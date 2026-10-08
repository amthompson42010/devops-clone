/** Deployment history + saved targets per project (shared by server and browser builds). */
import { Router } from 'express';
import { getJson, updateJson } from '../blob.js';
import { HttpError, requireProject, newId, now } from '../store.js';

const r = Router({ mergeParams: true });
const blobName = (key) => `projects/${key}/deployments.json`;
const empty = { items: [], targets: {} };

r.get('/', async (req, res) => {
  const project = await requireProject(req.params.key);
  const { data } = await getJson(blobName(project.key), empty);
  const items = req.query.repo ? data.items.filter((d) => d.repo === req.query.repo) : data.items;
  res.json({ items: [...items].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 200), targets: data.targets || {} });
});

/** Record a new deployment (status "running"). */
r.post('/', async (req, res) => {
  const project = await requireProject(req.params.key);
  const b = req.body || {};
  if (!b.repo || !b.site?.id) throw new HttpError(400, 'repo and site are required');
  const { result } = await updateJson(blobName(project.key), empty, (data) => {
    const d = {
      id: newId(), repo: b.repo, ref: b.ref, sha: b.sha || null, method: b.method || 'unknown',
      site: { id: b.site.id, name: b.site.name, host: b.site.host || null },
      subscription: b.subscription || null, resourceGroup: b.resourceGroup || null,
      startedBy: req.user.name, startedAt: now(), status: 'running', log: [],
    };
    data.items.push(d);
    data.targets ||= {};
    data.targets[b.repo] = { site: d.site, subscription: d.subscription, resourceGroup: d.resourceGroup, tenantId: b.tenantId || null, storage: b.storage || null, build: !!b.build };
    if (data.items.length > 500) data.items.splice(0, data.items.length - 500);
    return d;
  });
  res.status(201).json(result);
});

/** Update status / append log lines. */
r.patch('/:id', async (req, res) => {
  const project = await requireProject(req.params.key);
  const { result } = await updateJson(blobName(project.key), empty, (data) => {
    const d = data.items.find((x) => x.id === req.params.id);
    if (!d) throw new HttpError(404, 'Deployment not found');
    if (req.body.status) d.status = req.body.status;
    if (Array.isArray(req.body.log)) d.log.push(...req.body.log.map((l) => ({ at: now(), text: String(l).slice(0, 2000) })));
    if (d.log.length > 400) d.log.splice(0, d.log.length - 400);
    if (req.body.status && req.body.status !== 'running') d.finishedAt = now();
    if (req.body.url) d.url = req.body.url;
    return d;
  });
  res.json(result);
});

export default r;
