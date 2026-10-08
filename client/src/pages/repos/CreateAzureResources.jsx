/** Inline forms (inside the Deploy dialog) to create a resource group or a brand-new App Service. */
import { useEffect, useMemo, useState } from 'react';
import { ErrorBox } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import {
  prepareWebProvider, checkAppName, listPlans, createResourceGroup, createWebApp, RUNTIMES, PLAN_SKUS,
} from '../../azure/arm.js';

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').replace(/--+/g, '-');

function useRegions(sub, tenantId) {
  const [regions, setRegions] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let alive = true;
    setRegions(null);
    prepareWebProvider(sub, tenantId).then((r) => alive && setRegions(r)).catch((e) => alive && setErr(e));
    return () => { alive = false; };
  }, [sub, tenantId]);
  return { regions, err };
}

function RegionSelect({ regions, value, onChange, disabled }) {
  return (
    <label className="field"><span>Region</span>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled || !regions}>
        {!regions && <option>Loading regions…</option>}
        {regions?.map((r) => <option key={r.name} value={r.name}>{r.label}</option>)}
      </select>
    </label>
  );
}

export function NewResourceGroup({ sub, tenantId, existing, onCreated, onCancel }) {
  const { regions, err: regionErr } = useRegions(sub, tenantId);
  const [name, setName] = useState('rg-');
  const [location, setLocation] = useState('eastus');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const valid = /^[-\w._()]{1,90}$/.test(name) && !name.endsWith('.');
  const taken = existing.some((g) => g.name.toLowerCase() === name.toLowerCase());
  const create = async () => {
    setBusy(true);
    setErr(null);
    try { onCreated(await createResourceGroup(sub, name, location, tenantId)); } catch (e) { setErr(e); setBusy(false); }
  };
  return (
    <div className="create-panel">
      <div className="create-panel-head"><Icon name="plus" /> <b>New resource group</b></div>
      <div className="grid-2">
        <label className="field"><span>Name</span><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} /></label>
        <RegionSelect regions={regions} value={location} onChange={setLocation} />
      </div>
      {taken && <div className="muted small">A resource group with that name already exists.</div>}
      <ErrorBox error={err || regionErr} />
      <div className="row">
        <button className="btn btn-primary btn-sm" disabled={!valid || taken || busy} onClick={create}>{busy ? 'Creating…' : 'Create resource group'}</button>
        <button className="btn btn-sm" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}

export function NewAppService({ sub, rg, rgLocation, tenantId, repoName, onCreated, onCancel }) {
  const { regions, err: regionErr } = useRegions(sub, tenantId);
  const [name, setName] = useState(slug(repoName).slice(0, 50) || 'my-app');
  const [nameState, setNameState] = useState({ checking: false, available: null, message: '' });
  const [runtime, setRuntime] = useState(RUNTIMES[0].value);
  const [location, setLocation] = useState(rgLocation || 'eastus');
  const [plans, setPlans] = useState(null);
  const [planId, setPlanId] = useState('__new');
  const [planName, setPlanName] = useState('');
  const [sku, setSku] = useState('B1');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState([]);
  const [err, setErr] = useState(null);

  useEffect(() => { listPlans(sub, rg, tenantId).then(setPlans).catch(() => setPlans([])); }, [sub, rg, tenantId]);
  useEffect(() => { if (rgLocation) setLocation(rgLocation); }, [rgLocation]);

  // Debounced global name availability check (<name>.azurewebsites.net must be unique)
  useEffect(() => {
    const valid = /^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$/i.test(name);
    if (!valid) { setNameState({ checking: false, available: false, message: '2–60 letters, digits or hyphens; can’t start or end with a hyphen.' }); return undefined; }
    setNameState({ checking: true, available: null, message: '' });
    const t = setTimeout(() => {
      checkAppName(sub, name, tenantId)
        .then((r) => setNameState({ checking: false, ...r }))
        .catch((e) => setNameState({ checking: false, available: null, message: e.message }));
    }, 450);
    return () => clearTimeout(t);
  }, [name, sub, tenantId]);

  const linuxPlans = useMemo(() => (plans || []).filter((p) => p.linux), [plans]);
  const chosenPlan = linuxPlans.find((p) => p.id === planId);
  const effectiveLocation = chosenPlan ? toRegion(chosenPlan.location) : location;
  const effectivePlanName = planName || `${name}-plan`;
  const skuInfo = PLAN_SKUS.find((s) => s.value === sku);

  const create = async () => {
    setBusy(true);
    setErr(null);
    setProgress([]);
    const log = (t) => setProgress((p) => [...p, t]);
    try {
      const id = await createWebApp({
        sub, rg, name, runtime, tenantId, log,
        location: effectiveLocation,
        planId: chosenPlan?.id,
        newPlan: chosenPlan ? null : { name: effectivePlanName, sku, tier: skuInfo.tier },
        alwaysOn: chosenPlan ? !/^F/i.test(chosenPlan.sku || '') : sku !== 'F1',
      });
      onCreated(id);
    } catch (e) {
      setErr(e);
      setBusy(false);
    }
  };

  return (
    <div className="create-panel">
      <div className="create-panel-head"><Icon name="plus" /> <b>New App Service</b> <span className="muted small">Linux · in {rg}</span></div>
      <label className="field"><span>Name</span>
        <div className="row nowrap-row">
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value.toLowerCase())} disabled={busy} />
          <span className="muted">.azurewebsites.net</span>
        </div>
        <small className={nameState.available === false ? 'text-danger' : nameState.available ? 'text-ok' : 'muted'}>
          {nameState.checking ? 'Checking availability…' : nameState.available ? '✓ Available' : nameState.message}
        </small>
      </label>
      <div className="grid-2">
        <label className="field"><span>Runtime stack</span>
          <select className="input" value={runtime} onChange={(e) => setRuntime(e.target.value)} disabled={busy}>
            {RUNTIMES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
        <label className="field"><span>App Service plan</span>
          <select className="input" value={planId} onChange={(e) => setPlanId(e.target.value)} disabled={busy || !plans}>
            <option value="__new">+ New plan</option>
            {linuxPlans.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku}, {p.location}, {p.sites} app{p.sites === 1 ? '' : 's'})</option>)}
          </select>
        </label>
      </div>
      {!chosenPlan && (
        <div className="grid-2">
          <RegionSelect regions={regions} value={location} onChange={setLocation} disabled={busy} />
          <label className="field"><span>Pricing tier</span>
            <select className="input" value={sku} onChange={(e) => setSku(e.target.value)} disabled={busy}>
              {PLAN_SKUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          <label className="field"><span>Plan name</span><input className="input" value={planName} placeholder={`${name}-plan`} onChange={(e) => setPlanName(e.target.value)} disabled={busy} /></label>
        </div>
      )}
      <p className="muted small">
        Creates a Linux web app with HTTPS only, FTP disabled, TLS 1.2 and build-on-deploy turned on.
        {sku === 'F1' && !chosenPlan && ' Free plans are limited to one per region per subscription and have no "Always On".'}
        {' '}Charges apply for paid tiers.
      </p>
      <ErrorBox error={err || regionErr} />
      {progress.length > 0 && <div className="deploy-log">{progress.map((p, i) => <div key={i}>{p}</div>)}</div>}
      <div className="row">
        <button className="btn btn-primary btn-sm" disabled={busy || !nameState.available} onClick={create}>{busy ? 'Creating…' : 'Create App Service'}</button>
        <button className="btn btn-sm" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}

const toRegion = (loc) => String(loc || '').toLowerCase().replace(/[^a-z0-9]/g, '');
