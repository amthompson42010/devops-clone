/**
 * Real git repositories whose source of truth is Azure Blob Storage.
 *
 * Each bare repository is mirrored file-by-file into the repo container:
 *   {PROJECT}/{repo}.git/<path inside bare repo>
 *   {PROJECT}/{repo}.git.manifest.json   -> { version, files: { rel: { size, md5 } } }
 *
 * The server keeps a local working cache of the bare repo (GIT_CACHE_DIR) so the
 * real `git` binary can serve clone/fetch/push. Before every operation the cache
 * is reconciled with the manifest (hydrate); after every write the changed files
 * are uploaded and the manifest version bumped (sync).
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  repoContainer, getJson, putJson, pool, downloadToFile, uploadFile, deletePrefix, deleteBlob,
} from './blob.js';

export const CACHE_DIR = path.resolve(process.env.GIT_CACHE_DIR || '.git-cache');

export const repoDir = (key, repo) => path.join(CACHE_DIR, key, `${repo}.git`);
const statePath = (key, repo) => path.join(CACHE_DIR, key, `${repo}.state.json`);
const blobPrefix = (key, repo) => `${key}/${repo}.git/`;
const manifestName = (key, repo) => `${key}/${repo}.git.manifest.json`;

const EXCLUDE = [/^hooks\//, /\.lock$/, /^gc\.log$/];

/* ------------------------------------------------------------------ locks */
const locks = new Map();
export function withLock(id, fn) {
  const prev = locks.get(id) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  const tail = next.catch(() => {});
  locks.set(id, tail);
  tail.then(() => { if (locks.get(id) === tail) locks.delete(id); });
  return next;
}

/* -------------------------------------------------------------------- git */
export function git(gitDir, args, { input, env, allowExit = [] } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', gitDir ? ['--git-dir', gitDir, ...args] : args, {
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...env },
      windowsHide: true,
    });
    const out = [];
    const err = [];
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));
    child.on('error', reject);
    child.on('close', (code) => {
      const stdout = Buffer.concat(out);
      if (code === 0 || allowExit.includes(code)) resolve({ code, stdout, text: stdout.toString('utf8') });
      else {
        const e = new Error(`git ${args.join(' ')} failed (${code}): ${Buffer.concat(err).toString().trim()}`);
        e.code = code;
        e.stderr = Buffer.concat(err).toString();
        reject(e);
      }
    });
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

/* ------------------------------------------------------------------ files */
async function walk(dir, base = dir, out = []) {
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, base, out);
    else if (e.isFile()) {
      const rel = path.relative(base, full).split(path.sep).join('/');
      if (!EXCLUDE.some((r) => r.test(rel))) out.push(rel);
    }
  }
  return out;
}

const md5File = (file) => new Promise((resolve, reject) => {
  const h = crypto.createHash('md5');
  fs.createReadStream(file).on('error', reject).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex')));
});

async function forceUnlink(file) {
  try { await fsp.chmod(file, 0o666); } catch { /* ignore */ }
  await fsp.rm(file, { force: true });
}

async function readState(key, repo) {
  try { return JSON.parse(await fsp.readFile(statePath(key, repo), 'utf8')); } catch { return { version: -1, files: {} }; }
}
async function writeState(key, repo, state) {
  await fsp.mkdir(path.dirname(statePath(key, repo)), { recursive: true });
  await fsp.writeFile(statePath(key, repo), JSON.stringify(state));
}

async function ensureSkeleton(dir) {
  for (const d of ['objects/info', 'objects/pack', 'refs/heads', 'refs/tags']) {
    await fsp.mkdir(path.join(dir, d), { recursive: true });
  }
}

/* ----------------------------------------------------------- hydrate/sync */
export async function repoExists(key, repo) {
  const { data } = await getJson(manifestName(key, repo), null, repoContainer);
  return !!data;
}

