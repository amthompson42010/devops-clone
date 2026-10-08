import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { api, q, repoApi } from '../../api.js';
import { Spinner, ErrorBox, Tabs } from '../../components/ui.jsx';
import { Markdown } from '../../components/RichText.jsx';
import Icon from '../../components/Icon.jsx';
import CommitDialog from './CommitDialog.jsx';

export default function EditFile() {
  const { project, repo, reloadRepo } = useOutletContext();
  const [sp] = useSearchParams();
  const ref = sp.get('ref') || repo.defaultBranch;
  const isNew = !!sp.get('new');
  const dir = isNew ? sp.get('path') || '' : '';
  const origPath = isNew ? '' : sp.get('path') || '';
  const nav = useNavigate();
  const [name, setName] = useState(isNew ? '' : origPath);
  const [content, setContent] = useState(isNew ? '' : null);
  const [original, setOriginal] = useState('');
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('edit');
  const [committing, setCommitting] = useState(false);
  const base = repoApi(project.key, repo.name);
  const head = repo.branches.find((b) => b.name === ref)?.sha;

  useEffect(() => {
    if (isNew) return;
    api.get(`${base}/items${q({ ref, path: origPath })}`).then((d) => {
      if (d.type !== 'blob' || d.file.binary || d.file.tooLarge) throw new Error('This file cannot be edited in the browser');
      setContent(d.file.content);
      setOriginal(d.file.content);
    }).catch(setErr);
  }, [base, ref, origPath, isNew]);

  const fullPath = isNew ? [dir, name.trim()].filter(Boolean).join('/') : name.trim();
  const changes = [];
  if (fullPath) {
    if (!isNew && fullPath !== origPath) changes.push({ action: 'delete', path: origPath });
    changes.push({ path: fullPath, content: content ?? '' });
  }
  const dirty = isNew ? !!fullPath : content !== original || fullPath !== origPath;
  const back = () => nav(`../files${q({ ref: ref === repo.defaultBranch ? '' : ref, path: isNew ? dir : origPath })}`);

  const onKey = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const t = e.target;
      const s = t.selectionStart;
      const v = t.value;
      setContent(`${v.slice(0, s)}  ${v.slice(t.selectionEnd)}`);
      requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = s + 2; });
    }
  };

  if (err) return <main className="page"><ErrorBox error={err} /></main>;
  if (content === null) return <Spinner />;

  return (
    <main className="page repo-page edit-page">
      <div className="repo-toolbar">
        <span className="badge"><Icon name="branch" /> {ref}</span>
        <div className="path-input">
          <span className="muted">{repo.name}/{dir && `${dir}/`}</span>
          <input className="input mono" value={name} onChange={(e) => setName(e.target.value)} placeholder={isNew ? 'filename.ext' : ''} autoFocus={isNew} />
        </div>
        <div className="push" />
        <button className="btn" onClick={back}>Cancel</button>
        <button className="btn btn-primary" disabled={!dirty} onClick={() => setCommitting(true)}>Commit…</button>
      </div>
      <div className="card flush">
        <div className="file-head">
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'edit', label: 'Edit' }, ...(/\.md$/i.test(fullPath) ? [{ value: 'preview', label: 'Preview' }] : [])]} />
        </div>
        {tab === 'edit' ? (
          <textarea className="code-editor" spellCheck={false} value={content} onChange={(e) => setContent(e.target.value)} onKeyDown={onKey} />
        ) : (
          <div className="pad"><Markdown source={content} /></div>
        )}
      </div>
      {committing && (
        <CommitDialog
          repo={repo}
          branch={ref}
          baseSha={head}
          changes={changes}
          defaultMessage={isNew ? `Add ${fullPath}` : `Update ${fullPath}`}
          onClose={() => setCommitting(false)}
          onDone={(res) => {
            reloadRepo();
            nav(`../files${q({ ref: res.branch === repo.defaultBranch ? '' : res.branch, path: fullPath })}`);
          }}
        />
      )}
    </main>
  );
}
