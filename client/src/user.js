import { useSyncExternalStore } from 'react';

const KEY = 'devops.user';
const listeners = new Set();
let cached = null;

export function getUser() {
  if (cached) return cached;
  try { cached = JSON.parse(localStorage.getItem(KEY)) || { name: '', email: '' }; } catch { cached = { name: '', email: '' }; }
  return cached;
}

export function setUser(user) {
  cached = { name: user.name.trim(), email: (user.email || '').trim() };
  try { localStorage.setItem(KEY, JSON.stringify(cached)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

export function useUser() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, getUser);
}
