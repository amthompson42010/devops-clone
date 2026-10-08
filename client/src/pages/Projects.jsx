import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAsync, timeAgo } from '../util.js';
import { Modal, Spinner, ErrorBox, Empty, useToast } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

export function ProjectTile({ project, size = 40 }) {
  return (
    <span className="project-tile" style={{ background: project.color, width: size, height: size, fontSize: size * 0.42 }}>
      {project.name[0]?.toUpperCase()}
    </span>
  );
}

export default function Projects() {
  const { data, loading, error, reload } = useAsync(() => api.get('/api/projects'), []);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('');
  const list = (data || []).filter((p) => !filter || `${p.name} ${p.key}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <main className="page projects-page">
      <div className="page-head">
        <h1>Projects</h1>
        <div className="page-actions">
          <div className="search-box">
            <Icon name="search" />
            <input placeholder="Filter projects" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="plus" /> New project</button>
        </div>
      </div>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data && <Spinner />}
      {data && !data.length && (
        <Empty icon="overview" title="Create your first project" action={<button className="btn btn-primary" onClick={() => setCreating(true)}>New project</button>}>
          Projects hold your repositories, boards and wiki pages.
        </Empty>
      )}
      <div className="project-grid">
        {list.map((p) => (
          <Link key={p.key} to={`/${p.key}`} className="project-card">
            <ProjectTile project={p} />
            <div className="project-card-body">
              <h3>{p.name}</h3>
              <span className="project-key">{p.key}</span>
              <p>{p.description || <span className="muted">No description</span>}</p>
              <span className="muted small">Created {timeAgo(p.createdAt)} by {p.createdBy}</span>
            </div>
          </Link>
        ))}
      </div>
      {creating && <CreateProject onClose={() => setCreating(false)} />}
    </main>
  );
}

function suggestKey(name) {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  let k = words.length > 1 ? words.map((w) => w[0]).join('') : words[0].slice(0, 4);
  if (!/^[A-Z]/.test(k)) k = `P${k}`;
  return k.slice(0, 10).padEnd(2, 'X');
}

function CreateProject({ onClose }) {
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [repoName, setRepoName] = useState('');
  const [repoTouched, setRepoTouched] = useState(false);
  const [start, setStart] = useState('readme');
  const [gitignore, setGitignore] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const nav = useNavigate();
  const toast = useToast();
  const effectiveKey = keyTouched ? key : suggestKey(name);
  const effectiveRepo = repoTouched ? repoName : name.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const p = await api.post('/api/projects', {
        name, key: effectiveKey, description, repoName: effectiveRepo, readme: start === 'readme', gitignore,
      });
      toast(`Project ${p.name} created`);
      if (start === 'upload') nav(`/${p.key}/repos/${encodeURIComponent(p.repoName)}/files?upload=1`);
      else nav(`/${p.key}`);
    } catch (ex) {
      setErr(ex);
      setBusy(false);
    }
  };
  return (
    <Modal title="Create new project" onClose={onClose} width={520}>
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Project name *</span>
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Customer Portal" />
        </label>
        <label className="field">
          <span>Key *</span>
          <input
            className="input mono"
            value={effectiveKey}
            maxLength={10}
            onChange={(e) => { setKeyTouched(true); setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); }}
          />
          <small className="muted">Used as the prefix for work items, e.g. {effectiveKey || 'KEY'}-123</small>
        </label>
        <label className="field">
          <span>Description</span>
          <textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <fieldset className="fieldset">
          <legend>Repository</legend>
          <label className="field">
            <span>Repository name *</span>
            <input className="input mono" value={effectiveRepo} onChange={(e) => { setRepoTouched(true); setRepoName(e.target.value.replace(/\s/g, '-')); }} />
          </label>
          <div className="field">
            <span>Start with</span>
            <label className="radio"><input type="radio" checked={start === 'readme'} onChange={() => setStart('readme')} /> A README</label>
            <label className="radio"><input type="radio" checked={start === 'upload'} onChange={() => setStart('upload')} /> My code: upload a folder or .zip next</label>
            <label className="radio"><input type="radio" checked={start === 'empty'} onChange={() => setStart('empty')} /> An empty repository</label>
          </div>
          {start === 'readme' && (
            <label className="field"><span>.gitignore</span>
              <select className="input" value={gitignore} onChange={(e) => setGitignore(e.target.value)}>
                <option value="">None</option><option>Node</option><option>Python</option><option>VisualStudio</option><option>Java</option>
              </select>
            </label>
          )}
        </fieldset>
        <p className="muted small">The project also gets its own board and wiki space. You can add more repositories later.</p>
        <ErrorBox error={err} />
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !name.trim() || effectiveKey.length < 2 || !effectiveRepo}>{busy ? 'Creating…' : 'Create'}</button>
        </div>
      </form>
    </Modal>
  );
}
