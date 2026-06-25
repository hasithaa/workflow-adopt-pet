import { NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import ConfigBar from './ConfigBar';
import { roleColor } from './StatusBadge';
import {
  getPendingCount, getSelectedUser, rolesOf, hasRole,
  USER_CONTEXT_CHANGED_EVENT,
} from '../api/managementApi';

function usePendingCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const load = () => getPendingCount().then(d => setCount(d.count ?? 0)).catch(() => {});
    load();
    const onChange = () => load();
    window.addEventListener(USER_CONTEXT_CHANGED_EVENT, onChange);
    const id = setInterval(load, 15000);
    return () => { clearInterval(id); window.removeEventListener(USER_CONTEXT_CHANGED_EVENT, onChange); };
  }, []);
  return count;
}

const navCls = ({ isActive }) => `nav-item${isActive ? ' active' : ''}`;
const personaHome = (persona) => (persona === 'Shop' ? '/start' : '/tasks');

export default function Layout({ children }) {
  const navigate = useNavigate();
  const pendingCount = usePendingCount();
  const [user, setUser] = useState(getSelectedUser());
  const prevPersona = useRef(user.persona);

  // Switching persona changes the whole mode — send the user to that mode's home.
  useEffect(() => {
    const onChange = () => {
      const next = getSelectedUser();
      setUser(next);
      if (next.persona !== prevPersona.current) {
        prevPersona.current = next.persona;
        navigate(personaHome(next.persona));
      }
    };
    window.addEventListener(USER_CONTEXT_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(USER_CONTEXT_CHANGED_EVENT, onChange);
  }, [navigate]);

  const persona = user.persona;
  const isShop = persona === 'Shop';
  const isShelterAdmin = hasRole('shelter_admin', user);
  const roles = rolesOf(user);

  return (
    <div className={`app persona-${isShop ? 'shop' : 'shelter'}`}>
      <ConfigBar />
      <div className="app-body">
        <nav className="sidebar">
          <div className="sidebar-persona-card">
            <div className="sp-label">{isShop ? '🏪' : '🏡'} {persona} mode · acting as</div>
            <div className="sp-name">{user.name}</div>
            <div className="user-roles-row">
              {roles.map(r => (
                <span key={r} className="role-badge sm" style={{ background: roleColor(r) }}>{r}</span>
              ))}
            </div>
          </div>

          {isShop && (
            <>
              <div className="sidebar-section-label">Adoption</div>
              <NavLink to="/start" className={navCls}>
                <span className="nav-icon">▶</span> Workflows
              </NavLink>
              <NavLink to="/workflows" end className={navCls}>
                <span className="nav-icon">🗂</span> My Adoptions
              </NavLink>
            </>
          )}

          <div className="sidebar-section-label">My Tasks</div>
          <NavLink to="/tasks" end className={navCls}>
            <span className="nav-icon">📋</span> All Tasks
            {pendingCount > 0 && <span className="nav-badge">{pendingCount}</span>}
          </NavLink>
          <NavLink to="/tasks/search" className={navCls}>
            <span className="nav-icon">🔍</span> Search Tasks
          </NavLink>

          {!isShop && isShelterAdmin && (
            <>
              <div className="sidebar-section-label">Admin Console</div>
              <NavLink to="/admin/workflows" className={navCls}>
                <span className="nav-icon">🗂</span> Adoption Status
              </NavLink>
            </>
          )}
        </nav>
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
