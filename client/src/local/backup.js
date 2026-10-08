/** Export / import / reset everything stored in this browser. */
import { entries, clear, set } from 'idb-keyval';
import { kvStore } from './blob.js';
import { fs, walkFiles, rmrf, mkdirp, flush } from './gitfs.js';

function toB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export async function exportAll() {
  const kv = Object.fromEntries(await entries(kvStore));
  const files = {};
  for (const path of await walkFiles('/repos')) files[path] = toB64(await fs.promises.readFile(path));
  return { app: 'devops-clone', version: 1, exportedAt: new Date().toISOString(), kv, files };
}

export async function importAll(data) {
  if (data?.app !== 'devops-clone' || !data.kv || !data.files) throw new Error('This is not a DevOps backup file.');
  await resetAll();
  for (const [k, v] of Object.entries(data.kv)) await set(k, v, kvStore);
  for (const [path, b64] of Object.entries(data.files)) {
    await mkdirp(path.slice(0, path.lastIndexOf('/')));
    await fs.promises.writeFile(path, fromB64(b64));
  }
  await flush();
}

export async function resetAll() {
  await clear(kvStore);
  await rmrf('/repos');
  await flush();
}

export async function usage() {
  try { return await navigator.storage.estimate(); } catch { return null; }
}
