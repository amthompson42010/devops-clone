import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { api, repoApi, saveBlob, BROWSER_MODE } from '../../api.js';
import { useAsync } from '../../util.js';
import { Spinner, ErrorBox, Menu, MenuItem, CopyButton, Modal, useToast } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import { NewRepoDialog, rememberRepo } from './ReposHome.jsx';

export default function RepoLayout() {
  const { project } = useOutletContext();
  const { repo } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const repos = useAsync(() => api.get(`/api/projects/${project.key}/repos`), [project.key]);
  const info = useAsync(() => api.get(repoApi(project.key, repo)), [project.key, repo]);

  useEffect(() => { rememberRepo(project.key, repo); }, [project.key, repo]);

  if (info.error) return <main className="page"><ErrorBox error={info.error} onRetry={info.reload} /></main>;
  if (!info.data) return <Spinner />;
  const r = info.data;

  const removeRepo = async () => {
    try {
      await api.del(repoApi(project.key, repo));
      toast(`Deleted ${repo}`);
      try { localStorage.removeItem(`devops.lastRepo.${project.key}`); } catch { /* ignore */ }
      nav(`/${project.key}/repos`);
    } catch (e) { toast(e, 'error'); }
  };

  return (
    <div className="repo-shell">
      <div className="repo-header">
        <Menu
          trigger={(open, toggle) => (
            <button className="repo-picker" onClick={toggle}>
              <Icon name="repo" size={18} /> <span>{r.name}</span> <Icon name="chevronDown" />
            </button>
          )}
        >
          {(repos.data || []).map((x) => (
            <MenuItem key={x.name} icon="repo" active={x.name === r.name} onClick={() => nav(`/${project.key}/repos/${encodeURIComponent(x.name)}/files`)}>{x.name}</MenuItem>
          ))}
          <div className="menu-divider" />
          <MenuItem icon="plus" onClick={() => setCreating(true)}>New repository</MenuItem>
          <MenuItem icon="trash" danger onClick={() => setDeleting(true)}>Delete {r.name}</MenuItem>
        </Menu>
        <div className="push" />
        {!r.empty && (
          <button className="btn" onClick={() => nav(`/${project.key}/repos/${encodeURIComponent(r.name)}/deployments?deploy=1`)}>
            <Icon name="upload" /> Deploy to Azure
          </button>
        )}
        {!r.empty && (
          <button
            className="btn"
            title="Download the default branch as a .zip"
            onClick={() => api.blob(`${repoApi(project.key, r.name)}/archive`).then((b) => saveBlob(b, `${r.name}.zip`)).catch((e) => toast(e, 'error'))}
          >
            <Icon name="download" /> Download ZIP
          </button>
        )}
        {!BROWSER_MODE && (
        <Menu
          align="right"
          trigger={(open, toggle) => <button className="btn" onClick={toggle}><Icon name="code" /> Clone</button>}
        >
          <div className="clone-pop">
            <strong>Clone repository</strong>
            <div className="row">
              <input className="input mono" readOnly value={r.cloneUrl} onFocus={(e) => e.target.select()} />
              <CopyButton text={r.cloneUrl} />
            </div>
            <pre className="cmd">git clone {r.cloneUrl}</pre>
          </div>
        </Menu>
        )}
      </div>
      <Outlet context={{ project, repo: r, reloadRepo: info.reload }} />
      {creating && <NewRepoDialog projectKey={project.key} onClose={() => { setCreating(false); repos.reload(); }} />}
      {deleting && (
        <Modal title={`Delete ${r.name}?`} onClose={() => setDeleting(false)} width={440}
          footer={<><button className="btn" onClick={() => setDeleting(false)}>Cancel</button><button className="btn btn-danger" onClick={removeRepo}>Delete</button></>}>
          <p>This permanently deletes the repository, all of its branches and pull requests from storage.</p>
        </Modal>
      )}
    </div>
  );
}
