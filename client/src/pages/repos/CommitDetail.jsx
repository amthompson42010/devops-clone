import { Link, useOutletContext, useParams } from 'react-router-dom';
import { api, repoApi } from '../../api.js';
import { useAsync, fmtDateTime, shortSha } from '../../util.js';
import { Spinner, ErrorBox, Avatar, CopyButton } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import { DiffView } from './repoBits.jsx';
import { linkifyKeys } from '../boards/issueMeta.jsx';

export default function CommitDetail() {
  const { project, repo } = useOutletContext();
  const { sha } = useParams();
  const { data, error } = useAsync(() => api.get(`${repoApi(project.key, repo.name)}/commits/${sha}`), [project.key, repo.name, sha]);
  if (error) return <main className="page"><ErrorBox error={error} /></main>;
  if (!data) return <Spinner />;
  return (
    <main className="page repo-page">
      <div className="commit-header card">
        <h2>{linkifyKeys(data.subject, project.key)}</h2>
        {data.body && <pre className="commit-body">{linkifyKeys(data.body, project.key)}</pre>}
        <div className="commit-meta">
          <Avatar name={data.author} size={28} />
          <span><b>{data.author}</b> committed {fmtDateTime(data.date)}</span>
          <span className="push" />
          <span className="mono">{shortSha(data.sha)}</span>
          <CopyButton text={data.sha} label="Copy SHA" />
          <Link className="btn btn-sm" to={`../files?ref=${data.sha}`}><Icon name="code" /> Browse files</Link>
        </div>
        {data.parents.length > 0 && (
          <div className="muted small">
            Parent{data.parents.length > 1 ? 's' : ''}:{' '}
            {data.parents.map((p) => <Link key={p} to={`../commit/${p}`} className="mono sha">{shortSha(p)}</Link>)}
          </div>
        )}
      </div>
      <DiffView files={data.files} truncated={data.truncated} />
    </main>
  );
}
