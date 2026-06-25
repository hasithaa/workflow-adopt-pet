// Central client for the Ballerina workflow.management HTTP service, scoped to
// the Pet Adoption demo. Config is read from localStorage on every call, so
// changes in the ConfigBar take effect immediately without a page reload.
//
// Identity is propagated with the x-user-id and x-user-roles headers. The
// Management API uses x-user-roles to decide `canComplete` on each human task,
// which is how a Shop user only sees/acts on Shop tasks and a Shelter Admin
// only on Shelter tasks.

const CONFIG_KEY   = 'adopt-mgmt-config';
const USERS_KEY    = 'adopt-mock-users';
const SELECTED_KEY = 'adopt-selected-user';

export const USER_CONTEXT_CHANGED_EVENT = 'adopt:user-context-changed';

export function notifyUserContextChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(USER_CONTEXT_CHANGED_EVENT));
  }
}

// ── Personas & mock users ───────────────────────────────────────────────────
// Two personas with NO role overlap between them. Multiple users per role so
// you can demonstrate task hand-off within the same role.
//
//   Shop     → roles: abc_shop, pqr_shop   (selects the pet — Step 3)
//   Shelter  → roles: shelter_admin         (approves adoption — Step 5)
//              shelter_worker                (drops the branch-ready file —
//                                             Step 6, a non-web file event, so
//                                             it never appears as a UI task)
export const DEFAULT_USERS = [
  // ── Shop persona ──
  { id: 'abc-1', persona: 'Shop',    name: 'ABC Shop — Owner',  userId: 'owner@abc-shop.com',  roles: 'abc_shop' },
  { id: 'abc-2', persona: 'Shop',    name: 'ABC Shop — Clerk',  userId: 'clerk@abc-shop.com',  roles: 'abc_shop' },
  { id: 'pqr-1', persona: 'Shop',    name: 'PQR Shop — Owner',  userId: 'owner@pqr-shop.com',  roles: 'pqr_shop' },
  { id: 'pqr-2', persona: 'Shop',    name: 'PQR Shop — Clerk',  userId: 'clerk@pqr-shop.com',  roles: 'pqr_shop' },
  // ── Shelter persona ──
  { id: 'adm-1', persona: 'Shelter', name: 'Shelter Admin — Dana', userId: 'dana@shelter.org', roles: 'shelter_admin' },
  { id: 'adm-2', persona: 'Shelter', name: 'Shelter Admin — Evan', userId: 'evan@shelter.org', roles: 'shelter_admin' },
  { id: 'wrk-1', persona: 'Shelter', name: 'Shelter Worker — Priya', userId: 'priya@shelter.org', roles: 'shelter_worker' },
  { id: 'wrk-2', persona: 'Shelter', name: 'Shelter Worker — Sam',   userId: 'sam@shelter.org',   roles: 'shelter_worker' },
];

export const PERSONAS = ['Shop', 'Shelter'];

// ── Config / users helpers ──────────────────────────────────────────────────
export function getApiConfig() {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}'); } catch { return {}; }
}
export function setApiConfig(cfg) { localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)); }

export function getUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || 'null') || DEFAULT_USERS; } catch { return DEFAULT_USERS; }
}
export function saveUsers(users) { localStorage.setItem(USERS_KEY, JSON.stringify(users)); }

export function getSelectedUserId() { return localStorage.getItem(SELECTED_KEY) || DEFAULT_USERS[0].id; }
export function setSelectedUserId(id) {
  localStorage.setItem(SELECTED_KEY, id);
  notifyUserContextChanged();
}

export function getSelectedUser() {
  const users = getUsers();
  return users.find(u => u.id === getSelectedUserId()) || users[0] || DEFAULT_USERS[0];
}

export function rolesOf(user) {
  const u = user || getSelectedUser();
  return (u.roles || '').split(',').map(r => r.trim()).filter(Boolean);
}

export function primaryRole(user) {
  return rolesOf(user)[0] || '';
}

export function hasRole(role, user) {
  return rolesOf(user).includes(role);
}

