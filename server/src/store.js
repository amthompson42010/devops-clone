/** Blob-backed metadata (projects, users, repo lists). */
import crypto from 'node:crypto';
import { getJson, updateJson } from './blob.js';

export const PROJECTS = 'meta/projects.json';
export const USERS = 'meta/users.json';
export const reposBlob = (key) => `projects/${key}/repos.json`;
export const boardBlob = (key) => `projects/${key}/board.json`;
export const wikiIndexBlob = (key) => `projects/${key}/wiki/index.json`;
export const wikiPageBlob = (key, id) => `projects/${key}/wiki/pages/${id}.json`;
export const wikiHistoryPrefix = (key, id) => `projects/${key}/wiki/history/${id}/`;
export const pullsBlob = (key, repo) => `projects/${key}/pulls/${repo}.json`;

export const newId = () => crypto.randomBytes(6).toString('hex');
export const now = () => new Date().toISOString();

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function listProjects() {
  const { data } = await getJson(PROJECTS, []);
  return data;
}

export async function getProject(key) {
  const projects = await listProjects();
  return projects.find((p) => p.key === key.toUpperCase()) || null;
}

export async function requireProject(key) {
  const p = await getProject(key);
  if (!p) throw new HttpError(404, `Project ${key} not found`);
  return p;
}

export async function listUsers() {
  const { data } = await getJson(USERS, []);
  return data;
}

export async function touchUser(user) {
  if (!user?.name) return;
  const users = await listUsers();
  if (users.some((u) => u.name === user.name)) return;
  await updateJson(USERS, [], (list) => {
    if (!list.some((u) => u.name === user.name)) list.push({ name: user.name, email: user.email || '' });
  });
}
