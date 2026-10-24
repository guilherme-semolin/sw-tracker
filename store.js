// Local data (localStorage) + optional Supabase sync.
const KEY = 'sw.entries.v1';
const META = 'sw.meta.v1';
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

let entries = [];
let meta = { dirty: [], lastPull: null };
const listeners = new Set();
const syncListeners = new Set();
let sb = null, user = null, syncState = 'off', pushTimer = null;

const readJSON = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('save failed', e); } };

export async function load() {
  meta = { ...meta, ...(readJSON(META) || {}) };
  const saved = readJSON(KEY);
  entries = Array.isArray(saved) && saved.length ? saved : await loadSeed();
  if (!saved) save();
}

async function loadSeed() {
  const r = await fetch('data/seed.json', { cache: 'no-cache' });
  return (await r.json()).map((e) => ({ ...e, u: 0 }));
}

function save() { writeJSON(KEY, entries); writeJSON(META, meta); }
function emit() { listeners.forEach((f) => f()); }
export const onChange = (f) => listeners.add(f);
export const onSync = (f) => syncListeners.add(f);
const setSync = (s) => { syncState = s; syncListeners.forEach((f) => f(s, user)); };

export const all = () => entries.filter((e) => !e.deleted);
export const get = (id) => entries.find((e) => e.id === id);

function touch(e) {
  e.u = Date.now();
  if (!meta.dirty.includes(e.id)) meta.dirty.push(e.id);
  save(); emit(); schedulePush();
}

export function update(id, patch) {
  const e = get(id);
  if (!e) return;
  Object.assign(e, patch);
  touch(e);
}

export function add(entry) {
  entries.push(entry);
  touch(entry);
}

export function remove(id) {
  const e = get(id);
  if (e) { e.deleted = true; touch(e); }
}

export function nextOrdem() {
  return Math.max(0, ...entries.filter((e) => !e.deleted && e.ordem).map((e) => e.ordem)) + 1;
}

export function exportJSON() {
  return JSON.stringify({ app: 'sw-tracker', exportedAt: new Date().toISOString(), entries: all() });
}

export function importJSON(text) {
  const data = JSON.parse(text);
  const list = Array.isArray(data) ? data : data.entries;
  if (!Array.isArray(list) || !list.length || !list[0].id) throw new Error('Arquivo inválido');
  const now = Date.now();
  const ids = new Set(list.map((e) => e.id));
  entries.forEach((e) => { if (!ids.has(e.id)) { e.deleted = true; e.u = now; } });
  const byId = new Map(entries.map((e) => [e.id, e]));
  list.forEach((e) => byId.set(e.id, { ...e, deleted: false, u: now }));
  entries = [...byId.values()];
  meta.dirty = entries.map((e) => e.id);
  save(); emit(); schedulePush();
  return list.length;
}

export async function resetToSeed() {
  const seed = await loadSeed();
  const now = Date.now();
  const ids = new Set(seed.map((e) => e.id));
  entries.forEach((e) => { if (!ids.has(e.id)) { e.deleted = true; e.u = now; } });
  const byId = new Map(entries.map((e) => [e.id, e]));
  seed.forEach((e) => byId.set(e.id, { ...e, u: now }));
  entries = [...byId.values()];
  meta.dirty = entries.map((e) => e.id);
  save(); emit(); schedulePush();
}

// ---------- Supabase sync ----------
export const syncConfigured = () => !!(window.SW_CONFIG && window.SW_CONFIG.supabaseUrl && window.SW_CONFIG.supabaseKey);
export const currentUser = () => user;
export const currentSyncState = () => syncState;

export async function initSync() {
  if (!syncConfigured()) return setSync('off');
  try {
    const { createClient } = await import(SUPABASE_JS);
    sb = createClient(window.SW_CONFIG.supabaseUrl, window.SW_CONFIG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });
    const { data } = await sb.auth.getSession();
    user = data.session ? data.session.user : null;
    sb.auth.onAuthStateChange((_ev, session) => { user = session ? session.user : null; setSync(user ? 'on' : 'logged-out'); });
    setSync(user ? 'on' : 'logged-out');
    if (user) await syncNow();
  } catch (e) {
    console.warn('sync init failed', e);
    setSync('err');
  }
}

export async function signIn(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  user = (await sb.auth.getUser()).data.user;
  meta.lastPull = null; save();
  await syncNow();
}

export async function signUp(email, password) {
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
  if (data.session) { user = data.session.user; meta.lastPull = null; save(); await syncNow(); return 'in'; }
  return 'confirm';
}

export async function signOut() { await sb.auth.signOut(); user = null; setSync('logged-out'); }

function schedulePush() {
  if (!sb || !user) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => push().catch(() => setSync('err')), 1200);
}

async function push() {
  if (!sb || !user || !meta.dirty.length) return;
  setSync('busy');
  const ids = [...meta.dirty];
  for (let i = 0; i < ids.length; i += 500) {
    const rows = ids.slice(i, i + 500).map(get).filter(Boolean).map((e) => ({ user_id: user.id, id: e.id, data: e }));
    const { error } = await sb.from('sw_entries').upsert(rows, { onConflict: 'user_id,id' });
    if (error) { setSync('err'); throw error; }
  }
  meta.dirty = meta.dirty.filter((id) => !ids.includes(id));
  save(); setSync('on');
}

async function pull() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from('sw_entries').select('id,data,synced_at').order('synced_at').range(from, from + 999);
    if (meta.lastPull) q = q.gt('synced_at', meta.lastPull);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  let changed = false;
  const byId = new Map(entries.map((e) => [e.id, e]));
  for (const r of rows) {
    const local = byId.get(r.id);
    if (!local || (r.data.u || 0) > (local.u || 0)) {
      byId.set(r.id, r.data);
      meta.dirty = meta.dirty.filter((id) => id !== r.id);
      changed = true;
    }
  }
  if (rows.length) meta.lastPull = rows[rows.length - 1].synced_at;
  return { rows, changed, byId };
}

export async function syncNow() {
  if (!sb || !user) return;
  try {
    setSync('busy');
    const firstSync = !meta.lastPull;
    const { rows, changed, byId } = await pull();
    if (changed) entries = [...byId.values()];
    if (firstSync) {
      // Push anything the cloud doesn't have yet (e.g. first login on a fresh account).
      const remote = new Set(rows.map((r) => r.id));
      entries.forEach((e) => { if (!remote.has(e.id) && !meta.dirty.includes(e.id)) meta.dirty.push(e.id); });
    }
    save(); if (changed) emit();
    await push();
    setSync('on');
  } catch (e) {
    console.warn('sync failed', e);
    setSync('err');
    throw e;
  }
}
