import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Avatar, Menu, MenuItem, Tabs, useToast } from '../../components/ui.jsx';
import { RichEditor, RichView, isEmptyHtml } from '../../components/RichText.jsx';
import Icon from '../../components/Icon.jsx';
import { useUser } from '../../user.js';
import { timeAgo, fmtDateTime, shortSha, copyText } from '../../util.js';
import { appLink } from '../../api.js';
import { TypeIcon, StatusLozenge, EpicLozenge, PriorityIcon, isDone, TYPES } from './issueMeta.jsx';
import { UserPicker, TypePicker, PriorityPicker, SprintPicker, EpicPicker, StatusPicker, LabelsInput, allLabels } from './fields.jsx';

export default function IssueModal({ ctx, issue, onClose }) {
  const { board, users, project } = ctx;
  const user = useUser();
  const toast = useToast();
  const [tab, setTab] = useState('comments');
  const upd = (patch) => ctx.updateIssue(issue.id, patch).catch(() => {});

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape' && !document.querySelector('.ProseMirror-focused')) onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const epic = board.issues.find((i) => i.id === issue.epicId);
  const parent = board.issues.find((i) => i.id === issue.parentId);
  const children = issue.type === 'epic'
    ? board.issues.filter((i) => i.epicId === issue.id)
    : board.issues.filter((i) => i.parentId === issue.id);
  const doneCount = children.filter((c) => isDone(board, c)).length;
  const typeOptions = issue.type === 'subtask' ? ['subtask'] : ['story', 'task', 'bug', 'epic'];

  const remove = async () => {
    if (!window.confirm(`Delete ${issue.key}${children.length && issue.type !== 'epic' ? ' and its subtasks' : ''}? This can't be undone.`)) return;
    onClose();
    await ctx.deleteIssue(issue.id);
    toast(`${issue.key} deleted`);
  };

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal issue-modal" role="dialog" aria-modal="true">
        <div className="issue-modal-head">
          <div className="issue-crumbs">
            {epic && <><button className="link-btn" onClick={() => ctx.openIssue(epic.key)}><TypeIcon type="epic" size={14} /> {epic.key}</button><span>/</span></>}
            {parent && <><button className="link-btn" onClick={() => ctx.openIssue(parent.key)}><TypeIcon type={parent.type} size={14} /> {parent.key}</button><span>/</span></>}
            <Menu trigger={(o, t) => <button className="link-btn" onClick={t} title="Change type"><TypeIcon type={issue.type} size={14} /></button>}>
              {typeOptions.map((t) => <MenuItem key={t} active={t === issue.type} onClick={() => upd({ type: t, ...(t === 'epic' ? { epicId: null } : {}) })}><TypeIcon type={t} /> {TYPES[t].label}</MenuItem>)}
            </Menu>
            <button className="link-btn" onClick={() => { copyText(appLink(`/${project.key}/boards/issues?issue=${issue.key}`)); toast('Link copied'); }}>{issue.key}</button>
          </div>
          <div className="push" />
          <button className="icon-btn" title="Copy link" onClick={() => { copyText(appLink(`/${project.key}/boards/issues?issue=${issue.key}`)); toast('Link copied'); }}><Icon name="link" /></button>
          <Menu align="right" trigger={(o, t) => <button className="icon-btn" onClick={t}><Icon name="more" /></button>}>
            <MenuItem icon="trash" danger onClick={remove}>Delete</MenuItem>
          </Menu>
          <button className="icon-btn" onClick={onClose} title="Close"><Icon name="close" /></button>
        </div>

        <div className="issue-modal-body">
          <div className="issue-main">
            <InlineTitle value={issue.title} onSave={(title) => upd({ title })} />
            <div className="issue-actions">
              {issue.type === 'epic' && (
                <button className="btn btn-subtle" onClick={() => ctx.openCreate({ epicId: issue.id })}>
                  <Icon name="plus" /> Add issue to epic
                </button>
              )}
            </div>

            <h4 className="section-label">Description</h4>
            <Description issue={issue} onSave={(description) => upd({ description })} />

            {issue.type !== 'subtask' && (
              <section className="child-issues">
                <div className="section-row">
                  <h4 className="section-label">{issue.type === 'epic' ? 'Issues in this epic' : 'Child issues'}</h4>
                  {children.length > 0 && (
                    <div className="progress" title={`${doneCount} of ${children.length} done`}>
                      <span style={{ width: `${(doneCount / children.length) * 100}%` }} />
                    </div>
                  )}
                  {children.length > 0 && <span className="muted small">{Math.round((doneCount / children.length) * 100)}% done</span>}
                </div>
                <ul className="child-list">
                  {children.map((c) => (
                    <li key={c.id} onClick={() => ctx.openIssue(c.key)}>
                      <TypeIcon type={c.type} />
                      <span className={`issue-key ${isDone(board, c) ? 'done' : ''}`}>{c.key}</span>
                      <span className="ellipsis">{c.title}</span>
                      <PriorityIcon priority={c.priority} />
                      <Avatar name={c.assignee} size={22} />
                      <StatusLozenge column={board.columns.find((col) => col.id === c.status)} />
                    </li>
                  ))}
                </ul>
                {issue.type !== 'epic' && <QuickChild ctx={ctx} parent={issue} />}
              </section>
            )}

            <Development ctx={ctx} issue={issue} />

            <h4 className="section-label">Activity</h4>
            <Tabs value={tab} onChange={setTab} tabs={[{ value: 'comments', label: 'Comments', count: issue.comments.length }, { value: 'history', label: 'History' }]} />
            {tab === 'comments' ? <Comments ctx={ctx} issue={issue} user={user} /> : (
              <ul className="history">
                {[...issue.history].reverse().map((h, i) => (
                  <li key={i}>
                    <Avatar name={h.by} size={24} />
                    <div>
                      <b>{h.by}</b> {h.action === 'created' ? 'created the issue' : <>changed the <b>{fieldLabel(h.field)}</b></>}
                      <span className="muted small"> {timeAgo(h.at)}</span>
                      {h.field && <div className="history-change"><span className="from">{h.from}</span> → <span>{h.to}</span></div>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <aside className="issue-side">
            <div className="row">
              <StatusPicker board={board} value={issue.status} onChange={(status) => upd({ status })} />
            </div>
            <div className="details-box">
              <div className="details-head">Details</div>
              <dl className="details">
                <dt>Assignee</dt>
                <dd>
                  <UserPicker users={users} value={issue.assignee} onChange={(assignee) => upd({ assignee })} />
                  {issue.assignee !== user.name && <button className="link-btn small" onClick={() => upd({ assignee: user.name })}>Assign to me</button>}
                </dd>
                <dt>Reporter</dt><dd><UserPicker users={users} value={issue.reporter} onChange={(reporter) => upd({ reporter })} noneLabel="None" /></dd>
                <dt>Priority</dt><dd><PriorityPicker value={issue.priority} onChange={(priority) => upd({ priority })} /></dd>
                <dt>Labels</dt><dd><LabelsInput value={issue.labels} onChange={(labels) => upd({ labels })} suggestions={allLabels(board)} /></dd>
                {issue.type !== 'epic' && (<><dt>Story points</dt><dd><PointsInput value={issue.storyPoints} onSave={(storyPoints) => upd({ storyPoints })} /></dd></>)}
                {issue.type !== 'subtask' && issue.type !== 'epic' && (<><dt>Sprint</dt><dd><SprintPicker board={board} value={issue.sprintId} onChange={(sprintId) => upd({ sprintId })} /></dd></>)}
                {issue.type !== 'subtask' && issue.type !== 'epic' && (<><dt>Epic</dt><dd><EpicPicker board={board} value={issue.epicId} onChange={(epicId) => upd({ epicId })} /></dd></>)}
                <dt>Due date</dt><dd><input className="input input-ghost" type="date" value={issue.dueDate || ''} onChange={(e) => upd({ dueDate: e.target.value || null })} /></dd>
              </dl>
            </div>
            <div className="muted small timestamps">
              <div>Created {fmtDateTime(issue.createdAt)}</div>
              <div>Updated {timeAgo(issue.updatedAt)}</div>
            </div>
          </aside>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const FIELD_LABELS = { title: 'Summary', storyPoints: 'Story points', sprintId: 'Sprint', epicId: 'Epic', parentId: 'Parent', dueDate: 'Due date' };
const fieldLabel = (f) => FIELD_LABELS[f] || f.charAt(0).toUpperCase() + f.slice(1);

function InlineTitle({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  if (!editing) return <h1 className="issue-title" onClick={() => setEditing(true)}>{value}</h1>;
  const save = () => { setEditing(false); if (v.trim() && v !== value) onSave(v.trim()); else setV(value); };
  return (
    <textarea
      className="input issue-title-input"
      autoFocus
      value={v}
      rows={1}
      onChange={(e) => setV(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') { setV(value); setEditing(false); } }}
    />
  );
}

function Description({ issue, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(issue.description);
  if (!editing) {
    return (
      <div className="description-view" onClick={(e) => { if (!e.target.closest('a')) { setDraft(issue.description); setEditing(true); } }}>
        {isEmptyHtml(issue.description) ? <p className="placeholder">Add a description…</p> : <RichView html={issue.description} />}
      </div>
    );
  }
  return (
    <div className="description-edit">
      <RichEditor value={draft} onChange={setDraft} autoFocus full placeholder="Add a description…" minHeight={140} />
      <div className="row">
        <button className="btn btn-jira" onClick={() => { onSave(draft); setEditing(false); }}>Save</button>
        <button className="btn btn-subtle" onClick={() => setEditing(false)}>Cancel</button>
      </div>
    </div>
  );
}

function PointsInput({ value, onSave }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => setV(value ?? ''), [value]);
  const save = () => { const n = v === '' ? null : Number(v); if (n !== value) onSave(n); };
  return <input className="input input-ghost" type="number" min="0" step="0.5" value={v} placeholder="None" onChange={(e) => setV(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === 'Enter' && e.target.blur()} />;
}

function QuickChild({ ctx, parent }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  if (!open) return <button className="btn btn-subtle" onClick={() => setOpen(true)}><Icon name="plus" /> Add a child issue</button>;
  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    await ctx.createIssue({ type: 'subtask', title, parentId: parent.id, sprintId: parent.sprintId, epicId: parent.epicId });
    setTitle('');
  };
  return (
    <form className="quick-create" onSubmit={submit}>
      <TypeIcon type="subtask" />
      <input className="input" autoFocus placeholder="What needs to be done?" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)} />
      <button className="btn btn-jira btn-sm" disabled={!title.trim()}>Create</button>
      <button type="button" className="btn btn-subtle btn-sm" onClick={() => setOpen(false)}>Cancel</button>
    </form>
  );
}

function Development({ ctx, issue }) {
  const [dev, setDev] = useState(null);
  useEffect(() => { ctx.development(issue.id).then(setDev).catch(() => setDev({ commits: [], pulls: [] })); }, [issue.id, ctx]);
  if (!dev || (!dev.commits.length && !dev.pulls.length)) return null;
  const k = ctx.project.key;
  return (
    <section className="development">
      <h4 className="section-label">Development</h4>
      <ul className="plain-list">
        {dev.pulls.map((p) => (
          <li key={`${p.repo}-${p.id}`}>
            <Link to={`/${k}/repos/${encodeURIComponent(p.repo)}/pulls/${p.id}`} className="row-link">
              <Icon name="pr" /> <span className="ellipsis">!{p.id} {p.title}</span> <span className={`pr-status pr-${p.status}`}>{p.status}</span>
            </Link>
          </li>
        ))}
        {dev.commits.map((c) => (
          <li key={c.sha}>
            <Link to={`/${k}/repos/${encodeURIComponent(c.repo)}/commit/${c.sha}`} className="row-link">
              <Icon name="commit" /> <span className="mono sha">{shortSha(c.sha)}</span> <span className="ellipsis">{c.subject}</span>
              <span className="muted small push">{c.repo} · {timeAgo(c.date)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Comments({ ctx, issue, user }) {
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  const [editing, setEditing] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const save = async () => {
    if (isEmptyHtml(draft)) return;
    await ctx.addComment(issue.id, draft);
    setDraft('');
    setKey((k) => k + 1);
    setOpen(false);
  };
  return (
    <div className="comments">
      <div className="comment-new">
        <Avatar name={user.name} size={32} />
        {open ? (
          <div className="grow">
            <RichEditor key={key} value="" onChange={setDraft} autoFocus placeholder="Add a comment…" minHeight={80} />
            <div className="row">
              <button className="btn btn-jira" onClick={save}>Save</button>
              <button className="btn btn-subtle" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="comment-placeholder" onClick={() => setOpen(true)}>Add a comment…</button>
        )}
      </div>
      {[...issue.comments].reverse().map((c) => (
        <div key={c.id} className="comment">
          <Avatar name={c.author} size={32} />
          <div className="grow">
            <div><b>{c.author}</b> <span className="muted small">{timeAgo(c.createdAt)}{c.editedAt && ' (edited)'}</span></div>
            {editing === c.id ? (
              <>
                <RichEditor value={c.body} onChange={setEditDraft} autoFocus minHeight={60} />
                <div className="row">
                  <button className="btn btn-jira btn-sm" onClick={async () => { await ctx.editComment(issue.id, c.id, editDraft || c.body); setEditing(null); }}>Save</button>
                  <button className="btn btn-subtle btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </>
            ) : <RichView html={c.body} />}
            {c.author === user.name && editing !== c.id && (
              <div className="comment-actions">
                <button className="link-btn" onClick={() => { setEditing(c.id); setEditDraft(c.body); }}>Edit</button>
                <button className="link-btn" onClick={() => window.confirm('Delete this comment?') && ctx.deleteComment(issue.id, c.id)}>Delete</button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export { EpicLozenge };
