import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAsync, timeAgo, fmtDate, copyText } from '../../util.js';
import { useUser } from '../../user.js';
import { Spinner, ErrorBox, Avatar, Menu, MenuItem, Modal, useToast } from '../../components/ui.jsx';
import { RichView, RichEditor, isEmptyHtml } from '../../components/RichText.jsx';
import Icon from '../../components/Icon.jsx';
import { useWiki, ancestors, buildTree } from './WikiLayout.jsx';

export default function PageView() {
  const ctx = useWiki();
  const { pageId } = useParams();
  const { data: page, error, setData, reload } = useAsync(() => api.get(`${ctx.base}/pages/${pageId}`), [ctx.base, pageId]);
  const user = useUser();
  const nav = useNavigate();
  const toast = useToast();
  const [moving, setMoving] = useState(false);

  if (error) return <main className="cf-page"><ErrorBox error={error} onRetry={reload} /></main>;
  if (!page || page.id !== pageId) return <Spinner />;

  const crumbs = ancestors(ctx.index.pages, page.id);
  const children = buildTree(ctx.index.pages).get(page.id) || [];
  const words = page.content.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  const liked = page.likes?.includes(user.name);
  const pageApi = `${ctx.base}/pages/${page.id}`;

  const saveLabels = async (labels) => {
    try { setData(await api.put(pageApi, { labels })); } catch (e) { toast(e, 'error'); }
  };

  return (
    <main className="cf-page">
      <div className="cf-topline">
        <nav className="cf-crumbs">
          <Link to={`/${ctx.project.key}/wiki`}>{ctx.project.name}</Link>
          {crumbs.map((c) => <span key={c.id}> / <Link to={`/${ctx.project.key}/wiki/${c.id}`}>{c.title}</Link></span>)}
        </nav>
        <div className="cf-actions">
          <button className="btn btn-subtle" title="Edit (E)" onClick={() => nav('edit')}><Icon name="edit" /> Edit</button>
          <button className={`btn btn-subtle ${liked ? 'liked' : ''}`} title="Like" onClick={async () => setData(await api.post(`${pageApi}/like`))}>
            <Icon name="like" /> {page.likes?.length || ''}
          </button>
          <button className="btn btn-subtle" title="Copy link" onClick={() => { copyText(window.location.href); toast('Link copied'); }}><Icon name="link" /></button>
          <Menu align="right" trigger={(o, t) => <button className="btn btn-subtle" onClick={t}><Icon name="more" /></button>}>
            <MenuItem icon="history" onClick={() => nav('history')}>Page history</MenuItem>
            <MenuItem icon="plus" onClick={() => ctx.openCreate(page.id)}>Create child page</MenuItem>
            <MenuItem icon="move" onClick={() => setMoving(true)}>Move</MenuItem>
            <div className="menu-divider" />
            <MenuItem icon="trash" danger onClick={() => ctx.deletePage(page)}>Delete</MenuItem>
          </Menu>
        </div>
      </div>

      <h1 className="cf-title">{page.title}</h1>
      <div className="cf-byline">
        <Avatar name={page.createdBy} size={28} />
        <div>
          <div>Owned by <b>{page.createdBy}</b></div>
          <div className="muted small">
            {page.version > 1 ? <>Last updated: <Link to="history">{timeAgo(page.updatedAt)}</Link> by {page.updatedBy}</> : <>Created {fmtDate(page.createdAt)}</>}
            {' · '}{Math.max(1, Math.round(words / 200))} min read
          </div>
        </div>
      </div>

      <RichView html={page.content} className="cf-content" />

      {children.length > 0 && (
        <section className="cf-children">
          <h4>Child pages</h4>
          <ul>
            {children.map((c) => <li key={c.id}><Icon name="page" size={14} /> <Link to={`/${ctx.project.key}/wiki/${c.id}`}>{c.title}</Link></li>)}
          </ul>
        </section>
      )}

      <Labels labels={page.labels || []} onChange={saveLabels} />

      <div className="cf-likes muted small">
        {page.likes?.length ? <><Icon name="like" size={14} /> {page.likes.join(', ')} like{page.likes.length === 1 ? 's' : ''} this</> : 'Be the first to like this'}
      </div>

      <Comments page={page} pageApi={pageApi} setPage={setData} user={user} />
      {moving && <MoveDialog ctx={ctx} page={page} onClose={() => setMoving(false)} />}
    </main>
  );
}

