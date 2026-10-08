import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useOutletContext, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { Spinner, ErrorBox, useToast } from '../../components/ui.jsx';
import IssueModal from './IssueModal.jsx';
import CreateIssueDialog from './CreateIssueDialog.jsx';

export default function BoardsLayout() {
  const { project, reloadProject } = useOutletContext();
  const base = `/api/projects/${project.key}/board`;
  const [board, setBoard] = useState(null);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(null);
  const [sp, setSp] = useSearchParams();
  const toast = useToast();
  const busy = useRef(0);

  const load = useCallback(async () => {
    try {
      const [b, u] = await Promise.all([api.get(base), api.get('/api/users')]);
      if (!busy.current) setBoard(b);
      setUsers(u);
    } catch (e) { setError(e); }
  }, [base]);

  useEffect(() => { load(); }, [load]);
  // Keep in sync with teammates
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 20000);
    return () => clearInterval(t);
  }, [load]);

  const call = useCallback(async (method, url, body, optimistic) => {
    busy.current++;
    if (optimistic) setBoard((b) => optimistic(structuredClone(b)));
    try {
      const res = await api[method](`${base}${url}`, body);
      if (res?.board) setBoard(res.board);
      return res;
    } catch (e) {
      toast(e, 'error');
      load();
      throw e;
    } finally {
      busy.current--;
    }
  }, [base, load, toast]);

  const actions = useMemo(() => ({
    createIssue: (fields) => call('post', '/issues', fields).then((r) => r.issue),
    updateIssue: (id, patch) => call('patch', `/issues/${id}`, patch, (b) => {
      const i = b.issues.find((x) => x.id === id);
      if (i) Object.assign(i, patch);
      if (patch.sprintId !== undefined) for (const s of b.issues.filter((x) => x.parentId === id)) s.sprintId = patch.sprintId;
      return b;
    }).then((r) => r.issue),
    deleteIssue: (id) => call('del', `/issues/${id}`, undefined, (b) => ({ ...b, issues: b.issues.filter((i) => i.id !== id && i.parentId !== id) })),
    addComment: (id, body) => call('post', `/issues/${id}/comments`, { body }),
    editComment: (id, cid, body) => call('patch', `/issues/${id}/comments/${cid}`, { body }),
    deleteComment: (id, cid) => call('del', `/issues/${id}/comments/${cid}`),
    createSprint: (fields = {}) => call('post', '/sprints', fields),
    updateSprint: (sid, fields) => call('patch', `/sprints/${sid}`, fields),
    startSprint: (sid, fields) => call('post', `/sprints/${sid}/start`, fields).then((r) => { reloadProject(); return r; }),
    completeSprint: (sid, moveTo) => call('post', `/sprints/${sid}/complete`, { moveTo }).then((r) => { reloadProject(); return r; }),
    deleteSprint: (sid) => call('del', `/sprints/${sid}`),
    saveColumns: (columns) => call('put', '/columns', { columns }),
    openIssue: (key) => setSp((p) => { const n = new URLSearchParams(p); n.set('issue', key); return n; }),
    openCreate: (defaults = {}) => setCreating(defaults),
    development: (id) => api.get(`${base}/issues/${id}/development`),
  }), [call, setSp, base, reloadProject]);

  if (error) return <main className="page"><ErrorBox error={error} onRetry={load} /></main>;
  if (!board) return <Spinner />;

  const openKey = sp.get('issue');
  const openIssue = openKey && board.issues.find((i) => i.key === openKey);
  const closeIssue = () => setSp((p) => { const n = new URLSearchParams(p); n.delete('issue'); return n; });

  const ctx = { project, board, users, ...actions };
  return (
    <div className="jira">
      <Outlet context={ctx} />
      {openKey && !openIssue && <IssueNotFound onClose={closeIssue} keyName={openKey} />}
      {openIssue && <IssueModal ctx={ctx} issue={openIssue} onClose={closeIssue} />}
      {creating && <CreateIssueDialog ctx={ctx} defaults={creating} onClose={() => setCreating(null)} />}
    </div>
  );
}

function IssueNotFound({ keyName, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 2500); return () => clearTimeout(t); }, [onClose]);
  return <div className="toasts"><div className="toast toast-error">Issue {keyName} not found</div></div>;
}

export function useBoard() {
  return useOutletContext();
}