// The workflow needs to know who started it so it can scope the Select-Pet
// human task to the initiating shop's role (e.g. abc_shop vs pqr_shop). The App
// fills this automatically from the selected user.
export function getInitiatorContext() {
  const u = getSelectedUser();
  return { initiatedBy: u.userId, initiatorRole: primaryRole(u) };
}

// ── Default config ──────────────────────────────────────────────────────────
export const DEFAULT_CONFIG = {
  baseUrl:      '/workflow',
  authMode:     'none',   // 'none' | 'basic' | 'apikey'
  basicUser:    '',
  basicPass:    '',
  apiKeyHeader: 'x-api-key',
  apiKeyValue:  '',
};

function cfg() { return { ...DEFAULT_CONFIG, ...getApiConfig() }; }

// ── HTTP core ───────────────────────────────────────────────────────────────
function buildHeaders() {
  const c    = cfg();
  const user = getSelectedUser();
  const h    = { 'Content-Type': 'application/json' };

  if (user.userId) h['x-user-id']    = user.userId;
  if (user.roles)  h['x-user-roles'] = user.roles;

  if (c.authMode === 'basic' && c.basicUser) {
    h['Authorization'] = 'Basic ' + btoa(`${c.basicUser}:${c.basicPass}`);
  } else if (c.authMode === 'apikey' && c.apiKeyHeader && c.apiKeyValue) {
    h[c.apiKeyHeader] = c.apiKeyValue;
  }
  return h;
}

async function req(path, options = {}) {
  const url  = `${cfg().baseUrl.replace(/\/$/, '')}${path}`;
  const res  = await fetch(url, { ...options, headers: { ...buildHeaders(), ...(options.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status} ${res.statusText}`);
  return data;
}

function qs(params) {
  const p = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') p[k] = v;
  }
  const s = new URLSearchParams(p).toString();
  return s ? `?${s}` : '';
}

function enc(s) { return encodeURIComponent(s ?? ''); }

// ── Definitions / Workflows ───────────────────────────────────────────────────
export const getDefinitions = () => req('/definitions');
export const listWorkflows  = (p = {}) => req(`/workflows${qs(p)}`);
export const startWorkflow  = (body)   => req('/workflows', { method: 'POST', body: JSON.stringify(body) });
export const getWorkflow     = (id, r) => req(`/workflows/${enc(id)}/${enc(r)}`);
export const getHistory      = (id, r) => req(`/workflows/${enc(id)}/${enc(r)}/history`);
export const getActivityTree = (id, r) => req(`/workflows/${enc(id)}/${enc(r)}/activity-tree`);
export const suspendWorkflow   = (id, r) => req(`/workflows/${enc(id)}/${enc(r)}/suspend`, { method: 'POST' });
export const resumeWorkflow    = (id, r) => req(`/workflows/${enc(id)}/${enc(r)}/resume`,  { method: 'POST' });
export const cancelWorkflow    = (id, r) => req(`/workflows/${enc(id)}/${enc(r)}/cancel`,  { method: 'POST' });
export const terminateWorkflow = (id, r, reason) =>
  req(`/workflows/${enc(id)}/${enc(r)}/terminate`, { method: 'POST', body: JSON.stringify({ reason }) });

// ── Human Tasks ────────────────────────────────────────────────────────────────
export const listHumanTasks    = (p = {}) => req(`/human-tasks${qs(p)}`);
export const getPendingCount   = ()        => req('/human-tasks/pending-count');
export const getHumanTask      = (id)      => req(`/human-tasks/${enc(id)}`);
export const completeHumanTask = (id, res) => req(`/human-tasks/${enc(id)}/complete`, { method: 'POST', body: JSON.stringify({ result: res }) });
export const failHumanTask     = (id, reason) => req(`/human-tasks/${enc(id)}/fail`, { method: 'POST', body: JSON.stringify({ reason }) });
export const cancelHumanTask   = (id)      => req(`/human-tasks/${enc(id)}/cancel`, { method: 'POST' });

// ── Connectivity check ───────────────────────────────────────────────────────
export async function checkConnectivity() {
  try { await req('/definitions'); return true; } catch { return false; }
}
