interface CommentSummary {
  id: string;
  author: string;
  body: string;
  score: number;
  parentId: string | null;
}

interface PostSummary {
  id: string;
  title: string;
  body: string;
  author: string;
  category: string;
  score: number;
  commentCount: number;
  comments: CommentSummary[];
}

interface PreviousActivity {
  action: string;
  summary: string;
}

export function buildDecisionPrompt(params: {
  agentName: string;
  stepNumber: number;
  totalSteps: number;
  availablePosts: PostSummary[];
  previousActivity: PreviousActivity[];
  alreadyCommentedPostIds: Set<string>;
  alreadyVotedPostIds: Set<string>;
  roundsSincePost: number;
}): string {
  const postList = params.availablePosts
    .map((p, i) => {
      const alreadyCommented = params.alreadyCommentedPostIds.has(p.id);
      const alreadyVoted = params.alreadyVotedPostIds.has(p.id);
      const flags = [
        alreadyCommented ? '[you already commented here]' : '',
        alreadyVoted ? '[you already voted here]' : '',
      ].filter(Boolean).join(' ');

      const thread = p.comments.length > 0
        ? '\n  Comments:\n' + p.comments.map(c => {
            const indent = c.parentId ? '      ↳ ' : '    • ';
            return `${indent}[${c.id}] ${c.author}: "${c.body.slice(0, 150)}${c.body.length > 150 ? '...' : ''}"`;
          }).join('\n')
        : '';

      return `[${i + 1}] id:${p.id} ${flags}
  "${p.title}" — r/${p.category} by ${p.author} | score:${p.score} | ${p.commentCount} comments
  ${p.body.slice(0, 250)}${p.body.length > 250 ? '...' : ''}${thread}`;
    })
    .join('\n\n');

  const history = params.previousActivity.length > 0
    ? params.previousActivity.map(a => `- ${a.action}: ${a.summary}`).join('\n')
    : 'Nothing yet.';

  const postNudge = params.roundsSincePost >= 3
    ? `\nYou haven't posted anything in ${params.roundsSincePost} rounds. You have things on your mind — share one.`
    : params.roundsSincePost >= 2
    ? `\nYou haven't posted in a while. Consider writing something original.`
    : '';

  return `It's 11:00 AM. You're scrolling Reddit. Round ${params.stepNumber} of ${params.totalSteps}.${postNudge}

--- FEED ---
${postList}

--- WHAT YOU'VE DONE THIS SESSION ---
${history}

Decide what to do next. Think like a real person:
- If something in the feed sparks a thought, comment on the post or reply to a specific comment in the thread
- If you have something on your mind unrelated to what you see, write a new post
- If something is good but you have nothing to add, vote on it
- If nothing interests you but you still feel like contributing, write a new post on one of your interests
- Don't repeat actions you've already taken (don't comment again on posts marked [you already commented here], don't vote again on posts marked [you already voted here])
- "none" is only valid if you genuinely have nothing to say and nothing to post — this should be rare
- To reply to a comment: set chosenAction to "comment" AND set targetCommentId — do NOT use "reply" as chosenAction, it is not valid

Respond with ONLY valid JSON:
{
  "sessionGoal": "what you're here for today, in one sentence",
  "viewedItems": [
    {
      "postId": "id of a post you looked at",
      "title": "its title",
      "whyItCaughtAttention": "why you clicked or skimmed it",
      "interestScore": 7,
      "wouldComment": true,
      "commentWhyOrWhyNot": "your honest reaction"
    }
  ],
  "chosenAction": "post",  // MUST be one of: "none", "post", "comment", "vote" — never "reply"
  "reasoningSummary": "2-3 sentences on what you decided and why",
  "publicContent": {
    "title": "only for new posts",
    "body": "your comment, reply, or post body",
    "targetPostId": "required when commenting or replying or voting",
    "targetCommentId": "only when replying to a specific comment — use its id from the thread"
  }
}`;
}
