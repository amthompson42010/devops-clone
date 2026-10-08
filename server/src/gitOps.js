/** Read/write operations on a (hydrated) bare repository using the git CLI. */
import { git } from './gitStore.js';
import { pool } from './blob.js';
import { HttpError } from './store.js';

const SEP = '\x1f';
const REC = '\x1e';
const MAX_FILE = 2 * 1024 * 1024;
const MAX_PATCH = 1.5 * 1024 * 1024;

export function checkRef(ref) {
  if (!ref || typeof ref !== 'string' || ref.startsWith('-') || !/^[\w./@{}^~-]+$/.test(ref) || ref.includes('..')) {
    throw new HttpError(400, `Invalid ref: ${ref}`);
  }
  return ref;
}
export function checkPath(p = '') {
  const clean = String(p).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (clean.split('/').some((s) => s === '..')) throw new HttpError(400, 'Invalid path');
  return clean;
}

export async function defaultBranch(dir) {
  const r = await git(dir, ['symbolic-ref', '--short', 'HEAD'], { allowExit: [1, 128] });
  return r.code === 0 ? r.text.trim() : 'main';
}

export async function isEmpty(dir) {
  const r = await git(dir, ['for-each-ref', '--count=1', 'refs/heads']);
  return r.text.trim() === '';
}

export async function resolve(dir, ref) {
  const r = await git(dir, ['rev-parse', '--verify', '-q', `${checkRef(ref)}^{commit}`], { allowExit: [1, 128] });
  if (r.code !== 0) throw new HttpError(404, `Ref not found: ${ref}`);
  return r.text.trim();
}

export async function branches(dir) {
  const def = await defaultBranch(dir);
  const r = await git(dir, ['for-each-ref', 'refs/heads', '--sort=-committerdate',
    `--format=%(refname:short)${SEP}%(objectname)${SEP}%(committerdate:iso-strict)${SEP}%(authorname)${SEP}%(subject)`]);
  const list = r.text.split('\n').filter(Boolean).map((l) => {
    const [name, sha, date, author, subject] = l.split(SEP);
    return { name, sha, date, author, subject, isDefault: name === def };
  });
  const hasDef = list.some((b) => b.isDefault);
  await pool(list, 6, async (b) => {
    if (b.isDefault || !hasDef) { b.ahead = 0; b.behind = 0; return; }
    const c = await git(dir, ['rev-list', '--left-right', '--count', `${def}...${b.name}`]);
    const [behind, ahead] = c.text.trim().split(/\s+/).map(Number);
    Object.assign(b, { ahead, behind });
  });
  return { defaultBranch: def, branches: list };
}

export async function tree(dir, ref, p) {
  const path = checkPath(p);
  const treeish = path ? `${checkRef(ref)}:${path}` : checkRef(ref);
  const r = await git(dir, ['ls-tree', '-l', '-z', treeish], { allowExit: [128] });
  if (r.code !== 0) throw new HttpError(404, 'Path not found');
  const entries = r.text.split('\0').filter(Boolean).map((l) => {
    const tab = l.indexOf('\t');
    const [mode, type, sha, size] = l.slice(0, tab).split(/\s+/);
    const name = l.slice(tab + 1);
    return { name, path: path ? `${path}/${name}` : name, mode, type, sha, size: size === '-' ? null : Number(size) };
  });
  entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'tree' ? -1 : 1));
  await pool(entries.slice(0, 200), 6, async (e) => {
    const l = await git(dir, ['log', '-1', `--format=%H${SEP}%an${SEP}%aI${SEP}%s`, checkRef(ref), '--', e.path]);
    const [sha, author, date, subject] = l.text.trim().split(SEP);
    e.lastCommit = { sha, author, date, subject };
  });
  return entries;
}

