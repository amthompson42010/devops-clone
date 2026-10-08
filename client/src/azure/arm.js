/**
 * Azure Resource Manager helpers + the two deployment strategies:
 *  - relay   (server mode): our Node server pushes a git archive to the app's Kudu zipdeploy endpoint
 *  - storage (GitHub Pages): browser stages the zip in a storage account, then ARM "onedeploy" pulls it
 * Kudu (*.scm.azurewebsites.net) doesn't allow cross-origin browser calls, which is why both exist.
 */
import { getToken } from './auth.js';
import { api, repoApi } from '../api.js';

const ARM = 'https://management.azure.com';
const V = {
  tenants: '2022-12-01', subs: '2022-12-01', rg: '2021-04-01', web: '2023-12-01', storage: '2023-05-01', onedeploy: '2022-03-01',
};
export const STAGING_CONTAINER = 'devops-deploy';

export class ArmError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

export async function arm(method, path, { body, apiVersion, tenantId, raw } = {}) {
  const token = await getToken(tenantId);
  const url = path.startsWith('http') ? path : `${ARM}${path}${path.includes('?') ? '&' : '?'}api-version=${apiVersion}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (raw) return res;
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err = data?.error || {};
    let msg = err.message || `Azure request failed (${res.status})`;
    if (res.status === 403) msg = `${msg} — your account may need Contributor access on this resource.`;
    throw new ArmError(res.status, err.code, msg);
  }
  return { status: res.status, data, headers: res.headers };
}

async function armList(path, apiVersion, tenantId) {
  const out = [];
  let next = `${ARM}${path}${path.includes('?') ? '&' : '?'}api-version=${apiVersion}`;
  while (next) {
    const { data } = await arm('GET', next, { tenantId });
    out.push(...(data?.value || []));
    next = data?.nextLink || null;
  }
  return out;
}

export const listTenants = () => armList('/tenants', V.tenants).then((l) => l.map((t) => ({
  id: t.tenantId, name: t.displayName || t.defaultDomain || t.tenantId, domain: t.defaultDomain,
})));

export const listSubscriptions = (tenantId) => armList('/subscriptions', V.subs, tenantId).then((l) => l
  .filter((s) => s.state === 'Enabled')
  .map((s) => ({ id: s.subscriptionId, name: s.displayName, tenantId: s.tenantId }))
  .sort((a, b) => a.name.localeCompare(b.name)));

export const listResourceGroups = (sub, tenantId) => armList(`/subscriptions/${sub}/resourcegroups`, V.rg, tenantId)
  .then((l) => l.map((g) => ({ name: g.name, location: g.location })).sort((a, b) => a.name.localeCompare(b.name)));

export const listWebApps = (sub, rg, tenantId) => armList(`/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Web/sites`, V.web, tenantId)
  .then((l) => l.map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind || '',
    location: s.location,
    state: s.properties?.state,
    host: s.properties?.defaultHostName,
    scmHost: s.properties?.hostNameSslStates?.find((h) => h.hostType === 'Repository')?.name || null,
  })).sort((a, b) => a.name.localeCompare(b.name)));

export const listStorageAccounts = (sub, rg, tenantId) => armList(`/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Storage/storageAccounts`, V.storage, tenantId)
  .then((l) => l.map((a) => ({ id: a.id, name: a.name, location: a.location, sharedKey: a.properties?.allowSharedKeyAccess !== false })));

/** Turn on Oryx build during deployment (npm install, pip install, …) if requested. */
export async function ensureBuildSetting(siteId, tenantId, log) {
  const { data } = await arm('POST', `${siteId}/config/appsettings/list`, { apiVersion: V.web, tenantId });
  const props = data?.properties || {};
  if (String(props.SCM_DO_BUILD_DURING_DEPLOYMENT).toLowerCase() === 'true') return;
  log('Enabling "build during deployment" (SCM_DO_BUILD_DURING_DEPLOYMENT=true)…');
  await arm('PUT', `${siteId}/config/appsettings`, { apiVersion: V.web, tenantId, body: { properties: { ...props, SCM_DO_BUILD_DURING_DEPLOYMENT: 'true' } } });
}

/* ------------------------------------------------------------ relay path */

export async function deployViaRelay({ projectKey, repo, ref, site, tenantId, log, onJob }) {
  const token = await getToken(tenantId);
  if (!site.scmHost) throw new Error('This app has no SCM (Kudu) host; it can\'t receive zip deployments.');
  const { id } = await api.post('/api/relay/deploy', { key: projectKey, repo, ref, scmHost: site.scmHost, token });
  onJob?.(id);
  let seen = 0;
  for (;;) {
    await new Promise((r) => setTimeout(r, 2000));
    const job = await api.get(`/api/relay/jobs/${id}?since=${seen}`);
    for (const l of job.log) log(l.text);
    seen = job.total;
    if (job.done) return { status: job.status, sha: job.sha };
  }
}

/* ---------------------------------------------------------- storage path */

const randomName = () => `devopsdeploy${Math.random().toString(36).slice(2, 10)}`.slice(0, 24);

export async function createStagingAccount(sub, rg, location, tenantId, log) {
  const name = randomName();
  const id = `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Storage/storageAccounts/${name}`;
  log(`Creating storage account ${name} in ${location}…`);
  await arm('PUT', id, {
    apiVersion: V.storage, tenantId,
    body: {
      location, kind: 'StorageV2', sku: { name: 'Standard_LRS' },
      properties: { minimumTlsVersion: 'TLS1_2', allowBlobPublicAccess: false, allowSharedKeyAccess: true, supportsHttpsTrafficOnly: true },
      tags: { purpose: 'devops-clone-deploy-staging' },
    },
  });
  for (let i = 0; i < 60; i++) {
    const { data } = await arm('GET', id, { apiVersion: V.storage, tenantId });
    if (data?.properties?.provisioningState === 'Succeeded') return { id, name, location };
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('Timed out creating the storage account.');
}

async function prepareStaging(account, tenantId, log) {
  const svc = `${account.id}/blobServices/default`;
  const origin = window.location.origin;
  const { data } = await arm('GET', svc, { apiVersion: V.storage, tenantId });
  const rules = data?.properties?.cors?.corsRules || [];
  const ok = rules.some((r) => (r.allowedOrigins || []).some((o) => o === origin || o === '*') && (r.allowedMethods || []).includes('PUT'));
  if (!ok) {
    log(`Allowing uploads from ${origin} on ${account.name} (CORS)…`);
    rules.push({ allowedOrigins: [origin], allowedMethods: ['PUT', 'GET', 'DELETE', 'OPTIONS'], allowedHeaders: ['*'], exposedHeaders: ['*'], maxAgeInSeconds: 3600 });
    await arm('PUT', svc, { apiVersion: V.storage, tenantId, body: { properties: { cors: { corsRules: rules } } } });
  }
  await arm('PUT', `${account.id}/blobServices/default/containers/${STAGING_CONTAINER}`, { apiVersion: V.storage, tenantId, body: { properties: { publicAccess: 'None' } } });
}

async function blobSas(account, blobName, tenantId) {
  const expiry = new Date(Date.now() + 3 * 3600 * 1000).toISOString().replace(/\.\d+Z$/, 'Z');
  const { data } = await arm('POST', `${account.id}/listServiceSas`, {
    apiVersion: V.storage, tenantId,
    body: {
      canonicalizedResource: `/blob/${account.name}/${STAGING_CONTAINER}/${blobName}`,
      signedResource: 'b', signedPermission: 'rcwd', signedProtocol: 'https', signedExpiry: expiry,
    },
  });
  return data.serviceSasToken;
}

async function pollSiteDeployment(siteId, since, tenantId, log) {
  const started = Date.now();
  let last = '';
  while (Date.now() - started < 30 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 5000));
    let list;
    try { list = (await arm('GET', `${siteId}/deployments`, { apiVersion: V.web, tenantId })).data?.value || []; } catch { continue; }
    const recent = list
      .map((d) => d.properties || {})
      .filter((p) => p.start_time && new Date(p.start_time).getTime() >= since - 120000)
      .sort((a, b) => new Date(b.start_time) - new Date(a.start_time))[0];
    if (!recent) continue;
    const line = `${({ 0: 'Pending', 1: 'Building', 2: 'Deploying', 3: 'Failed', 4: 'Success' })[recent.status] ?? recent.status}${recent.message ? ` – ${recent.message}` : ''}`;
    if (line !== last) { log(line); last = line; }
    if (recent.status === 4) return 'succeeded';
    if (recent.status === 3) return 'failed';
  }
  log('Still running after 30 minutes — check Deployment Center in the Azure portal.');
  return 'unknown';
}

export async function deployViaStorage({ projectKey, repo, ref, site, account, tenantId, log }) {
  log(`Packaging ${repo}@${ref}…`);
  const zip = await api.blob(`${repoApi(projectKey, repo)}/archive?ref=${encodeURIComponent(ref)}`);
  log(`Package ready (${(zip.size / 1024).toFixed(1)} KB).`);
  await prepareStaging(account, tenantId, log);
  const blobName = `${site.name}-${Date.now()}.zip`;
  const sas = await blobSas(account, blobName, tenantId);
  const blobUrl = `https://${account.name}.blob.core.windows.net/${STAGING_CONTAINER}/${blobName}`;
  log(`Uploading package to ${account.name}…`);
  let uploaded = false;
  for (let i = 0; i < 6 && !uploaded; i++) {
    try {
      const res = await fetch(`${blobUrl}?${sas}`, { method: 'PUT', headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': 'application/zip' }, body: zip });
      if (!res.ok) throw new Error(`Upload failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
      uploaded = true;
    } catch (e) {
      if (i === 5) throw e;
      log('Waiting for storage CORS settings to take effect…');
      await new Promise((r) => setTimeout(r, 5000 * (i + 1)));
    }
  }
  const since = Date.now();
  log('Asking App Service to deploy the package (OneDeploy)…');
  await arm('PUT', `${site.id}/extensions/onedeploy`, {
    apiVersion: V.onedeploy, tenantId,
    body: { properties: { packageUri: `${blobUrl}?${sas}`, type: 'zip', restart: true } },
  });
  const status = await pollSiteDeployment(site.id, since, tenantId, log);
  if (status !== 'unknown') {
    try { await fetch(`${blobUrl}?${sas}`, { method: 'DELETE' }); } catch { /* staging cleanup is best effort */ }
  }
  return { status };
}
