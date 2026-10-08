/**
 * Browser implementation of server/src/gitOps.js using isomorphic-git.
 * Same function names and return shapes, so server/src/routes/repos.js runs unchanged.
 * `dir` is the gitdir path of a bare repository inside the virtual filesystem.
 */
import git from 'isomorphic-git';
import { structuredPatch } from 'diff';
import { zipSync } from 'fflate';
import { fs, cache } from './gitfs.js';

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const G = (dir) => ({ fs, gitdir: dir, cache });
const MAX_FILE = 2 * 1024 * 1024;
const MAX_PATCH_CHARS = 1.5 * 1024 * 1024;
const td = new TextDecoder();

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

/* ---------------------------------------------------------------- helpers */
const isoDate = (sig) => new Date(sig.timestamp * 1000).toISOString();
function splitMessage(msg = '') {
  const [subject, ...rest] = msg.replace(/\r/g, '').split('\n');
  return { subject, body: rest.join('\n').trim() };
}
function toLogEntry(c) {
  const { subject, body } = splitMessage(c.commit.message);
  return {
    sha: c.oid, parents: c.commit.parent, author: c.commit.author.name, email: c.commit.author.email,
    date: isoDate(c.commit.author), committer: c.commit.committer.name, subject, body,
  };
}

function makeReader(dir) {
  const commits = new Map();
  const trees = new Map();
  return {
    async commit(oid) {
      if (!commits.has(oid)) commits.set(oid, git.readCommit({ ...G(dir), oid }));
      return commits.get(oid);
    },
    async tree(oid) {
      if (!trees.has(oid)) trees.set(oid, git.readTree({ ...G(dir), oid }).then((t) => t.tree));
      return trees.get(oid);
    },
    /** Entry {oid,type,mode} at path inside a tree, or null. */
    async entryAt(treeOid, path) {
      if (!path) return { oid: treeOid, type: 'tree', mode: '040000' };
      let cur = treeOid;
      const parts = path.split('/');
      for (let i = 0; i < parts.length; i++) {
        const entries = await this.tree(cur);
        const e = entries.find((x) => x.path === parts[i]);
        if (!e) return null;
        if (i === parts.length - 1) return e;
        if (e.type !== 'tree') return null;
        cur = e.oid;
      }
      return null;
    },
    /** Map of path -> {oid, mode} for every blob under a tree. */
    async flatten(treeOid, prefix = '', out = new Map()) {
      if (!treeOid) return out;
      for (const e of await this.tree(treeOid)) {
        const p = prefix ? `${prefix}/${e.path}` : e.path;
        if (e.type === 'tree') await this.flatten(e.oid, p, out);
        else out.set(p, { oid: e.oid, mode: e.mode, type: e.type });
      }
      return out;
    },
  };
}

async function ancestors(rd, oid, limit = 20000) {
  const seen = new Set();
  const stack = [oid];
  while (stack.length && seen.size < limit) {
    const o = stack.pop();
    if (!o || seen.has(o)) continue;
    seen.add(o);
    const c = await rd.commit(o);
    stack.push(...c.commit.parent);
  }
  return seen;
}

/**
 * Commit history newest-first (by committer date), de-duplicated, like `git log`.
 * `include(c, rd)` can filter commits; walking stops after `max` included commits.
 */
async function walkLog(rd, starts, { max = Infinity, include, scanLimit = 5000 } = {}) {
  const out = [];
  const seen = new Set();
  const queue = [];
  const push = async (oid) => {
    if (!oid || seen.has(oid)) return;
    seen.add(oid);
    queue.push(await rd.commit(oid));
  };
  for (const o of starts) await push(o);
  let scanned = 0;
  while (queue.length && out.length < max && scanned < scanLimit) {
    queue.sort((a, b) => b.commit.committer.timestamp - a.commit.committer.timestamp);
    const c = queue.shift();
    scanned++;
    if (!include || (await include(c))) out.push(c);
    for (const p of c.commit.parent) await push(p);
  }
  return out;
}

