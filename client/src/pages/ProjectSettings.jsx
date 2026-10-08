import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorBox, useToast } from '../components/ui.jsx';

export default function ProjectSettings() {
  const { project, reloadProject } = useOutletContext();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState(null);
  const toast = useToast();
  const nav = useNavigate();

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/api/projects/${project.key}`, { name, description });
      toast('Project updated');
      reloadProject();
    } catch (ex) { setErr(ex); }
  };
  const remove = async () => {
    try {
      await api.del(`/api/projects/${project.key}`);
      toast(`Deleted ${project.name}`);
      nav('/');
    } catch (ex) { setErr(ex); }
  };

  return (
    <main className="page narrow">
      <h1>Project settings</h1>
      <ErrorBox error={err} />
      <form className="card form" onSubmit={save}>
        <h3>Overview</h3>
        <label className="field"><span>Name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field"><span>Description</span><textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <label className="field"><span>Key</span><input className="input mono" value={project.key} disabled /></label>
        <div className="form-actions"><button className="btn btn-primary">Save</button></div>
      </form>
      <div className="card danger-zone">
        <h3>Delete project</h3>
        <p>This permanently deletes all repositories, work items and wiki pages from blob storage. Type <b>{project.key}</b> to confirm.</p>
        <div className="row">
          <input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={project.key} />
          <button className="btn btn-danger" disabled={confirm !== project.key} onClick={remove}>Delete project</button>
        </div>
      </div>
    </main>
  );
}
