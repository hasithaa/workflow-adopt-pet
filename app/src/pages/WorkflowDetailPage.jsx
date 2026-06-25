import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge';
import {
  getWorkflow, listWorkflows, getHistory, getActivityTree, listHumanTasks,
  suspendWorkflow, resumeWorkflow, terminateWorkflow, cancelWorkflow, hasRole,
} from '../api/managementApi';

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function coalesce(...values) {
  for (const v of values) if (v !== null && v !== undefined) return v;
  return null;
}

function JsonBlock({ label, data }) {
  const isEmpty = data === null || data === undefined;
  const str = isEmpty ? null : (typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  return (
    <div className="io-card">
      <div className="io-label">{label}</div>
      {isEmpty ? <span className="io-empty">—</span> : <pre className="io-json">{str}</pre>}
    </div>
  );
}

function MetaCard({ label, children }) {
  return <div className="meta-card"><div className="meta-label">{label}</div><div className="meta-value">{children}</div></div>;
}

// ── Temporal payload decoding (workflow input/output live in history) ──
function decodePayload(payload) {
  const encoded = payload?.data;
  if (!encoded || typeof encoded !== 'string') return null;
  try { return JSON.parse(atob(encoded)); } catch { return null; }
}
function decodeContainer(container) {
  const payloads = container?.payloads;
  if (!Array.isArray(payloads) || payloads.length === 0) return null;
  const decoded = payloads.map(decodePayload)
    .filter(v => v !== null && v !== undefined)
    .filter(v => !(v && typeof v === 'object' && v.__callConfig__ === true));
  if (decoded.length === 0) return null;
  return decoded.length === 1 ? decoded[0] : decoded;
}
function historyInput(events) {
  if (!Array.isArray(events)) return null;
  const started = events.find(e => e?.eventType === 'WORKFLOW_EXECUTION_STARTED');
  return decodeContainer(started?.attributes?.input);
}
function historyOutput(events) {
  if (!Array.isArray(events)) return null;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i]?.eventType === 'WORKFLOW_EXECUTION_COMPLETED') {
      return decodeContainer(events[i]?.attributes?.result);
    }
  }
  return null;
}

const NODE_ICONS = { ACTIVITY: '⚙', TIMER: '⏱', SIGNAL: '📡', CHILD_WORKFLOW: '⬡', HUMAN_TASK: '👤', RETRY_TASK: '🔄' };
const STATUS_CLASSES = { COMPLETED: 'node-completed', FAILED: 'node-failed', RUNNING: 'node-running', TIMED_OUT: 'node-timed-out', CANCELED: 'node-canceled' };

