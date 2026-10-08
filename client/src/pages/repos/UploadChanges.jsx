/**
 * Upload a folder, files or a .zip and overlay it onto a branch:
 * files are compared (by git blob SHA) with what's stored; only added/changed files are committed.
 * Files that exist in the repo but not in the upload are left untouched (overlay, never delete).
 */
import { useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { unzipSync } from 'fflate';
import { api, q, repoApi } from '../../api.js';
import { Modal, ErrorBox, Spinner, useToast } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import { fmtSize } from '../../util.js';
import { bytesToBase64 } from '../../zip.js';
import CommitDialog from './CommitDialog.jsx';

const IGNORED_SEGMENTS = new Set(['.git', 'node_modules', '__MACOSX', '.DS_Store', 'Thumbs.db', 'desktop.ini']);
const MAX_TOTAL = 200 * 1024 * 1024;

const isIgnored = (path) => path.split('/').some((s) => IGNORED_SEGMENTS.has(s));

async function gitBlobSha(bytes) {
  const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const buf = new Uint8Array(header.length + bytes.length);
  buf.set(header);
  buf.set(bytes, header.length);
  const digest = await crypto.subtle.digest('SHA-1', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Strip a single shared top-level folder (e.g. "my-app/…" from a folder pick or GitHub zip). */
function stripCommonRoot(items) {
  if (!items.length) return items;
  const roots = new Set(items.map((i) => i.path.split('/')[0]));
  if (roots.size !== 1 || !items.every((i) => i.path.includes('/'))) return items;
  const prefix = `${[...roots][0]}/`;
  return items.map((i) => ({ ...i, path: i.path.slice(prefix.length) }));
}

async function fromZip(file) {
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  return Object.entries(entries)
    .filter(([n]) => !n.endsWith('/'))
    .map(([path, bytes]) => ({ path: path.replace(/\\/g, '/'), bytes }));
}

async function fromFileList(files, useRelative) {
  const out = [];
  for (const f of files) {
    const path = (useRelative && f.webkitRelativePath) || f.name;
    if (f.name.toLowerCase().endsWith('.zip') && files.length === 1 && !useRelative) return fromZip(f);
    out.push({ path: path.replace(/\\/g, '/'), bytes: new Uint8Array(await f.arrayBuffer()) });
  }
  return out;
}

/** Recursively read drag-and-dropped folders via the File System Entry API. */
async function fromDataTransfer(dt) {
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
  if (entries.length === 1 && entries[0].isFile && entries[0].name.toLowerCase().endsWith('.zip')) {
    const file = await new Promise((res, rej) => entries[0].file(res, rej));
    return fromZip(file);
  }
  const out = [];
  const readDir = (dir) => new Promise((res, rej) => {
    const reader = dir.createReader();
    const all = [];
    const next = () => reader.readEntries((batch) => { if (!batch.length) res(all); else { all.push(...batch); next(); } }, rej);
    next();
  });
  const walk = async (entry, prefix) => {
    const p = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej));
      out.push({ path: p, bytes: new Uint8Array(await file.arrayBuffer()) });
    } else if (entry.isDirectory && !IGNORED_SEGMENTS.has(entry.name)) {
      for (const child of await readDir(entry)) await walk(child, p);
    }
  };
  for (const e of entries) await walk(e, '');
  return out;
}

