import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge';
import { listWorkflows, getSelectedUser, USER_CONTEXT_CHANGED_EVENT } from '../api/managementApi';

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export default function MyWorkflowsPage() {
  const navigate = useNavigate();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [nextToken, setNextToken] = useState(null);
  const [prevTokens, setPrevTokens] = useState([]);
  const [user, setUser] = useState(getSelectedUser());

  const load = useCallback((token = null) => {
    setLoading(true); setError(null);
    const startedBy = getSelectedUser()?.userId;
    listWorkflows({ limit: 30, ...(startedBy ? { startedBy } : {}), ...(token ? { pageToken: token } : {}) })
      .then(d => { setResults(d.items || []); setNextToken(d.nextPageToken || null); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { setPrevTokens([]); load(null); }, [load]);

  useEffect(() => {
    const onChange = () => { setUser(getSelectedUser()); setPrevTokens([]); load(null); };
    window.addEventListener(USER_CONTEXT_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(USER_CONTEXT_CHANGED_EVENT, onChange);
  }, [load]);

  const goNext = () => { setPrevTokens(p => [...p, nextToken]); load(nextToken); };
  const goPrev = () => { const t = [...prevTokens]; const prev = t.pop() ?? null; setPrevTokens(t); load(prev); };
  const open = (exec) => navigate(`/workflows/${encodeURIComponent(exec.workflowId)}/${encodeURIComponent(exec.runId)}`);

  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">My Adoptions</h2>
        <span className="type-count">{results.length} shown</span>
        <button className="refresh-btn" onClick={() => { setPrevTokens([]); load(null); }}>↺ Refresh</button>
      </div>
      <p className="page-subtitle">Adoption runs you started, as <strong>{user.name}</strong> — open one to see its status, input and result.</p>

      <div className="results-section">
        {loading && <div className="loading">Loading…</div>}
        {error && <div className="error-msg">{error}</div>}
        {!loading && !error && results.length === 0 && <div className="loading">You haven't started any adoptions yet.</div>}
        {results.map(exec => (
          <div className="result-row" key={`${exec.workflowId}-${exec.runId}`}>
            <div className="result-main" onClick={() => open(exec)} title="Open status">
              <span className="result-chevron">›</span>
              <span className="result-wfid" title={exec.workflowId}>{exec.workflowId}</span>
              <span className="result-type" title={exec.workflowType}>{exec.workflowType}</span>
              <StatusBadge status={exec.status} />
              <span className="result-time">{fmtTime(exec.startTime)}</span>
            </div>
          </div>
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
