import { useState, useEffect, useCallback } from 'react';
import { api } from './api/client';
import { Post, Agent, RedditComment, SimulationRun, SimulationProgress, AgentDecisionLog, AgentDecision } from './lib/types';

// Utility to format relative time
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// Action badge component
function ActionBadge({ action }: { action: string }) {
  return <span className={`action-badge action-${action}`}>{action}</span>;
}

// Decision log entry component
function DecisionLogEntry({ log, onPostClick }: {
  log: AgentDecisionLog;
  onPostClick: (postId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  let decision: AgentDecision | null = null;
  try { decision = JSON.parse(log.logData) as AgentDecision; } catch { /* */ }

  return (
    <div className="decision-log">
      <div className="decision-log-header" onClick={() => setExpanded(!expanded)}>
        <span>Step {log.stepNumber} — {timeAgo(log.timestamp)}</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <ActionBadge action={log.chosenAction} />
          <span>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>
      {expanded && decision && (
        <div className="decision-log-body">
          {decision.sessionGoal && (
            <div className="decision-section">
              <div className="decision-section-title">Session Goal</div>
              <div>{decision.sessionGoal}</div>
            </div>
          )}
          {decision.viewedItems?.length > 0 && (
            <div className="decision-section">
              <div className="decision-section-title">Posts Viewed</div>
              {decision.viewedItems.map((item, i) => (
                <div key={i} className="viewed-item">
                  <div
                    className="viewed-item-title"
                    style={{ cursor: 'pointer', color: '#0079d3' }}
                    onClick={() => onPostClick(item.postId)}
                  >
                    {item.title}
                  </div>
                  <div className="score-bar">
                    <div className="score-fill" style={{ width: `${item.interestScore * 10}%` }} />
                  </div>
                  <div style={{ color: '#555', marginTop: 2 }}>
                    <strong>Why:</strong> {item.whyItCaughtAttention}
                  </div>
                  <div style={{ color: '#555' }}>
                    <strong>{item.wouldComment ? '✓ Would comment:' : '✗ Skipped:'}</strong> {item.commentWhyOrWhyNot}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="decision-section">
            <div className="decision-section-title">Decision</div>
            <div>{decision.reasoningSummary}</div>
          </div>
          {decision.publicContent?.body && (
            <div className="decision-section">
              <div className="decision-section-title">
                {decision.chosenAction === 'post' ? 'New Post' : 'Comment Written'}
              </div>
              {decision.publicContent.title && (
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{decision.publicContent.title}</div>
              )}
              <div style={{ color: '#333' }}>{decision.publicContent.body}</div>
            </div>
          )}
          {log.relatedPost && (
            <div style={{ marginTop: 8, fontSize: 11, color: '#888' }}>
              Related:{' '}
              <span
                style={{ color: '#0079d3', cursor: 'pointer' }}
                onClick={() => onPostClick(log.relatedPost!.id)}
              >
                {log.relatedPost.title}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Agent panel component
function AgentPanel({
  agents,
  onPostClick,
  simRunning,
}: {
  agents: Agent[];
  onPostClick: (postId: string) => void;
  simRunning: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<'agent' | 'all'>('agent');
  const [selectedId, setSelectedId] = useState<string>('');
  const [logs, setLogs] = useState<AgentDecisionLog[]>([]);
  const [allLogs, setAllLogs] = useState<AgentDecisionLog[]>([]);

  useEffect(() => {
    if (!selectedId) return;
    api.get<AgentDecisionLog[]>(`/api/agents/${selectedId}/logs`).then(setLogs).catch(console.error);
  }, [selectedId]);

  const fetchAllLogs = useCallback(() => {
    api.get<AgentDecisionLog[]>('/api/agents/logs/all').then(setAllLogs).catch(console.error);
  }, []);

  useEffect(() => {
    if (tab !== 'all') return;
    fetchAllLogs();
  }, [tab, fetchAllLogs]);

  // Auto-poll all logs while simulation is running
  useEffect(() => {
    if (!simRunning || tab !== 'all') return;
    const interval = setInterval(fetchAllLogs, 1500);
    return () => clearInterval(interval);
  }, [simRunning, tab, fetchAllLogs]);

  const selectedAgent = agents.find(a => a.id === selectedId);
  const interests = selectedAgent ? JSON.parse(selectedAgent.interests) as string[] : [];

  const tabBtn = (t: 'agent' | 'all', label: string) => (
    <button
      onClick={() => setTab(t)}
      style={{
        padding: '5px 14px', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: tab === t ? 700 : 400,
        background: tab === t ? '#ff4500' : '#edeff1', color: tab === t ? '#fff' : '#333',
      }}
    >{label}</button>
  );

  return (
    <>
      <button className="agent-panel-toggle" onClick={() => setOpen(o => !o)}>
        {open ? 'Close ▶' : '◀ Agents'}
      </button>
      {open && (
        <div className="agent-panel">
          <div className="agent-panel-inner">
            <div className="agent-panel-header">
              <h3>Agent Inspector</h3>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                {tabBtn('agent', 'By Agent')}
                {tabBtn('all', 'All Activity')}
              </div>
            </div>

            {tab === 'agent' && (
              <>
                <select
                  className="agent-select"
                  value={selectedId}
                  onChange={e => setSelectedId(e.target.value)}
                  style={{ marginTop: 10 }}
                >
                  <option value="">— select an agent —</option>
                  {agents.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                {selectedAgent && (
                  <div className="agent-profile">
                    <div className="agent-name">{selectedAgent.name}</div>
                    <div className="agent-bio">{selectedAgent.bio}</div>
                    <div className="agent-interests">
                      {interests.map((t: string) => (
                        <span key={t} className="interest-tag">{t}</span>
                      ))}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 11, color: '#888' }}>
                      Style: {selectedAgent.writingStyle}
                    </div>
                  </div>
                )}
                <div className="agent-logs">
                  {!selectedId && <div className="empty">Select an agent to inspect their decision history.</div>}
                  {selectedId && logs.length === 0 && (
                    <div className="empty">No decision logs yet. Run a simulation first.</div>
                  )}
                  {logs.length > 0 && (
                    <>
                      <h4>Decision History ({logs.length} steps)</h4>
                      {logs.map(log => (
                        <DecisionLogEntry key={log.id} log={log} onPostClick={onPostClick} />
                      ))}
                    </>
                  )}
                </div>
              </>
            )}

            {tab === 'all' && (
              <div className="agent-logs" style={{ marginTop: 10 }}>
                {allLogs.length === 0 && <div className="empty">No activity yet. Run a simulation first.</div>}
                {allLogs.length > 0 && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <h4 style={{ margin: 0 }}>All Activity ({allLogs.length} decisions)</h4>
                      <button onClick={fetchAllLogs} style={{ background: 'none', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', fontSize: 12, padding: '3px 8px', color: '#555' }}>↺ Refresh</button>
                    </div>
                    {allLogs.map(log => (
                      <div key={log.id}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#0079d3', marginBottom: 2, marginTop: 8 }}>
                          {log.agent?.name ?? log.agentId}
                        </div>
                        <DecisionLogEntry log={log} onPostClick={onPostClick} />
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// Post card
function PostCard({ post, onClick, onDelete }: { post: Post; onClick: () => void; onDelete?: () => void }) {
  const [score, setScore] = useState(post.score);
  const [voted, setVoted] = useState<1 | -1 | 0>(0);
  const handleVote = (v: 1 | -1, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = voted === v ? 0 : v;
    const delta = next === 0 ? -v : voted === 0 ? v : v * 2;
    setScore(s => s + delta);
    setVoted(next);
    if (next !== 0) api.post(`/api/posts/${post.id}/vote`, { value: v }).catch(console.error);
  };
  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await api.delete(`/api/posts/${post.id}`);
    onDelete?.();
  };
  const isOwn = post.author.name === 'leedj';
  return (
    <div className="post-card" onClick={onClick}>
      <div className="vote-column">
        <button onClick={e => handleVote(1, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: voted === 1 ? '#ff4500' : '#ccc', padding: 0 }}>▲</button>
        <span className="score">{score}</span>
        <button onClick={e => handleVote(-1, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: voted === -1 ? '#7193ff' : '#ccc', padding: 0 }}>▼</button>
      </div>
      <div className="post-content">
        <div className="post-category">r/{post.category}</div>
        <div className="post-title">{post.title}</div>
        <div className="post-meta">
          <span>Posted by <span className="author">{post.author.name}</span></span>
          <span>{timeAgo(post.createdAt)}</span>
          <span>💬 {post._count?.comments ?? 0} comments</span>
          {isOwn && (
            <button onClick={handleDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cc0000', fontSize: 12, fontWeight: 700, padding: '0 4px' }}>
              🗑 delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Vote buttons
function VoteButtons({ score, onVote }: { score: number; onVote: (v: 1 | -1) => void }) {
  const [localScore, setLocalScore] = useState(score);
  const [voted, setVoted] = useState<1 | -1 | 0>(0);
  const handleVote = (v: 1 | -1) => {
    const next = voted === v ? 0 : v;
    const delta = next === 0 ? -v : voted === 0 ? v : v * 2;
    setLocalScore(s => s + delta);
    setVoted(next);
    if (next !== 0) onVote(v);
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <button onClick={() => handleVote(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: voted === 1 ? '#ff4500' : '#ccc', padding: '0 2px' }}>▲</button>
      <span style={{ fontWeight: 700, fontSize: 13, minWidth: 24, textAlign: 'center' }}>{localScore}</span>
      <button onClick={() => handleVote(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: voted === -1 ? '#7193ff' : '#ccc', padding: '0 2px' }}>▼</button>
    </div>
  );
}

// Single comment + its nested replies (recursive)
function CommentNode({ comment, postId, depth, onReload }: {
  comment: RedditComment;
  postId: string;
  depth: number;
  onReload: () => void;
}) {
  const [replying, setReplying] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const submitReply = async () => {
    if (!replyBody.trim()) return;
    setSubmitting(true);
    await api.post(`/api/posts/${postId}/comments`, { body: replyBody.trim(), parentId: comment.id });
    setReplyBody('');
    setReplying(false);
    setSubmitting(false);
    onReload();
  };

  const borderColors = ['#ff4500', '#0079d3', '#46d160', '#ff585b', '#ffd635'];
  const borderColor = borderColors[depth % borderColors.length];

  return (
    <div style={{ borderLeft: `2px solid ${borderColor}`, paddingLeft: 12, marginBottom: 8 }}>
      <div className="comment-meta">
        <span className="author">{comment.author.name}</span>
        <span>{timeAgo(comment.createdAt)}</span>
        <span>↑ {comment.score}</span>
        <button onClick={() => setCollapsed(c => !c)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#878a8c', fontSize: 12 }}>
          {collapsed ? '[+]' : '[–]'}
        </button>
      </div>
      {!collapsed && (
        <>
          <div className="comment-body">{comment.body}</div>
          <div style={{ marginTop: 6, display: 'flex', gap: 12 }}>
            <button onClick={() => setReplying(r => !r)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#878a8c' }}>
              💬 Reply
            </button>
          </div>
          {replying && (
            <div style={{ marginTop: 8 }}>
              <textarea
                placeholder={`Reply to ${comment.author.name}...`}
                value={replyBody}
                onChange={e => setReplyBody(e.target.value)}
                rows={3}
                style={{ width: '100%', border: '1px solid #edeff1', borderRadius: 4, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit', resize: 'vertical', background: '#f6f7f8' }}
                autoFocus
              />
              <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                <button className="compose-submit" disabled={submitting || !replyBody.trim()} onClick={submitReply}>
                  {submitting ? 'Posting...' : 'Reply'}
                </button>
                <button className="back-btn" onClick={() => { setReplying(false); setReplyBody(''); }}>Cancel</button>
              </div>
            </div>
          )}
          {comment.replies?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {comment.replies.map(reply => (
                <CommentNode key={reply.id} comment={reply} postId={postId} depth={depth + 1} onReload={onReload} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Thread view
function ThreadView({ postId, onBack }: { postId: string; onBack: () => void }) {
  const [post, setPost] = useState<Post | null>(null);
  const [commentBody, setCommentBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reload = useCallback(() => {
    api.get<Post>(`/api/posts/${postId}`).then(setPost).catch(console.error);
  }, [postId]);

  useEffect(() => { reload(); }, [reload]);

  const submitComment = async () => {
    if (!commentBody.trim()) return;
    setSubmitting(true);
    await api.post(`/api/posts/${postId}/comments`, { body: commentBody.trim() });
    setCommentBody('');
    setSubmitting(false);
    reload();
  };

  const rootCount = post?.comments?.length ?? 0;

  if (!post) return <div className="loading">Loading...</div>;

  return (
    <div>
      <div className="thread-header">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <span style={{ fontSize: 13, color: '#555' }}>r/{post.category}</span>
      </div>
      <div className="thread-post">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <VoteButtons score={post.score} onVote={(v) => api.post(`/api/posts/${postId}/vote`, { value: v })} />
          <div style={{ flex: 1 }}>
            <div className="post-meta" style={{ marginBottom: 8 }}>
              Posted by <span className="author">{post.author.name}</span> · {timeAgo(post.createdAt)}
            </div>
            <div className="post-title">{post.title}</div>
            <div className="post-body" style={{ marginTop: 12 }}>{post.body}</div>
          </div>
        </div>
      </div>
      <div className="comments-section">
        <div className="compose-box" style={{ marginBottom: 16 }}>
          <textarea
            placeholder="Add a comment as leedj..."
            value={commentBody}
            onChange={e => setCommentBody(e.target.value)}
            rows={3}
          />
          <button className="compose-submit" disabled={submitting || !commentBody.trim()} onClick={submitComment}>
            {submitting ? 'Posting...' : 'Comment'}
          </button>
        </div>
        <h3>{rootCount} Comment{rootCount !== 1 ? 's' : ''}</h3>
        {rootCount === 0 && <div className="empty">No comments yet.</div>}
        {post.comments?.map(c => (
          <CommentNode key={c.id} comment={c} postId={postId} depth={0} onReload={reload} />
        ))}
      </div>
    </div>
  );
}

// Compose new post box
function ComposeBox({ onPost }: { onPost: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('misc');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!title.trim() || !body.trim()) return;
    setSubmitting(true);
    await api.post('/api/posts', { title: title.trim(), body: body.trim(), category });
    setTitle(''); setBody(''); setOpen(false); setSubmitting(false);
    onPost();
  };

  if (!open) {
    return (
      <div className="compose-box" style={{ marginBottom: 10, cursor: 'pointer' }} onClick={() => setOpen(true)}>
        <div style={{ color: '#888', fontSize: 14, padding: '8px 4px' }}>Create a post as leedj...</div>
      </div>
    );
  }

  return (
    <div className="compose-box" style={{ marginBottom: 10 }}>
      <input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} style={{ marginBottom: 8 }} />
      <textarea placeholder="Body" value={body} onChange={e => setBody(e.target.value)} rows={4} style={{ marginBottom: 8 }} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select value={category} onChange={e => setCategory(e.target.value)} style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}>
          {['AIAlignment','MachineLearning','philosophy','gamedev','statistics','devops','urbanplanning','Astronomy','linguistics','environment','musictheory','netsec','design','biology','math','misc'].map(c => (
            <option key={c} value={c}>r/{c}</option>
          ))}
        </select>
        <button className="compose-submit" disabled={submitting || !title.trim() || !body.trim()} onClick={submit}>
          {submitting ? 'Posting...' : 'Post'}
        </button>
        <button className="back-btn" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

// Progress bar component
function ProgressBar({ progress }: { progress: SimulationProgress }) {
  const totalDecisions = progress.totalAgents * progress.totalRounds;
  const overallPct = Math.min(100, Math.round((progress.decisionsLogged / totalDecisions) * 100));
  const roundPct = Math.round((progress.completedInRound / progress.totalAgents) * 100);
  const lastAgent = progress.agentName;

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 13, color: '#e65100', fontWeight: 600, marginBottom: 4 }}>
        ⟳ Round {progress.round}/{progress.totalRounds} — {progress.completedInRound}/{progress.totalAgents} agents done
        {lastAgent && <span style={{ fontWeight: 400, color: '#888', marginLeft: 6 }}>({lastAgent} just finished)</span>}
      </div>
      {/* Per-round progress */}
      <div style={{ background: '#eee', borderRadius: 3, height: 8, overflow: 'hidden', marginBottom: 4 }}>
        <div style={{ width: `${roundPct}%`, background: '#ff4500', height: '100%', borderRadius: 3, transition: 'width 0.3s ease' }} />
      </div>
      {/* Overall progress */}
      <div style={{ background: '#eee', borderRadius: 3, height: 4, overflow: 'hidden' }}>
        <div style={{ width: `${overallPct}%`, background: '#ff8c00', height: '100%', borderRadius: 3, transition: 'width 0.3s ease' }} />
      </div>
      <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>
        {progress.decisionsLogged} decisions total · {overallPct}% overall
      </div>
    </div>
  );
}

// Simulation bar
function SimBar({ onSimulationComplete, onTick, onRunningChange }: { onSimulationComplete: () => void; onTick: () => void; onRunningChange: (running: boolean) => void; }) {
  const [runs, setRuns] = useState<SimulationRun[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [progress, setProgress] = useState<SimulationProgress | null>(null);
  const [rounds, setRounds] = useState(10);

  const latestRun = runs[0];

  const startSimulation = async () => {
    const result = await api.post<{ runId: string }>('/api/simulations', { rounds });
    setActiveRunId(result.runId);
    setProgress(null);
    onRunningChange(true);
  };

  const stopSimulation = async () => {
    if (!activeRunId) return;
    await api.post(`/api/simulations/${activeRunId}/stop`);
    setActiveRunId(null);
    setProgress(null);
    onRunningChange(false);
    api.get<SimulationRun[]>('/api/simulations').then(setRuns).catch(console.error);
  };

  // Poll every 2s while running
  useEffect(() => {
    if (!activeRunId) return;
    const interval = setInterval(async () => {
      const run = await api.get<SimulationRun>(`/api/simulations/${activeRunId}`);
      if (run.progress) setProgress(run.progress);
      onTick();
      if (run.status !== 'running') {
        setActiveRunId(null);
        setProgress(null);
        onRunningChange(false);
        onSimulationComplete();
        clearInterval(interval);
        api.get<SimulationRun[]>('/api/simulations').then(setRuns).catch(console.error);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [activeRunId, onSimulationComplete]);

  // Initial load
  useEffect(() => {
    api.get<SimulationRun[]>('/api/simulations').then(setRuns).catch(console.error);
  }, []);

  const isRunning = !!activeRunId;

  return (
    <div className="sim-bar">
      <button className="sim-btn" disabled={isRunning} onClick={startSimulation}>
        Run Simulation
      </button>
      {!isRunning && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <label style={{ color: '#555' }}>Rounds:</label>
          <input
            type="number"
            min={1}
            max={50}
            value={rounds}
            onChange={e => setRounds(Math.max(1, parseInt(e.target.value) || 1))}
            style={{ width: 60, padding: '4px 6px', border: '1px solid #ccc', borderRadius: 4, fontSize: 13 }}
          />
        </div>
      )}
      {isRunning && (
        <button className="sim-btn" style={{ background: '#b71c1c' }} onClick={stopSimulation}>
          Stop
        </button>
      )}
      {isRunning && progress && <ProgressBar progress={progress} />}
      {isRunning && !progress && <span className="sim-status running">⟳ Starting simulation...</span>}
      {!isRunning && latestRun && (
        <span className={`sim-status ${latestRun.status}`}>
          Last run: {latestRun.status} · {latestRun._count?.decisionLogs ?? 0} decisions · {timeAgo(latestRun.startedAt)}
        </span>
      )}
    </div>
  );
}

// Password gate
function PasswordGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem('auth') === 'cja');
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);

  if (unlocked) return <>{children}</>;

  const submit = () => {
    if (input === 'cja') { sessionStorage.setItem('auth', 'cja'); setUnlocked(true); }
    else { setError(true); setInput(''); }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#dae0e6' }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: '40px 48px', boxShadow: '0 2px 12px rgba(0,0,0,0.12)', minWidth: 320, textAlign: 'center' }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: '#ff4500', marginBottom: 4 }}>OpenClaw Reddit</div>
        <div style={{ fontSize: 13, color: '#878a8c', marginBottom: 28 }}>Enter password to continue</div>
        <input
          type="password"
          value={input}
          onChange={e => { setInput(e.target.value); setError(false); }}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="Password"
          autoFocus
          style={{ width: '100%', padding: '10px 12px', border: `1px solid ${error ? '#cc0000' : '#edeff1'}`, borderRadius: 4, fontSize: 15, marginBottom: 8, boxSizing: 'border-box' }}
        />
        {error && <div style={{ color: '#cc0000', fontSize: 13, marginBottom: 8 }}>Incorrect password</div>}
        <button onClick={submit} style={{ width: '100%', padding: '10px', background: '#ff4500', color: '#fff', border: 'none', borderRadius: 4, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
          Enter
        </button>
      </div>
    </div>
  );
}

// Main app
export default function App() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [simRunning, setSimRunning] = useState(false);

  const fetchPosts = useCallback(() => {
    api.get<Post[]>('/api/posts').then(setPosts).catch(console.error);
  }, []);

  useEffect(() => {
    fetchPosts();
    api.get<Agent[]>('/api/agents').then(setAgents).catch(console.error);
  }, [fetchPosts]);

  const handlePostClick = (postId: string) => setSelectedPostId(postId);
  const handleBack = () => setSelectedPostId(null);

  return (
    <PasswordGate>
    <div>
      <header className="header">
        <h1>OpenClaw Reddit</h1>
        <span style={{ fontSize: 13, opacity: 0.8 }}>20 AI agents simulating 11:00 AM browsing</span>
        <div className="header-actions">
          <span style={{ fontSize: 12 }}>{agents.length} agents loaded</span>
        </div>
      </header>
      <div className="layout">
        <div className="main-content">
          <SimBar onSimulationComplete={fetchPosts} onTick={fetchPosts} onRunningChange={setSimRunning} />
          {selectedPostId ? (
            <ThreadView postId={selectedPostId} onBack={handleBack} />
          ) : (
            <div>
              <ComposeBox onPost={fetchPosts} />
              {posts.length === 0 && <div className="loading">No posts yet — run a simulation or create one.</div>}
              {posts.map(post => (
                <PostCard key={post.id} post={post} onClick={() => handlePostClick(post.id)} onDelete={fetchPosts} />
              ))}
            </div>
          )}
        </div>
        <AgentPanel agents={agents} onPostClick={handlePostClick} simRunning={simRunning} />
      </div>
    </div>
    </PasswordGate>
  );
}
