/**
 * Server-only deployment relay (not part of the GitHub Pages build).
 *
 * Browsers can't call an App Service's Kudu/SCM endpoint directly (no CORS), so the web UI
 * hands the server the user's Azure access token and the target SCM host; the server builds a
 * zip of the requested ref with `git archive` and pushes it to Kudu's zipdeploy API, then
 * polls until the deployment finishes. Tokens are only held in memory for the job's duration.
 */
import { Router } from 'express';
import crypto from 'node:crypto';
import { HttpError, requireProject } from '../store.js';
import { getJson } from '../blob.js';
import { reposBlob } from '../store.js';
import { withRepo } from '../gitStore.js';
import * as ops from '../gitOps.js';

const r = Router();
const jobs = new Map();
const SCM_HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.scm\.([a-z0-9-]+\.)*(azurewebsites\.net|appserviceenvironment\.net|azurewebsites\.us|chinacloudsites\.cn)$/i;

function baseUrl(scmHost) {
  const h = String(scmHost || '').trim().toLowerCase();
  if (process.env.RELAY_ALLOW_INSECURE_HOSTS === '1' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(h)) return h;
  if (!SCM_HOST.test(h)) throw new HttpError(400, `Not an App Service deployment host: ${scmHost}`);
  return `https://${h}`;
}

const STATUS = { 0: 'Pending', 1: 'Building', 2: 'Deploying', 3: 'Failed', 4: 'Success' };

async function run(job, { key, repo, ref, token, base }) {
  const log = (t) => { job.log.push({ at: new Date().toISOString(), text: t }); };
  const auth = { Authorization: `Bearer ${token}` };
  try {
    log(`Packaging ${repo}@${ref}…`);
    const zip = await withRepo(key, repo, (dir) => ops.archive(dir, ref));
    job.sha = await withRepo(key, repo, (dir) => ops.resolve(dir, ref));
    log(`Package ready (${(zip.length / 1024).toFixed(1)} KB, commit ${job.sha.slice(0, 8)}). Uploading to ${base.replace(/^https?:\/\//, '')}…`);

    const res = await fetch(`${base}/api/zipdeploy?isAsync=true&deployer=DevOpsClone&message=${encodeURIComponent(`${repo}@${ref}`)}`, {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/zip' }, body: zip,
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Azure rejected the upload (${res.status}). Your account needs Contributor (or Website Contributor) on the app.`);
    }
    if (![200, 202].includes(res.status)) throw new Error(`Upload failed: ${res.status} ${(await res.text()).slice(0, 400)}`);
    log('Upload accepted. Waiting for App Service to build and deploy…');

    const pollUrl = res.headers.get('location') || `${base}/api/deployments/latest`;
    const started = Date.now();
    let last = '';
    while (Date.now() - started < 30 * 60 * 1000) {
      await new Promise((r2) => setTimeout(r2, Number(process.env.RELAY_POLL_MS || 4000)));
      const p = await fetch(pollUrl, { headers: auth });
      if (p.status === 202 || p.status === 404) continue;
      if (!p.ok) { log(`Status check returned ${p.status}; retrying…`); continue; }
      const d = await p.json();
      const line = `${STATUS[d.status] ?? d.status}${d.status_text ? ` – ${d.status_text}` : ''}${d.progress ? ` (${d.progress})` : ''}`;
      if (line !== last) { log(line); last = line; }
      if (d.complete || d.status === 3 || d.status === 4) {
        if (d.status === 4) { job.status = 'succeeded'; log('Deployment succeeded.'); }
        else {
          job.status = 'failed';
          if (d.log_url) {
            try {
              const l = await (await fetch(d.log_url, { headers: auth })).json();
              for (const e of l.slice(-8)) log(`  ${e.message}`);
            } catch { /* best effort */ }
          }
          log('Deployment failed.');
        }
        return;
      }
    }
    job.status = 'unknown';
    log('Timed out waiting for the deployment to finish. Check Deployment Center in the Azure portal.');
  } catch (err) {
    job.status = 'failed';
    log(`Error: ${err.message}`);
  } finally {
    job.done = true;
    job.finishedAt = new Date().toISOString();
    setTimeout(() => jobs.delete(job.id), 60 * 60 * 1000);
  }
}

r.get('/info', (req, res) => res.json({ relay: true }));

r.post('/deploy', async (req, res) => {
  const { key, repo, ref, scmHost, token } = req.body || {};
  if (!token) throw new HttpError(400, 'Missing Azure access token');
  const project = await requireProject(key);
  const { data: repos } = await getJson(reposBlob(project.key), []);
  if (!repos.some((x) => x.name === repo)) throw new HttpError(404, 'Repository not found');
  const base = baseUrl(scmHost);
  const job = { id: crypto.randomUUID(), status: 'running', done: false, log: [], startedAt: new Date().toISOString() };
  jobs.set(job.id, job);
  run(job, { key: project.key, repo, ref: ref || 'main', token, base });
  res.status(202).json({ id: job.id });
});

r.get('/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) throw new HttpError(404, 'Job not found (it may have expired)');
  const since = Number(req.query.since || 0);
  res.json({ ...job, log: job.log.slice(since), total: job.log.length });
});

export default r;
