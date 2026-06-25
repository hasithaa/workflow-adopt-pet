import { useState, useEffect, useCallback } from 'react';
import { TaskDetailPanel, TaskRow } from '../components/TaskDetail';
import { listHumanTasks, getSelectedUser, USER_CONTEXT_CHANGED_EVENT } from '../api/managementApi';

// Terminated/canceled tasks surface under "All" — there's no separate category.
const STATUS_TABS = ['Pending', 'Completed', 'All'];
const STATUS_MAP = { Pending: 'RUNNING', Completed: 'COMPLETED', All: '' };
const TITLE_MAP = { Pending: 'Pending Tasks', Completed: 'Completed Tasks', All: 'All Tasks' };

export default function HumanTasksPage({ defaultTab = 'Pending' }) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [nextToken, setNextToken] = useState(null);
  const [prevTokens, setPrevTokens] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [user, setUser] = useState(getSelectedUser());

  const load = useCallback((token = null) => {
    setLoading(true); setError(null);
    const params = { limit: 30 };
    const statusVal = STATUS_MAP[activeTab];
    if (statusVal) params.status = statusVal;
    if (token) params.pageToken = token;
    listHumanTasks(params)
      .then(d => { setTasks(d.items || []); setNextToken(d.nextPageToken || null); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [activeTab]);

  useEffect(() => { setPrevTokens([]); setNextToken(null); load(null); }, [load]);

  useEffect(() => {
    const onChange = () => {
      setUser(getSelectedUser());
      setSelectedTaskId(null); setPrevTokens([]); setNextToken(null); load(null);
    };
    window.addEventListener(USER_CONTEXT_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(USER_CONTEXT_CHANGED_EVENT, onChange);
  }, [load]);

  const goNext = () => { setPrevTokens(p => [...p, nextToken]); load(nextToken); };
  const goPrev = () => { const t = [...prevTokens]; const prev = t.pop() ?? null; setPrevTokens(t); load(prev); };
  const switchTab = (tab) => { setActiveTab(tab); setSelectedTaskId(null); };
  const handleSelect = (taskId) => setSelectedTaskId(prev => prev === taskId ? null : taskId);

  return (
    <div className="page ht-page">
      <div className="page-header">
        <h2 className="page-title">{TITLE_MAP[defaultTab] ?? 'Human Tasks'}</h2>
        <button className="refresh-btn" onClick={() => load(null)}>↺ Refresh</button>
      </div>
      <p className="page-subtitle">
        Showing tasks visible to <strong>{user.name}</strong> ({user.roles}). Tasks you can act on
        are highlighted; others are read-only.
      </p>

      <div className="ht-layout">
        <div className="ht-list-pane">
          <div className="tabs">
            {STATUS_TABS.map(tab => (
              <button key={tab} className={`tab-btn${activeTab === tab ? ' active' : ''}`} onClick={() => switchTab(tab)}>{tab}</button>
            ))}
          </div>

          <div className="ht-list-body">
            {loading && <div className="loading">Loading…</div>}
            {error && <div className="error-msg">{error}</div>}
            {!loading && !error && tasks.length === 0 && (
              <div className="loading">No {activeTab.toLowerCase()} tasks found</div>
            )}
            {tasks.map(task => (
              <TaskRow key={`${task.taskId}-${task.runId}`} task={task}
                isSelected={selectedTaskId === task.taskId} onClick={() => handleSelect(task.taskId)} />
            ))}
          </div>

          {(prevTokens.length > 0 || nextToken) && (
            <div className="pagination">
              <button className="page-btn" disabled={prevTokens.length === 0} onClick={goPrev}>← Prev</button>
              <span className="page-info">Page {prevTokens.length + 1}</span>
              <button className="page-btn" disabled={!nextToken} onClick={goNext}>Next →</button>
            </div>
          )}
        </div>

        {selectedTaskId && (
          <div className="ht-detail-pane">
            <TaskDetailPanel taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} onActionDone={() => load(null)} />
          </div>
        )}
      </div>
    </div>
  );
}