export default function UploadChanges({ repo, branch, dir = '', onClose, onCommitted }) {
  const { project } = useOutletContext();
  const base = repoApi(project.key, repo.name);
  const [items, setItems] = useState(null); // [{path, bytes, sha, status}]
  const [sourceName, setSourceName] = useState('');
  const [ignored, setIgnored] = useState(0);
  const [target, setTarget] = useState(dir);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [drag, setDrag] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [committing, setCommitting] = useState(false);
  const folderInput = useRef(null);
  const filesInput = useRef(null);
  const zipInput = useRef(null);
  const toast = useToast();

  const raw = useRef(null);

  const compare = async (kept, tgt) => {
    setBusy(true);
    setErr(null);
    try {
      const stored = repo.empty ? { files: {} } : await api.get(`${base}/tree-flat${q({ ref: branch })}`);
      const prefix = tgt ? `${tgt.replace(/\/+$/, '')}/` : '';
      const analyzed = [];
      for (const i of kept) {
        const path = prefix + i.path;
        const sha = await gitBlobSha(i.bytes);
        const old = stored.files[path];
        analyzed.push({ path, bytes: i.bytes, size: i.bytes.length, status: !old ? 'added' : old === sha ? 'unchanged' : 'modified' });
      }
      analyzed.sort((a, b) => a.path.localeCompare(b.path));
      setItems(analyzed);
    } catch (e) { setErr(e); }
    setBusy(false);
  };

  const analyze = async (loader, name) => {
    setBusy(true);
    setErr(null);
    setItems(null);
    try {
      const all = stripCommonRoot(await loader());
      const kept = all.filter((i) => i.path && !isIgnored(i.path));
      setIgnored(all.length - kept.length);
      if (!kept.length) throw new Error('No files found in the upload.');
      raw.current = kept;
      setSourceName(name);
      await compare(kept, target);
    } catch (e) { setErr(e); setBusy(false); }
  };

  const changed = useMemo(() => (items || []).filter((i) => i.status !== 'unchanged'), [items]);
  const counts = useMemo(() => ({
    added: changed.filter((i) => i.status === 'added').length,
    modified: changed.filter((i) => i.status === 'modified').length,
    unchanged: (items || []).length - changed.length,
    bytes: changed.reduce((a, i) => a + i.size, 0),
  }), [items, changed]);
  const tooBig = counts.bytes > MAX_TOTAL;
  const changes = useMemo(() => changed.map((i) => ({ path: i.path, content: bytesToBase64(i.bytes), encoding: 'base64' })), [changed]);
  const message = `Upload ${sourceName || 'files'}: ${counts.added} added, ${counts.modified} modified`;

  const commitToEmpty = async () => {
    setBusy(true);
    try {
      const res = await api.post(`${base}/commits`, { branch: repo.defaultBranch || 'main', message, changes });
      toast(`Committed ${changes.length} files`);
      onCommitted?.(res);
    } catch (e) { setErr(e); setBusy(false); }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    const dt = e.dataTransfer;
    const first = dt.items?.[0]?.webkitGetAsEntry?.();
    analyze(() => fromDataTransfer(dt), first?.name || 'dropped files');
  };

  if (committing) {
    return (
      <CommitDialog
        repo={repo}
        branch={branch}
        baseSha={repo.branches.find((b) => b.name === branch)?.sha}
        changes={changes}
        defaultMessage={message}
        summary={[...changed.slice(0, 12).map((c) => `${c.status === 'added' ? 'Add' : 'Update'} ${c.path}`), ...(changed.length > 12 ? [`…and ${changed.length - 12} more`] : [])]}
        onClose={() => setCommitting(false)}
        onDone={(res) => onCommitted?.(res)}
      />
    );
  }

  const shown = (items || []).filter((i) => showAll || i.status !== 'unchanged');

  return (
    <Modal title="Upload changes" onClose={onClose} width={760}
      footer={(
        <>
          <span className="muted small push-left">Overlay mode: files not in the upload are kept as they are.</span>
          <button className="btn" onClick={onClose}>Cancel</button>
          {repo.empty
            ? <button className="btn btn-primary" disabled={!changes.length || busy || tooBig} onClick={commitToEmpty}>Commit {changes.length} files</button>
            : <button className="btn btn-primary" disabled={!changes.length || busy || tooBig} onClick={() => setCommitting(true)}>Commit {changes.length} change{changes.length === 1 ? '' : 's'}…</button>}
        </>
      )}>
      <div className="upload-changes">
        <div className="row">
          <span className="muted">Into branch</span> <b className="mono">{repo.empty ? repo.defaultBranch || 'main' : branch}</b>
          <span className="muted">at</span>
          <select className="input input-sm" style={{ width: 'auto' }} value={target} onChange={(e) => { setTarget(e.target.value); if (raw.current) compare(raw.current, e.target.value); }}>
            <option value="">/ (repository root)</option>
            {dir && <option value={dir}>/{dir}</option>}
          </select>
        </div>

        <div
          className={`drop-zone ${drag ? 'drag' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
        >
          <Icon name="upload" size={28} />
          <div><b>Drag a folder, files or a .zip here</b></div>
          <div className="row">
            <button className="btn btn-sm" onClick={() => folderInput.current?.click()}><Icon name="folder" /> Choose folder</button>
            <button className="btn btn-sm" onClick={() => zipInput.current?.click()}><Icon name="download" /> Choose .zip</button>
            <button className="btn btn-sm" onClick={() => filesInput.current?.click()}><Icon name="file" /> Choose files</button>
          </div>
          <span className="muted small">.git, node_modules and OS junk files are skipped automatically.</span>
        </div>
        <input type="file" hidden ref={folderInput} webkitdirectory="" directory="" multiple
          onChange={(e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) analyze(() => fromFileList(fs, true), fs[0].webkitRelativePath.split('/')[0]); }} />
        <input type="file" hidden ref={zipInput} accept=".zip,application/zip"
          onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) analyze(() => fromZip(f), f.name); }} />
        <input type="file" hidden ref={filesInput} multiple
          onChange={(e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) analyze(() => fromFileList(fs, false), fs.length === 1 ? fs[0].name : `${fs.length} files`); }} />

        <ErrorBox error={err} />
        {busy && <Spinner label="Comparing with stored source…" />}
        {items && !busy && (
          <>
            <div className="upload-summary">
              <b>{sourceName}</b>
              <span className="chip st-chip added">{counts.added} added</span>
              <span className="chip st-chip modified">{counts.modified} modified</span>
              <span className="chip">{counts.unchanged} unchanged</span>
              {ignored > 0 && <span className="chip">{ignored} skipped</span>}
              <span className="muted small">{fmtSize(counts.bytes)} to commit</span>
              <span className="push" />
              <label className="check small"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show unchanged</label>
            </div>
            {tooBig && <div className="notice warn">The changed files total more than {fmtSize(MAX_TOTAL)}. Upload in smaller parts.</div>}
            {!changes.length && <div className="notice ok"><Icon name="check" /> Everything in this upload already matches <b>{branch}</b>. Nothing to commit.</div>}
            <div className="upload-list">
              {shown.map((i) => (
                <div key={i.path} className="upload-row">
                  <span className={`st st-${i.status === 'unchanged' ? 'same' : i.status}`}>{i.status === 'added' ? 'A' : i.status === 'modified' ? 'M' : '='}</span>
                  <span className="mono ellipsis">{i.path}</span>
                  <span className="muted small">{fmtSize(i.size)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
