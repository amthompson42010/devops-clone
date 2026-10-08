/**
 * Microsoft Entra ID sign-in (MSAL.js) for calling Azure Resource Manager from the browser.
 * Requires an app registration (SPA platform) — see README "Deploying to Azure App Service".
 */
import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';
import { BROWSER_MODE } from '../api.js';

export const ARM_SCOPE = 'https://management.azure.com/user_impersonation';
const CFG_KEY = 'devops.azure';

export function getAzureConfig() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(CFG_KEY)) || {}; } catch { /* ignore */ }
  return {
    clientId: saved.clientId || import.meta.env.VITE_AZURE_CLIENT_ID || '',
    tenant: saved.tenant || import.meta.env.VITE_AZURE_TENANT || 'organizations',
  };
}

export function setAzureConfig(cfg) {
  try { localStorage.setItem(CFG_KEY, JSON.stringify({ clientId: cfg.clientId.trim(), tenant: (cfg.tenant || 'organizations').trim() })); } catch { /* ignore */ }
  pca = null;
}

/** The URL to register as a "Single-page application" redirect URI in the app registration. */
export function redirectUri() {
  const { origin, pathname } = window.location;
  if (!BROWSER_MODE) return `${origin}/redirect.html`;
  return new URL('redirect.html', `${origin}${pathname}`).href;
}

let pca = null;
let pcaKey = '';

/** Test seam: e2e tests can inject a fake token without a real Microsoft sign-in. */
const testToken = () => (typeof window !== 'undefined' ? window.__DEVOPS_AZURE_TEST__ : null);

async function client() {
  const cfg = getAzureConfig();
  if (!cfg.clientId) {
    const e = new Error('Azure sign-in is not configured. Add your app registration\'s client ID.');
    e.code = 'NO_CLIENT_ID';
    throw e;
  }
  const key = `${cfg.clientId}|${cfg.tenant}`;
  if (!pca || pcaKey !== key) {
    pca = new PublicClientApplication({
      auth: { clientId: cfg.clientId, authority: `https://login.microsoftonline.com/${cfg.tenant}`, redirectUri: redirectUri() },
      cache: { cacheLocation: 'localStorage' },
    });
    await pca.initialize();
    pcaKey = key;
  }
  return pca;
}

export async function currentAccount() {
  if (testToken()) return testToken().account;
  try {
    const c = await client();
    return c.getActiveAccount() || c.getAllAccounts()[0] || null;
  } catch { return null; }
}

export async function signIn() {
  if (testToken()) return testToken().account;
  const c = await client();
  const res = await c.loginPopup({ scopes: [ARM_SCOPE], prompt: 'select_account', redirectUri: redirectUri() });
  c.setActiveAccount(res.account);
  return res.account;
}

export async function signOut() {
  if (testToken()) return;
  const c = await client();
  const account = c.getActiveAccount() || c.getAllAccounts()[0];
  if (account) await c.clearCache({ account });
  c.setActiveAccount(null);
}

/** Access token for ARM, optionally for a specific tenant (needed for subscriptions in other directories). */
export async function getToken(tenantId) {
  if (testToken()) return testToken().token;
  const c = await client();
  const account = c.getActiveAccount() || c.getAllAccounts()[0];
  if (!account) throw new Error('Sign in to Azure first.');
  const request = {
    scopes: [ARM_SCOPE],
    account,
    redirectUri: redirectUri(),
    ...(tenantId ? { authority: `https://login.microsoftonline.com/${tenantId}` } : {}),
  };
  try {
    return (await c.acquireTokenSilent(request)).accessToken;
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError || /interaction_required|consent_required|login_required/i.test(e.errorCode || e.message)) {
      return (await c.acquireTokenPopup(request)).accessToken;
    }
    throw e;
  }
}
