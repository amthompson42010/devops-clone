import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load .env from the repo root first, then server/ (server/.env wins)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });
process.env.GIT_CACHE_DIR = path.resolve(__dirname, '../..', process.env.GIT_CACHE_DIR || '.git-cache');
process.env.LOCAL_STORAGE_DIR = path.resolve(__dirname, '../..', process.env.LOCAL_STORAGE_DIR || '.data');

const { initStorage } = await import('./blob.js');
const { gitRouter } = await import('./gitHttp.js');
const { touchUser } = await import('./store.js');
const projects = (await import('./routes/projects.js')).default;
const repos = (await import('./routes/repos.js')).default;
const boards = (await import('./routes/boards.js')).default;
const wiki = (await import('./routes/wiki.js')).default;

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');

// Git smart HTTP must see the raw request body, so mount it before any body parsers.
app.use('/git', gitRouter());

app.use(express.json({ limit: '25mb' }));

app.use('/api', (req, res, next) => {
  const decode = (v) => { try { return decodeURIComponent(v || ''); } catch { return v || ''; } };
  const name = decode(req.get('x-user-name')).trim().slice(0, 80) || 'Anonymous';
  const email = decode(req.get('x-user-email')).trim().slice(0, 120);
  req.user = { name, email };
  if (req.method !== 'GET') touchUser(req.user).catch(() => {});
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api', projects);
app.use('/api/projects/:key/repos', repos);
app.use('/api/projects/:key/board', boards);
app.use('/api/projects/:key/wiki', wiki);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Serve the built client in production
const dist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('/{*splat}', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || (err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Server error' });
});

const port = Number(process.env.PORT || 4000);
let mode;
try {
  mode = await initStorage();
} catch (err) {
  console.error(`\n✖ Could not initialise storage: ${err.message}\n`);
  process.exit(1);
}
app.listen(port, () => {
  console.log(`DevOps server listening on http://localhost:${port}`);
  console.log(`Storage: ${mode}`);
});