export async function pathType(dir, ref, p) {
  const path = checkPath(p);
  if (!path) return 'tree';
  const r = await git(dir, ['cat-file', '-t', `${checkRef(ref)}:${path}`], { allowExit: [128] });
  if (r.code !== 0) throw new HttpError(404, 'Path not found');
  return r.text.trim();
}

export async function fileContent(dir, ref, p) {
  const path = checkPath(p);
  const spec = `${checkRef(ref)}:${path}`;
  const s = await git(dir, ['cat-file', '-s', spec], { allowExit: [128] });
  if (s.code !== 0) throw new HttpError(404, 'File not found');
  const size = Number(s.text.trim());
  if (size > MAX_FILE) return { path, size, tooLarge: true };
  const r = await git(dir, ['cat-file', 'blob', spec]);
  const buf = r.stdout;
  const binary = buf.subarray(0, 8000).includes(0);
  return { path, size, binary, content: binary ? null : buf.toString('utf8') };
}

export async function rawFile(dir, ref, p) {
  const r = await git(dir, ['cat-file', 'blob', `${checkRef(ref)}:${checkPath(p)}`], { allowExit: [128] });
  if (r.code !== 0) throw new HttpError(404, 'File not found');
  return r.stdout;
}

function parseLog(text) {
  return text.split(REC).map((s) => s.trim()).filter(Boolean).map((rec) => {
    const [sha, parents, author, email, date, committer, subject, body] = rec.split(SEP);
    return { sha, parents: parents ? parents.split(' ') : [], author, email, date, committer, subject, body: (body || '').trim() };
  });
}
const LOG_FMT = `--format=%H${SEP}%P${SEP}%an${SEP}%ae${SEP}%aI${SEP}%cn${SEP}%s${SEP}%b${REC}`;

export async function log(dir, ref, p, { skip = 0, limit = 50, author } = {}) {
  const args = ['log', LOG_FMT, `--skip=${Number(skip) || 0}`, `-n`, String(Math.min(Number(limit) || 50, 200))];
  if (author) args.push(`--author=${author}`);
  args.push(checkRef(ref), '--');
  const path = checkPath(p);
  if (path) args.push(path);
  const r = await git(dir, args, { allowExit: [128] });
  if (r.code !== 0) return [];
  return parseLog(r.text);
}

/* ------------------------------------------------------------------- diffs */
export function parseDiff(patch) {
  const files = [];
  let file = null;
  let hunk = null;
  let oldNo = 0;
  let newNo = 0;
  const unq = (s) => (s.startsWith('"') ? s.slice(1, -1).replace(/\\(.)/g, '$1') : s);
  for (const line of patch.split('\n')) {
    if (line.startsWith('diff --git ')) {
      const m = line.match(/^diff --git (?:"?a\/(.+?)"?) (?:"?b\/(.+?)"?)$/);
      file = { oldPath: m ? unq(m[1]) : '', newPath: m ? unq(m[2]) : '', status: 'modified', hunks: [], additions: 0, deletions: 0, binary: false };
      files.push(file);
      hunk = null;
    } else if (!file) continue;
    else if (line.startsWith('new file mode')) file.status = 'added';
    else if (line.startsWith('deleted file mode')) file.status = 'deleted';
    else if (line.startsWith('rename from ')) { file.status = 'renamed'; file.oldPath = unq(line.slice(12)); }
    else if (line.startsWith('rename to ')) file.newPath = unq(line.slice(10));
    else if (line.startsWith('Binary files')) file.binary = true;
    else if (line.startsWith('--- ') || line.startsWith('+++ ')) { /* skip */ }
    else if (line.startsWith('@@')) {
      const m = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/);
      oldNo = m ? Number(m[1]) : 0;
      newNo = m ? Number(m[2]) : 0;
      hunk = { header: line, lines: [] };
      file.hunks.push(hunk);
    } else if (hunk) {
      if (line.startsWith('+')) { hunk.lines.push({ t: '+', s: line.slice(1), n: newNo++ }); file.additions++; }
      else if (line.startsWith('-')) { hunk.lines.push({ t: '-', s: line.slice(1), o: oldNo++ }); file.deletions++; }
      else if (line.startsWith(' ')) hunk.lines.push({ t: ' ', s: line.slice(1), o: oldNo++, n: newNo++ });
    }
  }
  return files;
}

