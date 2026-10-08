import { useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { api, repoApi } from '../../api.js';
import { useAsync, timeAgo, fmtDateTime, shortSha } from '../../util.js';
import { useUser } from '../../user.js';
import { Spinner, ErrorBox, Avatar, Tabs, Menu, MenuItem, Modal, useToast } from '../../components/ui.jsx';
import { Markdown } from '../../components/RichText.jsx';
import Icon from '../../components/Icon.jsx';
import { DiffView } from './repoBits.jsx';
import { CommitRows } from './NewPullRequest.jsx';
import { PrStatus, VOTE_LABEL } from './PullRequests.jsx';
import { linkifyKeys } from '../boards/issueMeta.jsx';

export default function PullRequestDetail() {
  const { project, repo, reloadRepo } = useOutletContext();
  const { id } = useParams();
  const user = useUser();
  const base = `${repoApi(project.key, repo.name)}/pulls/${id}`;
  const { data: pr, error, reload, setData } = useAsync(() => api.get(base), [base]);
  const [tab, setTab] = useState('overview');
  const [comment, setComment] = useState('');
  const [completing, setCompleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const toast = useToast();

  if (error) return <main className="page"><ErrorBox error={error} /></main>;
  if (!pr) return <Spinner />;

  const merge = (patch) => setData((d) => ({ ...d, ...patch }));
  const act = async (fn, msg) => {
    try { const r = await fn(); if (r) merge(r); if (msg) toast(msg); } catch (e) { toast(e, 'error'); }
  };
  const myVote = pr.reviewers.find((r) => r.name === user.name)?.vote;
  const diff = pr.diff || {};
  const timeline = [
    ...pr.comments.map((c) => ({ ...c, kind: 'comment', at: c.createdAt })),
    ...pr.reviewers.map((r) => ({ id: `v-${r.name}`, kind: 'vote', author: r.name, vote: r.vote, at: r.at })),
    ...(pr.status === 'completed' ? [{ id: 'done', kind: 'completed', author: pr.completedBy, at: pr.completedAt }] : []),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <main className="page repo-page pr-detail">
      <div className="pr-header">
        <div className="pr-header-top">
          <PrStatus status={pr.status} />
          <span className="muted">!{pr.id}</span>
          {editing ? (
            <EditTitle pr={pr} onCancel={() => setEditing(false)} onSave={async (title) => { await act(() => api.patch(base, { title })); setEditing(false); }} />
          ) : (
            <h1 onDoubleClick={() => pr.status === 'active' && setEditing(true)}>{linkifyKeys(pr.title, project.key)}</h1>
          )}
          <div className="push" />
          {pr.status === 'active' && (
            <>
              <Menu align="right" trigger={(o, t) => (
                <button className={`btn ${myVote ? `vote-btn vote-${myVote}` : ''}`} onClick={t}>
                  <Icon name="check" /> {myVote ? VOTE_LABEL[myVote] : 'Approve'} <Icon name="chevronDown" />
                </button>
              )}>
                {Object.entries(VOTE_LABEL).map(([v, label]) => (
                  <MenuItem key={v} active={myVote === v} onClick={() => act(() => api.post(`${base}/vote`, { vote: v }))}>{label}</MenuItem>
                ))}
                <div className="menu-divider" />
                <MenuItem onClick={() => act(() => api.post(`${base}/vote`, { vote: 'none' }))}>Reset feedback</MenuItem>
              </Menu>
              <button className="btn btn-primary" disabled={!diff.mergeable} title={diff.mergeable ? '' : 'Resolve conflicts first'} onClick={() => setCompleting(true)}>Complete</button>
              <Menu align="right" trigger={(o, t) => <button className="icon-btn" onClick={t}><Icon name="more" /></button>}>
                <MenuItem icon="edit" onClick={() => setEditing(true)}>Edit title</MenuItem>
                <MenuItem icon="close" danger onClick={() => act(() => api.post(`${base}/status`, { status: 'abandoned' }), 'Pull request abandoned')}>Abandon</MenuItem>
              </Menu>
            </>
          )}
          {pr.status === 'abandoned' && <button className="btn" onClick={() => act(() => api.post(`${base}/status`, { status: 'active' }).then(() => { reload(); }), 'Reactivated')}>Reactivate</button>}
        </div>
        <div className="muted">
          <Avatar name={pr.createdBy} size={20} /> {pr.createdBy} wants to merge <span className="mono chip">{pr.source}</span> into <span className="mono chip">{pr.target}</span>
          {pr.status === 'completed' && <> · merged {timeAgo(pr.completedAt)} as <span className="mono">{shortSha(pr.mergeSha)}</span></>}
        </div>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'overview', label: 'Overview' },
        { value: 'files', label: 'Files', count: diff.files?.length || 0 },
        { value: 'commits', label: 'Commits', count: diff.commits?.length || 0 },
      ]} />
      {diff.error && <div className="notice warn">{diff.error}</div>}

      {tab === 'overview' && (
        <div className="pr-overview">
          <div className="pr-thread">
            {pr.status === 'active' && diff.mergeable === false && (
              <div className="notice warn"><Icon name="warning" /> Merge conflicts in {diff.conflicts.join(', ')}. Resolve them locally and push to <span className="mono">{pr.source}</span>.</div>
            )}
            {pr.status === 'active' && diff.mergeable && <div className="notice ok"><Icon name="check" /> No merge conflicts. This pull request can be completed.</div>}
            <div className="card">
              <h4>Description</h4>
              {pr.description ? <Markdown source={pr.description} /> : <p className="muted">No description provided.</p>}
            </div>
            {timeline.map((t) => (
              <div key={t.id} className="timeline-item">
                <Avatar name={t.author} size={28} />
                <div className="timeline-body card">
                  <div className="small"><b>{t.author}</b> <span className="muted">{fmtDateTime(t.at)}</span></div>
                  {t.kind === 'comment' && (
                    <>
                      {t.file && <div className="muted small mono">{t.file}{t.line ? `:${t.line}` : ''}</div>}
                      <Markdown source={t.body} />
                    </>
                  )}
                  {t.kind === 'vote' && <div className={`vote-text vote-${t.vote}`}>voted <b>{VOTE_LABEL[t.vote]}</b></div>}
                  {t.kind === 'completed' && <div>completed the pull request {pr.squash ? '(squash merge)' : '(merge commit)'}</div>}
                </div>
              </div>
            ))}
            <div className="timeline-item">
              <Avatar name={user.name} size={28} />
              <div className="timeline-body">
                <textarea className="input" rows={3} placeholder="Add a comment (Markdown supported)" value={comment} onChange={(e) => setComment(e.target.value)} />
                <div className="form-actions">
                  <button className="btn btn-primary" disabled={!comment.trim()} onClick={() => act(() => api.post(`${base}/comments`, { body: comment })).then(() => setComment(''))}>Comment</button>
                </div>
              </div>
            </div>
          </div>
          <aside className="pr-aside card">
            <h4>Reviewers</h4>
            {!pr.reviewers.length && <p className="muted small">No reviews yet.</p>}
            {pr.reviewers.map((r) => (
              <div key={r.name} className="reviewer"><Avatar name={r.name} size={24} /> {r.name} <span className={`vote-pill vote-${r.vote}`}>{VOTE_LABEL[r.vote]}</span></div>
            ))}
            <h4>Work items</h4>
            <WorkItemRefs text={`${pr.title} ${pr.description} ${pr.source}`} projectKey={project.key} />
          </aside>
        </div>
      )}
      {tab === 'files' && (
        <DiffView files={diff.files} truncated={diff.truncated} comments={pr.comments}
          onComment={pr.status === 'active' ? (c) => act(() => api.post(`${base}/comments`, c)) : undefined} />
      )}
      {tab === 'commits' && <CommitRows commits={diff.commits || []} linkBase={`/${project.key}/repos/${encodeURIComponent(repo.name)}`} />}
      {completing && (
        <CompleteDialog pr={pr} onClose={() => setCompleting(false)} onDone={async (opts) => {
          await act(() => api.post(`${base}/complete`, opts), `Merged !${pr.id} into ${pr.target}`);
          setCompleting(false);
          reloadRepo();
          reload();
        }} />
      )}
    </main>
  );
}

