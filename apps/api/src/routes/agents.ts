import { Router } from 'express';
import { db } from '../lib/db';

export const agentsRouter = Router();

agentsRouter.get('/', async (_req, res) => {
  const agents = await db.agent.findMany({
    where: { id: { startsWith: 'agent_' } },
    include: {
      _count: { select: { posts: true, comments: true, decisionLogs: true } },
    },
  });
  res.json(agents);
});

agentsRouter.get('/:id', async (req, res) => {
  const agent = await db.agent.findUnique({
    where: { id: req.params.id },
    include: {
      _count: { select: { posts: true, comments: true } },
    },
  });
  if (!agent) return res.status(404).json({ error: 'Not found' });
  return res.json(agent);
});

agentsRouter.get('/logs/all', async (_req, res) => {
  const logs = await db.agentDecisionLog.findMany({
    orderBy: { timestamp: 'desc' },
    take: 200,
    include: {
      agent: { select: { id: true, name: true } },
      simulationRun: { select: { id: true, startedAt: true, status: true } },
      relatedPost: { select: { id: true, title: true } },
    },
  });
  res.json(logs);
});

agentsRouter.get('/:id/logs', async (req, res) => {
  const logs = await db.agentDecisionLog.findMany({
    where: { agentId: req.params.id },
    orderBy: { timestamp: 'desc' },
    take: 50,
    include: {
      simulationRun: { select: { id: true, startedAt: true, status: true } },
      relatedPost: { select: { id: true, title: true } },
    },
  });
  res.json(logs);
});
