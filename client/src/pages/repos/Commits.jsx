import { useEffect, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { api, q, repoApi } from '../../api.js';
import { timeAgo, shortSha, fmtDate } from '../../util.js';
import { Spinner, ErrorBox, Avatar, Empty, CopyButton } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import { BranchPicker } from './repoBits.jsx';

const PAGE = 50;

export default function Commits() {
  const { project, repo } = useOutletContext();
  const [sp, setSp] = useSearchParams();
  const ref = sp.get('ref') || repo.defaultBranch;
  const base = repoApi(project.key, repo.name);
  const [commits, setCommits] = useState(null);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState(null);
  const [author, setAuthor] = useState('');

  const load = async (skip) => {
    try {
      const page = await api.get(`${base}/commits${q({ ref, skip, limit: PAGE, author })}`);
      setCommits((c) => (skip ? [...(c || []), ...page] : page));
      setMore(page.length === PAGE);
    } catch (e) { setErr(e); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setCommits(null); load(0); }, [base, ref, author]);

  if (repo.empty) return <main className="page"><Empty icon="commit" title="No commits yet" /></main>;

  const groups = [];
  for (const c of commits || []) {
    const day = fmtDate(c.date);
    if (!groups.length || groups[groups.length - 1].day !== day) groups.push({ day, items: [] });
    groups[groups.length - 1].items.push(c);
  }

  return (
    <main className="page repo-page">
      <div className="repo-toolbar">
        <h2 className="inline-title">Commits</h2>
        <BranchPicker branches={repo.branches} value={ref} onChange={(r) => setSp(r === repo.defaultBranch ? {} : { ref: r })} />
        <div className="push" />
        <div className="search-box">
          <Icon name="user" />
          <input placeholder="Filter by author" value={author} onChange={(e) => setAuthor(e.target.value)} />
        </div>
      </div>
      <ErrorBox error={err} />
      {!commits && <Spinner />}
      {groups.map((g) => (
        <section key={g.day} className="commit-group">
          <h4 className="muted">Commits on {g.day}</h4>
          <ul className="commit-list card flush">
            {g.items.map((c) => (
              <li key={c.sha}>
                <Avatar name={c.author} size={28} />
                <div className="commit-main">
                  <Link to={`../commit/${c.sha}`} className="commit-subject">{c.subject}</Link>
                  <span className="muted small">{c.author} committed {timeAgo(c.date)}{c.parents.length > 1 && ' · merge'}</span>
                </div>
                <Link to={`../commit/${c.sha}`} className="mono sha">{shortSha(c.sha)}</Link>
                <CopyButton text={c.sha} label="" />
                <Link className="btn btn-sm" title="Browse files at this commit" to={`../files?ref=${c.sha}`}><Icon name="code" /></Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {more && <button className="btn load-more" onClick={() => load(commits.length)}>Load more</button>}
    </main>
  );
}
