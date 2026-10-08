import { useState } from 'react';
import { Navigate, useNavigate, useOutletContext } from 'react-router-dom';
import { api } from '../../api.js';
import { useAsync } from '../../util.js';
import { Spinner, ErrorBox, Empty, Modal, useToast } from '../../components/ui.jsx';

const lastRepoKey = (key) => `devops.lastRepo.${key}`;
export const rememberRepo = (key, repo) => { try { localStorage.setItem(lastRepoKey(key), repo); } catch { /* ignore */ } };

export default function ReposHome() {
  const { project } = useOutletContext();
  const { data, error, reload } = useAsync(() => api.get(`/api/projects/${project.key}/repos`), [project.key]);
  const [creating, setCreating] = useState(false);
  if (error) return <main className="page"><ErrorBox error={error} onRetry={reload} /></main>;
  if (!data) return <Spinner />;
  if (data.length) {
    let last = null;
    try { last = localStorage.getItem(lastRepoKey(project.key)); } catch { /* ignore */ }
    const repo = data.find((r) => r.name === last) || data[0];
    return <Navigate to={`${encodeURIComponent(repo.name)}/files`} replace />;
  }
  return (
    <main className="page">
      <Empty icon="repo" title="This project has no repositories" action={<button className="btn btn-primary" onClick={() => setCreating(true)}>New repository</button>} />
      {creating && <NewRepoDialog projectKey={project.key} onClose={() => setCreating(false)} />}
    </main>
  );
}

export function NewRepoDialog({ projectKey, onClose }) {
  const [name, setName] = useState('');
  const [readme, setReadme] = useState(true);
  const [gitignore, setGitignore] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const nav = useNavigate();
  const toast = useToast();
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/api/projects/${projectKey}/repos`, { name, readme, gitignore });
      toast(`Repository ${name} created`);
      onClose();
      nav(`/${projectKey}/repos/${encodeURIComponent(name)}/files`);
    } catch (ex) { setErr(ex); setBusy(false); }
  };
  return (
    <Modal title="Create a repository" onClose={onClose} width={460}>
      <form className="form" onSubmit={submit}>
        <label className="field"><span>Repository name *</span>
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value.replace(/\s/g, '-'))} />
        </label>
        <label className="check"><input type="checkbox" checked={readme} onChange={(e) => setReadme(e.target.checked)} /> Add a README</label>
        <label className="field"><span>Add a .gitignore</span>
          <select className="input" value={gitignore} onChange={(e) => setGitignore(e.target.value)}>
            <option value="">None</option>
            <option>Node</option><option>Python</option><option>VisualStudio</option><option>Java</option>
          </select>
        </label>
        <ErrorBox error={err} />
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!name || busy}>{busy ? 'Creating…' : 'Create'}</button>
        </div>
      </form>
    </Modal>
  );
}