function ActivityTreeView({ workflowId, runId }) {
  const [nodes, setNodes] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    getActivityTree(workflowId, runId)
      .then(d => setNodes(d.nodes || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [workflowId, runId]);

  if (loading) return <div className="loading">Loading activity tree…</div>;
  if (error) return <div className="error-msg">Activity tree: {error}</div>;
  if (!nodes?.length) return <div className="loading">No execution steps recorded yet.</div>;

  return (
    <div className="activity-tree">
      {nodes.map((node, i) => {
        const icon = NODE_ICONS[node.type] || '•';
        const cls = STATUS_CLASSES[node.status] || 'node-running';
        const open = !!expanded[node.id];
        const hasDetail = node.input || node.output || node.failure;
        return (
          <div key={node.id} className={`tree-node ${cls}`}>
            <span className="tree-node-num">{i + 1}</span>
            <div className="tree-node-header" onClick={() => hasDetail && setExpanded(e => ({ ...e, [node.id]: !open }))}>
              <span className="tree-node-icon">{icon}</span>
              <span className="tree-node-name">{node.name}</span>
              <span className="tree-node-type">{node.type}</span>
              <StatusBadge status={node.status} />
              {node.attempt > 1 && <span className="tree-node-attempt">attempt {node.attempt}</span>}
              <span className="tree-node-time">{fmtTime(node.startTime)}</span>
              {node.endTime && <span className="tree-node-duration">→ {fmtTime(node.endTime)}</span>}
              {hasDetail && <span className="tree-chevron">{open ? '▼' : '▶'}</span>}
            </div>
            {open && (
              <div className="tree-node-detail">
                {node.failure && (
                  <div className="tree-failure">
                    <span>❌ {node.failure.message}</span>
                    {node.failure.type && <span className="tree-fail-type"> [{node.failure.type}]</span>}
                  </div>
                )}
                {node.input && <JsonBlock label="Input" data={node.input} />}
                {node.output && <JsonBlock label="Output" data={node.output} />}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PendingHumanTasks({ workflowId }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    listHumanTasks({ status: 'PENDING', parentWorkflowId: workflowId, limit: 20 })
      .then(d => setTasks(d.items || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [workflowId]);
  if (loading || tasks.length === 0) return null;
  return (
    <div className="pending-tasks-section">
      <div className="section-heading">Pending Human Tasks <span className="section-count">({tasks.length})</span></div>
      <div className="pending-tasks-list">
        {tasks.map(t => (
          <Link key={t.taskId} to="/tasks/search" className="pending-task-row">
            <span className="ht-indicator pending" />
            <div className="pending-task-info"><span className="pending-task-title">{t.title || t.taskName}</span></div>
            <div className="pending-task-roles">{(t.userRoles || []).map(r => <span key={r} className="role-pill">{r}</span>)}</div>
            <StatusBadge status={t.status} />
          </Link>
        ))}
      </div>
    </div>
  );
}

function LifecycleActions({ workflowId, runId, status, onRefresh }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const act = async (label, fn) => {
    setBusy(label); setError(null);
    try { await fn(); onRefresh(); } catch (e) { setError(e.message); } finally { setBusy(null); }
  };
  const isRunning = status === 'Running' || status === 'RUNNING';
  const isSuspended = status === 'Suspended' || status === 'SUSPENDED';
  return (
    <div className="lifecycle-actions">
      {isRunning && (
        <>
          <button className="back-btn" disabled={!!busy} onClick={() => act('Suspend', () => suspendWorkflow(workflowId, runId))}>{busy === 'Suspend' ? '…' : '⏸ Suspend'}</button>
          <button className="back-btn" disabled={!!busy} onClick={() => act('Cancel', () => cancelWorkflow(workflowId, runId))}>{busy === 'Cancel' ? '…' : '✕ Cancel'}</button>
          <button className="cancel-task-btn" disabled={!!busy} onClick={() => act('Terminate', () => terminateWorkflow(workflowId, runId, 'Manual termination'))}>{busy === 'Terminate' ? '…' : '⛔ Terminate'}</button>
        </>
      )}
      {isSuspended && (
        <button className="search-btn" disabled={!!busy} onClick={() => act('Resume', () => resumeWorkflow(workflowId, runId))}>{busy === 'Resume' ? '…' : '▶ Resume'}</button>
      )}
      {error && <span className="complete-error" style={{ marginLeft: 8 }}>{error}</span>}
    </div>
  );
}

export default function WorkflowDetailPage() {
  const { workflowId, runId } = useParams();
  const navigate = useNavigate();
  const [isAdmin] = useState(() => hasRole('shelter_admin')); // lifecycle actions are admin-only
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = () => {
    setLoading(true); setError(null);
    Promise.all([
      getWorkflow(workflowId, runId),
      getHistory(workflowId, runId).catch(() => ({ events: [] })),
      listWorkflows({ workflowId, limit: 100 }).catch(() => ({ items: [] })),
    ])
      .then(([d, historyResp, listResp]) => {
        const events = historyResp?.events || [];
        const summary = (listResp?.items || []).find(i => i.workflowId === workflowId && i.runId === runId) || {};
        setDetail({
          ...summary,
          ...d,
          startTime: coalesce(d?.startTime, summary?.startTime),
          closeTime: coalesce(d?.closeTime, summary?.closeTime),
          status: coalesce(d?.status, summary?.status),
          workflowType: coalesce(d?.workflowType, summary?.workflowType),
          input: coalesce(d?.input, summary?.input, d?.workflowInput, historyInput(events)),
          output: coalesce(d?.output, d?.result, summary?.output, historyOutput(events)),
        });
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setDetail(null); load(); }, [workflowId, runId]);

  // Initiators (Shop) see only status + input + output. The operational view —
  // metadata, activity timeline, pending tasks, lifecycle actions — is admin-only.
  return (
    <div className="page detail-page">
      <div className="page-header detail-header">
        <button className="back-btn" onClick={() => navigate(-1)}>← Back</button>
        <div className="detail-title-block">
          <h2 className="page-title mono">{workflowId}</h2>
          <div className="detail-run-id">Run ID: <span className="mono">{runId}</span></div>
        </div>
        {detail && <StatusBadge status={detail.status} />}
        {detail && isAdmin && <LifecycleActions workflowId={workflowId} runId={runId} status={detail.status} onRefresh={load} />}
      </div>

      {loading && <div className="loading">Loading…</div>}
      {error && <div className="error-msg">{error}</div>}

      {detail && (
        <div style={{ marginTop: 16 }}>
          <div className="io-section">
            <JsonBlock label="📥 Input" data={detail.input} />
            {detail.errorMessage ? (
              <div className="io-card io-error-card">
                <div className="io-label">❌ Failure</div>
                <div className="io-failure-msg">{detail.errorMessage}</div>
              </div>
            ) : (
              <JsonBlock label="📤 Output" data={detail.output} />
            )}
          </div>

          {isAdmin && (
            <>
              <div className="meta-grid">
                <MetaCard label="Workflow Type">{detail.workflowType || '—'}</MetaCard>
                <MetaCard label="Status"><StatusBadge status={detail.status} /></MetaCard>
                <MetaCard label="Initiated By">{detail.input?.initiatedBy || '—'}</MetaCard>
                <MetaCard label="Initiator Role">{detail.input?.initiatorRole || '—'}</MetaCard>
                <MetaCard label="Start Time">{fmtTime(detail.startTime)}</MetaCard>
                <MetaCard label="Close Time">{fmtTime(detail.closeTime)}</MetaCard>
              </div>

              <PendingHumanTasks workflowId={workflowId} />

              <div className="section-heading" style={{ marginTop: 4 }}>Activity Timeline</div>
              <ActivityTreeView workflowId={workflowId} runId={runId} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
