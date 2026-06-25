import { useState, useCallback } from 'react';
import { TaskDetailPanel, TaskRow } from '../components/TaskDetail';
import { listHumanTasks } from '../api/managementApi';

const STATUS_OPTIONS = ['All', 'Pending', 'Completed'];
const STATUS_MAP = { All: '', Pending: 'Running', Completed: 'Completed' };

export default function HumanTaskSearchPage() {
  const [activeTab, setActiveTab] = useState('byId');

  const [idInput, setIdInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [taskNameFilter, setTaskNameFilter] = useState('');
  const [parentFilter, setParentFilter] = useState('');

  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);
  const [nextToken, setNextToken] = useState(null);
  const [prevTokens, setPrevTokens] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [lastParams, setLastParams] = useState({});

  const fetchTasks = useCallback((params, token = null) => {
    setLoading(true); setError(null); setSearched(true);
    listHumanTasks({ limit: 30, ...params, ...(token ? { pageToken: token } : {}) })
      .then(d => { setResults(d.items || []); setNextToken(d.nextPageToken || null); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const buildParams = () => {
    const p = {};
    const statusVal = STATUS_MAP[statusFilter];
    if (statusVal) p.status = statusVal;
    if (taskNameFilter.trim()) p.taskName = taskNameFilter.trim();
    if (parentFilter.trim()) p.parentWorkflowId = parentFilter.trim();
    return p;
  };

  const handleSearch = () => {
    const params = buildParams();
    setLastParams(params); setPrevTokens([]); setNextToken(null); fetchTasks(params);
  };
  const handleFindById = () => {
    if (!idInput.trim()) return;
    const params = { taskId: idInput.trim() };
    setLastParams(params); setPrevTokens([]); setNextToken(null); fetchTasks(params);
  };

  const goNext = () => { setPrevTokens(p => [...p, nextToken]); fetchTasks(lastParams, nextToken); };
  const goPrev = () => { const t = [...prevTokens]; const prev = t.pop() ?? null; setPrevTokens(t); fetchTasks(lastParams, prev); };

  const switchTab = (tab) => {
    setActiveTab(tab); setResults([]); setSearched(false); setSelectedTaskId(null);
    setPrevTokens([]); setNextToken(null);
  };

  return (
    <div className="page ht-page">
      <div className="page-header">
        <h2 className="page-title">Search Tasks</h2>
      </div>

      <div className="ht-layout">
        <div className="ht-list-pane ht-search-pane">
          <div className="tabs">
            <button className={`tab-btn${activeTab === 'byId' ? ' active' : ''}`} onClick={() => switchTab('byId')}>🔍 Find by ID</button>
            <button className={`tab-btn${activeTab === 'search' ? ' active' : ''}`} onClick={() => switchTab('search')}>📋 Filter</button>
          </div>

          {activeTab === 'byId' && (
            <div className="tab-content">
              <div className="filter-row">
                <input className="filter-input filter-input-wide" placeholder="Enter Task ID (humantask-…)"
                  value={idInput} onChange={e => setIdInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleFindById()} />
                <button className="search-btn" onClick={handleFindById}>Find</button>
              </div>
            </div>
          )}

          {activeTab === 'search' && (
            <div className="tab-content">
              <div className="filters-body">
                <div className="filter-row">
                  <div className="filter-group">
                    <label className="filter-label">Status</label>
                    <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                      {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="filter-group">
                    <label className="filter-label">Task Name</label>
                    <input className="filter-input" placeholder="e.g. selectPet" value={taskNameFilter}
                      onChange={e => setTaskNameFilter(e.target.value)} />
                  </div>
                </div>
                <div className="filter-group">
                  <label className="filter-label">Parent Workflow ID</label>
                  <input className="filter-input filter-input-wide" placeholder="Filter by parent workflow"
                    value={parentFilter} onChange={e => setParentFilter(e.target.value)} />
                </div>
                <button className="search-btn" onClick={handleSearch}>Search</button>
              </div>
            </div>
          )}

          <div className="ht-list-body">
            {loading && <div className="loading">Loading…</div>}
            {error && <div className="error-msg">{error}</div>}
            {searched && !loading && !error && results.length === 0 && <div className="loading">No tasks found</div>}
            {results.map(task => (
              <TaskRow key={`${task.taskId}-${task.runId}`} task={task}
                isSelected={selectedTaskId === task.taskId}
                onClick={() => setSelectedTaskId(prev => prev === task.taskId ? null : task.taskId)} />
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
            <TaskDetailPanel taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} onActionDone={() => setSelectedTaskId(null)} />
          </div>
        )}
      </div>
    </div>
  );
}