async function headRef(dir, branch) {
  try { return await git.resolveRef({ ...G(dir), ref: `refs/heads/${branch}` }); } catch { return null; }
}

/* ------------------------------------------------------------------ reads */
export async function defaultBranch(dir) {
  try {
    const b = await git.currentBranch({ ...G(dir), fullname: false, test: false });
    return b || 'main';
  } catch { return 'main'; }
}

export async function isEmpty(dir) {
  return (await git.listBranches({ ...G(dir) })).length === 0;
}

export async function resolve(dir, ref) {
  checkRef(ref);
  let oid = null;
  if (/^[0-9a-f]{40}$/.test(ref)) oid = ref;
  else if (/^[0-9a-f]{4,39}$/.test(ref)) {
    try { oid = await git.expandOid({ ...G(dir), oid: ref }); } catch { /* not a sha */ }
  }
  if (!oid) {
    for (const r of [`refs/heads/${ref}`, `refs/tags/${ref}`, ref]) {
      try { oid = await git.resolveRef({ ...G(dir), ref: r }); break; } catch { /* next */ }
    }
  }
  if (!oid) throw new HttpError(404, `Ref not found: ${ref}`);
  try {
    const { type, object } = await git.readObject({ ...G(dir), oid });
    if (type === 'tag') return object.object;
    if (type !== 'commit') throw new Error();
  } catch { throw new HttpError(404, `Ref not found: ${ref}`); }
  return oid;
}

export async function branches(dir) {
  const def = await defaultBranch(dir);
  const rd = makeReader(dir);
  const names = await git.listBranches({ ...G(dir) });
  const list = [];
  for (const name of names) {
    const sha = await git.resolveRef({ ...G(dir), ref: `refs/heads/${name}` });
    const c = await rd.commit(sha);
    list.push({ name, sha, date: isoDate(c.commit.committer), author: c.commit.author.name, subject: splitMessage(c.commit.message).subject, isDefault: name === def });
  }
  list.sort((a, b) => b.date.localeCompare(a.date));
  const defB = list.find((b) => b.isDefault);
  const defAnc = defB ? await ancestors(rd, defB.sha) : null;
  for (const b of list) {
    if (b.isDefault || !defAnc) { b.ahead = 0; b.behind = 0; continue; }
    const anc = await ancestors(rd, b.sha);
    b.ahead = [...anc].filter((o) => !defAnc.has(o)).length;
    b.behind = [...defAnc].filter((o) => !anc.has(o)).length;
  }
  return { defaultBranch: def, branches: list };
}

/** For each path, the most recent commit (from `head`) that changed it. */
async function lastCommits(dir, rd, headOid, paths) {
  const result = {};
  const pending = new Set(paths);
  const commits = await walkLog(rd, [headOid], { max: 400 });
  for (const c of commits) {
    if (!pending.size) break;
    const parent = c.commit.parent[0] ? await rd.commit(c.commit.parent[0]) : null;
    for (const p of [...pending]) {
      const cur = await rd.entryAt(c.commit.tree, p);
      const prev = parent ? await rd.entryAt(parent.commit.tree, p) : null;
      if (cur?.oid !== prev?.oid) { result[p] = c; pending.delete(p); }
    }
  }
  const oldest = commits[commits.length - 1];
  for (const p of pending) result[p] = oldest;
  return result;
}

export async function tree(dir, ref, p) {
  const path = checkPath(p);
  const oid = await resolve(dir, ref);
  const rd = makeReader(dir);
  const c = await rd.commit(oid);
  const t = await rd.entryAt(c.commit.tree, path);
  if (!t || t.type !== 'tree') throw new HttpError(404, 'Path not found');
  const entries = (await rd.tree(t.oid)).map((e) => ({
    name: e.path, path: path ? `${path}/${e.path}` : e.path, mode: e.mode, type: e.type, sha: e.oid, size: null,
  }));
  entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'tree' ? -1 : 1));
  const last = await lastCommits(dir, rd, oid, entries.slice(0, 200).map((e) => e.path));
  for (const e of entries) {
    const lc = last[e.path];
    if (lc) e.lastCommit = { sha: lc.oid, author: lc.commit.author.name, date: isoDate(lc.commit.author), subject: splitMessage(lc.commit.message).subject };
  }
  return entries;
}

