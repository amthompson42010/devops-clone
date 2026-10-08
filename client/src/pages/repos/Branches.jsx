import { useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { api, q, repoApi } from '../../api.js';
import { timeAgo, shortSha } from '../../util.js';
import { Modal, ErrorBox, Menu, MenuItem, Empty, useToast, Avatar } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import { BranchPicker } from './repoBits.jsx';

export default function Branches() {
  const { project, repo, reloadRepo } = useOutletContext();
  const base = repoApi(project.key, repo.name);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('');
  const toast = useToast();
  const nav = useNavigate();

  if (repo.empty) return <main className="page"><Empty icon="branch" title="No branches yet" /></main>;

  const act = async (fn, msg) => {
    try { await fn(); toast(msg); reloadRepo(); } catch (e) { toast(e, 'error'); }
  };
  const list = repo.branches.filter((b) => !filter || b.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <main className="page repo-page">
      <div className="repo-toolbar">
        <h2 className="inline-title">Branches</h2>
        <div className="push" />
        <div className="search-box"><Icon name="search" /><input placeholder="Search branch name" value={filter} onChange={(e) => setFilter(e.target.value)} /></div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="plus" /> New branch</button>
      </div>
      <div className="card flush">
        <table className="table">
          <thead><tr><th>Branch</th><th>Commit</th><th>Author</th><th>Updated</th><th>Behind | Ahead</th><th /></tr></thead>
          <tbody>
            {list.map((b) => (
              <tr key={b.name}>
                <td>
                  <Link to={`../files${q({ ref: b.isDefault ? '' : b.name })}`} className="file-link"><Icon name="branch" /> {b.name}</Link>
                  {b.isDefault && <span className="badge">default</span>}
                </td>
                <td><Link to={`../commit/${b.sha}`} className="mono sha">{shortSha(b.sha)}</Link> <span className="muted ellipsis inline">{b.subject}</span></td>
                <td className="nowrap"><Avatar name={b.author} size={20} /> {b.author}</td>
                <td className="muted nowrap">{timeAgo(b.date)}</td>
                <td>{!b.isDefault && <AheadBehind ahead={b.ahead} behind={b.behind} />}</td>
                <td className="right">
                  <Menu align="right" trigger={(o, t) => <button className="icon-btn" onClick={t}><Icon name="more" /></button>}>
                    {!b.isDefault && <MenuItem icon="pr" onClick={() => nav(`../pulls/new${q({ source: b.name, target: repo.defaultBranch })}`)}>New pull request</MenuItem>}
                    <MenuItem icon="commit" onClick={() => nav(`../commits?ref=${encodeURIComponent(b.name)}`)}>View history</MenuItem>
                    {!b.isDefault && <MenuItem icon="check" onClick={() => act(() => api.put(`${base}/default-branch`, { name: b.name }), `${b.name} is now the default branch`)}>Set as default branch</MenuItem>}
                    {!b.isDefault && (
                      <MenuItem icon="trash" danger onClick={() => window.confirm(`Delete branch ${b.name}?`) && act(() => api.del(`${base}/branches${q({ name: b.name })}`), `Deleted ${b.name}`)}>Delete branch</MenuItem>
                    )}
                  </Menu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {creating && <NewBranch repo={repo} base={base} onClose={() => setCreating(false)} onDone={() => { setCreating(false); reloadRepo(); }} />}
    </main>
  );
}

function AheadBehind({ ahead = 0, behind = 0 }) {
  const max = Math.max(ahead, behind, 1);
  return (
    <div className="ahead-behind" title={`${behind} behind, ${ahead} ahead`}>
      <span className="ab-num">{behind}</span>
      <span className="ab-bar left"><span style={{ width: `${(behind / max) * 100}%` }} /></span>
      <span className="ab-bar right"><span style={{ width: `${(ahead / max) * 100}%` }} /></span>
      <span className="ab-num">{ahead}</span>
    </div>
  );
}

function NewBranch({ repo, base, onClose, onDone }) {
  const [name, setName] = useState('');
  const [from, setFrom] = useState(repo.defaultBranch);
  const [err, setErr] = useState(null);
  const toast = useToast();
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post(`${base}/branches`, { name: name.trim(), from });
      toast(`Created ${name}`);
      onDone();
    } catch (ex) { setErr(ex); }
  };
  return (
    <Modal title="Create a branch" onClose={onClose} width={440}>
      <form className="form" onSubmit={submit}>
        <label className="field"><span>Name *</span><input className="input mono" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="feature/my-change" /></label>
        <div className="field"><span>Based on</span><BranchPicker branches={repo.branches} value={from} onChange={setFrom} /></div>
        <ErrorBox error={err} />
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!name.trim()}>Create</button>
        </div>
      </form>
    </Modal>
  );
}
