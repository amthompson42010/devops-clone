import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { api, q, repoApi } from '../../api.js';
import { Modal, ErrorBox, useToast } from '../../components/ui.jsx';
import { getUser } from '../../user.js';

/** Commit a set of changes to the current branch or a new branch (optionally opening a PR). */
export default function CommitDialog({ repo, branch, baseSha, changes, defaultMessage, summary, onClose, onDone }) {
  const { project } = useOutletContext();
  const [message, setMessage] = useState(defaultMessage || '');
  const [description, setDescription] = useState('');
  const isBranch = repo.branches.some((b) => b.name === branch);
  const [mode, setMode] = useState(isBranch ? 'current' : 'new');
  const [newBranch, setNewBranch] = useState(`users/${(getUser().name || 'me').toLowerCase().replace(/[^a-z0-9]+/g, '-')}/${Date.now().toString(36)}`);
  const [createPr, setCreatePr] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const toast = useToast();
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const target = mode === 'current' ? branch : newBranch.trim();
      const res = await api.post(`${repoApi(project.key, repo.name)}/commits`, {
        branch: target,
        baseSha: mode === 'current' ? baseSha : undefined,
        createBranchFrom: mode === 'new' ? branch : undefined,
        message: description.trim() ? `${message.trim()}\n\n${description.trim()}` : message,
        changes,
      });
      toast(`Committed ${res.sha.slice(0, 8)} to ${res.branch}`);
      if (mode === 'new' && createPr) {
        nav(`/${project.key}/repos/${encodeURIComponent(repo.name)}/pulls/new${q({ source: res.branch, target: branch })}`);
        return;
      }
      onDone?.(res);
    } catch (ex) {
      setErr(ex);
      setBusy(false);
    }
  };

  return (
    <Modal title="Commit" onClose={onClose} width={520}>
      <form className="form" onSubmit={submit}>
        <label className="field"><span>Comment *</span>
          <input className="input" autoFocus value={message} onChange={(e) => setMessage(e.target.value)} />
        </label>
        <label className="field"><span>Extended description</span>
          <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Reference work items with their key, e.g. PROJ-12" />
        </label>
        {summary && <ul className="change-summary">{summary.map((s) => <li key={s}>{s}</li>)}</ul>}
        <div className="field">
          <span>Branch</span>
          {isBranch && (
            <label className="radio"><input type="radio" checked={mode === 'current'} onChange={() => setMode('current')} /> Commit directly to <b className="mono">{branch}</b></label>
          )}
          <label className="radio"><input type="radio" checked={mode === 'new'} onChange={() => setMode('new')} /> Create a new branch for this commit</label>
          {mode === 'new' && (
            <>
              <input className="input mono" value={newBranch} onChange={(e) => setNewBranch(e.target.value)} />
              <label className="check"><input type="checkbox" checked={createPr} onChange={(e) => setCreatePr(e.target.checked)} /> Create a pull request</label>
            </>
          )}
        </div>
        <ErrorBox error={err} />
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!message.trim() || busy}>{busy ? 'Committing…' : 'Commit'}</button>
        </div>
      </form>
    </Modal>
  );
}
