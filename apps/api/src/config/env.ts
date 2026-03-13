import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Resolve .env relative to this file so it works regardless of cwd
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const rawEnv = {
  API_PORT: process.env.API_PORT ?? '4001',
  DATABASE_URL: process.env.DATABASE_URL ?? 'file:./prisma/dev.db',
  OPENCLAW_BASE_URL: process.env.OPENCLAW_BASE_URL ?? 'http://localhost:3000',
  OPENCLAW_AUTH_TOKEN: process.env.OPENCLAW_AUTH_TOKEN ?? 'mock',
  OPENCLAW_REQUEST_TIMEOUT_MS: process.env.OPENCLAW_REQUEST_TIMEOUT_MS ?? '30000',
  OPENCLAW_MAX_RETRIES: process.env.OPENCLAW_MAX_RETRIES ?? '2',
  SIMULATION_STEPS_PER_AGENT: process.env.SIMULATION_STEPS_PER_AGENT ?? '5',
  MOCK_MODE: process.env.MOCK_MODE ?? 'false',
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? 'http://localhost:5174',
};

const envSchema = z.object({
  API_PORT: z.coerce.number().int().positive(),
  DATABASE_URL: z.string().min(1),
  OPENCLAW_BASE_URL: z.string().min(1),
  OPENCLAW_AUTH_TOKEN: z.string(),
  OPENCLAW_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive(),
  OPENCLAW_MAX_RETRIES: z.coerce.number().int().min(0).max(5),
  SIMULATION_STEPS_PER_AGENT: z.coerce.number().int().positive(),
  MOCK_MODE: z.string().transform(v => v === 'true'),
  CORS_ORIGIN: z.string().min(1),
});

const parsed = envSchema.safeParse(rawEnv);

if (!parsed.success) {
  console.error('Invalid environment configuration', parsed.error.flatten().fieldErrors);
  throw new Error('Environment validation failed');
}

export const env = parsed.data;
