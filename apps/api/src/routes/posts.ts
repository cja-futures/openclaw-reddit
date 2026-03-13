import { Router } from 'express';
import { db } from '../lib/db';

const HUMAN_USER_ID = 'user_leedj';

export const postsRouter = Router();

postsRouter.get('/', async (_req, res) => {
  const posts = await db.post.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      author: { select: { id: true, name: true, avatarSeed: true } },
      _count: { select: { comments: true } },
    },
  });
  res.json(posts);
});

// Recursive helper: nest replies under their parents
function nestComments(flat: CommentRow[]): NestedComment[] {
  const map = new Map<string, NestedComment>();
  const roots: NestedComment[] = [];
  for (const c of flat) map.set(c.id, { ...c, replies: [] });
  for (const c of flat) {
    const node = map.get(c.id)!;
    if (c.parentId && map.has(c.parentId)) {
      map.get(c.parentId)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

type CommentRow = { id: string; body: string; authorId: string; author: { id: string; name: string; avatarSeed: string }; postId: string; parentId: string | null; score: number; createdAt: Date };
type NestedComment = CommentRow & { replies: NestedComment[] };

postsRouter.get('/:id', async (req, res) => {
  const post = await db.post.findUnique({
    where: { id: req.params.id },
    include: {
      author: { select: { id: true, name: true, bio: true, avatarSeed: true } },
      comments: {
        orderBy: { createdAt: 'asc' },
        include: {
          author: { select: { id: true, name: true, avatarSeed: true } },
        },
      },
    },
  });
  if (!post) return res.status(404).json({ error: 'Not found' });
  return res.json({ ...post, comments: nestComments(post.comments as CommentRow[]) });
});

postsRouter.post('/', async (req, res) => {
  const { title, body, category } = req.body as { title?: string; body?: string; category?: string };
  if (!title?.trim() || !body?.trim()) return res.status(400).json({ error: 'title and body required' });
  const post = await db.post.create({
    data: { title: title.trim(), body: body.trim(), authorId: HUMAN_USER_ID, category: category?.trim() || 'misc', score: 1 },
    include: { author: { select: { id: true, name: true, avatarSeed: true } }, _count: { select: { comments: true } } },
  });
  res.json(post);
});

postsRouter.post('/:id/comments', async (req, res) => {
  const { body, parentId } = req.body as { body?: string; parentId?: string };
  if (!body?.trim()) return res.status(400).json({ error: 'body required' });
  const post = await db.post.findUnique({ where: { id: req.params.id } });
  if (!post) return res.status(404).json({ error: 'Not found' });
  const comment = await db.comment.create({
    data: { body: body.trim(), authorId: HUMAN_USER_ID, postId: post.id, parentId: parentId ?? null, score: 1 },
    include: { author: { select: { id: true, name: true, avatarSeed: true } } },
  });
  res.json(comment);
});

postsRouter.delete('/:id', async (req, res) => {
  const post = await db.post.findUnique({ where: { id: req.params.id } });
  if (!post) return res.status(404).json({ error: 'Not found' });
  if (post.authorId !== HUMAN_USER_ID) return res.status(403).json({ error: 'Forbidden' });
  await db.post.delete({ where: { id: req.params.id } });
  return res.json({ deleted: true });
});

postsRouter.post('/:id/vote', async (req, res) => {
  const { value } = req.body as { value?: number };
  if (value !== 1 && value !== -1) return res.status(400).json({ error: 'value must be 1 or -1' });
  const post = await db.post.findUnique({ where: { id: req.params.id } });
  if (!post) return res.status(404).json({ error: 'Not found' });
  const existing = await db.vote.findFirst({ where: { agentId: HUMAN_USER_ID, postId: post.id } });
  if (existing) {
    if (existing.value === value) {
      // undo vote
      await db.vote.delete({ where: { id: existing.id } });
      await db.post.update({ where: { id: post.id }, data: { score: { increment: -value } } });
      return res.json({ score: post.score - value, vote: 0 });
    }
    // flip vote
    await db.vote.update({ where: { id: existing.id }, data: { value } });
    await db.post.update({ where: { id: post.id }, data: { score: { increment: value * 2 } } });
    return res.json({ score: post.score + value * 2, vote: value });
  }
  await db.vote.create({ data: { agentId: HUMAN_USER_ID, postId: post.id, value } });
  await db.post.update({ where: { id: post.id }, data: { score: { increment: value } } });
  return res.json({ score: post.score + value, vote: value });
});
