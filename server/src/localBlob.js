/**
 * Local filesystem stand-in for an Azure Blob container.
 * Implements the subset of the @azure/storage-blob ContainerClient / BlockBlobClient API
 * that this app uses, including ETags and conditional writes (ifMatch / ifNoneMatch),
 * so the rest of the server runs unchanged against local disk.
 *
 * Blob "a/b/c.json" in container "devops-data" is stored at {root}/devops-data/a/b/c.json.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';

const locks = new Map();
function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  const tail = next.catch(() => {});
  locks.set(key, tail);
  tail.then(() => { if (locks.get(key) === tail) locks.delete(key); });
  return next;
}

const etagOf = (buf) => `"${crypto.createHash('md5').update(buf).digest('hex')}"`;

function storageError(statusCode, code, message) {
  const e = new Error(message);
  e.statusCode = statusCode;
  e.code = code;
  return e;
}

async function readOrNull(file) {
  try { return await fsp.readFile(file); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}

async function atomicWrite(file, buf) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await fsp.writeFile(tmp, buf);
  try {
    await fsp.rename(tmp, file);
  } catch (e) {
    // Windows can refuse to rename over a file another handle has open; fall back to copy.
    await fsp.copyFile(tmp, file);
    await fsp.rm(tmp, { force: true });
    if (e.code !== 'EPERM' && e.code !== 'EACCES' && e.code !== 'EBUSY') throw e;
  }
}

async function pruneEmptyDirs(dir, stopAt) {
  let cur = dir;
  while (cur.startsWith(stopAt) && cur !== stopAt) {
    try { await fsp.rmdir(cur); } catch { return; }
    cur = path.dirname(cur);
  }
}

class LocalBlockBlob {
  constructor(container, name) {
    this.container = container;
    this.name = name;
    this.file = path.join(container.root, ...name.split('/'));
  }

  async download() {
    const buf = await readOrNull(this.file);
    if (!buf) throw storageError(404, 'BlobNotFound', `The specified blob does not exist: ${this.name}`);
    return { etag: etagOf(buf), contentLength: buf.length, readableStreamBody: Readable.from([buf]) };
  }

  async downloadToBuffer() {
    const buf = await readOrNull(this.file);
    if (!buf) throw storageError(404, 'BlobNotFound', `The specified blob does not exist: ${this.name}`);
    return buf;
  }

  uploadData(data, { conditions = {} } = {}) {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    return withLock(this.file, async () => {
      if (conditions.ifMatch || conditions.ifNoneMatch) {
        const cur = await readOrNull(this.file);
        if (conditions.ifNoneMatch === '*' && cur) throw storageError(409, 'BlobAlreadyExists', 'The specified blob already exists.');
        if (conditions.ifMatch && (!cur || etagOf(cur) !== conditions.ifMatch)) {
          throw storageError(412, 'ConditionNotMet', 'The condition specified using HTTP conditional header(s) is not met.');
        }
      }
      await atomicWrite(this.file, buf);
      return { etag: etagOf(buf) };
    });
  }

  async deleteIfExists() {
    return withLock(this.file, async () => {
      const existed = fs.existsSync(this.file);
      await fsp.rm(this.file, { force: true });
      if (existed) await pruneEmptyDirs(path.dirname(this.file), this.container.root);
      return { succeeded: existed };
    });
  }

  async downloadToFile(target) {
    if (!fs.existsSync(this.file)) throw storageError(404, 'BlobNotFound', `The specified blob does not exist: ${this.name}`);
    await fsp.copyFile(this.file, target);
  }

  async uploadFile(source) {
    return withLock(this.file, async () => {
      await fsp.mkdir(path.dirname(this.file), { recursive: true });
      await fsp.copyFile(source, this.file);
      return {};
    });
  }
}

export class LocalContainer {
  constructor(baseDir, name) {
    this.containerName = name;
    this.root = path.join(baseDir, name);
  }

  async createIfNotExists() {
    await fsp.mkdir(this.root, { recursive: true });
  }

  getBlockBlobClient(name) {
    return new LocalBlockBlob(this, name);
  }

  async* listBlobsFlat({ prefix = '' } = {}) {
    const results = [];
    const walk = async (dir) => {
      let entries;
      try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else if (e.isFile() && !e.name.endsWith('.tmp')) {
          const name = path.relative(this.root, full).split(path.sep).join('/');
          if (name.startsWith(prefix)) results.push(name);
        }
      }
    };
    // Only walk the directory the prefix points into
    const dirPart = prefix.includes('/') ? prefix.slice(0, prefix.lastIndexOf('/')) : '';
    await walk(path.join(this.root, ...dirPart.split('/').filter(Boolean)));
    results.sort();
    for (const name of results) yield { name };
  }
}