export async function pathType(dir, ref, p) {
  const path = checkPath(p);
  if (!path) return 'tree';
  const rd = makeReader(dir);
  const c = await rd.commit(await resolve(dir, ref));
  const e = await rd.entryAt(c.commit.tree, path);
  if (!e) throw new HttpError(404, 'Path not found');
  return e.type;
}

async function blobAt(dir, ref, p) {
  const path = checkPath(p);
  const rd = makeReader(dir);
  const c = await rd.commit(await resolve(dir, ref));
  const e = await rd.entryAt(c.commit.tree, path);
  if (!e || e.type !== 'blob') throw new HttpError(404, 'File not found');
  const { blob } = await git.readBlob({ ...G(dir), oid: e.oid });
  return { path, blob };
}

const isBinary = (u8) => u8.subarray(0, 8000).includes(0);

export async function fileContent(dir, ref, p) {
  const { path, blob } = await blobAt(dir, ref, p);
  const size = blob.length;
  if (size > MAX_FILE) return { path, size, tooLarge: true };
  const binary = isBinary(blob);
  return { path, size, binary, content: binary ? null : td.decode(blob) };
}

export async function rawFile(dir, ref, p) {
  return (await blobAt(dir, ref, p)).blob;
}

export async function log(dir, ref, p, { skip = 0, limit = 50, author } = {}) {
  const path = checkPath(p);
  const n = Math.min(Number(limit) || 50, 200);
  const s = Number(skip) || 0;
  const oid = await resolve(dir, ref);
  const rd = makeReader(dir);
  const who = author ? String(author).toLowerCase() : null;
  const include = async (c) => {
    if (who && !c.commit.author.name.toLowerCase().includes(who) && !c.commit.author.email.toLowerCase().includes(who)) return false;
    if (!path) return true;
    const mine = (await rd.entryAt(c.commit.tree, path))?.oid;
    if (!c.commit.parent.length) return !!mine;
    // Like git's default history simplification: a commit is shown if it differs from every parent
    for (const p of c.commit.parent) {
      const theirs = (await rd.entryAt((await rd.commit(p)).commit.tree, path))?.oid;
      if (theirs === mine) return false;
    }
    return true;
  };
  const commits = await walkLog(rd, [oid], { max: s + n, include });
  return commits.map(toLogEntry).slice(s, s + n);
}