function Labels({ labels, onChange }) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  return (
    <div className="cf-labels">
      <Icon name="tag" size={14} />
      {labels.map((l) => (
        <span key={l} className="cf-label">{l}<button onClick={() => onChange(labels.filter((x) => x !== l))}>×</button></span>
      ))}
      {adding ? (
        <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) onChange([...labels, text.trim()]); setText(''); setAdding(false); }}>
          <input className="input input-sm" autoFocus value={text} onChange={(e) => setText(e.target.value)} onBlur={() => setAdding(false)} placeholder="label" />
        </form>
      ) : <button className="link-btn small" onClick={() => setAdding(true)}>+ Add label</button>}
    </div>
  );
}

function Comments({ page, pageApi, setPage, user }) {
  const [draft, setDraft] = useState('');
  const [key, setKey] = useState(0);
  const [replyTo, setReplyTo] = useState(null);
  const [reply, setReply] = useState('');
  const toast = useToast();
  const roots = (page.comments || []).filter((c) => !c.parentId);
  const repliesOf = (id) => page.comments.filter((c) => c.parentId === id);

  const post = async (body, parentId = null) => {
    if (isEmptyHtml(body)) return;
    try { setPage(await api.post(`${pageApi}/comments`, { body, parentId })); } catch (e) { toast(e, 'error'); }
  };

  const renderComment = (c, nested) => (
    <div key={c.id} className={`cf-comment ${nested ? 'nested' : ''}`}>
      <Avatar name={c.author} size={28} />
      <div className="grow">
        <div><b>{c.author}</b></div>
        <RichView html={c.body} />
        <div className="cf-comment-actions small">
          {!nested && <button className="link-btn" onClick={() => { setReplyTo(c.id); setReply(''); }}>Reply</button>}
          {c.author === user.name && <button className="link-btn" onClick={async () => setPage(await api.del(`${pageApi}/comments/${c.id}`))}>Delete</button>}
          <span className="muted">{timeAgo(c.createdAt)}</span>
        </div>
        {!nested && repliesOf(c.id).map((r) => renderComment(r, true))}
        {replyTo === c.id && (
          <div className="cf-comment nested">
            <Avatar name={user.name} size={28} />
            <div className="grow">
              <RichEditor value="" onChange={setReply} autoFocus placeholder="Reply…" minHeight={60} />
              <div className="row">
                <button className="btn btn-cf btn-sm" onClick={async () => { await post(reply, c.id); setReplyTo(null); }}>Save</button>
                <button className="btn btn-subtle btn-sm" onClick={() => setReplyTo(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <section className="cf-comments">
      <h3>{page.comments?.length || 0} Comment{page.comments?.length === 1 ? '' : 's'}</h3>
      {roots.map((c) => renderComment(c, false))}
      <div className="cf-comment">
        <Avatar name={user.name} size={28} />
        <div className="grow">
          <RichEditor key={key} value="" onChange={setDraft} placeholder="Add a comment…" minHeight={60} />
          <div className="row">
            <button className="btn btn-cf btn-sm" disabled={isEmptyHtml(draft)} onClick={async () => { await post(draft); setDraft(''); setKey((k) => k + 1); }}>Save</button>
          </div>
        </div>
      </div>
    </section>
  );
}

function MoveDialog({ ctx, page, onClose }) {
  const descendants = new Set([page.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of ctx.index.pages) if (p.parentId && descendants.has(p.parentId) && !descendants.has(p.id)) { descendants.add(p.id); grew = true; }
  }
  const options = ctx.index.pages.filter((p) => !descendants.has(p.id));
  const meta = ctx.index.pages.find((p) => p.id === page.id);
  const [parentId, setParentId] = useState(meta?.parentId || '');
  const toast = useToast();
  const label = (p) => [...ancestors(ctx.index.pages, p.id).map((a) => a.title), p.title].join(' / ');
  const submit = async () => {
    try {
      ctx.setIndex(await api.post(`${ctx.base}/pages/${page.id}/move`, { parentId: parentId || null }));
      toast('Page moved');
      onClose();
    } catch (e) { toast(e, 'error'); }
  };
  return (
    <Modal title={`Move “${page.title}”`} onClose={onClose} width={480} className="cf-modal"
      footer={<><button className="btn btn-subtle" onClick={onClose}>Cancel</button><button className="btn btn-cf" onClick={submit}>Move</button></>}>
      <label className="field"><span>New parent page</span>
        <select className="input" value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">(Top level of space)</option>
          {options.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}
        </select>
      </label>
    </Modal>
  );
}
