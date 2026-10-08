/** Jira-style boards: issues, sprints, columns. One JSON blob per project. */
import { Router } from 'express';
import { getJson, updateJson } from '../blob.js';
import { HttpError, requireProject, boardBlob, reposBlob, pullsBlob, now, newId } from '../store.js';
import { withRepo } from '../gitStore.js';
import * as ops from '../gitOps.js';

const r = Router({ mergeParams: true });

export const TYPES = ['epic', 'story', 'task', 'bug', 'subtask'];
export const PRIORITIES = ['highest', 'high', 'medium', 'low', 'lowest'];

export const defaultBoard = () => ({
  nextNumber: 1,
  nextSprint: 1,
  columns: [
    { id: 'todo', name: 'To Do', category: 'todo' },
    { id: 'inprogress', name: 'In Progress', category: 'inprogress' },
    { id: 'review', name: 'In Review', category: 'inprogress' },
    { id: 'done', name: 'Done', category: 'done' },
  ],
  sprints: [],
  issues: [],
});

const FIELDS = ['title', 'description', 'type', 'status', 'priority', 'assignee', 'reporter', 'labels', 'storyPoints',
  'sprintId', 'epicId', 'parentId', 'rank', 'dueDate', 'color'];

function sanitize(board, patch) {
  const out = {};
  for (const f of FIELDS) if (patch[f] !== undefined) out[f] = patch[f];
  if (out.title !== undefined) {
    out.title = String(out.title).trim();
    if (!out.title) throw new HttpError(400, 'Summary is required');
  }
  if (out.type !== undefined && !TYPES.includes(out.type)) throw new HttpError(400, 'Invalid issue type');
  if (out.priority !== undefined && !PRIORITIES.includes(out.priority)) throw new HttpError(400, 'Invalid priority');
  if (out.status !== undefined && !board.columns.some((c) => c.id === out.status)) throw new HttpError(400, 'Invalid status');
  if (out.sprintId && !board.sprints.some((s) => s.id === out.sprintId)) throw new HttpError(400, 'Invalid sprint');
  if (out.epicId && !board.issues.some((i) => i.id === out.epicId && i.type === 'epic')) throw new HttpError(400, 'Invalid epic');
  if (out.parentId && !board.issues.some((i) => i.id === out.parentId)) throw new HttpError(400, 'Invalid parent');
  if (out.storyPoints !== undefined) out.storyPoints = out.storyPoints === null || out.storyPoints === '' ? null : Number(out.storyPoints);
  if (out.labels !== undefined) out.labels = [...new Set((out.labels || []).map((l) => String(l).trim()).filter(Boolean))];
  return out;
}

const describe = (board, field, v) => {
  if (v === null || v === undefined || v === '') return 'None';
  if (field === 'status') return board.columns.find((c) => c.id === v)?.name || v;
  if (field === 'sprintId') return board.sprints.find((s) => s.id === v)?.name || v;
  if (field === 'epicId' || field === 'parentId') return board.issues.find((i) => i.id === v)?.key || v;
  if (Array.isArray(v)) return v.join(', ') || 'None';
  if (field === 'description') return '(edited)';
  return String(v);
};

async function mutate(req, fn) {
  const project = await requireProject(req.params.key);
  const { data, result } = await updateJson(boardBlob(project.key), defaultBoard(), (board) => fn(board, project));
  return { board: data, result };
}

const findIssue = (board, id) => {
  const issue = board.issues.find((i) => i.id === id || i.key === id);
  if (!issue) throw new HttpError(404, 'Issue not found');
  return issue;
};

r.get('/', async (req, res) => {
  const project = await requireProject(req.params.key);
  const { data } = await getJson(boardBlob(project.key), defaultBoard());
  res.json(data);
});