/* ------------------------------------------------------------------ diffs */
async function treeDiff(dir, rd, oldTree, newTree) {
  const changes = [];
  async function walk(a, b, prefix) {
    if (a === b) return;
    const ea = a ? await rd.tree(a) : [];
    const eb = b ? await rd.tree(b) : [];
    const names = [...new Set([...ea.map((e) => e.path), ...eb.map((e) => e.path)])].sort();
    for (const name of names) {
      const x = ea.find((e) => e.path === name);
      const y = eb.find((e) => e.path === name);
      const p = prefix ? `${prefix}/${name}` : name;
      if (x?.oid === y?.oid) continue;
      const xt = x?.type === 'tree';
      const yt = y?.type === 'tree';
      if (xt || yt) {
        await walk(xt ? x.oid : null, yt ? y.oid : null, p);
        if (x && !xt) changes.push({ path: p, old: x.oid, new: null });
        if (y && !yt) changes.push({ path: p, old: null, new: y.oid });
      } else {
        changes.push({ path: p, old: x?.oid || null, new: y?.oid || null });
      }
    }
  }
  await walk(oldTree, newTree, '');

  const files = [];
  let budget = MAX_PATCH_CHARS;
  let truncated = false;
  for (const ch of changes) {
    const status = !ch.old ? 'added' : !ch.new ? 'deleted' : 'modified';
    const file = { oldPath: ch.path, newPath: ch.path, status, hunks: [], additions: 0, deletions: 0, binary: false };
    files.push(file);
    if (budget <= 0) { truncated = true; continue; }
    const a = ch.old ? (await git.readBlob({ ...G(dir), oid: ch.old })).blob : new Uint8Array();
    const b = ch.new ? (await git.readBlob({ ...G(dir), oid: ch.new })).blob : new Uint8Array();
    if (isBinary(a) || isBinary(b) || a.length > MAX_FILE || b.length > MAX_FILE) { file.binary = true; continue; }
    const as = td.decode(a);
    const bs = td.decode(b);
    budget -= as.length + bs.length;
    const patch = structuredPatch('a', 'b', as, bs, '', '', { context: 3 });
    for (const h of patch.hunks) {
      let o = h.oldStart;
      let n = h.newStart;
      const hunk = { header: `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`, lines: [] };
      for (const line of h.lines) {
        const t = line[0];
        const s = line.slice(1);
        if (t === '+') { hunk.lines.push({ t, s, n: n++ }); file.additions++; }
        else if (t === '-') { hunk.lines.push({ t, s, o: o++ }); file.deletions++; }
        else if (t === ' ') hunk.lines.push({ t, s, o: o++, n: n++ });
      }
      file.hunks.push(hunk);
    }
  }
  return { files, truncated };
}

export async function commit(dir, sha) {
  checkRef(sha);
  const rd = makeReader(dir);
  let c;
  try { c = await rd.commit(await resolve(dir, sha)); } catch { throw new HttpError(404, 'Commit not found'); }
  const parent = c.commit.parent[0] ? await rd.commit(c.commit.parent[0]) : null;
  const diff = await treeDiff(dir, rd, parent?.commit.tree || null, c.commit.tree);
  return { ...toLogEntry(c), ...diff };
}

/* -------------------------------------------------------------- web edits */
function signature(user) {
  const name = user?.name || 'Anonymous';
  const email = user?.email || `${name.toLowerCase().replace(/\s+/g, '.')}@devops.local`;
  return { name, email, timestamp: Math.floor(Date.now() / 1000), timezoneOffset: new Date().getTimezoneOffset() };
}

// git sorts tree entries by name, with directories compared as "name/"
const treeSortKey = (e) => (e.type === 'tree' ? `${e.path}/` : e.path);

async function writeFlatTree(dir, flat) {
  const root = new Map();
  for (const [p, info] of flat) {
    const parts = p.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node.has(parts[i]) || !(node.get(parts[i]) instanceof Map)) node.set(parts[i], new Map());
      node = node.get(parts[i]);
    }
    node.set(parts[parts.length - 1], info);
  }
  async function write(node) {
    const entries = [];
    for (const [name, v] of node) {
      if (v instanceof Map) {
        if (!v.size) continue;
        entries.push({ mode: '040000', path: name, type: 'tree', oid: await write(v) });
      } else {
        entries.push({ mode: v.mode || '100644', path: name, type: v.type || 'blob', oid: v.oid });
      }
    }
    entries.sort((a, b) => (treeSortKey(a) < treeSortKey(b) ? -1 : treeSortKey(a) > treeSortKey(b) ? 1 : 0));
    return git.writeTree({ ...G(dir), tree: entries });
  }
  return write(root);
}

