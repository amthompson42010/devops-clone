/** Confluence-style pages ("Wiki"): page tree, rich-text pages, versions, comments, labels. */
import { Router } from 'express';
import { getJson, putJson, updateJson, listNames, deleteBlob, pool, deletePrefix } from '../blob.js';
import {
  HttpError, requireProject, wikiIndexBlob, wikiPageBlob, wikiHistoryPrefix, newId, now,
} from '../store.js';

const r = Router({ mergeParams: true });
const emptyIndex = { pages: [] };
const pad = (n) => String(n).padStart(6, '0');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const HOME_TEMPLATE = (name, description) => `
<h1>Welcome to ${esc(name)}</h1>
<p>${esc(description || 'This is the home page of your project space. Use it to orient your team.')}</p>
<h2>Getting started</h2>
<ul data-type="taskList">
<li data-type="taskItem" data-checked="false"><p>Add a project overview and goals</p></li>
<li data-type="taskItem" data-checked="false"><p>Link key resources and repositories</p></li>
<li data-type="taskItem" data-checked="false"><p>Create child pages for requirements, meeting notes and decisions</p></li>
</ul>
<h2>Team</h2>
<table><tbody><tr><th><p>Name</p></th><th><p>Role</p></th><th><p>Contact</p></th></tr><tr><td><p></p></td><td><p></p></td><td><p></p></td></tr></tbody></table>
`.trim();

export async function createPage(key, { title, content = '', parentId = null, labels = [] }, user) {
  const id = newId();
  const t = String(title || '').trim() || 'Untitled';
  const page = {
    id, title: t, content, labels, version: 1,
    createdAt: now(), createdBy: user.name, updatedAt: now(), updatedBy: user.name, comments: [], likes: [],
  };
  await updateJson(wikiIndexBlob(key), emptyIndex, (idx) => {
    if (parentId && !idx.pages.some((p) => p.id === parentId)) throw new HttpError(400, 'Parent page not found');
    const siblings = idx.pages.filter((p) => p.parentId === parentId);
    idx.pages.push({
      id, parentId, title: t, position: siblings.length,
      createdAt: page.createdAt, createdBy: user.name, updatedAt: page.updatedAt, updatedBy: user.name,
    });
  });
  await putJson(wikiPageBlob(key, id), page, null);
  await putJson(`${wikiHistoryPrefix(key, id)}${pad(1)}.json`, snapshot(page), '*');
  return page;
}

const snapshot = (p, message = '') => ({
  version: p.version, title: p.title, content: p.content, updatedAt: p.updatedAt, updatedBy: p.updatedBy, message,
});

async function loadPage(key, id) {
  const { data, etag } = await getJson(wikiPageBlob(key, id), null);
  if (!data) throw new HttpError(404, 'Page not found');
  return { page: data, etag };
}

r.get('/', async (req, res) => {
  const project = await requireProject(req.params.key);
  const { data } = await getJson(wikiIndexBlob(project.key), emptyIndex);
  res.json(data);
});

r.get('/search', async (req, res) => {
  const project = await requireProject(req.params.key);
  const q = String(req.query.q || '').trim().toLowerCase();
  if (!q) return res.json([]);
  const { data: idx } = await getJson(wikiIndexBlob(project.key), emptyIndex);
  const results = [];
  await pool(idx.pages, 8, async (meta) => {
    const { data: p } = await getJson(wikiPageBlob(project.key, meta.id), null);
    if (!p) return;
    const text = p.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const inTitle = p.title.toLowerCase().includes(q);
    const pos = text.toLowerCase().indexOf(q);
    const inLabels = (p.labels || []).some((l) => l.toLowerCase() === q);
    if (inTitle || pos >= 0 || inLabels) {
      const snippet = pos >= 0 ? text.slice(Math.max(0, pos - 60), pos + q.length + 100) : text.slice(0, 160);
      results.push({ id: p.id, title: p.title, snippet, updatedAt: p.updatedAt, updatedBy: p.updatedBy, score: inTitle ? 2 : 1 });
    }
  });
  res.json(results.sort((a, b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt)));
});

r.post('/pages', async (req, res) => {
  const project = await requireProject(req.params.key);
  const page = await createPage(project.key, req.body, req.user);
  res.status(201).json(page);
});

r.get('/pages/:id', async (req, res) => {
  const project = await requireProject(req.params.key);
  const { page } = await loadPage(project.key, req.params.id);
  res.json(page);
});

r.put('/pages/:id', async (req, res) => {
  const project = await requireProject(req.params.key);
  let versioned = false;
  const { data: page } = await updateJson(wikiPageBlob(project.key, req.params.id), null, (page) => {
    if (!page) throw new HttpError(404, 'Page not found');
    if (req.body.version !== undefined && Number(req.body.version) !== page.version) {
      throw new HttpError(409, `This page was updated by ${page.updatedBy} while you were editing (now version ${page.version}). Copy your changes, reload and try again.`);
    }
    const title = req.body.title !== undefined ? String(req.body.title).trim() || 'Untitled' : page.title;
    const content = req.body.content !== undefined ? String(req.body.content) : page.content;
    if (req.body.labels !== undefined) page.labels = [...new Set(req.body.labels.map((l) => String(l).trim().toLowerCase()).filter(Boolean))];
    versioned = title !== page.title || content !== page.content;
    if (versioned) Object.assign(page, { title, content, version: page.version + 1, updatedAt: now(), updatedBy: req.user.name });
  });
  if (versioned) {
    await putJson(`${wikiHistoryPrefix(project.key, page.id)}${pad(page.version)}.json`, snapshot(page, req.body.message || ''), '*');
    await updateJson(wikiIndexBlob(project.key), emptyIndex, (idx) => {
      const m = idx.pages.find((p) => p.id === page.id);
      if (m) Object.assign(m, { title: page.title, updatedAt: page.updatedAt, updatedBy: page.updatedBy });
    });
  }
  res.json(page);
});

