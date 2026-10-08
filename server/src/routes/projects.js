import { Router } from 'express';
import { getJson, updateJson, deletePrefix } from '../blob.js';
import {
  PROJECTS, HttpError, listProjects, requireProject, listUsers, reposBlob, boardBlob, wikiIndexBlob, now,
} from '../store.js';
import { createRepo, deleteRepo } from '../gitStore.js';
import { defaultBoard } from './boards.js';
import { createPage, HOME_TEMPLATE } from './wiki.js';

const r = Router();
const COLORS = ['#0078d4', '#8764b8', '#00a36c', '#e3008c', '#ca5010', '#038387', '#4f6bed', '#c239b3', '#498205'];

r.get('/users', async (req, res) => res.json(await listUsers()));

r.get('/projects', async (req, res) => {
  res.json(await listProjects());
});

r.post('/projects', async (req, res) => {
  const name = String(req.body.name || '').trim();
  const key = String(req.body.key || '').trim().toUpperCase();
  const description = String(req.body.description || '').trim();
  if (!name) throw new HttpError(400, 'Project name is required');
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(key)) throw new HttpError(400, 'Key must be 2-10 letters/digits starting with a letter');

  const { result: project } = await updateJson(PROJECTS, [], (list) => {
    if (list.some((p) => p.key === key)) throw new HttpError(409, `Key ${key} is already in use`);
    if (list.some((p) => p.name.toLowerCase() === name.toLowerCase())) throw new HttpError(409, 'A project with that name already exists');
    const p = { key, name, description, color: COLORS[list.length % COLORS.length], createdAt: now(), createdBy: req.user.name };
    list.push(p);
    return p;
  });

  await updateJson(boardBlob(key), defaultBoard(), () => {});
  await createPage(key, { title: `${name} Home`, content: HOME_TEMPLATE(name, description), parentId: null }, req.user);

  // Like Azure DevOps, every project starts with a repo named after the project
  const repoName = name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || key;
  await createRepo(key, repoName);
  await updateJson(reposBlob(key), [], (list) => { list.push({ name: repoName, createdAt: now(), createdBy: req.user.name }); });

  res.status(201).json(project);
});

r.get('/projects/:key', async (req, res) => {
  const project = await requireProject(req.params.key);
  const [{ data: repos }, { data: board }, { data: wiki }] = await Promise.all([
    getJson(reposBlob(project.key), []),
    getJson(boardBlob(project.key), defaultBoard()),
    getJson(wikiIndexBlob(project.key), { pages: [] }),
  ]);
  const doneCols = new Set(board.columns.filter((c) => c.category === 'done').map((c) => c.id));
  const issues = board.issues.filter((i) => i.type !== 'epic');
  const activeSprint = board.sprints.find((s) => s.state === 'active') || null;
  const members = new Set([project.createdBy, ...board.issues.map((i) => i.assignee), ...wiki.pages.map((p) => p.updatedBy)].filter(Boolean));
  res.json({
    ...project,
    repos,
    stats: {
      repos: repos.length,
      issues: issues.length,
      open: issues.filter((i) => !doneCols.has(i.status)).length,
      done: issues.filter((i) => doneCols.has(i.status)).length,
      pages: wiki.pages.length,
      bugs: issues.filter((i) => i.type === 'bug' && !doneCols.has(i.status)).length,
    },
    activeSprint,
    recentIssues: [...board.issues].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6),
    recentPages: [...wiki.pages].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 6),
    members: [...members],
  });
});

r.patch('/projects/:key', async (req, res) => {
  const key = req.params.key.toUpperCase();
  const { result } = await updateJson(PROJECTS, [], (list) => {
    const p = list.find((x) => x.key === key);
    if (!p) throw new HttpError(404, 'Project not found');
    if (req.body.name !== undefined) p.name = String(req.body.name).trim() || p.name;
    if (req.body.description !== undefined) p.description = String(req.body.description);
    return p;
  });
  res.json(result);
});

r.delete('/projects/:key', async (req, res) => {
  const project = await requireProject(req.params.key);
  const { data: repos } = await getJson(reposBlob(project.key), []);
  for (const repo of repos) await deleteRepo(project.key, repo.name);
  await deletePrefix(`projects/${project.key}/`);
  await updateJson(PROJECTS, [], (list) => {
    const i = list.findIndex((p) => p.key === project.key);
    if (i >= 0) list.splice(i, 1);
  });
  res.status(204).end();
});

export default r;