/* ---------------------------------------------------------------- issues */
r.post('/issues', async (req, res) => {
  const { board, result } = await mutate(req, (board, project) => {
    const fields = sanitize(board, req.body);
    if (!fields.title) throw new HttpError(400, 'Summary is required');
    const maxRank = board.issues.reduce((m, i) => Math.max(m, i.rank || 0), 0);
    const issue = {
      id: newId(),
      key: `${project.key}-${board.nextNumber++}`,
      type: 'task',
      status: board.columns[0].id,
      priority: 'medium',
      assignee: null,
      reporter: req.user.name,
      labels: [],
      storyPoints: null,
      sprintId: null,
      epicId: null,
      parentId: null,
      description: '',
      dueDate: null,
      ...fields,
      rank: fields.rank ?? maxRank + 1000,
      createdAt: now(),
      updatedAt: now(),
      comments: [],
      history: [{ at: now(), by: req.user.name, action: 'created' }],
    };
    if (issue.type === 'subtask' && issue.parentId) {
      const parent = findIssue(board, issue.parentId);
      issue.sprintId = parent.sprintId;
    }
    board.issues.push(issue);
    return issue;
  });
  res.status(201).json({ board, issue: result });
});

r.patch('/issues/:id', async (req, res) => {
  const { board, result } = await mutate(req, (board) => {
    const issue = findIssue(board, req.params.id);
    const fields = sanitize(board, req.body);
    for (const [f, v] of Object.entries(fields)) {
      const before = issue[f];
      if (JSON.stringify(before) === JSON.stringify(v)) continue;
      issue[f] = v;
      if (f !== 'rank') {
        issue.history.push({ at: now(), by: req.user.name, field: f, from: describe(board, f, before), to: describe(board, f, v) });
      }
    }
    // Sub-tasks travel with their parent between sprints
    if (fields.sprintId !== undefined) {
      for (const s of board.issues.filter((i) => i.parentId === issue.id)) s.sprintId = issue.sprintId;
    }
    issue.updatedAt = now();
    return issue;
  });
  res.json({ board, issue: result });
});

r.delete('/issues/:id', async (req, res) => {
  const { board } = await mutate(req, (board) => {
    const issue = findIssue(board, req.params.id);
    const remove = new Set([issue.id, ...board.issues.filter((i) => i.parentId === issue.id).map((i) => i.id)]);
    board.issues = board.issues.filter((i) => !remove.has(i.id));
    for (const i of board.issues) if (i.epicId === issue.id) i.epicId = null;
  });
  res.json({ board });
});

r.post('/issues/:id/comments', async (req, res) => {
  if (!String(req.body.body || '').replace(/<[^>]*>/g, '').trim()) throw new HttpError(400, 'Comment is empty');
  const { board, result } = await mutate(req, (board) => {
    const issue = findIssue(board, req.params.id);
    const c = { id: newId(), author: req.user.name, body: req.body.body, createdAt: now() };
    issue.comments.push(c);
    issue.updatedAt = now();
    return issue;
  });
  res.status(201).json({ board, issue: result });
});

r.patch('/issues/:id/comments/:cid', async (req, res) => {
  const { board, result } = await mutate(req, (board) => {
    const issue = findIssue(board, req.params.id);
    const c = issue.comments.find((x) => x.id === req.params.cid);
    if (!c) throw new HttpError(404, 'Comment not found');
    c.body = req.body.body;
    c.editedAt = now();
    return issue;
  });
  res.json({ board, issue: result });
});

r.delete('/issues/:id/comments/:cid', async (req, res) => {
  const { board, result } = await mutate(req, (board) => {
    const issue = findIssue(board, req.params.id);
    issue.comments = issue.comments.filter((x) => x.id !== req.params.cid);
    return issue;
  });
  res.json({ board, issue: result });
});

/** Commits and pull requests across the project's repos that mention the issue key. */
r.get('/issues/:id/development', async (req, res) => {
  const project = await requireProject(req.params.key);
  const { data: board } = await getJson(boardBlob(project.key), defaultBoard());
  const issue = findIssue(board, req.params.id);
  const { data: repos } = await getJson(reposBlob(project.key), []);
  const commits = [];
  const pulls = [];
  const keyRe = new RegExp(`\\b${issue.key}\\b`, 'i');
  for (const repo of repos) {
    try {
      const found = await withRepo(project.key, repo.name, (dir) => ops.grepCommits(dir, issue.key));
      for (const c of found) commits.push({ repo: repo.name, ...c });
    } catch { /* empty or missing repo */ }
    const { data: pr } = await getJson(pullsBlob(project.key, repo.name), { items: [] });
    for (const p of pr.items) {
      if (keyRe.test(p.title) || keyRe.test(p.description || '') || keyRe.test(p.source)) {
        pulls.push({ repo: repo.name, id: p.id, title: p.title, status: p.status, source: p.source, target: p.target });
      }
    }
  }
  res.json({ commits, pulls });
});

