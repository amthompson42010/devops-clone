/** Minimal stand-ins for node:crypto and node:path used by the shared server code. */
export function randomBytes(n) {
  const b = crypto.getRandomValues(new Uint8Array(n));
  return { toString: () => [...b].map((x) => x.toString(16).padStart(2, '0')).join('') };
}
export const extname = (p) => { const m = /\.[^./]*$/.exec(String(p).split('/').pop()); return m ? m[0] : ''; };
export const basename = (p) => String(p).split('/').pop();
export default { randomBytes, extname, basename };
