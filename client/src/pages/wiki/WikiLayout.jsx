import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { api } from '../../api.js';
import { Spinner, ErrorBox, Modal, Menu, MenuItem, useToast } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import { ProjectTile } from '../Projects.jsx';
import { TEMPLATES } from './templates.js';

export function buildTree(pages) {
  const byParent = new Map();
  for (const p of pages) {
    const k = p.parentId || null;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k).push(p);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
  return byParent;
}

export function ancestors(pages, id) {
  const out = [];
  let cur = pages.find((p) => p.id === id);
  while (cur?.parentId) {
    cur = pages.find((p) => p.id === cur.parentId);
    if (cur) out.unshift(cur);
  }
  return out;
}

export default function WikiLayout() {
  const { project } = useOutletContext();
  const [index, setIndex] = useState(null);
  const [error, setError] = useState(null);
  const [creatingUnder, setCreatingUnder] = useState(undefined);
  const [expanded, setExpanded] = useState({});
  const [search, setSearch] = useState('');
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useToast();
  const base = `/api/projects/${project.key}/wiki`;

  const reloadIndex = useCallback(() => api.get(base).then(setIndex).catch(setError), [base]);
  useEffect(() => { reloadIndex(); }, [reloadIndex]);

  const tree = useMemo(() => buildTree(index?.pages || []), [index]);
  const currentId = loc.pathname.split('/')[3];

  // Auto-expand ancestors of the current page
  useEffect(() => {
    if (!index || !currentId) return;
    const anc = ancestors(index.pages, currentId);
    if (anc.length) setExpanded((e) => ({ ...e, ...Object.fromEntries(anc.map((a) => [a.id, true])) }));
  }, [index, currentId]);

  const createPage = async (parentId, template) => {
    const t = TEMPLATES.find((x) => x.id === template) || TEMPLATES[0];
    const title = (typeof t.title === 'function' ? t.title() : t.title) || 'Untitled';
    try {
      const page = await api.post(`${base}/pages`, { parentId, title, content: t.content() });
      await reloadIndex();
      if (parentId) setExpanded((e) => ({ ...e, [parentId]: true }));
      nav(`/${project.key}/wiki/${page.id}/edit?new=1`);
    } catch (e) { toast(e, 'error'); }
  };

  const deletePage = async (page) => {
    const kids = (index.pages || []).filter((p) => p.parentId === page.id).length;
    if (!window.confirm(`Delete "${page.title}"${kids ? ' and all of its child pages' : ''}?`)) return;
    try {
      const idx = await api.del(`${base}/pages/${page.id}`);
      setIndex(idx);
      toast('Page deleted');
      if (currentId === page.id || !idx.pages.some((p) => p.id === currentId)) nav(`/${project.key}/wiki`);
    } catch (e) { toast(e, 'error'); }
  };

  if (error) return <main className="page"><ErrorBox error={error} onRetry={reloadIndex} /></main>;
  if (!index) return <Spinner />;

  const ctx = {
    project, index, setIndex, reloadIndex, base,
    openCreate: (parentId) => setCreatingUnder(parentId ?? null),
    deletePage,
  };
  const editing = loc.pathname.endsWith('/edit');

  return (
    <div className={`confluence ${editing ? 'editing' : ''}`}>
      {!editing && (
        <aside className="cf-sidebar">
          <div className="cf-space">
            <ProjectTile project={project} size={32} />
            <div>
              <div className="cf-space-name">{project.name}</div>
              <div className="muted small">Knowledge space</div>
            </div>
          </div>
          <form className="cf-search" onSubmit={(e) => { e.preventDefault(); if (search.trim()) nav(`/${project.key}/wiki?q=${encodeURIComponent(search.trim())}`); }}>
            <Icon name="search" />
            <input placeholder="Search this space" value={search} onChange={(e) => setSearch(e.target.value)} />
          </form>
          <div className="cf-section-head">
            <span>Pages</span>
            <button className="icon-btn" title="Create a page" onClick={() => setCreatingUnder(null)}><Icon name="plus" size={14} /></button>
          </div>
          <ul className="cf-tree">
            {(tree.get(null) || []).map((p) => (
              <TreeNode key={p.id} page={p} tree={tree} depth={0} ctx={ctx} expanded={expanded} setExpanded={setExpanded} />
            ))}
          </ul>
        </aside>
      )}
      <div className="cf-main">
        <Outlet context={ctx} />
      </div>
      {creatingUnder !== undefined && (
        <TemplatePicker
          parent={index.pages.find((p) => p.id === creatingUnder)}
          onClose={() => setCreatingUnder(undefined)}
          onPick={(tpl) => { const parent = creatingUnder; setCreatingUnder(undefined); createPage(parent, tpl); }}
        />
      )}
    </div>
  );
}

function TreeNode({ page, tree, depth, ctx, expanded, setExpanded }) {
  const kids = tree.get(page.id) || [];
  const open = expanded[page.id];
  return (
    <li>
      <div className="cf-node" style={{ paddingLeft: 6 + depth * 14 }}>
        <button className={`cf-chev ${kids.length ? '' : 'invisible'}`} onClick={() => setExpanded((e) => ({ ...e, [page.id]: !open }))}>
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} />
        </button>
        <NavLink to={`/${ctx.project.key}/wiki/${page.id}`} className="cf-node-link" title={page.title}>
          <Icon name="page" size={14} /> <span className="ellipsis">{page.title}</span>
        </NavLink>
        <span className="cf-node-actions">
          <Menu align="right" trigger={(o, t) => <button className="icon-btn" onClick={t}><Icon name="more" size={14} /></button>}>
            <MenuItem icon="plus" onClick={() => ctx.openCreate(page.id)}>Create child page</MenuItem>
            <MenuItem icon="trash" danger onClick={() => ctx.deletePage(page)}>Delete</MenuItem>
          </Menu>
          <button className="icon-btn" title="Create child page" onClick={() => ctx.openCreate(page.id)}><Icon name="plus" size={14} /></button>
        </span>
      </div>
      {open && kids.length > 0 && (
        <ul>
          {kids.map((k) => <TreeNode key={k.id} page={k} tree={tree} depth={depth + 1} ctx={ctx} expanded={expanded} setExpanded={setExpanded} />)}
        </ul>
      )}
    </li>
  );
}

function TemplatePicker({ parent, onClose, onPick }) {
  const [sel, setSel] = useState('blank');
  return (
    <Modal title="Create" onClose={onClose} width={720} className="cf-modal"
      footer={<><button className="btn btn-subtle" onClick={onClose}>Cancel</button><button className="btn btn-cf" onClick={() => onPick(sel)}>Create</button></>}>
      {parent && <p className="muted small">Creating under <b>{parent.title}</b></p>}
      <div className="template-grid">
        {TEMPLATES.map((t) => (
          <button key={t.id} className={`template-card ${sel === t.id ? 'selected' : ''}`} onClick={() => setSel(t.id)} onDoubleClick={() => onPick(t.id)}>
            <span className="template-icon">{t.icon}</span>
            <b>{t.name}</b>
            <span className="muted small">{t.description}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function useWiki() {
  return useOutletContext();
}
