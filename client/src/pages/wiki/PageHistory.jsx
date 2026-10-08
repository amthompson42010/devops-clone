import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAsync, fmtDateTime } from '../../util.js';
import { Spinner, ErrorBox, Avatar, useToast } from '../../components/ui.jsx';
import { RichView } from '../../components/RichText.jsx';
import Icon from '../../components/Icon.jsx';
import { useWiki } from './WikiLayout.jsx';

export default function PageHistory() {
  const ctx = useWiki();
  const { pageId } = useParams();
  const pageApi = `${ctx.base}/pages/${pageId}`;
  const { data, error, reload } = useAsync(() => api.get(`${pageApi}/history`), [pageApi]);
  const [viewing, setViewing] = useState(null);
  const toast = useToast();
  const nav = useNavigate();
  const meta = ctx.index.pages.find((p) => p.id === pageId);

  const view = async (v) => {
    try { setViewing(await api.get(`${pageApi}/history/${v}`)); } catch (e) { toast(e, 'error'); }
  };
  const restore = async (v) => {
    if (!window.confirm(`Restore version ${v}? This creates a new version with that content.`)) return;
    try {
      await api.post(`${pageApi}/restore/${v}`);
      await ctx.reloadIndex();
      toast(`Restored version ${v}`);
      nav(`/${ctx.project.key}/wiki/${pageId}`);
    } catch (e) { toast(e, 'error'); }
  };

  if (error) return <main className="cf-page"><ErrorBox error={error} onRetry={reload} /></main>;
  if (!data) return <Spinner />;
  const current = data[0]?.version;

  return (
    <main className="cf-page wide">
      <nav className="cf-crumbs"><Link to={`/${ctx.project.key}/wiki/${pageId}`}><Icon name="chevronLeft" size={12} /> Back to page</Link></nav>
      <h1 className="cf-title">Page history: {meta?.title}</h1>
      <table className="table cf-history">
        <thead><tr><th>Version</th><th>Published</th><th>Changed by</th><th>Comment</th><th /></tr></thead>
        <tbody>
          {data.map((v) => (
            <tr key={v.version} className={viewing?.version === v.version ? 'selected' : ''}>
              <td><button className="link-btn" onClick={() => view(v.version)}>v.{v.version}{v.version === current && ' (current)'}</button></td>
              <td className="nowrap">{fmtDateTime(v.updatedAt)}</td>
              <td className="nowrap"><Avatar name={v.updatedBy} size={20} /> {v.updatedBy}</td>
              <td className="muted">{v.message}</td>
              <td className="right">{v.version !== current && <button className="btn btn-subtle btn-sm" onClick={() => restore(v.version)}>Restore</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {viewing && (
        <section className="cf-version-preview">
          <div className="row"><h3>Version {viewing.version}: {viewing.title}</h3><div className="push" /><button className="btn btn-subtle btn-sm" onClick={() => setViewing(null)}>Close preview</button></div>
          <RichView html={viewing.content} className="cf-content" />
        </section>
      )}
    </main>
  );
}
