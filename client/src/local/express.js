/** A tiny subset of Express's Router API so server/src/routes/*.js can run in the browser. */
function compile(path, end) {
  const keys = [];
  const src = path
    .replace(/\/$/, '')
    .replace(/[.+*?^${}()|[\]\\]/g, '\\$&')
    .replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; });
  return { re: new RegExp(`^${src}${end ? '/?$' : '(?=/|$)'}`), keys };
}

export function Router() {
  const routes = [];
  const add = (method) => (path, handler) => { routes.push({ method, ...compile(path, true), handler }); };
  const router = {
    routes,
    get: add('GET'), post: add('POST'), put: add('PUT'), patch: add('PATCH'), delete: add('DELETE'),
    match(method, path) {
      for (const r of routes) {
        if (r.method !== method) continue;
        const m = r.re.exec(path || '/');
        if (m) return { handler: r.handler, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
      }
      return null;
    },
  };
  return router;
}

export function createApp() {
  const mounts = [];
  return {
    use(path, router) { mounts.push({ ...compile(path, false), router }); },
    async handle(req, res) {
      for (const mt of mounts) {
        const m = mt.re.exec(req.path);
        if (!m) continue;
        const rest = req.path.slice(m[0].length) || '/';
        const hit = mt.router.match(req.method, rest);
        if (!hit) continue;
        req.params = { ...Object.fromEntries(mt.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])), ...hit.params };
        await hit.handler(req, res);
        return true;
      }
      return false;
    },
  };
}

export default { Router };
