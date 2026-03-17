import { PrismaClient } from '@prisma/client';
import { OpenClawClient } from '../client/OpenClawClient';
import { env } from '../config/env';
import { AGENTS, AgentDefinition } from '../data/agents';
import { buildAgentSystemPrompt } from '../prompts/agentSystemPrompt';
import { buildDecisionPrompt } from '../prompts/agentDecisionPrompt';
import { generateMockDecision } from './MockDecisionGenerator';

// Each Reddit agent maps to its own gateway agent by id (same pattern as openclaw_invest)

interface ViewedItem {
  postId: string;
  title: string;
  whyItCaughtAttention: string;
  interestScore: number;
  wouldComment: boolean;
  commentWhyOrWhyNot: string;
}

interface AgentDecision {
  sessionGoal: string;
  viewedItems: ViewedItem[];
  chosenAction: 'none' | 'post' | 'comment' | 'vote';
  reasoningSummary: string;
  publicContent: {
    title?: string;
    body?: string;
    targetPostId?: string;
    targetCommentId?: string;
  };
}

interface RunProgress {
  round: number;
  totalRounds: number;
  agentIndex: number;
  agentName: string;
  decisionsLogged: number;
  completedInRound: number;
  totalAgents: number;
}

export class SimulationEngine {
  private client: OpenClawClient;
  private db: PrismaClient;
  private runningSimulations = new Map<string, Promise<void>>();
  private progress = new Map<string, RunProgress>();
  private abortControllers = new Map<string, AbortController>();

  constructor(db: PrismaClient) {
    this.db = db;
    this.client = new OpenClawClient();
  }

  async startRun(rounds?: number): Promise<string> {
    const totalRounds = rounds ?? env.SIMULATION_STEPS_PER_AGENT;
    const run = await this.db.simulationRun.create({
      data: { status: 'running' },
    });

    const abort = new AbortController();
    this.abortControllers.set(run.id, abort);

    // Run in background, don't await
    const promise = this.executeRun(run.id, totalRounds, abort.signal).finally(() => {
      this.runningSimulations.delete(run.id);
      this.progress.delete(run.id);
      this.abortControllers.delete(run.id);
    });
    this.runningSimulations.set(run.id, promise);

    return run.id;
  }

  isRunning(runId: string): boolean {
    return this.runningSimulations.has(runId);
  }

  getProgress(runId: string): RunProgress | null {
    return this.progress.get(runId) ?? null;
  }

  async stopRun(runId: string): Promise<void> {
    this.abortControllers.get(runId)?.abort();
    await this.db.simulationRun.update({
      where: { id: runId },
      data: { status: 'failed', completedAt: new Date() },
    });
  }

  private async executeRun(runId: string, totalRounds: number, signal: AbortSignal): Promise<void> {
    // Per-agent memory persists across all rounds
    const agentMemory = new Map<string, Array<{ action: string; summary: string }>>();
    const roundsSincePost = new Map<string, number>();

    // Seed roundsSincePost from DB — how many decisions ago did each agent last post?
    for (const agent of AGENTS) {
      agentMemory.set(agent.id, []);
      const recentLogs = await this.db.agentDecisionLog.findMany({
        where: { agentId: agent.id },
        orderBy: { timestamp: 'desc' },
        take: 10,
        select: { chosenAction: true },
      });
      const lastPostIndex = recentLogs.findIndex(l => l.chosenAction === 'post');
      roundsSincePost.set(agent.id, lastPostIndex === -1 ? recentLogs.length : lastPostIndex);
    }

    let decisionsLogged = 0;

    try {
      for (let round = 1; round <= totalRounds; round++) {
        if (signal.aborted) break;

        let completedInRound = 0;
        this.progress.set(runId, {
          round,
          totalRounds,
          agentIndex: 0,
          agentName: '',
          decisionsLogged,
          completedInRound: 0,
          totalAgents: AGENTS.length,
        });

        // Run agents in parallel with a concurrency limit to avoid overwhelming the gateway
        const CONCURRENCY = 4;
        const results: Array<{ agentId: string; logged: number; didPost: boolean }> = [];
        for (let start = 0; start < AGENTS.length; start += CONCURRENCY) {
          if (signal.aborted) break;
          const batch = AGENTS.slice(start, start + CONCURRENCY);
          const batchResults = await Promise.all(
            batch.map(agent => {
              const sincePost = roundsSincePost.get(agent.id)!;
              return this.executeAgentStep(
                runId, agent, round, totalRounds,
                agentMemory.get(agent.id)!,
                signal,
                sincePost,
              ).then(result => {
                completedInRound++;
                const current = this.progress.get(runId);
                if (current) {
                  this.progress.set(runId, {
                    ...current,
                    agentName: agent.name,
                    completedInRound,
                    decisionsLogged: current.decisionsLogged + result.logged,
                  });
                }
                return { agentId: agent.id, ...result };
              });
            })
          );
          results.push(...batchResults);
        }

        for (const { agentId, logged, didPost } of results) {
          decisionsLogged += logged;
          roundsSincePost.set(agentId, didPost ? 0 : roundsSincePost.get(agentId)! + 1);
        }
        // Sync final decisionsLogged into progress after round completes
        const cur = this.progress.get(runId);
        if (cur) this.progress.set(runId, { ...cur, decisionsLogged });
      }

      if (!signal.aborted) {
        await this.db.simulationRun.update({
          where: { id: runId },
          data: { status: 'completed', completedAt: new Date() },
        });
      }
    } catch (err) {
      if (!signal.aborted) {
        await this.db.simulationRun.update({
          where: { id: runId },
          data: { status: 'failed', completedAt: new Date() },
        });
      }
      throw err;
    }
  }

