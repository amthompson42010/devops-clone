import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { api, q, repoApi, saveBlob } from '../../api.js';
import { zipToChanges } from '../../zip.js';
import { useAsync, timeAgo, fmtSize, shortSha } from '../../util.js';
import { Spinner, ErrorBox, Tabs, Menu, MenuItem, useToast, Avatar } from '../../components/ui.jsx';
import { Markdown } from '../../components/RichText.jsx';
import Icon from '../../components/Icon.jsx';
import { BranchPicker, PathCrumbs, CodeView, EmptyRepo } from './repoBits.jsx';
import CommitDialog from './CommitDialog.jsx';

const IMG = /\.(png|jpe?g|gif|webp|ico|bmp)$/i;

export default function Files() {
  const { project, repo, reloadRepo } = useOutletContext();
  const [sp, setSp] = useSearchParams();
  const ref = sp.get('ref') || repo.defaultBranch;
  const path = sp.get('path') || '';
  const base = repoApi(project.key, repo.name);
  const nav = useNavigate();
  const toast = useToast();
  const items = useAsync(() => (repo.empty ? null : api.get(`${base}/items${q({ ref, path })}`)), [base, ref, path, repo.empty]);
  const [tab, setTab] = useState('contents');
  const [pendingUpload, setPendingUpload] = useState(null);
  const fileInput = useRef(null);
  const zipInput = useRef(null);

  const linkFor = (p, r = ref) => `?${new URLSearchParams({ ...(r !== repo.defaultBranch ? { ref: r } : {}), ...(p ? { path: p } : {}) })}`;
  const setRef = (r) => setSp(Object.fromEntries(Object.entries({ ref: r === repo.defaultBranch ? '' : r, path }).filter(([, v]) => v)));

  if (repo.empty) {
    const init = async () => {
      try {
        await api.post(`${base}/commits`, { branch: repo.defaultBranch || 'main', message: 'Add README.md', changes: [{ path: 'README.md', content: `# ${repo.name}\n\nIntroduction to this repository.\n` }] });
        reloadRepo();
      } catch (e) { toast(e, 'error'); }
    };
    const importZip = async (file) => {
      try {
        const changes = await zipToChanges(file);
        if (!changes.length) throw new Error('The archive is empty');
        await api.post(`${base}/commits`, { branch: repo.defaultBranch || 'main', message: `Import ${file.name}`, changes });
        toast(`Imported ${changes.length} files`);
        reloadRepo();
      } catch (e) { toast(e, 'error'); }
    };
    return <main className="page"><EmptyRepo repo={repo} onInit={init} onImportZip={importZip} /></main>;
  }

  const data = items.data;
  const isFile = data?.type === 'blob';
  const dir = isFile ? path.split('/').slice(0, -1).join('/') : path;

  const onUpload = async (fileList) => {
    const files = [...fileList];
    if (!files.length) return;
    const changes = await Promise.all(files.map((f) => new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve({ path: dir ? `${dir}/${f.name}` : f.name, content: String(r.result).split(',')[1] || '', encoding: 'base64' });
      r.readAsDataURL(f);
    })));
    setPendingUpload(changes);
  };

  return (
    <main className="page repo-page">
      <div className="repo-toolbar">
        <BranchPicker branches={repo.branches} value={ref} onChange={setRef} />
        <PathCrumbs repoName={repo.name} path={path} linkFor={(p) => linkFor(p)} />
        <div className="push" />
        {!isFile && (
          <Menu align="right" trigger={(o, t) => <button className="btn" onClick={t}><Icon name="plus" /> New <Icon name="chevronDown" /></button>}>
            <MenuItem icon="file" onClick={() => nav(`../edit${q({ ref, path: dir, new: 1 })}`)}>New file</MenuItem>
            <MenuItem icon="upload" onClick={() => fileInput.current?.click()}>Upload file(s)</MenuItem>
            <MenuItem icon="upload" onClick={() => zipInput.current?.click()}>Import ZIP here</MenuItem>
          </Menu>
        )}
        {isFile && (
          <>
            <button className="btn" onClick={() => nav(`../edit${q({ ref, path })}`)}><Icon name="edit" /> Edit</button>
            <button className="btn" onClick={() => api.blob(`${base}/raw${q({ ref, path })}`).then((b) => saveBlob(b, path.split('/').pop())).catch((e) => toast(e, 'error'))}><Icon name="download" /> Download</button>
            <button className="btn" onClick={() => setPendingUpload([{ action: 'delete', path }])}><Icon name="trash" /> Delete</button>
          </>
        )}
        <input type="file" multiple hidden ref={fileInput} onChange={(e) => { onUpload(e.target.files); e.target.value = ''; }} />
        <input type="file" accept=".zip,application/zip" hidden ref={zipInput} onChange={async (e) => {
          const f = e.target.files[0];
          e.target.value = '';
          if (!f) return;
          try { setPendingUpload(await zipToChanges(f, dir)); } catch (ex) { toast(ex, 'error'); }
        }} />
      </div>
      <ErrorBox error={items.error} onRetry={items.reload} />
      {items.loading && !data && <Spinner />}
      {data && !isFile && (
        <>
          <div className="card flush">
            <table className="table files-table">
              <thead><tr><th>Name</th><th>Last change</th><th>Commits</th></tr></thead>
              <tbody>
                {path && (
                  <tr><td colSpan={3}><Link to={linkFor(path.split('/').slice(0, -1).join('/'))} className="file-link"><Icon name="folder" /> ..</Link></td></tr>
                )}
                {data.entries.map((e) => (
                  <tr key={e.path}>
                    <td>
                      <Link to={linkFor(e.path)} className="file-link">
                        <Icon name={e.type === 'tree' ? 'folder' : e.type === 'commit' ? 'repo' : 'file'} className={e.type === 'tree' ? 'folder-icon' : ''} />
                        {e.name}
                      </Link>
                    </td>
                    <td className="muted nowrap">{timeAgo(e.lastCommit?.date)}</td>
                    <td className="commit-cell">
                      <Link to={`../commit/${e.lastCommit?.sha}`} className="mono sha">{shortSha(e.lastCommit?.sha)}</Link>
                      <span className="ellipsis">{e.lastCommit?.subject}</span>
                      <span className="muted nowrap">{e.lastCommit?.author}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.readme && !data.readme.binary && (
            <div className="card readme">
              <div className="card-head"><Icon name="page" /> {data.readme.name}</div>
              {/\.md$|\.markdown$/i.test(data.readme.name) ? <Markdown source={data.readme.content} /> : <pre>{data.readme.content}</pre>}
            </div>
          )}
        </>
      )}
      {data && isFile && (
        <div className="card flush">
          <div className="file-head">
            <Tabs value={tab} onChange={setTab} tabs={[{ value: 'contents', label: 'Contents' }, ...(/\.md$/i.test(path) ? [{ value: 'preview', label: 'Preview' }] : []), { value: 'history', label: 'History' }]} />
            <span className="muted small">{fmtSize(data.file.size)}</span>
          </div>
          {tab === 'history' ? <FileHistory base={base} refName={ref} path={path} /> : <FileBody base={base} refName={ref} file={data.file} preview={tab === 'preview'} />}
        </div>
      )}
      {pendingUpload && (
        <CommitDialog
          repo={repo}
          branch={ref}
          defaultMessage={pendingUpload[0].action === 'delete' ? `Delete ${pendingUpload[0].path}` : `Upload ${pendingUpload.length} file${pendingUpload.length > 1 ? 's' : ''}`}
          summary={[...pendingUpload.slice(0, 12).map((c) => `${c.action === 'delete' ? 'Delete' : 'Add/update'} ${c.path}`), ...(pendingUpload.length > 12 ? [`…and ${pendingUpload.length - 12} more`] : [])]}
          changes={pendingUpload}
          onClose={() => setPendingUpload(null)}
          onDone={(res) => {
            setPendingUpload(null);
            reloadRepo();
            const delPath = pendingUpload[0].action === 'delete';
            setSp(Object.fromEntries(Object.entries({ ref: res.branch === repo.defaultBranch ? '' : res.branch, path: delPath ? dir : path }).filter(([, v]) => v)));
            items.reload();
          }}
        />
      )}
    </main>
  );
}

function FileBody({ base, refName, file, preview }) {
  if (file.tooLarge) return <div className="pad muted">This file is too large to display ({fmtSize(file.size)}).</div>;
  if (file.binary) {
    if (IMG.test(file.path)) return <div className="pad image-preview"><RawImage url={`${base}/raw${q({ ref: refName, path: file.path })}`} alt={file.path} /></div>;
    return <div className="pad muted">Binary file — use Download to view it.</div>;
  }
  if (preview) return <div className="pad"><Markdown source={file.content} /></div>;
  return <CodeView content={file.content} path={file.path} />;
}

function FileHistory({ base, refName, path }) {
  const { data, error } = useAsync(() => api.get(`${base}/commits${q({ ref: refName, path })}`), [base, refName, path]);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Spinner />;
  return (
    <ul className="commit-list">
      {data.map((c) => (
        <li key={c.sha}>
          <Avatar name={c.author} size={28} />
          <div className="commit-main">
            <Link to={`../commit/${c.sha}`} className="commit-subject">{c.subject}</Link>
            <span className="muted small">{c.author} committed {timeAgo(c.date)}</span>
          </div>
          <Link to={`../commit/${c.sha}`} className="mono sha">{shortSha(c.sha)}</Link>
        </li>
      ))}
    </ul>
  );
}

function RawImage({ url, alt }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let objectUrl = null;
    let alive = true;
    api.blob(url).then((b) => {
      if (!alive) return;
      objectUrl = URL.createObjectURL(b);
      setSrc(objectUrl);
    }).catch(() => {});
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url]);
  return src ? <img src={src} alt={alt} /> : <Spinner />;
}
