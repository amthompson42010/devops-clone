import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api, q, repoApi } from '../../api.js';
import { useAsync, timeAgo } from '../../util.js';
import { Spinner, ErrorBox, Avatar, Tabs, Empty } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';

export function PrStatus({ status }) {
  return <span className={`pr-status pr-${status}`}>{status === 'active' ? 'Active' : status === 'completed' ? 'Completed' : 'Abandoned'}</span>;
}

export const VOTE_LABEL = {
  approved: 'Approved', 'approved-with-suggestions': 'Approved with suggestions', waiting: 'Waiting for author', rejected: 'Rejected',
};

export default function PullRequests() {
  const { project, repo } = useOutletContext();
  const [status, setStatus] = useState('active');
  const { data, error } = useAsync(() => api.get(`${repoApi(project.key, repo.name)}/pulls${q({ status })}`), [project.key, repo.name, status]);
  return (
    <main className="page repo-page">
      <div className="repo-toolbar">
        <h2 className="inline-title">Pull requests</h2>
        <div className="push" />
        <Link className="btn btn-primary" to="new"><Icon name="plus" /> New pull request</Link>
      </div>
      <Tabs value={status} onChange={setStatus} tabs={[{ value: 'active', label: 'Active' }, { value: 'completed', label: 'Completed' }, { value: 'abandoned', label: 'Abandoned' }]} />
      <ErrorBox error={error} />
      {!data && !error && <Spinner />}
      {data && !data.length && <Empty icon="pr" title={`No ${status} pull requests`}>Pull requests let your team review code and merge branches.</Empty>}
      {data && data.length > 0 && (
        <ul className="pr-list card flush">
          {data.map((p) => (
            <li key={p.id}>
              <Avatar name={p.createdBy} size={32} />
              <div className="pr-main">
                <Link to={String(p.id)} className="pr-title">{p.title}</Link>
                <span className="muted small">
                  {p.createdBy} requested !{p.id} into <span className="mono">{p.target}</span> from <span className="mono">{p.source}</span> · {timeAgo(p.createdAt)}
                </span>
              </div>
              <div className="pr-side">
                {p.reviewers.map((r) => <span key={r.name} className={`vote vote-${r.vote}`} title={`${r.name}: ${VOTE_LABEL[r.vote]}`}><Avatar name={r.name} size={22} /></span>)}
                {p.commentCount > 0 && <span className="muted small"><Icon name="comment" size={14} /> {p.commentCount}</span>}
                <PrStatus status={p.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
