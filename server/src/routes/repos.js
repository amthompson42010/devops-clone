import { Router } from 'express';
import path from 'node:path';
import { getJson, updateJson, deleteBlob } from '../blob.js';
import { HttpError, requireProject, reposBlob, pullsBlob, now } from '../store.js';
import { createRepo, deleteRepo, withRepo } from '../gitStore.js';
import * as ops from '../gitOps.js';

const r = Router({ mergeParams: true });

const publicUrl = (req) => (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
const cloneUrl = (req, key, repo) => `${publicUrl(req)}/git/${key}/${encodeURIComponent(repo)}.git`;

async function requireRepo(req) {
  const project = await requireProject(req.params.key);
  const { data: repos } = await getJson(reposBlob(project.key), []);
  const repo = repos.find((x) => x.name.toLowerCase() === String(req.params.repo).toLowerCase());
  if (!repo) throw new HttpError(404, `Repository ${req.params.repo} not found`);
  return { key: project.key, repo, project };
}

const READ = (req, fn) => requireRepo(req).then(({ key, repo }) => withRepo(key, repo.name, fn));
const WRITE = (req, fn) => requireRepo(req).then(({ key, repo }) => withRepo(key, repo.name, fn, { write: true }));

const GITIGNORES = {
  Node: 'node_modules/\ndist/\n.env\nnpm-debug.log*\n',
  Python: '__pycache__/\n*.py[cod]\n.venv/\nvenv/\n.env\ndist/\nbuild/\n*.egg-info/\n',
  VisualStudio: 'bin/\nobj/\n.vs/\n*.user\n*.suo\npackages/\nTestResults/\n',
  Java: 'target/\n*.class\n.gradle/\nbuild/\n.idea/\n',
};

/* ---------------------------------------------------------------- repos */
r.get('/', async (req, res) => {
  const project = await requireProject(req.params.key);
  const { data: repos } = await getJson(reposBlob(project.key), []);
  res.json(repos.map((x) => ({ ...x, cloneUrl: cloneUrl(req, project.key, x.name) })));
});

r.post('/', async (req, res) => {
  const project = await requireProject(req.params.key);
  const name = String(req.body.name || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name) || name.toLowerCase().endsWith('.git')) {
    throw new HttpError(400, 'Repository names may contain letters, digits, ".", "_" and "-"');
  }
  const { data: existing } = await getJson(reposBlob(project.key), []);
  if (existing.some((x) => x.name.toLowerCase() === name.toLowerCase())) throw new HttpError(409, 'Repository already exists');

  await createRepo(project.key, name, 'main');
  await updateJson(reposBlob(project.key), [], (list) => { list.push({ name, createdAt: now(), createdBy: req.user.name }); });

  const changes = [];
  if (req.body.readme) changes.push({ path: 'README.md', content: `# ${name}\n\n${req.body.description || 'Describe your project here.'}\n` });
  if (req.body.gitignore && GITIGNORES[req.body.gitignore]) changes.push({ path: '.gitignore', content: GITIGNORES[req.body.gitignore] });
  if (changes.length) {
    await withRepo(project.key, name, (dir) => ops.commitFiles(dir, { branch: 'main', message: 'Initial commit', changes, user: req.user }), { write: true });
  }
  res.status(201).json({ name, cloneUrl: cloneUrl(req, project.key, name) });
});

r.get('/:repo', async (req, res) => {
  const { key, repo } = await requireRepo(req);
  const info = await withRepo(key, repo.name, async (dir) => {
    const empty = await ops.isEmpty(dir);
    const b = empty ? { defaultBranch: await ops.defaultBranch(dir), branches: [] } : await ops.branches(dir);
    return { empty, ...b };
  });
  res.json({ ...repo, ...info, cloneUrl: cloneUrl(req, key, repo.name) });
});

r.delete('/:repo', async (req, res) => {
  const { key, repo } = await requireRepo(req);
  await deleteRepo(key, repo.name);
  await deleteBlob(pullsBlob(key, repo.name));
  await updateJson(reposBlob(key), [], (list) => {
    const i = list.findIndex((x) => x.name === repo.name);
    if (i >= 0) list.splice(i, 1);
  });
  res.status(204).end();
});