function EditTitle({ pr, onSave, onCancel }) {
  const [t, setT] = useState(pr.title);
  return (
    <form className="row grow" onSubmit={(e) => { e.preventDefault(); onSave(t); }}>
      <input className="input" autoFocus value={t} onChange={(e) => setT(e.target.value)} />
      <button className="btn btn-primary btn-sm">Save</button>
      <button type="button" className="btn btn-sm" onClick={onCancel}>Cancel</button>
    </form>
  );
}

function WorkItemRefs({ text, projectKey }) {
  const keys = [...new Set((text.match(new RegExp(`\\b${projectKey}-\\d+\\b`, 'gi')) || []).map((k) => k.toUpperCase()))];
  if (!keys.length) return <p className="muted small">Mention a work item key (e.g. {projectKey}-1) in the title or description to link it.</p>;
  return <div className="chips">{keys.map((k) => <span key={k}>{linkifyKeys(k, projectKey)}</span>)}</div>;
}

function CompleteDialog({ pr, onClose, onDone }) {
  const [squash, setSquash] = useState(false);
  const [deleteSource, setDeleteSource] = useState(true);
  const [message, setMessage] = useState(`Merged PR ${pr.id}: ${pr.title}`);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Complete pull request" onClose={onClose} width={500}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={async () => { setBusy(true); await onDone({ squash, deleteSource, message }); setBusy(false); }}>{busy ? 'Merging…' : 'Complete merge'}</button></>}>
      <div className="form">
        <label className="field"><span>Merge type</span>
          <select className="input" value={squash ? 'squash' : 'merge'} onChange={(e) => setSquash(e.target.value === 'squash')}>
            <option value="merge">Merge (no fast-forward)</option>
            <option value="squash">Squash commit</option>
          </select>
        </label>
        <label className="field"><span>Merge commit message</span><textarea className="input" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} /></label>
        <label className="check"><input type="checkbox" checked={deleteSource} onChange={(e) => setDeleteSource(e.target.checked)} /> Delete <span className="mono">{pr.source}</span> after merging</label>
      </div>
    </Modal>
  );
}
