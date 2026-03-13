import { Router } from 'express';
import { db } from '../lib/db';
import { SimulationEngine } from '../services/SimulationEngine';

export const simulationsRouter = Router();
const engine = new SimulationEngine(db);

simulationsRouter.get('/', async (_req, res) => {
  const runs = await db.simulationRun.findMany({
    orderBy: { startedAt: 'desc' },
    take: 20,
    include: {
      _count: { select: { decisionLogs: true } },
    },
  });
  res.json(runs);
});

simulationsRouter.post('/', async (req, res) => {
  const { rounds } = req.body as { rounds?: number };
  const runId = await engine.startRun(rounds);
  res.json({ runId, status: 'running' });
});

simulationsRouter.post('/:id/stop', async (req, res) => {
  if (!engine.isRunning(req.params.id)) return res.status(400).json({ error: 'Not running' });
  await engine.stopRun(req.params.id);
  res.json({ stopped: true });
});

simulationsRouter.get('/:id', async (req, res) => {
  const run = await db.simulationRun.findUnique({
    where: { id: req.params.id },
    include: {
      _count: { select: { decisionLogs: true } },
    },
  });
  if (!run) return res.status(404).json({ error: 'Not found' });
  const progress = engine.getProgress(req.params.id);
  res.json({ ...run, isRunning: engine.isRunning(req.params.id), progress });
});