/* --------------------------------------------------------------- sprints */
r.post('/sprints', async (req, res) => {
  const { board, result } = await mutate(req, (board, project) => {
    const n = board.nextSprint++;
    const s = {
      id: newId(), name: req.body.name?.trim() || `${project.key} Sprint ${n}`, goal: req.body.goal || '',
      state: 'future', startDate: req.body.startDate || null, endDate: req.body.endDate || null, createdAt: now(),
    };
    board.sprints.push(s);
    return s;
  });
  res.status(201).json({ board, sprint: result });
});

const findSprint = (board, id) => {
  const s = board.sprints.find((x) => x.id === id);
  if (!s) throw new HttpError(404, 'Sprint not found');
  return s;
};

r.patch('/sprints/:sid', async (req, res) => {
  const { board } = await mutate(req, (board) => {
    const s = findSprint(board, req.params.sid);
    for (const f of ['name', 'goal', 'startDate', 'endDate']) if (req.body[f] !== undefined) s[f] = req.body[f];
  });
  res.json({ board });
});

r.post('/sprints/:sid/start', async (req, res) => {
  const { board } = await mutate(req, (board) => {
    const s = findSprint(board, req.params.sid);
    if (board.sprints.some((x) => x.state === 'active')) throw new HttpError(409, 'Another sprint is already active. Complete it first.');
    if (s.state !== 'future') throw new HttpError(400, 'Only future sprints can be started');
    const start = req.body.startDate || now().slice(0, 10);
    const end = req.body.endDate || new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
    Object.assign(s, { state: 'active', startDate: start, endDate: end, goal: req.body.goal ?? s.goal, name: req.body.name || s.name, startedAt: now() });
  });
  res.json({ board });
});

r.post('/sprints/:sid/complete', async (req, res) => {
  const { board } = await mutate(req, (board) => {
    const s = findSprint(board, req.params.sid);
    if (s.state !== 'active') throw new HttpError(400, 'Only the active sprint can be completed');
    const done = new Set(board.columns.filter((c) => c.category === 'done').map((c) => c.id));
    const target = req.body.moveTo && req.body.moveTo !== 'backlog' ? findSprint(board, req.body.moveTo).id : null;
    const issues = board.issues.filter((i) => i.sprintId === s.id && i.type !== 'epic');
    s.completedIssues = issues.filter((i) => done.has(i.status)).map((i) => i.key);
    s.incompleteIssues = issues.filter((i) => !done.has(i.status)).map((i) => i.key);
    s.completedPoints = issues.filter((i) => done.has(i.status)).reduce((a, i) => a + (i.storyPoints || 0), 0);
    for (const i of issues) if (!done.has(i.status)) i.sprintId = target;
    Object.assign(s, { state: 'closed', completedAt: now() });
  });
  res.json({ board });
});

r.delete('/sprints/:sid', async (req, res) => {
  const { board } = await mutate(req, (board) => {
    const s = findSprint(board, req.params.sid);
    if (s.state === 'active') throw new HttpError(400, 'Complete the active sprint instead of deleting it');
    for (const i of board.issues) if (i.sprintId === s.id) i.sprintId = null;
    board.sprints = board.sprints.filter((x) => x.id !== s.id);
  });
  res.json({ board });
});

/* --------------------------------------------------------------- columns */
r.put('/columns', async (req, res) => {
  const cols = req.body.columns;
  if (!Array.isArray(cols) || !cols.length) throw new HttpError(400, 'At least one column is required');
  const { board } = await mutate(req, (board) => {
    const next = cols.map((c) => ({
      id: c.id || newId(),
      name: String(c.name || 'Column').trim(),
      category: ['todo', 'inprogress', 'done'].includes(c.category) ? c.category : 'inprogress',
      wip: c.wip ? Number(c.wip) : null,
    }));
    const ids = new Set(next.map((c) => c.id));
    for (const i of board.issues) if (!ids.has(i.status)) i.status = next[0].id;
    board.columns = next;
  });
  res.json({ board });
});

export default r;