/* ---------------------------------------------------------------- files */
r.get('/:repo/items', async (req, res) => {
  const result = await READ(req, async (dir) => {
    const ref = req.query.ref || (await ops.defaultBranch(dir));
    const p = ops.checkPath(req.query.path);
    const type = await ops.pathType(dir, ref, p);
    if (type === 'blob') return { type, ref, path: p, file: await ops.fileContent(dir, ref, p) };
    const entries = await ops.tree(dir, ref, p);
    const readmeEntry = entries.find((e) => e.type === 'blob' && /^readme(\.md|\.markdown|\.txt)?$/i.test(e.name));
    const readme = readmeEntry ? await ops.fileContent(dir, ref, readmeEntry.path) : null;
    return { type: 'tree', ref, path: p, entries, readme: readme && { ...readme, name: readmeEntry.name } };
  });
  res.json(result);
});

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'text/plain', '.webp': 'image/webp', '.pdf': 'application/pdf', '.ico': 'image/x-icon' };
r.get('/:repo/raw', async (req, res) => {
  const buf = await READ(req, async (dir) => ops.rawFile(dir, req.query.ref || (await ops.defaultBranch(dir)), req.query.path));
  const ext = path.extname(String(req.query.path)).toLowerCase();
  res.set('Content-Type', MIME[ext] || 'application/octet-stream');
  res.set('X-Content-Type-Options', 'nosniff');
  if (req.query.download) res.attachment(path.basename(String(req.query.path)));
  res.send(buf);
});

r.get('/:repo/archive', async (req, res) => {
  let ref;
  const buf = await READ(req, async (dir) => {
    ref = req.query.ref || (await ops.defaultBranch(dir));
    return ops.archive(dir, ref);
  });
  res.set('Content-Type', 'application/zip');
  res.attachment(`${req.params.repo}-${String(ref).replace(/[^\w.-]+/g, '-')}.zip`);
  res.send(buf);
});

/* -------------------------------------------------------------- commits */
r.get('/:repo/commits', async (req, res) => {
  const list = await READ(req, async (dir) => {
    if (await ops.isEmpty(dir)) return [];
    const ref = req.query.ref || (await ops.defaultBranch(dir));
    return ops.log(dir, ref, req.query.path, { skip: req.query.skip, limit: req.query.limit, author: req.query.author });
  });
  res.json(list);
});

r.get('/:repo/commits/:sha', async (req, res) => {
  res.json(await READ(req, (dir) => ops.commit(dir, req.params.sha)));
});

r.post('/:repo/commits', async (req, res) => {
  const { branch, baseSha, message, changes, createBranchFrom } = req.body;
  const out = await WRITE(req, (dir) => ops.commitFiles(dir, { branch, baseSha, message, changes, createBranchFrom, user: req.user }));
  res.status(201).json(out);
});

/* ------------------------------------------------------------- branches */
r.get('/:repo/branches', async (req, res) => {
  res.json(await READ(req, async (dir) => ((await ops.isEmpty(dir)) ? { defaultBranch: await ops.defaultBranch(dir), branches: [] } : ops.branches(dir))));
});
r.post('/:repo/branches', async (req, res) => {
  res.status(201).json(await WRITE(req, (dir) => ops.createBranch(dir, String(req.body.name || '').trim(), req.body.from)));
});
r.delete('/:repo/branches', async (req, res) => {
  await WRITE(req, (dir) => ops.deleteBranch(dir, String(req.query.name)));
  res.status(204).end();
});
r.put('/:repo/default-branch', async (req, res) => {
  await WRITE(req, (dir) => ops.setDefaultBranch(dir, String(req.body.name)));
  res.status(204).end();
});

r.get('/:repo/compare', async (req, res) => {
  res.json(await READ(req, (dir) => ops.compare(dir, String(req.query.base), String(req.query.head))));
});

/* -------------------------------------------------------- pull requests */
const emptyPulls = { next: 1, items: [] };

r.get('/:repo/pulls', async (req, res) => {
  const { key, repo } = await requireRepo(req);
  const { data } = await getJson(pullsBlob(key, repo.name), emptyPulls);
  const status = req.query.status || 'active';
  const items = data.items.filter((p) => status === 'all' || p.status === status).sort((a, b) => b.id - a.id);
  res.json(items.map(({ comments, ...rest }) => ({ ...rest, commentCount: comments.length })));
});

r.post('/:repo/pulls', async (req, res) => {
  const { key, repo } = await requireRepo(req);
  const { title, description = '', source, target } = req.body;
  if (!title?.trim()) throw new HttpError(400, 'Title is required');
  if (source === target) throw new HttpError(400, 'Source and target branches must differ');
  await withRepo(key, repo.name, async (dir) => { await ops.resolve(dir, source); await ops.resolve(dir, target); });
  const { result } = await updateJson(pullsBlob(key, repo.name), emptyPulls, (data) => {
    if (data.items.some((p) => p.status === 'active' && p.source === source && p.target === target)) {
      throw new HttpError(409, 'An active pull request already exists for these branches');
    }
    const pr = {
      id: data.next++, title: title.trim(), description, source, target, status: 'active',
      createdBy: req.user.name, createdAt: now(), updatedAt: now(), reviewers: [], comments: [],
    };
    data.items.push(pr);
    return pr;
  });
  res.status(201).json(result);
});

