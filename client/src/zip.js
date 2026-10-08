import { unzipSync } from 'fflate';

export function bytesToBase64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * Turn a .zip File into commit changes. If every entry shares one top-level folder
 * (like GitHub "Download ZIP" archives) that folder is stripped.
 */
export async function zipToChanges(file, intoDir = '') {
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  let names = Object.keys(entries).filter((n) => !n.endsWith('/') && !n.startsWith('__MACOSX/') && !/(^|\/)\.DS_Store$/.test(n) && !/(^|\/)\.git\//.test(n));
  const roots = new Set(names.map((n) => n.split('/')[0]));
  const strip = roots.size === 1 && names.every((n) => n.includes('/')) ? `${[...roots][0]}/` : '';
  return names.map((n) => {
    const rel = strip ? n.slice(strip.length) : n;
    return { path: intoDir ? `${intoDir}/${rel}` : rel, content: bytesToBase64(entries[n]), encoding: 'base64' };
  });
}