/** Make the local cache match blob storage. Must be called inside the repo lock. */
export async function hydrate(key, repo) {
  const { data: manifest } = await getJson(manifestName(key, repo), null, repoContainer);
  if (!manifest) {
    const e = new Error(`Repository ${key}/${repo} not found`);
    e.status = 404;
    throw e;
  }
  const dir = repoDir(key, repo);
  const state = await readState(key, repo);
  if (state.version === manifest.version && fs.existsSync(path.join(dir, 'HEAD'))) return dir;

  await fsp.mkdir(dir, { recursive: true });
  const prefix = blobPrefix(key, repo);
  const wanted = Object.entries(manifest.files);
  const newState = { version: manifest.version, files: {} };

  await pool(wanted, 8, async ([rel, info]) => {
    const file = path.join(dir, ...rel.split('/'));
    const local = state.files[rel];
    let have = false;
    if (local && local.md5 === info.md5 && fs.existsSync(file)) {
      const st = await fsp.stat(file);
      have = st.size === local.size && st.mtimeMs === local.mtimeMs;
    }
    if (!have) {
      await fsp.mkdir(path.dirname(file), { recursive: true });
      if (fs.existsSync(file)) await forceUnlink(file);
      await downloadToFile(prefix + rel, file, repoContainer);
    }
    const st = await fsp.stat(file);
    newState.files[rel] = { size: st.size, mtimeMs: st.mtimeMs, md5: info.md5 };
  });

  for (const rel of await walk(dir)) {
    if (!manifest.files[rel]) await forceUnlink(path.join(dir, ...rel.split('/')));
  }
  await ensureSkeleton(dir);
  await writeState(key, repo, newState);
  return dir;
}

/** Upload local changes to blob storage. Must be called inside the repo lock. */
export async function sync(key, repo) {
  const dir = repoDir(key, repo);
  const name = manifestName(key, repo);
  const { data: manifest, etag } = await getJson(name, { version: 0, files: {} }, repoContainer);
  const state = await readState(key, repo);
  const prefix = blobPrefix(key, repo);
  const rels = await walk(dir);
  const files = {};
  const newState = { version: manifest.version + 1, files: {} };

  await pool(rels, 8, async (rel) => {
    const file = path.join(dir, ...rel.split('/'));
    const st = await fsp.stat(file);
    const prev = state.files[rel];
    const md5 = prev && prev.size === st.size && prev.mtimeMs === st.mtimeMs ? prev.md5 : await md5File(file);
    if (!manifest.files[rel] || manifest.files[rel].md5 !== md5) await uploadFile(prefix + rel, file, repoContainer);
    files[rel] = { size: st.size, md5 };
    newState.files[rel] = { size: st.size, mtimeMs: st.mtimeMs, md5 };
  });

  // Write the manifest before deleting stale blobs so readers never see a manifest
  // that references files which no longer exist.
  await putJson(name, { version: newState.version, updatedAt: new Date().toISOString(), files }, etag, repoContainer);
  const stale = Object.keys(manifest.files).filter((rel) => !files[rel]);
  await pool(stale, 8, (rel) => deleteBlob(prefix + rel, repoContainer));
  await writeState(key, repo, newState);
}

/** Run fn(gitDir) against an up-to-date local copy; if write=true, sync afterwards. */
export function withRepo(key, repo, fn, { write = false } = {}) {
  return withLock(`${key}/${repo}`, async () => {
    const dir = await hydrate(key, repo);
    try {
      return await fn(dir);
    } finally {
      if (write) await sync(key, repo);
    }
  });
}

export async function createRepo(key, repo, defaultBranch = 'main') {
  return withLock(`${key}/${repo}`, async () => {
    if (await repoExists(key, repo)) {
      const e = new Error('A repository with that name already exists');
      e.status = 409;
      throw e;
    }
    const dir = repoDir(key, repo);
    await fsp.rm(dir, { recursive: true, force: true });
    await fsp.rm(statePath(key, repo), { force: true });
    await fsp.mkdir(path.dirname(dir), { recursive: true });
    await git(null, ['init', '--bare', `--initial-branch=${defaultBranch}`, dir]);
    await git(dir, ['config', 'http.receivepack', 'true']);
    await git(dir, ['config', 'receive.denyDeleteCurrent', 'warn']);
    await git(dir, ['config', 'core.logAllRefUpdates', 'true']);
    await fsp.rm(path.join(dir, 'hooks'), { recursive: true, force: true });
    await sync(key, repo);
    return dir;
  });
}

export async function deleteRepo(key, repo) {
  return withLock(`${key}/${repo}`, async () => {
    await deletePrefix(blobPrefix(key, repo), repoContainer);
    await deleteBlob(manifestName(key, repo), repoContainer);
    await fsp.rm(repoDir(key, repo), { recursive: true, force: true });
    await fsp.rm(statePath(key, repo), { force: true });
  });
}