  private async executeAgentStep(
    runId: string,
    agent: AgentDefinition,
    round: number,
    totalRounds: number,
    previousActivity: Array<{ action: string; summary: string }>,
    signal: AbortSignal,
    roundsSincePost: number,
  ): Promise<{ logged: number; didPost: boolean }> {
    if (signal.aborted) return { logged: 0, didPost: false };

    const systemPrompt = buildAgentSystemPrompt(agent);
    const sessionKey = `${runId}-${agent.id}`;

    const posts = await this.db.post.findMany({
      take: 15,
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { name: true } },
        _count: { select: { comments: true } },
        comments: {
          take: 10,
          orderBy: { createdAt: 'asc' },
          select: { id: true, body: true, score: true, parentId: true, author: { select: { name: true } } },
        },
      },
    });

    // Find which posts this agent has already left a top-level comment on
    const agentTopLevelComments = await this.db.comment.findMany({
      where: { authorId: agent.id, postId: { in: posts.map(p => p.id) }, parentId: null },
      select: { postId: true },
    });
    const alreadyCommentedPostIds = new Set(agentTopLevelComments.map(c => c.postId));

    // Find which posts this agent has already voted on
    const agentVotes = await this.db.vote.findMany({
      where: { agentId: agent.id, postId: { in: posts.map(p => p.id) } },
      select: { postId: true },
    });
    const alreadyVotedPostIds = new Set(agentVotes.map(v => v.postId).filter(Boolean) as string[]);

    const availablePosts = posts.map(p => ({
      id: p.id,
      title: p.title,
      body: p.body,
      author: p.author.name,
      category: p.category,
      score: p.score,
      commentCount: p._count.comments,
      comments: p.comments.map(c => ({
        id: c.id,
        author: c.author.name,
        body: c.body,
        score: c.score,
        parentId: c.parentId,
      })),
    }));

    const userPrompt = buildDecisionPrompt({
      agentName: agent.name,
      stepNumber: round,
      totalSteps: totalRounds,
      availablePosts,
      previousActivity,
      alreadyCommentedPostIds,
      alreadyVotedPostIds,
      roundsSincePost,
    });

    let decision: AgentDecision;

    if (env.MOCK_MODE || env.OPENCLAW_AUTH_TOKEN === 'mock') {
      decision = generateMockDecision(agent, round, availablePosts);
    } else {
      let raw: string;
      try {
        raw = await this.client.createResponse({
          agentId: agent.id,
          systemPrompt,
          userPrompt,
          sessionKey,
          metadata: { agentId: agent.id, simulationRunId: runId, round },
        });
      } catch (err) {
        console.error(`[${agent.name}] Round ${round}: API error`, err);
        return { logged: 0, didPost: false };
      }

      try {
        const cleaned = raw.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
        decision = JSON.parse(cleaned) as AgentDecision;
      } catch {
        console.error(`[${agent.name}] Round ${round}: Failed to parse JSON`, raw.slice(0, 200));
        return { logged: 0, didPost: false };
      }
    }

    const relatedPostId = await this.applyDecision(agent, decision);

    await this.db.agentDecisionLog.create({
      data: {
        agentId: agent.id,
        simulationRunId: runId,
        stepNumber: round,
        logData: JSON.stringify(decision),
        chosenAction: decision.chosenAction,
        relatedPostId: relatedPostId ?? null,
      },
    });

    previousActivity.push({ action: decision.chosenAction, summary: decision.reasoningSummary });
    return { logged: 1, didPost: decision.chosenAction === 'post' };
  }

  private async applyDecision(agent: AgentDefinition, decision: AgentDecision): Promise<string | null> {
    // Normalize LLM variants — model sometimes outputs "reply" instead of "comment"
    if ((decision.chosenAction as string) === 'reply') decision.chosenAction = 'comment';

    switch (decision.chosenAction) {
      case 'post': {
        if (!decision.publicContent.title || !decision.publicContent.body) return null;
        const post = await this.db.post.create({
          data: {
            title: decision.publicContent.title,
            body: decision.publicContent.body,
            authorId: agent.id,
            category: this.inferCategory(agent),
            score: 1,
          },
        });
        return post.id;
      }

      case 'comment': {
        if (!decision.publicContent.body || !decision.publicContent.targetPostId) return null;
        const targetPost = await this.db.post.findUnique({
          where: { id: decision.publicContent.targetPostId },
        });
        if (!targetPost) return null;

        // Validate parentId if replying to a comment
        let parentId: string | null = null;
        if (decision.publicContent.targetCommentId) {
          const parentComment = await this.db.comment.findUnique({
            where: { id: decision.publicContent.targetCommentId },
          });
          if (parentComment && parentComment.postId === targetPost.id) {
            parentId = parentComment.id;
          }
        }

        await this.db.comment.create({
          data: {
            body: decision.publicContent.body,
            authorId: agent.id,
            postId: targetPost.id,
            parentId,
            score: 1,
          },
        });

        // Update post score slightly for engagement
        await this.db.post.update({
          where: { id: targetPost.id },
          data: { score: { increment: 1 } },
        });

        return targetPost.id;
      }

      case 'vote': {
        if (!decision.publicContent.targetPostId) return null;
        const targetPost = await this.db.post.findUnique({
          where: { id: decision.publicContent.targetPostId },
        });
        if (!targetPost) return null;

        // Check if already voted
        const existing = await this.db.vote.findFirst({
          where: { agentId: agent.id, postId: targetPost.id },
        });
        if (!existing) {
          const value = decision.viewedItems.find(v => v.postId === targetPost.id)?.interestScore ?? 5;
          const voteValue = value >= 6 ? 1 : -1;
          await this.db.vote.create({
            data: { agentId: agent.id, postId: targetPost.id, value: voteValue },
          });
          await this.db.post.update({
            where: { id: targetPost.id },
            data: { score: { increment: voteValue } },
          });
        }
        return targetPost.id;
      }

      default:
        return null;
    }
  }

  private inferCategory(agent: AgentDefinition): string {
    const interestCategories: Record<string, string> = {
      'semiconductor': 'stocks',
      'chip': 'stocks',
      'TSMC': 'stocks',
      'NVIDIA': 'stocks',
      'AMD': 'stocks',
      'AI infrastructure': 'investing',
      'hyperscaler': 'investing',
      'GPU': 'hardware',
      'HBM': 'hardware',
      'memory': 'hardware',
      'DRAM': 'hardware',
      'NAND': 'hardware',
      'data center': 'sysadmin',
      'networking': 'networking',
      'AI accelerator': 'MachineLearning',
      'machine learning': 'MachineLearning',
      'AI': 'artificial',
      'LLM': 'MachineLearning',
      'quantitative': 'quant',
      'factor model': 'quant',
      'options': 'options',
      'macro': 'investing',
      'Fed policy': 'Economics',
      'geopolit': 'geopolitics',
      'export control': 'geopolitics',
      'M&A': 'investing',
      'enterprise software': 'technology',
      'SaaS': 'technology',
      'cybersecurity': 'netsec',
      'big tech': 'technology',
      'power': 'energy',
      'nuclear': 'energy',
      'energy': 'energy',
      'EDA': 'technology',
      'equipment': 'technology',
      'valuation': 'investing',
      'DCF': 'investing',
    };

    for (const interest of agent.interests) {
      for (const [key, cat] of Object.entries(interestCategories)) {
        if (interest.toLowerCase().includes(key.toLowerCase())) {
          return cat;
        }
      }
    }
    return 'wallstreetbets';
  }
}
