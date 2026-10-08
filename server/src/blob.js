import { BlobServiceClient } from '@azure/storage-blob';
import { LocalContainer } from './localBlob.js';

export let dataContainer;
export let repoContainer;
export let storageMode;

/**
 * STORAGE=local  -> files on disk under LOCAL_STORAGE_DIR (default when no connection string is set)
 * STORAGE=azure  -> Azure Blob Storage via AZURE_STORAGE_CONNECTION_STRING
 */
export async function initStorage() {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING?.trim();
  const mode = (process.env.STORAGE || (conn ? 'azure' : 'local')).toLowerCase();
  const dataName = process.env.DATA_CONTAINER || 'devops-data';
  const repoName = process.env.REPO_CONTAINER || 'devops-repos';

  if (mode === 'azure') {
    if (!conn) throw new Error('STORAGE=azure but AZURE_STORAGE_CONNECTION_STRING is not set.');
    const service = BlobServiceClient.fromConnectionString(conn);
    dataContainer = service.getContainerClient(dataName);
    repoContainer = service.getContainerClient(repoName);
    storageMode = `Azure Blob Storage (${service.accountName})`;
  } else if (mode === 'local') {
    const dir = process.env.LOCAL_STORAGE_DIR;
    dataContainer = new LocalContainer(dir, dataName);
    repoContainer = new LocalContainer(dir, repoName);
    storageMode = `local disk (${dir})`;
  } else {
    throw new Error(`Unknown STORAGE mode "${mode}". Use "local" or "azure".`);
  }
  await dataContainer.createIfNotExists();
  await repoContainer.createIfNotExists();
  return storageMode;
}

const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const c of stream) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  return Buffer.concat(chunks);
}

export function isStatus(err, ...codes) {
  return err && codes.includes(err.statusCode);
}

/** Read a JSON blob. Returns { data, etag } (data = fallback, etag = null when missing). */
export async function getJson(name, fallback = null, container = dataContainer) {
  try {
    const res = await container.getBlockBlobClient(name).download();
    const buf = await streamToBuffer(res.readableStreamBody);
    return { data: JSON.parse(buf.toString('utf8')), etag: res.etag };
  } catch (err) {
    if (isStatus(err, 404)) return { data: clone(fallback), etag: null };
    throw err;
  }
}

/** Write a JSON blob with optimistic concurrency (etag null => must not exist; etag '*' => unconditional). */
export async function putJson(name, data, etag = '*', container = dataContainer) {
  const body = Buffer.from(JSON.stringify(data));
  const conditions = etag === '*' ? {} : etag ? { ifMatch: etag } : { ifNoneMatch: '*' };
  const res = await container.getBlockBlobClient(name).uploadData(body, {
    blobHTTPHeaders: { blobContentType: 'application/json' },
    conditions,
  });
  return res.etag;
}

/**
 * Read-modify-write a JSON blob with retry on concurrent modification.
 * mutator(data) may mutate data in place and/or return a result value.
 * Throwing from the mutator aborts without writing.
 */
export async function updateJson(name, fallback, mutator, container = dataContainer) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const { data, etag } = await getJson(name, fallback, container);
    const result = await mutator(data);
    try {
      await putJson(name, data, etag, container);
      return { data, result };
    } catch (err) {
      if (isStatus(err, 409, 412)) {
        await new Promise((r) => setTimeout(r, 25 + Math.random() * 100 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Too much contention updating ${name}`);
}

export async function deleteBlob(name, container = dataContainer) {
  await container.getBlockBlobClient(name).deleteIfExists();
}

export async function listNames(prefix, container = dataContainer) {
  const names = [];
  for await (const b of container.listBlobsFlat({ prefix })) names.push(b.name);
  return names;
}

export async function deletePrefix(prefix, container = dataContainer) {
  const names = await listNames(prefix, container);
  await pool(names, 16, (n) => container.getBlockBlobClient(n).deleteIfExists());
  return names.length;
}

export async function downloadToFile(name, filePath, container) {
  await container.getBlockBlobClient(name).downloadToFile(filePath);
}

export async function uploadFile(name, filePath, container) {
  await container.getBlockBlobClient(name).uploadFile(filePath, {
    blobHTTPHeaders: { blobContentType: 'application/octet-stream' },
  });
}

/** Run fn over items with limited concurrency. */
export async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}
