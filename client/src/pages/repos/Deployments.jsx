import { useCallback, useEffect, useRef, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { api, BROWSER_MODE, q } from '../../api.js';
import { useAsync, timeAgo, fmtDateTime, shortSha, copyText } from '../../util.js';
import { Modal, Spinner, ErrorBox, Empty, Avatar, useToast } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import { BranchPicker } from './repoBits.jsx';
import { getAzureConfig, setAzureConfig, redirectUri, currentAccount, signIn, signOut } from '../../azure/auth.js';
import {
  listTenants, listSubscriptions, listResourceGroups, listWebApps, listStorageAccounts,
  ensureBuildSetting, deployViaRelay, deployViaStorage, createStagingAccount,
} from '../../azure/arm.js';

const STATUS_LABEL = { running: 'Running', succeeded: 'Succeeded', failed: 'Failed', unknown: 'Unknown' };

export default function Deployments() {
  const { project, repo } = useOutletContext();
  const [sp, setSp] = useSearchParams();
  const base = `/api/projects/${project.key}/deployments`;
  const hist = useAsync(() => api.get(`${base}${q({ repo: repo.name })}`), [base, repo.name]);
  const [open, setOpen] = useState(sp.get('deploy') === '1');
  const [expanded, setExpanded] = useState(null);
  const target = hist.data?.targets?.[repo.name];

  useEffect(() => {
    if (!hist.data?.items?.some((d) => d.status === 'running')) return undefined;
    const t = setInterval(hist.reload, 5000);
    return () => clearInterval(t);
  }, [hist.data, hist.reload]);

  const close = () => {
    setOpen(false);
    if (sp.get('deploy')) setSp({});
    hist.reload();
  };

  return (
    <main className="page repo-page">
      <div className="repo-toolbar">
        <h2 className="inline-title">Deployments</h2>
        <div className="push" />
        <button className="btn btn-primary" disabled={repo.empty} onClick={() => setOpen(true)}><Icon name="upload" /> Deploy to Azure</button>
      </div>
      {repo.empty && <div className="notice">Add code to this repository before deploying.</div>}
      {target && (
        <div className="card deploy-target">
          <span className="az-icon">A</span>
          <div className="grow">
            <div><b>{target.site.name}</b> <span className="muted small">App Service</span></div>
            <div className="muted small">
              {target.resourceGroup} · {target.subscription?.name || target.subscription?.id}
              {target.site.host && <> · <a href={`https://${target.site.host}`} target="_blank" rel="noreferrer">{target.site.host}</a></>}
            </div>
          </div>
          <button className="btn" disabled={repo.empty} onClick={() => setOpen(true)}><Icon name="refresh" /> Redeploy</button>
        </div>
      )}
      <ErrorBox error={hist.error} onRetry={hist.reload} />
      {!hist.data && !hist.error && <Spinner />}
      {hist.data && !hist.data.items.length && (
        <Empty icon="upload" title="No deployments yet">
          Sign in with your Microsoft account, pick a subscription, resource group and App Service, and push this repository live.
        </Empty>
      )}
      {hist.data?.items.length > 0 && (
        <div className="card flush">
          <table className="table">
            <thead><tr><th>Status</th><th>Source</th><th>App Service</th><th>By</th><th>Started</th><th>Duration</th></tr></thead>
            <tbody>
              {hist.data.items.map((d) => (
                <FragmentRows key={d.id} d={d} open={expanded === d.id} onToggle={() => setExpanded(expanded === d.id ? null : d.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <DeployDialog project={project} repo={repo} saved={target} onClose={close} />}
    </main>
  );
}

function FragmentRows({ d, open, onToggle }) {
  const dur = d.finishedAt ? Math.round((new Date(d.finishedAt) - new Date(d.startedAt)) / 1000) : null;
  return (
    <>
      <tr className={`dep-row ${open ? 'open' : ''}`} onClick={onToggle}>
        <td><span className={`dep-status dep-${d.status}`}>{STATUS_LABEL[d.status] || d.status}</span></td>
        <td className="nowrap"><Icon name="branch" size={14} /> <span className="mono">{d.ref}</span>{d.sha && <span className="mono muted"> @{shortSha(d.sha)}</span>}</td>
        <td className="nowrap">{d.site.host ? <a href={`https://${d.site.host}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{d.site.name}</a> : d.site.name}</td>
        <td className="nowrap"><Avatar name={d.startedBy} size={20} /> {d.startedBy}</td>
        <td className="nowrap muted" title={fmtDateTime(d.startedAt)}>{timeAgo(d.startedAt)}</td>
        <td className="nowrap muted">{dur !== null ? `${Math.floor(dur / 60)}m ${dur % 60}s` : '—'}</td>
      </tr>
      {open && (
        <tr><td colSpan={6}><DeployLog lines={d.log.map((l) => ({ at: l.at, text: l.text }))} /></td></tr>
      )}
    </>
  );
}

function DeployLog({ lines }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [lines.length]);
  return (
    <div className="deploy-log" ref={ref}>
      {lines.length ? lines.map((l, i) => (
        <div key={i}><span className="t">{new Date(l.at).toLocaleTimeString()}</span>{l.text}</div>
      )) : <span className="t">No output.</span>}
    </div>
  );
}

/* ---------------------------------------------------------------- dialog */

function AzureSetup({ onSaved }) {
  const cfg = getAzureConfig();
  const [clientId, setClientId] = useState(cfg.clientId);
  const [tenant, setTenant] = useState(cfg.tenant);
  const toast = useToast();
  return (
    <div className="az-setup form">
      <p>To sign in to Azure, this app needs a Microsoft Entra <b>app registration</b> (one-time, free):</p>
      <ol>
        <li>Azure portal ▸ <b>Microsoft Entra ID ▸ App registrations ▸ New registration</b>.</li>
        <li>Supported account types: <i>Accounts in any organizational directory</i> (or single tenant).</li>
        <li>Redirect URI: platform <b>Single-page application (SPA)</b>, value:
          <div className="row"><input className="input mono" readOnly value={redirectUri()} /><button className="btn btn-sm" onClick={() => { copyText(redirectUri()); toast('Copied'); }}><Icon name="copy" /></button></div>
        </li>
        <li>After creating it, under <b>API permissions</b> add <i>Azure Service Management ▸ user_impersonation</i> (delegated).</li>
        <li>Copy the <b>Application (client) ID</b> from the Overview page into the box below.</li>
      </ol>
      <div className="grid-2">
        <label className="field"><span>Application (client) ID</span><input className="input mono" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" /></label>
        <label className="field"><span>Tenant</span><input className="input mono" value={tenant} onChange={(e) => setTenant(e.target.value)} placeholder="organizations" /></label>
      </div>
      <p className="muted small">Tenant can stay <code>organizations</code> (any work/school account) or be your tenant ID / domain. Stored in this browser only.</p>
      <div className="form-actions">
        <button className="btn btn-primary" disabled={!/^[0-9a-f-]{36}$/i.test(clientId.trim())} onClick={() => { setAzureConfig({ clientId, tenant }); onSaved(); }}>Save</button>
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options, loading, placeholder, disabled }) {
  return (
    <label className="field">
      <span>{label}{loading && ' …'}</span>
      <select className="input" value={value || ''} onChange={(e) => onChange(e.target.value)} disabled={disabled || loading}>
        <option value="">{loading ? 'Loading…' : placeholder}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function DeployDialog({ project, repo, saved, onClose }) {
  const [configured, setConfigured] = useState(!!getAzureConfig().clientId);
  const [account, setAccount] = useState(undefined);
  const [tenants, setTenants] = useState([]);
  const [tenantId, setTenantId] = useState(saved?.tenantId || '');
  const [subs, setSubs] = useState(null);
  const [sub, setSub] = useState(saved?.subscription?.id || '');
  const [rgs, setRgs] = useState(null);
  const [rg, setRg] = useState(saved?.resourceGroup || '');
  const [apps, setApps] = useState(null);
  const [siteId, setSiteId] = useState(saved?.site?.id || '');
  const [accounts, setAccounts] = useState(null);
  const [storageId, setStorageId] = useState(saved?.storage?.id || '');
  const [ref, setRef] = useState(repo.defaultBranch);
  const [build, setBuild] = useState(saved ? saved.build !== false : true);
  const [loading, setLoading] = useState({});
  const [err, setErr] = useState(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [lines, setLines] = useState([]);
  const toast = useToast();

  const load = useCallback(async (key, fn) => {
    setLoading((l) => ({ ...l, [key]: true }));
    setErr(null);
    try { return await fn(); } catch (e) { setErr(e); return null; } finally { setLoading((l) => ({ ...l, [key]: false })); }
  }, []);

  useEffect(() => { if (configured) currentAccount().then(setAccount); }, [configured]);
  useEffect(() => {
    if (!account) return;
    load('tenants', listTenants).then((t) => { if (t) { setTenants(t); if (!tenantId && t.length) setTenantId(account.tenantId && t.some((x) => x.id === account.tenantId) ? account.tenantId : t[0].id); } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);
  useEffect(() => { if (account && tenantId) load('subs', () => listSubscriptions(tenantId)).then((s) => setSubs(s || [])); }, [account, tenantId, load]);
  useEffect(() => { setRgs(null); if (sub) load('rgs', () => listResourceGroups(sub, tenantId)).then((r) => setRgs(r || [])); }, [sub, tenantId, load]);
  useEffect(() => {
    setApps(null);
    setAccounts(null);
    if (!sub || !rg) return;
    load('apps', () => listWebApps(sub, rg, tenantId)).then((a) => setApps(a || []));
    if (BROWSER_MODE) load('accounts', () => listStorageAccounts(sub, rg, tenantId)).then((a) => setAccounts(a || []));
  }, [sub, rg, tenantId, load]);

  const site = apps?.find((a) => a.id === siteId) || null;
  const subscription = subs?.find((s) => s.id === sub) || null;
  const log = useCallback((text) => setLines((l) => [...l, { at: new Date().toISOString(), text }]), []);

  const deploy = async () => {
    setRunning(true);
    setLines([]);
    setErr(null);
    setResult(null);
    const depBase = `/api/projects/${project.key}/deployments`;
    let rec = null;
    const buffer = [];
    const logAndRecord = (t) => { log(t); buffer.push(t); };
    const flush = async (extra = {}) => {
      if (!rec) return;
      const chunk = buffer.splice(0);
      await api.patch(`${depBase}/${rec.id}`, { log: chunk, ...extra }).catch(() => {});
    };
    const timer = setInterval(flush, 4000);
    try {
      let storage = null;
      if (BROWSER_MODE) {
        storage = accounts.find((a) => a.id === storageId) || null;
      }
      rec = await api.post(depBase, {
        repo: repo.name, ref, sha: repo.branches.find((b) => b.name === ref)?.sha, method: BROWSER_MODE ? 'storage+onedeploy' : 'relay+zipdeploy',
        site: { id: site.id, name: site.name, host: site.host },
        subscription: subscription && { id: subscription.id, name: subscription.name },
        resourceGroup: rg, tenantId, build, storage: storage && { id: storage.id, name: storage.name },
      });
      logAndRecord(`Deploying ${repo.name}@${ref} to ${site.name} (${rg})`);
      if (build) await ensureBuildSetting(site.id, tenantId, logAndRecord);
      let outcome;
      if (BROWSER_MODE) {
        if (!storage) {
          storage = await createStagingAccount(sub, rg, site.location, tenantId, logAndRecord);
          setAccounts((a) => [...(a || []), { ...storage, sharedKey: true }]);
          setStorageId(storage.id);
        }
        outcome = await deployViaStorage({ projectKey: project.key, repo: repo.name, ref, site, account: storage, tenantId, log: logAndRecord });
      } else {
        outcome = await deployViaRelay({ projectKey: project.key, repo: repo.name, ref, site, tenantId, log: logAndRecord });
      }
      await flush({ status: outcome.status });
      setResult(outcome.status);
      if (outcome.status === 'succeeded') toast(`Deployed to ${site.name}`);
    } catch (e) {
      logAndRecord(`Error: ${e.message}`);
      setErr(e);
      setResult('failed');
      await flush({ status: 'failed' });
    } finally {
      clearInterval(timer);
      setRunning(false);
    }
  };

  const canDeploy = account && site && ref && !running && (!BROWSER_MODE || accounts);

  return (
    <Modal title="Deploy to Azure App Service" onClose={running ? undefined : onClose} width={720}
      footer={configured && account ? (
        <>
          {result === 'succeeded' && site?.host && <a className="btn push-left" href={`https://${site.host}`} target="_blank" rel="noreferrer"><Icon name="link" /> Open site</a>}
          <button className="btn" onClick={onClose} disabled={running}>{result ? 'Close' : 'Cancel'}</button>
          <button className="btn btn-primary" disabled={!canDeploy} onClick={deploy}>{running ? 'Deploying…' : result ? 'Deploy again' : 'Deploy'}</button>
        </>
      ) : null}>
      {!configured && <AzureSetup onSaved={() => setConfigured(true)} />}
      {configured && account === undefined && <Spinner />}
      {configured && account === null && (
        <div className="form">
          <p>Sign in with the Microsoft account that has access to your Azure subscription.</p>
          <ErrorBox error={err} />
          <div className="row">
            <button className="btn btn-primary" onClick={async () => { setErr(null); try { setAccount(await signIn()); } catch (e) { setErr(e); } }}>Sign in with Microsoft</button>
            <button className="btn" onClick={() => setConfigured(false)}>Change app registration</button>
          </div>
        </div>
      )}
      {configured && account && (
        <div className="form deploy-form">
          <div className="az-account">
            <Avatar name={account.name || account.username} size={28} />
            <div className="grow"><b>{account.name}</b> <span className="muted small">{account.username}</span></div>
            {!running && <button className="btn btn-sm" onClick={async () => { await signOut(); setAccount(null); setSubs(null); }}>Sign out</button>}
          </div>
          {tenants.length > 1 && (
            <Select label="Directory (tenant)" value={tenantId} onChange={(v) => { setTenantId(v); setSub(''); setRg(''); setSiteId(''); }} placeholder="Select a directory"
              options={tenants.map((t) => ({ value: t.id, label: `${t.name}${t.domain ? ` (${t.domain})` : ''}` }))} loading={loading.tenants} disabled={running} />
          )}
          <div className="grid-2">
            <Select label="Subscription" value={sub} onChange={(v) => { setSub(v); setRg(''); setSiteId(''); }} placeholder="Select a subscription"
              options={(subs || []).map((s) => ({ value: s.id, label: s.name }))} loading={loading.subs} disabled={running} />
            <Select label="Resource group" value={rg} onChange={(v) => { setRg(v); setSiteId(''); }} placeholder={sub ? 'Select a resource group' : 'Select a subscription first'}
              options={(rgs || []).map((g) => ({ value: g.name, label: `${g.name} (${g.location})` }))} loading={loading.rgs} disabled={running || !sub} />
          </div>
          <Select label="App Service" value={siteId} onChange={setSiteId} placeholder={rg ? (apps && !apps.length ? 'No App Services in this resource group' : 'Select an App Service') : 'Select a resource group first'}
            options={(apps || []).map((a) => ({ value: a.id, label: `${a.name} — ${a.host || ''} ${a.state && a.state !== 'Running' ? `(${a.state})` : ''}${/linux/i.test(a.kind) ? ' · Linux' : ' · Windows'}` }))}
            loading={loading.apps} disabled={running || !rg} />
          {BROWSER_MODE && rg && (
            <Select label="Staging storage account (holds the package while App Service pulls it)" value={storageId} onChange={setStorageId}
              placeholder="Create a new one automatically"
              options={(accounts || []).filter((a) => a.sharedKey).map((a) => ({ value: a.id, label: `${a.name} (${a.location})` }))}
              loading={loading.accounts} disabled={running} />
          )}
          <div className="grid-2">
            <div className="field"><span>Source branch</span><BranchPicker branches={repo.branches} value={ref} onChange={setRef} /></div>
            <label className="check" style={{ alignSelf: 'end', paddingBottom: 6 }}>
              <input type="checkbox" checked={build} onChange={(e) => setBuild(e.target.checked)} disabled={running} />
              Build on Azure during deployment (npm install / pip install…)
            </label>
          </div>
          {site && !site.scmHost && !BROWSER_MODE && <div className="notice warn">This app doesn&apos;t expose a deployment (SCM) endpoint.</div>}
          <ErrorBox error={err} />
          {(lines.length > 0 || running) && <DeployLog lines={lines} />}
          {result && <div className={`notice ${result === 'succeeded' ? 'ok' : 'warn'}`}><Icon name={result === 'succeeded' ? 'check' : 'warning'} /> Deployment {STATUS_LABEL[result]?.toLowerCase() || result}.</div>}
        </div>
      )}
    </Modal>
  );
}