r.post('/pages/:id/move', async (req, res) => {
  const project = await requireProject(req.params.key);
  const parentId = req.body.parentId || null;
  const { data } = await updateJson(wikiIndexBlob(project.key), emptyIndex, (idx) => {
    const page = idx.pages.find((p) => p.id === req.params.id);
    if (!page) throw new HttpError(404, 'Page not found');
    // Prevent moving a page under itself or its descendants
    for (let cur = parentId; cur; cur = idx.pages.find((p) => p.id === cur)?.parentId) {
      if (cur === page.id) throw new HttpError(400, 'A page cannot be moved under itself');
    }
    if (parentId && !idx.pages.some((p) => p.id === parentId)) throw new HttpError(400, 'Parent not found');
    const siblings = idx.pages.filter((p) => p.parentId === parentId && p.id !== page.id).sort((a, b) => a.position - b.position);
    const pos = Math.max(0, Math.min(req.body.position ?? siblings.length, siblings.length));
    siblings.splice(pos, 0, page);
    page.parentId = parentId;
    siblings.forEach((p, i) => { p.position = i; });
  });
  res.json(data);
});

r.delete('/pages/:id', async (req, res) => {
  const project = await requireProject(req.params.key);
  let removed = [];
  const { data } = await updateJson(wikiIndexBlob(project.key), emptyIndex, (idx) => {
    const ids = new Set([req.params.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const p of idx.pages) if (p.parentId && ids.has(p.parentId) && !ids.has(p.id)) { ids.add(p.id); grew = true; }
    }
    removed = [...ids];
    idx.pages = idx.pages.filter((p) => !ids.has(p.id));
  });
  await pool(removed, 8, async (id) => {
    await deleteBlob(wikiPageBlob(project.key, id));
    await deletePrefix(wikiHistoryPrefix(project.key, id));
  });
  res.json(data);
});

/* --------------------------------------------------------------- history */
r.get('/pages/:id/history', async (req, res) => {
  const project = await requireProject(req.params.key);
  const names = await listNames(wikiHistoryPrefix(project.key, req.params.id));
  const versions = await pool(names, 8, async (n) => {
    const { data } = await getJson(n, null);
    return data && { version: data.version, title: data.title, updatedAt: data.updatedAt, updatedBy: data.updatedBy, message: data.message };
  });
  res.json(versions.filter(Boolean).sort((a, b) => b.version - a.version));
});

r.get('/pages/:id/history/:v', async (req, res) => {
  const project = await requireProject(req.params.key);
  const { data } = await getJson(`${wikiHistoryPrefix(project.key, req.params.id)}${pad(Number(req.params.v))}.json`, null);
  if (!data) throw new HttpError(404, 'Version not found');
  res.json(data);
});

r.post('/pages/:id/restore/:v', async (req, res) => {
  const project = await requireProject(req.params.key);
  const { data: old } = await getJson(`${wikiHistoryPrefix(project.key, req.params.id)}${pad(Number(req.params.v))}.json`, null);
  if (!old) throw new HttpError(404, 'Version not found');
  const { page, etag } = await loadPage(project.key, req.params.id);
  Object.assign(page, { title: old.title, content: old.content, version: page.version + 1, updatedAt: now(), updatedBy: req.user.name });
  await putJson(wikiPageBlob(project.key, page.id), page, etag);
  await putJson(`${wikiHistoryPrefix(project.key, page.id)}${pad(page.version)}.json`, snapshot(page, `Restored v${old.version}`), '*');
  await updateJson(wikiIndexBlob(project.key), emptyIndex, (idx) => {
    const m = idx.pages.find((p) => p.id === page.id);
    if (m) Object.assign(m, { title: page.title, updatedAt: page.updatedAt, updatedBy: page.updatedBy });
  });
  res.json(page);
});

/* ------------------------------------------------------ comments & likes */
async function mutatePage(req, fn) {
  const project = await requireProject(req.params.key);
  const { data } = await updateJson(wikiPageBlob(project.key, req.params.id), null, (page) => {
    if (!page) throw new HttpError(404, 'Page not found');
    page.comments ||= [];
    page.likes ||= [];
    fn(page);
  });
  return data;
}

r.post('/pages/:id/comments', async (req, res) => {
  if (!String(req.body.body || '').replace(/<[^>]*>/g, '').trim()) throw new HttpError(400, 'Comment is empty');
  res.status(201).json(await mutatePage(req, (page) => {
    page.comments.push({ id: newId(), author: req.user.name, body: req.body.body, parentId: req.body.parentId || null, createdAt: now() });
  }));
});

r.delete('/pages/:id/comments/:cid', async (req, res) => {
  res.json(await mutatePage(req, (page) => {
    page.comments = page.comments.filter((c) => c.id !== req.params.cid && c.parentId !== req.params.cid);
  }));
});

r.post('/pages/:id/like', async (req, res) => {
  res.json(await mutatePage(req, (page) => {
    if (page.likes.includes(req.user.name)) page.likes = page.likes.filter((n) => n !== req.user.name);
    else page.likes.push(req.user.name);
  }));
});

export default r;
