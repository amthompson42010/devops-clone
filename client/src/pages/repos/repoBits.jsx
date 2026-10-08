import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import hljs from 'highlight.js/lib/common';
import Icon from '../../components/Icon.jsx';
import { CopyButton } from '../../components/ui.jsx';
import { BROWSER_MODE } from '../../api.js';
import { useClickOutside } from '../../util.js';

export function BranchPicker({ branches, value, onChange, label = 'Branch', className = '' }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false), open);
  const list = branches.filter((b) => !term || b.name.toLowerCase().includes(term.toLowerCase()));
  const isSha = value && /^[0-9a-f]{40}$/.test(value);
  return (
    <div className={`picker branch-picker ${className}`} ref={ref}>
      <button type="button" className="picker-btn" onClick={() => { setOpen(!open); setTerm(''); }} title={label}>
        <Icon name={isSha ? 'commit' : 'branch'} /> <span className="mono">{isSha ? value.slice(0, 8) : value}</span> <Icon name="chevronDown" />
      </button>
      {open && (
        <div className="menu menu-left picker-menu">
          <input autoFocus className="input input-sm" placeholder="Filter branches" value={term} onChange={(e) => setTerm(e.target.value)} />
          <div className="picker-list">
            {list.map((b) => (
              <button key={b.name} type="button" className={`menu-item ${b.name === value ? 'active' : ''}`} onClick={() => { onChange(b.name); setOpen(false); }}>
                <Icon name="branch" /> <span>{b.name}</span>{b.isDefault && <span className="badge">default</span>}
              </button>
            ))}
            {!list.length && <div className="menu-empty">No branches</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export function PathCrumbs({ repoName, path, linkFor }) {
  const parts = path ? path.split('/') : [];
  return (
    <div className="path-crumbs">
      <Link to={linkFor('')}>{repoName}</Link>
      {parts.map((p, i) => {
        const sub = parts.slice(0, i + 1).join('/');
        return (
          <span key={sub}>
            <span className="crumb-sep">/</span>
            {i === parts.length - 1 ? <strong>{p}</strong> : <Link to={linkFor(sub)}>{p}</Link>}
          </span>
        );
      })}
    </div>
  );
}

const EXT_LANG = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', ts: 'typescript', tsx: 'typescript', py: 'python',
  cs: 'csharp', java: 'java', rb: 'ruby', go: 'go', rs: 'rust', php: 'php', c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp',
  json: 'json', yml: 'yaml', yaml: 'yaml', xml: 'xml', html: 'xml', htm: 'xml', svg: 'xml', css: 'css', scss: 'scss', less: 'less',
  md: 'markdown', sh: 'bash', bash: 'bash', ps1: 'powershell', sql: 'sql', kt: 'kotlin', swift: 'swift', ini: 'ini', toml: 'ini',
  dockerfile: 'dockerfile', makefile: 'makefile', vb: 'vbnet', r: 'r', lua: 'lua', pl: 'perl', diff: 'diff',
};
export function langFor(path = '') {
  const name = path.split('/').pop().toLowerCase();
  if (name === 'dockerfile') return 'dockerfile';
  if (name === 'makefile') return 'makefile';
  const ext = name.includes('.') ? name.split('.').pop() : '';
  const lang = EXT_LANG[ext];
  return lang && hljs.getLanguage(lang) ? lang : null;
}

/** Highlight full text and split into per-line HTML while keeping spans balanced. */
function highlightLines(code, lang) {
  let html;
  try {
    html = lang ? hljs.highlight(code, { language: lang, ignoreIllegals: true }).value : escapeHtml(code);
  } catch { html = escapeHtml(code); }
  const lines = [];
  let open = [];
  for (const raw of html.split('\n')) {
    const prefix = open.join('');
    const tagRe = /<span[^>]*>|<\/span>/g;
    let m;
    while ((m = tagRe.exec(raw))) {
      if (m[0] === '</span>') open.pop();
      else open.push(m[0]);
    }
    lines.push(prefix + raw + '</span>'.repeat(open.length));
  }
  return lines;
}
const escapeHtml = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export function CodeView({ content, path }) {
  const lines = useMemo(() => highlightLines(content.replace(/\n$/, ''), langFor(path)), [content, path]);
  return (
    <div className="code-view">
      <table>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} id={`L${i + 1}`}>
              <td className="ln">{i + 1}</td>
              <td className="code hljs" dangerouslySetInnerHTML={{ __html: l || ' ' }} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STATUS_LABEL = { added: 'A', deleted: 'D', modified: 'M', renamed: 'R' };

export function DiffView({ files, truncated, comments, onComment }) {
  const [collapsed, setCollapsed] = useState({});
  if (!files?.length) return <p className="muted pad">No file changes.</p>;
  const totalAdd = files.reduce((a, f) => a + f.additions, 0);
  const totalDel = files.reduce((a, f) => a + f.deletions, 0);
  return (
    <div className="diff">
      <div className="diff-summary">
        <span>{files.length} changed file{files.length === 1 ? '' : 's'}</span>
        <span className="add">+{totalAdd}</span><span className="del">−{totalDel}</span>
      </div>
      <div className="diff-layout">
        <ul className="diff-files">
          {files.map((f, i) => (
            <li key={i}><a href={`#diff-${i}`} onClick={(e) => { e.preventDefault(); document.getElementById(`diff-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><span className={`st st-${f.status}`}>{STATUS_LABEL[f.status]}</span> <span className="ellipsis">{f.newPath}</span></a></li>
          ))}
        </ul>
        <div className="diff-body">
          {truncated && <div className="notice">The diff is too large and has been truncated.</div>}
          {files.map((f, i) => (
            <div className="diff-file" id={`diff-${i}`} key={i}>
              <div className="diff-file-head" onClick={() => setCollapsed((c) => ({ ...c, [i]: !c[i] }))}>
                <Icon name={collapsed[i] ? 'chevronRight' : 'chevronDown'} />
                <span className={`st st-${f.status}`}>{STATUS_LABEL[f.status]}</span>
                <span className="mono">{f.status === 'renamed' ? `${f.oldPath} → ${f.newPath}` : f.newPath}</span>
                <span className="push" />
                <span className="add">+{f.additions}</span><span className="del">−{f.deletions}</span>
              </div>
              {!collapsed[i] && (
                f.binary ? <div className="pad muted">Binary file</div> : (
                  <table className="diff-table">
                    <tbody>
                      {f.hunks.map((h, hi) => (
                        <HunkRows key={hi} hunk={h} file={f} comments={comments} onComment={onComment} />
                      ))}
                    </tbody>
                  </table>
                )
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HunkRows({ hunk, file, comments, onComment }) {
  const [draftLine, setDraftLine] = useState(null);
  const [text, setText] = useState('');
  return (
    <>
      <tr className="hunk-head"><td className="ln" /><td className="ln" /><td className="code">{hunk.header}</td></tr>
      {hunk.lines.map((l, i) => {
        const lineNo = l.n ?? l.o;
        const lineComments = (comments || []).filter((c) => c.file === file.newPath && c.line === l.n && l.t !== '-');
        return (
          <FragmentRow key={i}>
            <tr className={`dl dl-${l.t === '+' ? 'add' : l.t === '-' ? 'del' : 'ctx'}`}>
              <td className="ln">{l.o ?? ''}</td>
              <td className="ln">{l.n ?? ''}</td>
              <td className="code">
                {onComment && l.t !== '-' && (
                  <button className="line-comment-btn" title="Comment" onClick={() => { setDraftLine(lineNo); setText(''); }}>+</button>
                )}
                <span className="sign">{l.t}</span>{l.s}
              </td>
            </tr>
            {lineComments.map((c) => (
              <tr key={c.id} className="inline-comment"><td colSpan={2} /><td><div className="inline-comment-box"><strong>{c.author}</strong> {c.body}</div></td></tr>
            ))}
            {draftLine === lineNo && l.t !== '-' && (
              <tr className="inline-comment">
                <td colSpan={2} />
                <td>
                  <div className="inline-comment-box">
                    <textarea autoFocus className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Leave a comment" />
                    <div className="row">
                      <button className="btn btn-sm" onClick={() => setDraftLine(null)}>Cancel</button>
                      <button className="btn btn-sm btn-primary" disabled={!text.trim()} onClick={async () => { await onComment({ body: text, file: file.newPath, line: l.n }); setDraftLine(null); }}>Comment</button>
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </FragmentRow>
        );
      })}
    </>
  );
}
const FragmentRow = ({ children }) => <>{children}</>;

export function EmptyRepo({ repo, onInit, onUpload }) {
  return (
    <div className="empty-repo">
      <h2>{repo.name} is empty. Add some code!</h2>
      {!BROWSER_MODE && (
        <>
          <section>
            <h4>Clone to your computer</h4>
            <div className="row">
              <input className="input mono" readOnly value={repo.cloneUrl} />
              <CopyButton text={repo.cloneUrl} />
            </div>
          </section>
          <section>
            <h4>Push an existing repository from the command line</h4>
            <pre className="cmd">{`git remote add origin ${repo.cloneUrl}\ngit push -u origin --all`}</pre>
          </section>
        </>
      )}
      <section>
        <h4>Upload your code</h4>
        <p className="muted small">Drag in a project folder or a .zip (e.g. GitHub&apos;s &ldquo;Download ZIP&rdquo;). It becomes the first commit on the default branch.</p>
        <button className="btn" onClick={onUpload}><Icon name="upload" /> Upload folder or .zip</button>
      </section>
      <section>
        <h4>Initialize main branch</h4>
        <button className="btn btn-primary" onClick={onInit}>Initialize with a README</button>
      </section>
    </div>
  );
}