export async function validBranchName(name) {
  const bad = !name || name.startsWith('-') || name.startsWith('/') || name.endsWith('/') || name.endsWith('.') || name.endsWith('.lock')
    || name.includes('..') || name.includes('//') || name.includes('@{') || /[\s~^:?*[\\\x00-\x1f\x7f]/.test(name) || name === '@'
    || name.split('/').some((s) => s.startsWith('.'));
  if (bad) throw new HttpError(400, `Invalid branch name: ${name}`);
}

export async function commitFiles(dir, { branch, baseSha, message, changes, user, createBranchFrom }) {
  checkRef(branch);
  await validBranchName(branch);
  if (!message?.trim()) throw new HttpError(400, 'Commit message is required');
  if (!Array.isArray(changes) || !changes.length) throw new HttpError(400, 'No changes');

  const current = await headRef(dir, branch);
  let parent = current;
  if (!parent && createBranchFrom) parent = await resolve(dir, createBranchFrom);
  if (current && baseSha && current !== baseSha) {
    throw new HttpError(409, 'The branch has been updated since you started editing. Reload and try again.');
  }
  const rd = makeReader(dir);
  const parentTree = parent ? (await rd.commit(parent)).commit.tree : null;
  const flat = await rd.flatten(parentTree);
  for (const c of changes) {
    const p = checkPath(c.path);
    if (!p) throw new HttpError(400, 'File path is required');
    if (c.action === 'delete') {
      flat.delete(p);
      for (const k of [...flat.keys()]) if (k.startsWith(`${p}/`)) flat.delete(k);
    } else {
      const bytes = c.encoding === 'base64'
        ? Uint8Array.from(atob(c.content ?? ''), (ch) => ch.charCodeAt(0))
        : new TextEncoder().encode(c.content ?? '');
      const oid = await git.writeBlob({ ...G(dir), blob: bytes });
      // A file replaces any directory of the same name and vice versa
      for (const k of [...flat.keys()]) if (k.startsWith(`${p}/`)) flat.delete(k);
      const segs = p.split('/');
      for (let i = 1; i < segs.length; i++) flat.delete(segs.slice(0, i).join('/'));
      flat.set(p, { oid, mode: '100644', type: 'blob' });
    }
  }
  const treeOid = await writeFlatTree(dir, flat);
  if (parentTree && parentTree === treeOid) throw new HttpError(400, 'No changes to commit');
  const sig = signature(user);
  const oid = await git.writeCommit({
    ...G(dir),
    commit: { message: `${message.trim()}\n`, tree: treeOid, parent: parent ? [parent] : [], author: sig, committer: sig },
  });
  if ((await headRef(dir, branch)) !== current) throw new HttpError(409, 'The branch was updated concurrently. Try again.');
  await git.writeRef({ ...G(dir), ref: `refs/heads/${branch}`, value: oid, force: true });
  if (!parent) await git.writeRef({ ...G(dir), ref: 'HEAD', value: `refs/heads/${branch}`, symbolic: true, force: true });
  return { sha: oid, branch };
}

export async function createBranch(dir, name, from) {
  await validBranchName(name);
  const sha = await resolve(dir, from);
  if (await headRef(dir, name)) throw new HttpError(409, `Branch ${name} already exists`);
  await git.writeRef({ ...G(dir), ref: `refs/heads/${name}`, value: sha });
  return { name, sha };
}

export async function deleteBranch(dir, name) {
  checkRef(name);
  if (name === (await defaultBranch(dir))) throw new HttpError(400, 'Cannot delete the default branch');
  await git.deleteRef({ ...G(dir), ref: `refs/heads/${name}` });
}

export async function setDefaultBranch(dir, name) {
  await resolve(dir, name);
  await git.writeRef({ ...G(dir), ref: 'HEAD', value: `refs/heads/${checkRef(name)}`, symbolic: true, force: true });
}

/* ---------------------------------------------------------- compare/merge */
async function checkMerge(dir, baseBranch, headBranch, user) {
  try {
    const r = await git.merge({
      ...G(dir), ours: baseBranch, theirs: headBranch, dryRun: true, noUpdateBranch: true, fastForward: false,
      author: signature(user || { name: 'DevOps' }), abortOnConflict: true,
    });
    return { mergeable: true, alreadyMerged: !!r.alreadyMerged, conflicts: [] };
  } catch (e) {
    if (e.code === 'MergeConflictError' || e.name === 'MergeConflictError') {
      return { mergeable: false, conflicts: e.data?.filepaths || [] };
    }
    if (e.code === 'MergeNotSupportedError') return { mergeable: false, conflicts: ['(unsupported merge)'] };
    throw e;
  }
}

export async function compare(dir, base, head) {
  const baseSha = await resolve(dir, base);
  const headSha = await resolve(dir, head);
  const rd = makeReader(dir);
  const baseAnc = await ancestors(rd, baseSha);
  const headLog = await walkLog(rd, [headSha], { max: 250, include: async (c) => !baseAnc.has(c.oid) });
  const commits = headLog.map(toLogEntry);
  const [mergeBase] = await git.findMergeBase({ ...G(dir), oids: [baseSha, headSha] });
  const mbTree = mergeBase ? (await rd.commit(mergeBase)).commit.tree : null;
  const diff = await treeDiff(dir, rd, mbTree, (await rd.commit(headSha)).commit.tree);
  // merge checks need branch refs; fall back to shas for historical compares
  const m = await checkMerge(dir, base, head).catch(() => ({ mergeable: true, conflicts: [] }));
  return { baseSha, headSha, commits, ...diff, mergeable: m.mergeable, conflicts: m.conflicts };
}

export async function merge(dir, { base, head, message, squash, user }) {
  const baseSha = await resolve(dir, base);
  const headSha = await resolve(dir, head);
  const check = await checkMerge(dir, base, head, user);
  if (!check.mergeable) throw new HttpError(409, `Merge conflicts in: ${check.conflicts.join(', ')}`);
  const sig = signature(user);
  const r = await git.merge({
    ...G(dir), ours: base, theirs: head, noUpdateBranch: true, fastForward: false, message: `${message}\n`, author: sig, committer: sig,
  });
  if (r.alreadyMerged) throw new HttpError(400, `${head} is already merged into ${base}`);
  let oid = r.oid;
  const rd = makeReader(dir);
  if (squash) {
    const tree = (await rd.commit(oid)).commit.tree;
    oid = await git.writeCommit({ ...G(dir), commit: { message: `${message}\n`, tree, parent: [baseSha], author: sig, committer: sig } });
  }
  if ((await headRef(dir, base)) !== baseSha) throw new HttpError(409, `${base} changed during the merge. Try again.`);
  await git.writeRef({ ...G(dir), ref: `refs/heads/${base}`, value: oid, force: true });
  void headSha;
  return { sha: oid };
}

/* --------------------------------------------------------------- extras */
export async function grepCommits(dir, key, limit = 20) {
  const re = new RegExp(`(^|[^A-Za-z0-9])${key}([^0-9]|$)`, 'i');
  const rd = makeReader(dir);
  const heads = [];
  for (const b of await git.listBranches({ ...G(dir) })) heads.push(await git.resolveRef({ ...G(dir), ref: `refs/heads/${b}` }));
  const found = await walkLog(rd, heads, { max: limit, include: async (c) => re.test(c.commit.message), scanLimit: 3000 });
  return found.map((c) => ({ sha: c.oid, author: c.commit.author.name, date: isoDate(c.commit.author), subject: splitMessage(c.commit.message).subject }));
}

export async function archive(dir, ref) {
  const oid = await resolve(dir, ref);
  const rd = makeReader(dir);
  const flat = await rd.flatten((await rd.commit(oid)).commit.tree);
  const files = {};
  for (const [p, info] of flat) {
    if (info.type !== 'blob') continue;
    files[p] = (await git.readBlob({ ...G(dir), oid: info.oid })).blob;
  }
  return zipSync(files, { level: 6 });
}

export async function flatTree(dir, ref) {
  const oid = await resolve(dir, ref);
  const rd = makeReader(dir);
  const flat = await rd.flatten((await rd.commit(oid)).commit.tree);
  const out = {};
  for (const [p, info] of flat) if (info.type === 'blob') out[p] = info.oid;
  return out;
}
