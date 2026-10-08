/**
 * Browser implementation of server/src/blob.js backed by IndexedDB.
 * Same exports and semantics (ETags + conditional writes), so the server route code runs unchanged.
 */
import { createStore, get, set, del, keys } from 'idb-keyval';

export const kvStore = createStore('devops-clone', 'kv');
export const dataContainer = { name: 'data' };
export const repoContainer = { name: 'repos' };

const locks = new Map();
function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  const tail = next.catch(() => {});
  locks.set(key, tail);
  tail.then(() => { if (locks.get(key) === tail) locks.delete(key); });
  return next;
}

const clone = (v) => (v === undefined || v === null ? v : JSON.parse(JSON.stringify(v)));
const newEtag = () => `"${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}"`;
function storageError(statusCode, message) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}

export function isStatus(err, ...codes) {
  return err && codes.includes(err.statusCode);
}

export async function getJson(name, fallback = null) {
  const rec = await get(name, kvStore);
  if (!rec) return { data: clone(fallback), etag: null };
  return { data: rec.data, etag: rec.etag };
}

export function putJson(name, data, etag = '*') {
  return withLock(name, async () => {
    if (etag !== '*') {
      const cur = await get(name, kvStore);
      if (etag === null && cur) throw storageError(409, 'Blob already exists');
      if (etag && (!cur || cur.etag !== etag)) throw storageError(412, 'Condition not met');
    }
    const tag = newEtag();
    await set(name, { etag: tag, data: clone(data), updatedAt: Date.now() }, kvStore);
    return tag;
  });
}

export async function updateJson(name, fallback, mutator) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const { data, etag } = await getJson(name, fallback);
    const result = await mutator(data);
    try {
      await putJson(name, data, etag);
      return { data, result };
    } catch (err) {
      if (isStatus(err, 409, 412)) { await new Promise((r) => setTimeout(r, 10 + Math.random() * 40)); continue; }
      throw err;
    }
  }
  throw new Error(`Too much contention updating ${name}`);
}

export async function deleteBlob(name) {
  await withLock(name, () => del(name, kvStore));
}

export async function listNames(prefix) {
  return (await keys(kvStore)).filter((k) => typeof k === 'string' && k.startsWith(prefix)).sort();
}

export async function deletePrefix(prefix) {
  const names = await listNames(prefix);
  for (const n of names) await deleteBlob(n);
  return names.length;
}

export async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function initStorage() { return 'browser (IndexedDB)'; }