async function patchFor(dir, args) {
  const r = await git(dir, [...args, '--find-renames', '--no-color', '--no-ext-diff']);
  const truncated = r.stdout.length > MAX_PATCH;
  const text = (truncated ? r.stdout.subarray(0, MAX_PATCH) : r.stdout).toString('utf8');
  return { files: parseDiff(text), truncated };
}

export async function commit(dir, sha) {
  checkRef(sha);
  const r = await git(dir, ['log', '-1', LOG_FMT, sha], { allowExit: [128] });
  if (r.code !== 0) throw new HttpError(404, 'Commit not found');
  const [info] = parseLog(r.text);
  const diff = await patchFor(dir, ['show', '--format=', '--patch', '-m', '--first-parent', sha]);
  return { ...info, ...diff };
}

/* -------------------------------------------------------------- web edits */
function authorEnv(user) {
  const name = user?.name || 'Anonymous';
  const email = user?.email || `${name.toLowerCase().replace(/\s+/g, '.')}@devops.local`;
  return { GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email };
}

/**
 * Commit changes without a working tree.
 * changes: [{ action: 'upsert'|'delete', path, content, encoding: 'utf8'|'base64' }]
 */
export async function commitFiles(dir, { branch, baseSha, message, changes, user, createBranchFrom }) {
  checkRef(branch);
  await validBranchName(branch);
  if (!message?.trim()) throw new HttpError(400, 'Commit message is required');
  if (!Array.isArray(changes) || !changes.length) throw new HttpError(400, 'No changes');

  const refName = `refs/heads/${branch}`;
  const cur = await git(dir, ['rev-parse', '--verify', '-q', refName], { allowExit: [1] });
  let parent = cur.code === 0 ? cur.text.trim() : null;
  if (!parent && createBranchFrom) parent = await resolve(dir, createBranchFrom);
  if (parent && baseSha && cur.code === 0 && parent !== baseSha) {
    throw new HttpError(409, 'The branch has been updated since you started editing. Reload and try again.');
  }

  const indexFile = `${dir}/web-edit-${Date.now()}-${Math.random().toString(36).slice(2)}.idx`;
  const env = { GIT_INDEX_FILE: indexFile, ...authorEnv(user) };
  try {
    if (parent) await git(dir, ['read-tree', parent], { env });
    else await git(dir, ['read-tree', '--empty'], { env });
    for (const c of changes) {
      const p = checkPath(c.path);
      if (!p) throw new HttpError(400, 'File path is required');
      if (c.action === 'delete') {
        await git(dir, ['update-index', '--force-remove', '--', p], { env });
      } else {
        const buf = Buffer.from(c.content ?? '', c.encoding === 'base64' ? 'base64' : 'utf8');
        const h = await git(dir, ['hash-object', '-w', '--stdin'], { input: buf, env });
        await git(dir, ['update-index', '--add', '--cacheinfo', `100644,${h.text.trim()},${p}`], { env });
      }
    }
    const treeSha = (await git(dir, ['write-tree'], { env })).text.trim();
    if (parent) {
      const parentTree = (await git(dir, ['rev-parse', `${parent}^{tree}`])).text.trim();
      if (parentTree === treeSha) throw new HttpError(400, 'No changes to commit');
    }
    const args = ['commit-tree', treeSha, '-F', '-'];
    if (parent) args.push('-p', parent);
    const newSha = (await git(dir, args, { input: message.trim() + '\n', env })).text.trim();
    await git(dir, ['update-ref', '-m', `web: ${message.split('\n')[0]}`, refName, newSha, cur.code === 0 ? parent : ''], { env });
    if (!parent) {
      // First commit in an empty repository: make it the default branch
      await git(dir, ['symbolic-ref', 'HEAD', refName]);
    }
    return { sha: newSha, branch };
  } finally {
    await import('node:fs/promises').then((f) => f.rm(indexFile, { force: true }));
  }
}

