/** Browser implementation of server/src/gitStore.js: bare repos live in a LightningFS (IndexedDB) filesystem. */
import git from 'isomorphic-git';
import { fs, exists, mkdirp, rmrf } from './gitfs.js';

export const repoDir = (key, repo) => `/repos/${key}/${repo}.git`;

const locks = new Map();
export function withLock(id, fn) {
  const prev = locks.get(id) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  const tail = next.catch(() => {});
  locks.set(id, tail);
  tail.then(() => { if (locks.get(id) === tail) locks.delete(id); });
  return next;
}

export async function repoExists(key, repo) {
  return exists(`${repoDir(key, repo)}/HEAD`);
}

export function withRepo(key, repo, fn) {
  return withLock(`${key}/${repo}`, async () => {
    if (!(await repoExists(key, repo))) {
      const e = new Error(`Repository ${key}/${repo} not found`);
      e.status = 404;
      throw e;
    }
    return fn(repoDir(key, repo));
  });
}

export function createRepo(key, repo, defaultBranch = 'main') {
  return withLock(`${key}/${repo}`, async () => {
    if (await repoExists(key, repo)) {
      const e = new Error('A repository with that name already exists');
      e.status = 409;
      throw e;
    }
    const gitdir = repoDir(key, repo);
    await mkdirp(gitdir);
    await git.init({ fs, gitdir, bare: true, defaultBranch });
    return gitdir;
  });
}

export function deleteRepo(key, repo) {
  return withLock(`${key}/${repo}`, () => rmrf(repoDir(key, repo)));
}
