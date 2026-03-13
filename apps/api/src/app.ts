import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { postsRouter } from './routes/posts';
import { agentsRouter } from './routes/agents';
import { simulationsRouter } from './routes/simulations';

export const app = express();

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // same-origin / curl
    const allowed = env.CORS_ORIGIN.split(',').map(s => s.trim());
    if (allowed.some(o => o === '*' || origin === o || origin.endsWith('.vercel.app'))) {
      return cb(null, true);
    }
    cb(new Error(`CORS: ${origin} not allowed`));
  }
}));
app.use(express.json());

app.use('/api/posts', postsRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/simulations', simulationsRouter);

app.get('/api/health', (_req, res) => res.json({ ok: true }));
