import { AgentDefinition } from '../data/agents';

interface PostSummary {
  id: string;
  title: string;
  body: string;
  author: string;
  category: string;
  score: number;
  commentCount: number;
  comments: Array<{ id: string; author: string; body: string; score: number; parentId: string | null }>;
}

interface AgentDecision {
  sessionGoal: string;
  viewedItems: Array<{
    postId: string;
    title: string;
    whyItCaughtAttention: string;
    interestScore: number;
    wouldComment: boolean;
    commentWhyOrWhyNot: string;
  }>;
  chosenAction: 'none' | 'post' | 'comment' | 'vote';
  reasoningSummary: string;
  publicContent: {
    title?: string;
    body?: string;
    targetPostId?: string;
  };
}

function seededRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return function () {
    h ^= h >>> 16;
    h = Math.imul(h, 0x45d9f3b);
    h ^= h >>> 16;
    return ((h >>> 0) / 0xffffffff);
  };
}

const SESSION_GOALS = [
  'kill some time before a meeting and see if anything interesting is happening',
  'catch up on discussions in my areas of interest',
  'look for something that sparks a good conversation',
  'check if anyone responded to yesterday\'s posts',
  'find inspiration for a project I\'m working on',
];

const COMMENT_TEMPLATES: Array<(interest: string) => string> = [
  (interest) => `This really resonates with me — I've been thinking about ${interest} a lot lately and this is a great take.`,
  (interest) => `Interesting perspective. From a ${interest} standpoint, I'd add that the nuances here are often overlooked.`,
  (_interest) => `I've had similar thoughts. The main thing I'd push back on is whether the framing here is doing any real work.`,
  (interest) => `As someone who works with ${interest} professionally, this is spot on. Thanks for writing it up.`,
  (_interest) => `Good post. I'd be curious what others think about the longer-term implications here.`,
];

const POST_TEMPLATES: Array<(agent: AgentDefinition) => { title: string; body: string }> = [
  (a) => ({
    title: `Anyone else deep into ${a.interests[0]} lately? Looking for recommendations`,
    body: `I've been spending a lot of time on ${a.interests[0]} recently and I'm curious what resources, projects, or discussions others have found valuable. ${a.bio.split('.')[0]}. Happy to share what I've been finding useful if there's interest.`,
  }),
  (a) => ({
    title: `Hot take on ${a.interests[1] || a.interests[0]}: we're thinking about it wrong`,
    body: `Been mulling this over for a while. The conventional wisdom in ${a.interests[1] || a.interests[0]} seems off to me in a few key ways. Not saying I have all the answers, but I think the framing is doing more harm than good. Curious if others have noticed this.`,
  }),
  (a) => ({
    title: `Interesting problem I ran into with ${a.interests[0]} — any thoughts?`,
    body: `Working on something related to ${a.interests[0]} and hit an interesting edge case I haven't seen discussed much. Wondering if anyone here has run into this and how they handled it. Brief description: ${a.bio.split('.')[1] || 'I\'ll add more context in comments'}.`,
  }),
];

export function generateMockDecision(
  agent: AgentDefinition,
  step: number,
  availablePosts: PostSummary[]
): AgentDecision {
  const rand = seededRandom(`${agent.id}-step${step}`);

  const sessionGoal = SESSION_GOALS[Math.floor(rand() * SESSION_GOALS.length)];

  // Pick 2-4 posts to "view"
  const viewCount = 2 + Math.floor(rand() * 3);
  const shuffled = [...availablePosts].sort(() => rand() - 0.5);
  const viewed = shuffled.slice(0, Math.min(viewCount, shuffled.length));

  const viewedItems = viewed.map(post => {
    const interestScore = Math.floor(rand() * 10) + 1;
    const wouldComment = interestScore >= 7 && rand() > 0.4;
    return {
      postId: post.id,
      title: post.title,
      whyItCaughtAttention: `The title mentioned something adjacent to ${agent.interests[Math.floor(rand() * agent.interests.length)]}`,
      interestScore,
      wouldComment,
      commentWhyOrWhyNot: wouldComment
        ? `This intersects with my interest in ${agent.interests[0]} and I have something to add`
        : `Interesting but not quite in my wheelhouse enough to comment`,
    };
  });

  // Determine action
  const r = rand();
  let chosenAction: 'none' | 'post' | 'comment' | 'vote';
  const highInterest = viewedItems.filter(v => v.wouldComment);

  if (step === 1 && r > 0.7) {
    // First step: likely just browsing
    chosenAction = 'none';
  } else if (highInterest.length > 0 && r > 0.5) {
    chosenAction = 'comment';
  } else if (r > 0.8) {
    chosenAction = 'post';
  } else if (r > 0.5) {
    chosenAction = 'vote';
  } else {
    chosenAction = 'none';
  }

  const publicContent: AgentDecision['publicContent'] = {};

  if (chosenAction === 'comment' && highInterest.length > 0) {
    const target = highInterest[0];
    const template = COMMENT_TEMPLATES[Math.floor(rand() * COMMENT_TEMPLATES.length)];
    publicContent.body = template(agent.interests[0]);
    publicContent.targetPostId = target.postId;
  } else if (chosenAction === 'post') {
    const template = POST_TEMPLATES[Math.floor(rand() * POST_TEMPLATES.length)];
    const { title, body } = template(agent);
    publicContent.title = title;
    publicContent.body = body;
  } else if (chosenAction === 'vote' && viewedItems.length > 0) {
    const target = viewedItems.sort((a, b) => b.interestScore - a.interestScore)[0];
    publicContent.targetPostId = target.postId;
  }

  const reasoningSummaries: Record<string, string> = {
    none: `Browsed through a few posts but nothing quite grabbed me enough to engage with this time. I'll keep looking.`,
    comment: `Found a post that lines up with my interest in ${agent.interests[0]}. Left my thoughts — keeping it brief but hopefully useful.`,
    post: `Didn't find quite what I was looking for so I figured I'd start a conversation myself around ${agent.interests[0]}.`,
    vote: `Nothing to add verbally but a couple of posts were worth acknowledging with an upvote.`,
  };

  return {
    sessionGoal,
    viewedItems,
    chosenAction,
    reasoningSummary: reasoningSummaries[chosenAction],
    publicContent,
  };
}
