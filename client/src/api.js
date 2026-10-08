import { getUser } from './user.js';

/** true for the static / GitHub Pages build: all data lives in this browser. */
export const BROWSER_MODE = import.meta.env.VITE_BACKEND === 'browser';

let backend = null;
const loadBackend = () => {
  backend ||= import('virtual:local-backend');
  return backend;
};

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function browserRequest(method, url, body) {
  const { handle } = await loadBackend();
  const user = getUser();
  const res = await handle({ method, url, body, user: { name: user.name || 'Anonymous', email: user.email || '' } });
  if (res.status >= 400) throw new ApiError(res.status, res.body?.error || `Request failed (${res.status})`);
  return res;
}

async function request(method, url, body) {
  if (BROWSER_MODE) {
    const res = await browserRequest(method, url, body);
    return res.status === 204 ? null : res.body ?? null;
  }
  const user = getUser();
  const headers = {
    'X-User-Name': encodeURIComponent(user.name || 'Anonymous'),
    'X-User-Email': encodeURIComponent(user.email || ''),
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  if (res.status === 204) return null;
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new ApiError(res.status, (data && data.error) || `Request failed (${res.status})`);
  return data;
}

/** Fetch binary content (raw files, archives) as a Blob. */
async function blob(url) {
  if (BROWSER_MODE) {
    const res = await browserRequest('GET', url);
    return new Blob([res.body], { type: res.headers['content-type'] || 'application/octet-stream' });
  }
  const res = await fetch(url, { headers: { 'X-User-Name': encodeURIComponent(getUser().name || '') } });
  if (!res.ok) throw new ApiError(res.status, `Download failed (${res.status})`);
  return res.blob();
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body = {}) => request('PUT', url, body),
  patch: (url, body = {}) => request('PATCH', url, body),
  del: (url) => request('DELETE', url),
  blob,
};

export function saveBlob(b, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** Absolute link to an in-app route (works with hash routing on GitHub Pages). */
export function appLink(path) {
  if (BROWSER_MODE) return `${window.location.origin}${window.location.pathname}#${path}`;
  return `${window.location.origin}${path}`;
}

export const q = (params) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') s.set(k, v);
  const str = s.toString();
  return str ? `?${str}` : '';
};

export const repoApi = (key, repo) => `/api/projects/${key}/repos/${encodeURIComponent(repo)}`;
