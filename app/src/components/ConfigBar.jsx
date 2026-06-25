import { useEffect, useReducer, useState } from 'react';
import {
  getApiConfig, setApiConfig, DEFAULT_CONFIG,
  getUsers, getSelectedUserId, setSelectedUserId, getSelectedUser,
  checkConnectivity, PERSONAS,
} from '../api/managementApi';
import { roleColor } from './StatusBadge';

const PERSONA_ICON = { Shop: '🏪', Shelter: '🏡' };

function rolesOf(u) {
  return u.roles ? u.roles.split(',').map(r => r.trim()).filter(Boolean) : [];
}

export default function ConfigBar() {
  const [, rerender] = useReducer(x => x + 1, 0);
  const [connected, setConnected] = useState(null);
  const [showConnPanel, setShowConnPanel] = useState(false);
  const [showUserPanel, setShowUserPanel] = useState(false);

  const cfg   = { ...DEFAULT_CONFIG, ...getApiConfig() };
  const user  = getSelectedUser();
  const users = getUsers();
  const roles = rolesOf(user);

  useEffect(() => {
    setConnected(null);
    const t = setTimeout(() => checkConnectivity().then(ok => setConnected(ok)), 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.baseUrl, cfg.authMode, cfg.basicUser, cfg.basicPass, cfg.apiKeyValue]);

  const dot = connected === null ? 'checking' : connected ? 'ok' : 'error';

  const isShop = user.persona === 'Shop';

  return (
    <div className="topbar">
      <h1>🐾 Pet Adoption</h1>
      <span className="mode-tag">{isShop ? '🏪 Shop' : '🏡 Shelter'} mode</span>

      {/* ── User switcher ── */}
      <div className="user-switcher" onClick={() => { setShowConnPanel(false); setShowUserPanel(v => !v); }}>
        <div className="user-avatar">{user.name?.charAt(0).toUpperCase() || '?'}</div>
        <div className="user-info">
          <span className="user-name">{user.name}</span>
          <div className="user-roles-row">
            <span className="user-persona-tag">{user.persona}</span>
            {roles.map(r => (
              <span key={r} className="role-badge" style={{ background: roleColor(r) }}>{r}</span>
            ))}
          </div>
        </div>
        <span className="user-switcher-chevron">{showUserPanel ? '▲' : '▼'}</span>
      </div>

      {/* ── Connection badge ── */}
      <div className="conn-section">
        <button
          className="conn-badge"
          onClick={() => { setShowUserPanel(false); setShowConnPanel(v => !v); }}
          title="Edit Management API connection"
        >
          <span className="conn-url-short">{cfg.baseUrl.replace(/^https?:\/\//, '')}</span>
          <span className={`auth-mode-tag auth-mode-${cfg.authMode}`}>{cfg.authMode}</span>
        </button>
      </div>

      <div className={`dot ${dot}`}
        title={dot === 'ok' ? 'Connected' : dot === 'error' ? 'Cannot reach Management API' : 'Checking…'} />

      {showConnPanel && (
        <ConnPanel cfg={cfg} onClose={() => setShowConnPanel(false)} onSave={(newCfg) => {
          setApiConfig(newCfg); setShowConnPanel(false); rerender();
        }} />
      )}

      {showUserPanel && (
        <UserPanel
          users={users}
          selectedId={getSelectedUserId()}
          onSelect={id => { setSelectedUserId(id); rerender(); setShowUserPanel(false); }}
          onClose={() => setShowUserPanel(false)}
        />
      )}
    </div>
  );
}

// ── Connection panel ──────────────────────────────────────────────────────────
function ConnPanel({ cfg, onClose, onSave }) {
  const [draft, setDraft] = useState({ ...DEFAULT_CONFIG, ...cfg });
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  return (
    <div className="dropdown-panel conn-panel" onClick={e => e.stopPropagation()}>
      <div className="panel-header">
        <span>Management API Connection</span>
        <button className="icon-btn" onClick={onClose}>✕</button>
      </div>

      <div className="panel-field">
        <label>Management API URL</label>
        <input className="filter-input" value={draft.baseUrl}
          placeholder="/workflow or http://localhost:8234/workflow"
          onChange={e => set('baseUrl', e.target.value)} />
        <span className="field-hint">Relative <code>/workflow</code> goes through the Vite proxy (→ localhost:8234).</span>
      </div>

      <div className="panel-field">
        <label>Authentication mode</label>
        <div className="auth-mode-row">
          {['none', 'basic', 'apikey'].map(mode => (
            <button key={mode}
              className={`auth-mode-btn${draft.authMode === mode ? ' active' : ''}`}
              onClick={() => set('authMode', mode)}>
              {mode === 'none' ? '🔓 None' : mode === 'basic' ? '🔑 Basic' : '🗝 API Key'}
            </button>
          ))}
        </div>
      </div>

      {draft.authMode === 'basic' && (
        <div className="panel-row-2">
          <div className="panel-field">
            <label>Username</label>
            <input className="filter-input" value={draft.basicUser}
              onChange={e => set('basicUser', e.target.value)} />
          </div>
          <div className="panel-field">
            <label>Password</label>
            <input className="filter-input" type="password" value={draft.basicPass}
              onChange={e => set('basicPass', e.target.value)} />
          </div>
        </div>
      )}

      {draft.authMode === 'apikey' && (
        <div className="panel-row-2">
          <div className="panel-field" style={{ flex: '0 0 140px' }}>
            <label>Header name</label>
            <input className="filter-input" value={draft.apiKeyHeader}
              onChange={e => set('apiKeyHeader', e.target.value)} />
          </div>
          <div className="panel-field">
            <label>Key value</label>
            <input className="filter-input" type="password" value={draft.apiKeyValue}
              onChange={e => set('apiKeyValue', e.target.value)} />
          </div>
        </div>
      )}

      <div className="panel-footer">
        <button className="search-btn" onClick={() => onSave(draft)}>Apply</button>
        <button className="back-btn" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

// ── User panel — grouped by persona ─────────────────────────────────────────────
function UserPanel({ users, selectedId, onSelect, onClose }) {
  return (
    <div className="dropdown-panel user-panel" onClick={e => e.stopPropagation()}>
      <div className="panel-header">
        <span>Switch User</span>
        <button className="icon-btn" onClick={onClose}>✕</button>
      </div>
      <div className="user-list">
        {PERSONAS.map(persona => {
          const group = users.filter(u => u.persona === persona);
          if (group.length === 0) return null;
          return (
            <div key={persona}>
              <div className="persona-group-label">
                <span>{PERSONA_ICON[persona]}</span> {persona}
              </div>
              {group.map(u => (
                <div key={u.id}
                  className={`user-list-row${u.id === selectedId ? ' selected' : ''}`}
                  onClick={() => onSelect(u.id)}>
                  <div className="user-avatar sm">{u.name.charAt(0)}</div>
                  <div className="user-mgmt-info">
                    <strong>{u.name}</strong>
                    <span className="user-mgmt-uid">{u.userId}</span>
                    <div className="user-roles-row">
                      {rolesOf(u).map(r => (
                        <span key={r} className="role-badge sm" style={{ background: roleColor(r) }}>{r}</span>
                      ))}
                    </div>
                  </div>
                  {u.id === selectedId && <span className="user-check">✓</span>}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
