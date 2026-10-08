import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { api, q } from '../../api.js';
import { useAsync, timeAgo } from '../../util.js';
import { Spinner, Empty, Avatar } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import { useWiki, buildTree } from './WikiLayout.jsx';

export default function WikiHome() {
  const ctx = useWiki();
  const [sp] = useSearchParams();
  const term = sp.get('q');
  if (term) return <SearchResults ctx={ctx} term={term} />;
  const roots = buildTree(ctx.index.pages).get(null) || [];
  if (roots.length) return <Navigate to={roots[0].id} replace />;
  return (
    <main className="cf-page">
      <Empty icon="wiki" title="This space has no pages yet" action={<button className="btn btn-cf" onClick={() => ctx.openCreate(null)}>Create a page</button>} />
    </main>
  );
}

function SearchResults({ ctx, term }) {
  const { data } = useAsync(() => api.get(`${ctx.base}/search${q({ q: term })}`), [ctx.base, term]);
  return (
    <main className="cf-page">
      <h1 className="cf-title">Search results for “{term}”</h1>
      {!data && <Spinner />}
      {data && !data.length && <p className="muted">No pages match your search.</p>}
      <ul className="search-results">
        {data?.map((r) => (
          <li key={r.id}>
            <Link to={`/${ctx.project.key}/wiki/${r.id}`} className="search-title"><Icon name="page" /> {r.title}</Link>
            <p className="muted">…{r.snippet}…</p>
            <span className="small muted"><Avatar name={r.updatedBy} size={16} /> {r.updatedBy} · updated {timeAgo(r.updatedAt)}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
