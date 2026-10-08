import { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { api, q, repoApi } from '../../api.js';
import { useAsync, timeAgo, shortSha } from '../../util.js';
import { Spinner, ErrorBox, Tabs, Avatar, useToast } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import { BranchPicker, DiffView } from './repoBits.jsx';

export default function NewPullRequest() {
  const { project, repo } = useOutletContext();
  const [sp] = useSearchParams();
  const others = repo.branches.filter((b) => !b.isDefault);
  const [source, setSource] = useState(sp.get('source') || others[0]?.name || repo.defaultBranch);
  const [target, setTarget] = useState(sp.get('target') || repo.defaultBranch);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tab, setTab] = useState('files');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const base = repoApi(project.key, repo.name);
  const nav = useNavigate();
  const toast = useToast();
  const cmp = useAsync(() => (source && target && source !== target ? api.get(`${base}/compare${q({ base: target, head: source })}`) : null), [base, source, target]);

  useEffect(() => {
    if (cmp.data?.commits?.length && !title) {
      const c = cmp.data.commits;
      setTitle(c.length === 1 ? c[0].subject : source.split('/').pop().replace(/[-_]/g, ' '));
      if (!description) setDescription(c.map((x) => `- ${x.subject}`).join('\n'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmp.data]);

  const create = async () => {
    setBusy(true);
    try {
      const pr = await api.post(`${base}/pulls`, { title, description, source, target });
      toast(`Created pull request !${pr.id}`);
      nav(`../pulls/${pr.id}`);
    } catch (e) { setErr(e); setBusy(false); }
  };

  return (
    <main className="page repo-page">
      <h2>New pull request</h2>
      <div className="pr-branches">
        <BranchPicker branches={repo.branches} value={source} onChange={setSource} label="Source" />
        <Icon name="chevronRight" />
        <span className="muted">into</span>
        <BranchPicker branches={repo.branches} value={target} onChange={setTarget} label="Target" />
      </div>
      {source === target && <div className="notice">Choose different source and target branches.</div>}
      <div className="card form">
        <label className="field"><span>Title *</span><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="field"><span>Description (Markdown)</span>
          <textarea className="input" rows={6} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={`Describe the change. Mention work items like ${project.key}-1 to link them.`} />
        </label>
        <ErrorBox error={err} />
        <div className="form-actions">
          <button className="btn btn-primary" disabled={!title.trim() || busy || source === target || !cmp.data?.commits?.length} onClick={create}>Create</button>
        </div>
      </div>
      {cmp.loading && <Spinner />}
      <ErrorBox error={cmp.error} />
      {cmp.data && (
        <>
          {!cmp.data.mergeable && <div className="notice warn"><Icon name="warning" /> These branches have merge conflicts: {cmp.data.conflicts.join(', ')}</div>}
          {!cmp.data.commits.length && <div className="notice">{source} has no commits that aren&apos;t already in {target}.</div>}
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'files', label: 'Files', count: cmp.data.files.length }, { value: 'commits', label: 'Commits', count: cmp.data.commits.length }]} />
          {tab === 'files' ? <DiffView files={cmp.data.files} truncated={cmp.data.truncated} /> : <CommitRows commits={cmp.data.commits} linkBase={`/${project.key}/repos/${encodeURIComponent(repo.name)}`} />}
        </>
      )}
    </main>
  );
}

export function CommitRows({ commits, linkBase }) {
  return (
    <ul className="commit-list card flush">
      {commits.map((c) => (
        <li key={c.sha}>
          <Avatar name={c.author} size={24} />
          <div className="commit-main">
            <Link to={`${linkBase}/commit/${c.sha}`} className="commit-subject">{c.subject}</Link>
            <span className="muted small">{c.author} · {timeAgo(c.date)}</span>
          </div>
          <span className="mono sha">{shortSha(c.sha)}</span>
        </li>
      ))}
    </ul>
  );
}
