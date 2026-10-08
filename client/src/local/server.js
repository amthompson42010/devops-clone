/**
 * In-browser "server": runs the shared Express route modules from server/src/routes
 * against IndexedDB (data) and isomorphic-git on LightningFS (repos).
 * Used for the GitHub Pages / static build (VITE_BACKEND=browser).
 */
import './polyfills.js';
import LightningFS from '@isomorphic-git/lightning-fs';
import { setFs, flush } from './gitfs.js';
import { createApp } from './express.js';
import projects from '../../../server/src/routes/projects.js';
import repos from '../../../server/src/routes/repos.js';
import boards from '../../../server/src/routes/boards.js';
import wiki from '../../../server/src/routes/wiki.js';
import { touchUser } from '../../../server/src/store.js';

export const GIT_FS_NAME = 'devops-clone-git';
setFs(new LightningFS(GIT_FS_NAME));
try { navigator.storage?.persist?.(); } catch { /* best effort */ }

const app = createApp();
app.use('/api/projects/:key/repos', repos);
app.use('/api/projects/:key/board', boards);
app.use('/api/projects/:key/wiki', wiki);
app.use('/api', projects);

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(n) { this.statusCode = n; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    end() { return this; },
    set(k, v) { this.headers[String(k).toLowerCase()] = v; return this; },
    attachment(name) { this.headers['content-disposition'] = `attachment; filename="${name}"`; return this; },
  };
}

/** Handle one API request. Returns { status, body, headers }. */
export async function handle({ method, url, body, user }) {
  const u = new URL(url, 'http://local');
  const req = {
    method,
    path: u.pathname,
    originalUrl: url,
    query: Object.fromEntries(u.searchParams),
    body: body ?? {},
    user,
    params: {},
    protocol: 'browser',
    get: () => 'local',
  };
  const res = makeRes();
  try {
    if (method !== 'GET') touchUser(user).catch(() => {});
    const found = await app.handle(req, res);
    if (method !== 'GET') await flush();
    if (!found) return { status: 404, body: { error: 'Not found' }, headers: {} };
  } catch (err) {
    const status = err.status || (err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500);
    if (status >= 500) console.error(err);
    return { status, body: { error: err.message || 'Error' }, headers: {} };
  }
  return { status: res.statusCode, body: res.body, headers: res.headers };
}

export { exportAll, importAll, resetAll } from './backup.js';
