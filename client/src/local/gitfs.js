/** The filesystem isomorphic-git uses. Set once at startup (LightningFS in the browser, node:fs in tests). */
export let fs = null;
export const cache = {};
export function setFs(f) { fs = f; }

export async function exists(path) {
  try { await fs.promises.stat(path); return true; } catch { return false; }
}

export async function rmrf(path) {
  let st;
  try { st = await fs.promises.stat(path); } catch { return; }
  if (st.isDirectory()) {
    for (const name of await fs.promises.readdir(path)) await rmrf(`${path}/${name}`);
    await fs.promises.rmdir(path);
  } else {
    await fs.promises.unlink(path);
  }
}

export async function mkdirp(path) {
  const parts = path.split('/').filter(Boolean);
  let cur = '';
  for (const p of parts) {
    cur += `/${p}`;
    try { await fs.promises.mkdir(cur); } catch (e) { if (e.code !== 'EEXIST' && !(await exists(cur))) throw e; }
  }
}

/** List every file under a directory (absolute paths). */
export async function walkFiles(path, out = []) {
  let names;
  try { names = await fs.promises.readdir(path); } catch { return out; }
  for (const name of names) {
    const full = `${path === '/' ? '' : path}/${name}`;
    const st = await fs.promises.stat(full);
    if (st.isDirectory()) await walkFiles(full, out);
    else out.push(full);
  }
  return out;
}

/** LightningFS saves its directory index lazily; force it to IndexedDB after writes. */
export async function flush() {
  if (fs?.promises?.flush) await fs.promises.flush();
}
