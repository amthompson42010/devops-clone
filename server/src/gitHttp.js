/**
 * Git smart-HTTP endpoint: http://host/git/{PROJECT}/{repo}.git
 * Delegates to `git http-backend` (ships with every git install, including Git for Windows)
 * against the local cache, then syncs pushed data to Azure Blob Storage.
 */
import { spawn } from 'node:child_process';
import { CACHE_DIR, withRepo } from './gitStore.js';
import { getProject } from './store.js';

function checkAuth(req, res) {
  const user = process.env.GIT_HTTP_USER;
  const pass = process.env.GIT_HTTP_PASSWORD;
  if (!user) return true;
  const header = req.headers.authorization || '';
  const [scheme, value] = header.split(' ');
  if (scheme === 'Basic' && value) {
    const [u, ...p] = Buffer.from(value, 'base64').toString().split(':');
    if (u === user && p.join(':') === pass) return true;
  }
  res.set('WWW-Authenticate', 'Basic realm="DevOps Git"').status(401).end('Authentication required');
  return false;
}

export function gitHttpHandler() {
  return async (req, res) => {
    // /git/:project/:repo.git/<rest>
    const m = req.path.match(/^\/([^/]+)\/([^/]+?)(?:\.git)?(\/.*)$/);
    if (!m) return res.status(404).end('Not found');
    const key = m[1].toUpperCase();
    const repo = m[2];
    const rest = m[3];
    if (!checkAuth(req, res)) return;

    const project = await getProject(key).catch(() => null);
    if (!project) return res.status(404).end('Project not found');

    const service = req.query.service || (rest.endsWith('git-receive-pack') ? 'git-receive-pack' : 'git-upload-pack');
    const isWrite = service === 'git-receive-pack' && req.method === 'POST';

    try {
      await withRepo(key, repo, (dir) => runBackend(req, res, key, repo, rest), { write: isWrite });
    } catch (err) {
      console.error('[git-http]', err.message);
      if (!res.headersSent) res.status(err.status || 500).end(err.message);
      else res.end();
    }
  };
}

function runBackend(req, res, key, repo, rest) {
  return new Promise((resolve, reject) => {
    const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?') + 1) : '';
    const env = {
      ...process.env,
      GIT_PROJECT_ROOT: CACHE_DIR,
      GIT_HTTP_EXPORT_ALL: '1',
      PATH_INFO: `/${key}/${repo}.git${rest}`,
      REQUEST_METHOD: req.method,
      QUERY_STRING: qs,
      CONTENT_TYPE: req.headers['content-type'] || '',
      REMOTE_USER: req.headers['x-user-name'] || 'git',
      REMOTE_ADDR: req.socket.remoteAddress || '127.0.0.1',
      GIT_HTTP_MAX_REQUEST_BUFFER: '100M',
    };
    if (req.headers['content-encoding']) env.HTTP_CONTENT_ENCODING = req.headers['content-encoding'];
    if (req.headers['git-protocol']) env.GIT_PROTOCOL = req.headers['git-protocol'];
    if (req.headers['content-length']) env.CONTENT_LENGTH = req.headers['content-length'];

    const child = spawn('git', ['http-backend'], { env, windowsHide: true });
    let headerBuf = Buffer.alloc(0);
    let headersDone = false;
    const stderr = [];

    child.stderr.on('data', (d) => stderr.push(d));
    child.on('error', reject);

    child.stdout.on('data', (chunk) => {
      if (headersDone) { res.write(chunk); return; }
      headerBuf = Buffer.concat([headerBuf, chunk]);
      let idx = headerBuf.indexOf('\r\n\r\n');
      let sepLen = 4;
      if (idx === -1) { idx = headerBuf.indexOf('\n\n'); sepLen = 2; }
      if (idx === -1) return;
      const head = headerBuf.slice(0, idx).toString('utf8');
      const body = headerBuf.slice(idx + sepLen);
      headersDone = true;
      let status = 200;
      for (const line of head.split(/\r?\n/)) {
        const c = line.indexOf(':');
        if (c === -1) continue;
        const name = line.slice(0, c).trim();
        const value = line.slice(c + 1).trim();
        if (name.toLowerCase() === 'status') status = parseInt(value, 10) || 200;
        else res.setHeader(name, value);
      }
      res.status(status);
      if (body.length) res.write(body);
    });

    child.on('close', (code) => {
      if (code !== 0 && !headersDone) {
        const msg = Buffer.concat(stderr).toString();
        res.status(500).end(msg);
        return reject(new Error(`git http-backend exited ${code}: ${msg}`));
      }
      // Response is ended by caller after sync so a push only "succeeds" once data is in blob storage.
      resolve();
    });

    req.pipe(child.stdin);
  });
}

/** Express middleware wrapper that ends the response after the handler (and blob sync) completes. */
export function gitRouter() {
  const handler = gitHttpHandler();
  return async (req, res) => {
    await handler(req, res);
    if (!res.writableEnded) res.end();
  };
}
