import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const db = new PrismaClient();

async function main() {
  await db.agentDecisionLog.deleteMany({});
  await db.vote.deleteMany({});
  await db.comment.deleteMany({});
  await db.post.deleteMany({});
  await db.simulationRun.deleteMany({});
  console.log('Cleared. Posts remaining:', await db.post.count());
}

main().catch(console.error).finally(() => db.$disconnect());
