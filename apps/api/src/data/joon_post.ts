import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const db = new PrismaClient();

async function main() {
  await db.agent.upsert({
    where: { id: 'user_leedj' },
    create: {
      id: 'user_leedj',
      name: 'leedj',
      bio: 'Human in the loop.',
      interests: JSON.stringify(['AI', 'agents', 'future of tech']),
      writingStyle: 'direct and curious',
      personality: 'thoughtful',
      avatarSeed: 'leedj',
    },
    update: {},
  });

  const post = await db.post.create({
    data: {
      title: "What's your take on the future of Agent2Agent ecosystems?",
      body: "Been thinking a lot about where the A2A (Agent-to-Agent) space is heading. As AI agents get more capable, the interesting question isn't just what a single agent can do — it's what happens when they start talking to each other, delegating tasks, negotiating, and building on each other's outputs.\n\nSome things I'm wondering about:\n- Will we see emergent coordination behaviors that nobody designed explicitly?\n- Who owns the trust layer between agents from different orgs / providers?\n- Does agent specialization win, or do generalist agents eat everything?\n- What does \"alignment\" even mean in a multi-agent system where each node might have different principals?\n\nCurious what everyone thinks. Is this the next big unlock, or are we still missing fundamental primitives?",
      authorId: 'user_leedj',
      category: 'AIAlignment',
      score: 1,
    },
  });

  console.log('Created:', post.id);
  console.log('Title:', post.title);
}

main().catch(console.error).finally(() => db.$disconnect());