export async function validBranchName(name) {
  const r = await git(null, ['check-ref-format', '--branch', name], { allowExit: [1, 128] });
  if (r.code !== 0 || name.startsWith('-')) throw new HttpError(400, `Invalid branch name: ${name}`);
}

export async function createBranch(dir, name, from) {
  await validBranchName(name);
  const sha = await resolve(dir, from);
  const r = await git(dir, ['update-ref', `refs/heads/${name}`, sha, ''], { allowExit: [128] });
  if (r.code !== 0) throw new HttpError(409, `Branch ${name} already exists`);
  return { name, sha };
}

export async function deleteBranch(dir, name) {
  checkRef(name);
  if (name === (await defaultBranch(dir))) throw new HttpError(400, 'Cannot delete the default branch');
  await git(dir, ['update-ref', '-d', `refs/heads/${name}`]);
}

export async function setDefaultBranch(dir, name) {
  await resolve(dir, name);
  await git(dir, ['symbolic-ref', 'HEAD', `refs/heads/${checkRef(name)}`]);
}

/* ---------------------------------------------------------- compare/merge */
export async function compare(dir, base, head) {
  const baseSha = await resolve(dir, base);
  const headSha = await resolve(dir, head);
  const lr = await git(dir, ['log', LOG_FMT, '-n', '250', `${baseSha}..${headSha}`]);
  const diff = await patchFor(dir, ['diff', `${baseSha}...${headSha}`]);
  const mergeability = await checkMerge(dir, baseSha, headSha);
  return { baseSha, headSha, commits: parseLog(lr.text), ...diff, ...mergeability };
}

async function checkMerge(dir, baseSha, headSha) {
  const r = await git(dir, ['merge-tree', '--write-tree', '--name-only', '--no-messages', baseSha, headSha], { allowExit: [1] });
  const lines = r.text.trim().split('\n');
  return { mergeable: r.code === 0, mergeTree: lines[0], conflicts: r.code === 1 ? lines.slice(1).filter(Boolean) : [] };
}

export async function merge(dir, { base, head, message, squash, user }) {
  const baseSha = await resolve(dir, base);
  const headSha = await resolve(dir, head);
  const { mergeable, mergeTree, conflicts } = await checkMerge(dir, baseSha, headSha);
  if (!mergeable) throw new HttpError(409, `Merge conflicts in: ${conflicts.join(', ')}`);
  const env = authorEnv(user);
  const args = ['commit-tree', mergeTree, '-F', '-', '-p', baseSha];
  if (!squash) args.push('-p', headSha);
  const sha = (await git(dir, args, { input: message + '\n', env })).text.trim();
  await git(dir, ['update-ref', '-m', `merge ${head} into ${base}`, `refs/heads/${checkRef(base)}`, sha, baseSha], { env });
  return { sha };
}

/* --------------------------------------------------------------- extras */
/** Commits on any branch whose message mentions `key` (e.g. PROJ-12). */
export async function grepCommits(dir, key, limit = 20) {
  const r = await git(dir, ['log', '--all', '-n', String(limit), '-i', '-E', `--grep=(^|[^A-Za-z0-9])${key}([^0-9]|$)`,
    `--format=%H${SEP}%an${SEP}%aI${SEP}%s`], { allowExit: [128] });
  if (r.code !== 0) return [];
  return r.text.split('\n').filter(Boolean).map((l) => {
    const [sha, author, date, subject] = l.split(SEP);
    return { sha, author, date, subject };
  });
}

/** Zip archive of a ref. */
export async function archive(dir, ref) {
  const r = await git(dir, ['archive', '--format=zip', await resolve(dir, ref)]);
  return r.stdout;
}