async function getPull(req) {
  const ctx = await requireRepo(req);
  const { data } = await getJson(pullsBlob(ctx.key, ctx.repo.name), emptyPulls);
  const pr = data.items.find((p) => p.id === Number(req.params.id));
  if (!pr) throw new HttpError(404, 'Pull request not found');
  return { ...ctx, pr };
}

function mutatePull(req, ctx, fn) {
  return updateJson(pullsBlob(ctx.key, ctx.repo.name), emptyPulls, (data) => {
    const pr = data.items.find((p) => p.id === Number(req.params.id));
    if (!pr) throw new HttpError(404, 'Pull request not found');
    const out = fn(pr);
    pr.updatedAt = now();
    return out ?? pr;
  }).then((x) => x.result);
}

r.get('/:repo/pulls/:id', async (req, res) => {
  const { key, repo, pr } = await getPull(req);
  let diff = null;
  try {
    diff = await withRepo(key, repo.name, (dir) => (pr.status === 'completed'
      ? ops.compare(dir, pr.baseShaAtMerge, pr.headShaAtMerge)
      : ops.compare(dir, pr.target, pr.source)));
  } catch (err) {
    diff = { error: err.message, files: [], commits: [] };
  }
  res.json({ ...pr, diff });
});

r.patch('/:repo/pulls/:id', async (req, res) => {
  const ctx = await getPull(req);
  res.json(await mutatePull(req, ctx, (pr) => {
    if (req.body.title !== undefined) pr.title = String(req.body.title);
    if (req.body.description !== undefined) pr.description = String(req.body.description);
  }));
});

r.post('/:repo/pulls/:id/comments', async (req, res) => {
  const ctx = await getPull(req);
  if (!req.body.body?.trim()) throw new HttpError(400, 'Comment is empty');
  res.status(201).json(await mutatePull(req, ctx, (pr) => {
    pr.comments.push({ id: Date.now(), author: req.user.name, body: req.body.body, file: req.body.file || null, line: req.body.line || null, createdAt: now() });
  }));
});

r.post('/:repo/pulls/:id/vote', async (req, res) => {
  const ctx = await getPull(req);
  const vote = ['approved', 'approved-with-suggestions', 'waiting', 'rejected', 'none'].includes(req.body.vote) ? req.body.vote : 'none';
  res.json(await mutatePull(req, ctx, (pr) => {
    pr.reviewers = pr.reviewers.filter((x) => x.name !== req.user.name);
    if (vote !== 'none') pr.reviewers.push({ name: req.user.name, vote, at: now() });
  }));
});

r.post('/:repo/pulls/:id/status', async (req, res) => {
  const ctx = await getPull(req);
  const status = req.body.status;
  if (!['active', 'abandoned'].includes(status)) throw new HttpError(400, 'Invalid status');
  res.json(await mutatePull(req, ctx, (pr) => {
    if (pr.status === 'completed') throw new HttpError(400, 'Pull request is already completed');
    pr.status = status;
  }));
});

r.post('/:repo/pulls/:id/complete', async (req, res) => {
  const ctx = await getPull(req);
  const { pr } = ctx;
  if (pr.status !== 'active') throw new HttpError(400, 'Only active pull requests can be completed');
  const squash = !!req.body.squash;
  const message = (req.body.message || `Merged PR ${pr.id}: ${pr.title}`).trim();
  const result = await withRepo(ctx.key, ctx.repo.name, async (dir) => {
    const baseSha = await ops.resolve(dir, pr.target);
    const headSha = await ops.resolve(dir, pr.source);
    const merged = await ops.merge(dir, { base: pr.target, head: pr.source, message, squash, user: req.user });
    if (req.body.deleteSource) await ops.deleteBranch(dir, pr.source).catch(() => {});
    return { ...merged, baseSha, headSha };
  }, { write: true });
  res.json(await mutatePull(req, ctx, (p) => {
    Object.assign(p, {
      status: 'completed', completedBy: req.user.name, completedAt: now(), mergeSha: result.sha,
      baseShaAtMerge: result.baseSha, headShaAtMerge: result.headSha, squash,
    });
  }));
});

export default r;
