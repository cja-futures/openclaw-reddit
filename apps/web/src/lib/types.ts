export interface Agent {
  id: string;
  name: string;
  bio: string;
  interests: string; // JSON string
  writingStyle: string;
  personality: string;
  avatarSeed: string;
  _count?: { posts: number; comments: number; decisionLogs: number };
}

export interface Post {
  id: string;
  title: string;
  body: string;
  authorId: string;
  author: { id: string; name: string; avatarSeed: string };
  category: string;
  score: number;
  createdAt: string;
  _count?: { comments: number };
  comments?: RedditComment[];
}

export interface RedditComment {
  id: string;
  body: string;
  authorId: string;
  author: { id: string; name: string; avatarSeed: string };
  postId: string;
  parentId: string | null;
  score: number;
  createdAt: string;
  replies: RedditComment[];
}

export interface SimulationProgress {
  agentIndex: number;
  agentName: string;
  round: number;
  totalRounds: number;
  decisionsLogged: number;
  completedInRound: number;
  totalAgents: number;
}

export interface SimulationRun {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  isRunning?: boolean;
  progress?: SimulationProgress | null;
  _count?: { decisionLogs: number };
}

export interface ViewedItem {
  postId: string;
  title: string;
  whyItCaughtAttention: string;
  interestScore: number;
  wouldComment: boolean;
  commentWhyOrWhyNot: string;
}

export interface AgentDecision {
  sessionGoal: string;
  viewedItems: ViewedItem[];
  chosenAction: 'none' | 'post' | 'comment' | 'vote';
  reasoningSummary: string;
  publicContent: {
    title?: string;
    body?: string;
    targetPostId?: string;
  };
}

export interface AgentDecisionLog {
  id: string;
  agentId: string;
  agent?: { id: string; name: string };
  simulationRunId: string;
  stepNumber: number;
  timestamp: string;
  logData: string; // JSON string of AgentDecision
  chosenAction: string;
  relatedPostId: string | null;
  relatedCommentId: string | null;
  simulationRun?: { id: string; startedAt: string; status: string };
  relatedPost?: { id: string; title: string } | null;
}
