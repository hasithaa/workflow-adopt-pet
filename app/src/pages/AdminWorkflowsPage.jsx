import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge';
import { listWorkflows, hasRole, USER_CONTEXT_CHANGED_EVENT } from '../api/managementApi';

const STATUS_OPTIONS = ['All', 'Running', 'Completed', 'Failed', 'Canceled', 'Terminated', 'TimedOut'];

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function Row({ exec, onOpen }) {
  return (
    <div className="result-row">
      <div className="result-main" onClick={onOpen} title="Open workflow details">
        <span className="result-chevron">›</span>
        <span className="result-wfid" title={exec.workflowId}>{exec.workflowId}</span>
        <span className="result-type" title={exec.workflowType}>{exec.workflowType}</span>
        <StatusBadge status={exec.status} />
        <span className="result-time">{fmtTime(exec.startTime)}</span>
      </div>
    </div>
  );
}

export default function AdminWorkflowsPage() {
  const navigate = useNavigate();
  const [allowed] = useState(() => hasRole('shelter_admin'));
  const [statusFilter, setStatusFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('');
  const [idInput, setIdInput] = useState('');

  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [nextToken, setNextToken] = useState(null);
  const [prevTokens, setPrevTokens] = useState([]);

  const buildParams = useCallback(() => {
    const p = {};
    if (statusFilter !== 'All') p.status = statusFilter;
    if (typeFilter.trim()) p.workflowType = typeFilter.trim();
    if (idInput.trim()) p.workflowId = idInput.trim();
    return p;
  }, [statusFilter, typeFilter, idInput]);

  const load = useCallback((token = null) => {
    setLoading(true); setError(null);
    listWorkflows({ limit: 30, ...buildParams(), ...(token ? { pageToken: token } : {}) })
      .then(d => { setResults(d.items || []); setNextToken(d.nextPageToken || null); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [buildParams]);

  useEffect(() => { if (allowed) { setPrevTokens([]); load(null); } else { setLoading(false); } }, [allowed, load]);

  useEffect(() => {
    const onChange = () => { setPrevTokens([]); if (hasRole('shelter_admin')) load(null); };
    window.addEventListener(USER_CONTEXT_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(USER_CONTEXT_CHANGED_EVENT, onChange);
  }, [load]);

  const search = () => { setPrevTokens([]); setNextToken(null); load(null); };
  const goNext = () => { setPrevTokens(p => [...p, nextToken]); load(nextToken); };
  const goPrev = () => { const t = [...prevTokens]; const prev = t.pop() ?? null; setPrevTokens(t); load(prev); };

  if (!allowed) {
    return (
      <div className="page">
        <div className="page-header"><h2 className="page-title">Adoption Status</h2></div>
        <div className="notice">
          The adoption status console is available to <strong>shelter_admin</strong> users.<br />
          Switch to a Shelter Admin (e.g. Dana or Evan) to view all adoption workflows.
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">Adoption Status</h2>
        <span className="type-count">{results.length} shown</span>
        <button className="refresh-btn" onClick={() => { setPrevTokens([]); load(null); }}>↺ Refresh</button>
      </div>
      <p className="page-subtitle">Admin console — all adoption workflow runs across every shop, with live status.</p>

      <div className="filters-body">
        <div className="filter-row">
          <div className="filter-group">
            <label className="filter-label">Status</label>
            <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label className="filter-label">Workflow Type</label>
            <input className="filter-input" placeholder="e.g. adoptPet" value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)} />
          </div>
          <div className="filter-group">
            <label className="filter-label">Workflow ID</label>
            <input className="filter-input" placeholder="exact id" value={idInput}
              onChange={e => setIdInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} />
          </div>
          <button className="search-btn" onClick={search}>Search</button>
        </div>
      </div>

      <div className="results-section">
        {loading && <div className="loading">Loading…</div>}
        {error && <div className="error-msg">{error}</div>}
        {!loading && !error && results.length === 0 && <div className="loading">No workflows found</div>}
        {results.map(exec => (
          <Row key={`${exec.workflowId}-${exec.runId}`} exec={exec}
            onOpen={() => navigate(`/workflows/${encodeURIComponent(exec.workflowId)}/${encodeURIComponent(exec.runId)}`)} />
        ))}
        {(prevTokens.length > 0 || nextToken) && (
          <div className="pagination">
            <button className="page-btn" disabled={prevTokens.length === 0} onClick={goPrev}>← Prev</button>
            <span className="page-info">Page {prevTokens.length + 1}</span>
            <button className="page-btn" disabled={!nextToken} onClick={goNext}>Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}
