import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const local = (f) => path.join(here, 'src/local', f);
const SERVER_SRC = /[\\/]server[\\/]src[\\/]/;

/**
 * Browser mode (`--mode browser`, used for GitHub Pages): the shared server route code in
 * ../server/src is bundled into the app, with its Node-only dependencies swapped for
 * browser implementations (IndexedDB storage, isomorphic-git, a tiny Express router).
 */
function browserBackend(enabled) {
  return {
    name: 'devops-browser-backend',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === 'virtual:local-backend') return enabled ? local('server.js') : '\0local-backend-stub';
      if (!enabled || !importer || !SERVER_SRC.test(importer)) return null;
      if (source === 'express') return local('express.js');
      if (source === 'node:crypto' || source === 'node:path') return local('nodeShims.js');
      if (/(^|\/)blob\.js$/.test(source)) return local('blob.js');
      if (/(^|\/)gitStore\.js$/.test(source)) return local('gitStore.js');
      if (/(^|\/)gitOps\.js$/.test(source)) return local('gitOps.js');
      return null;
    },
    load(id) {
      if (id === '\0local-backend-stub') return 'export const handle = null, exportAll = null, importAll = null, resetAll = null;';
      return null;
    },
  };
}

export default defineConfig(({ mode }) => {
  const browser = mode === 'browser';
  return {
    plugins: [react(), browserBackend(browser)],
    // Relative asset paths so the build works from any GitHub Pages sub-path (/<repo>/)
    base: browser ? './' : '/',
    build: { chunkSizeWarningLimit: 2500 },
    server: {
      port: 5173,
      fs: { allow: ['..'] },
      proxy: browser ? undefined : {
        '/api': 'http://localhost:4000',
        '/git': 'http://localhost:4000',
      },
    },
  };
});
