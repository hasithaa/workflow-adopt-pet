import { useState, useEffect, useCallback } from 'react';
import StatusBadge, { roleColor } from './StatusBadge';
import {
  getHumanTask,
  completeHumanTask,
  failHumanTask,
  cancelHumanTask,
  USER_CONTEXT_CHANGED_EVENT,
} from '../api/managementApi';

function isRunningStatus(status) {
  return String(status || '').toUpperCase() === 'RUNNING';
}

function parseSchema(schema) {
  if (!schema || typeof schema !== 'string') return null;
  try {
    const parsed = JSON.parse(schema);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function schemaType(schema) {
  if (!schema || typeof schema !== 'object') return undefined;
  if (Array.isArray(schema.type)) return schema.type.find(t => t !== 'null') || schema.type[0];
  return schema.type;
}

function initialFormValues(schema) {
  const props = schema?.properties;
  if (!props || typeof props !== 'object') return {};
  const values = {};
  for (const [field, fieldSchema] of Object.entries(props)) {
    const type = schemaType(fieldSchema);
    if (type === 'boolean') { values[field] = fieldSchema.default === true; continue; }
    if (type === 'array' || type === 'object') {
      values[field] = fieldSchema.default !== undefined ? JSON.stringify(fieldSchema.default, null, 2) : '';
      continue;
    }
    values[field] = fieldSchema.default !== undefined ? String(fieldSchema.default) : '';
  }
  return values;
}

function resultFromForm(schema, formValues) {
  const props = schema?.properties;
  if (!props || typeof props !== 'object') return {};
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  const result = {};
  for (const [field, fieldSchema] of Object.entries(props)) {
    const type = schemaType(fieldSchema);
    const raw = formValues[field];
    if (type === 'boolean') { result[field] = !!raw; continue; }
    const trimmed = String(raw ?? '').trim();
    if (!trimmed) {
      if (required.has(field)) throw new Error(`Field '${field}' is required`);
      continue;
    }
    if (type === 'number') {
      const num = Number(trimmed);
      if (Number.isNaN(num)) throw new Error(`Field '${field}' must be a number`);
      result[field] = num; continue;
    }
    if (type === 'integer') {
      const num = Number(trimmed);
      if (!Number.isInteger(num)) throw new Error(`Field '${field}' must be an integer`);
      result[field] = num; continue;
    }
    if (type === 'array' || type === 'object') {
      let parsed;
      try { parsed = JSON.parse(trimmed); } catch { throw new Error(`Field '${field}' must be valid JSON`); }
      if (type === 'array' && !Array.isArray(parsed)) throw new Error(`Field '${field}' must be a JSON array`);
      if (type === 'object' && (!parsed || Array.isArray(parsed) || typeof parsed !== 'object')) {
        throw new Error(`Field '${field}' must be a JSON object`);
      }
      result[field] = parsed; continue;
    }
    result[field] = trimmed;
  }
  return result;
}

function formFromJson(schema, jsonText, currentValues) {
  const props = schema?.properties;
  if (!props || typeof props !== 'object') return currentValues;
  try {
    const parsed = JSON.parse(jsonText);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return currentValues;
    const next = { ...currentValues };
    for (const [field, fieldSchema] of Object.entries(props)) {
      if (!(field in parsed)) continue;
      const value = parsed[field];
      const type = schemaType(fieldSchema);
      if (type === 'boolean') next[field] = !!value;
      else if (type === 'array' || type === 'object') next[field] = JSON.stringify(value, null, 2);
      else next[field] = value === null || value === undefined ? '' : String(value);
    }
    return next;
  } catch {
    return currentValues;
  }
}

export function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export function PayloadTable({ payload }) {
  if (!payload || Object.keys(payload).length === 0) return <span className="ht-empty">—</span>;
  return (
    <table className="payload-table">
      <tbody>
        {Object.entries(payload).map(([k, v]) => (
          <tr key={k}>
            <td className="payload-key">{k}</td>
            <td className="payload-val">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CompleteForm({ taskId, formSchema, onDone, onCancel }) {
  const parsed = parseSchema(formSchema);
  const schemaObj = parsed && parsed.type === 'object' && parsed.properties ? parsed : null;

  const [activeTab, setActiveTab] = useState(schemaObj ? 'form' : 'json');
  const [formValues, setFormValues] = useState(() => initialFormValues(schemaObj));
  const [resultJson, setResultJson] = useState(() => {
    try { return JSON.stringify(resultFromForm(schemaObj, initialFormValues(schemaObj)), null, 2); }
    catch { return '{\n  \n}'; }
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const values = initialFormValues(schemaObj);
    setFormValues(values);
    setActiveTab(schemaObj ? 'form' : 'json');
    try { setResultJson(JSON.stringify(resultFromForm(schemaObj, values), null, 2)); }
    catch { setResultJson('{\n  \n}'); }
  }, [formSchema]);

  const syncJson = (next) => {
    try { setResultJson(JSON.stringify(resultFromForm(schemaObj, next), null, 2)); } catch { /* keep */ }
  };

  const submit = async () => {
    let result;
    if (activeTab === 'form' && schemaObj) {
      try { result = resultFromForm(schemaObj, formValues); }
      catch (e) { setError(e.message || 'Invalid form values'); return; }
    } else {
      try { result = JSON.parse(resultJson); }
      catch { setError('Invalid JSON — please check your input'); return; }
    }
    setSubmitting(true); setError(null);
    try { await completeHumanTask(taskId, result); onDone(); }
    catch (e) { setError(e.message); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="complete-form">
      <div className="complete-form-label">Task Result</div>
      <div className="tabs modal-tabs">
        {schemaObj && (
          <button className={`tab-btn${activeTab === 'form' ? ' active' : ''}`} onClick={() => setActiveTab('form')} type="button">Form</button>
        )}
        <button className={`tab-btn${activeTab === 'json' ? ' active' : ''}`} onClick={() => setActiveTab('json')} type="button">JSON</button>
      </div>

      {activeTab === 'form' && schemaObj && (
        <div className="modal-form-grid" style={{ marginTop: 10 }}>
          {Object.entries(schemaObj.properties).map(([field, fieldSchema]) => {
            const type = schemaType(fieldSchema);
            const required = (schemaObj.required || []).includes(field);
            const label = `${field}${required ? ' *' : ''}`;
            if (type === 'boolean') {
              return (
                <label key={field} className="modal-form-field modal-check-row">
                  <input type="checkbox" checked={!!formValues[field]}
                    onChange={e => { const next = { ...formValues, [field]: e.target.checked }; setFormValues(next); syncJson(next); }} />
                  <span>{label}</span>
                </label>
              );
            }
            const structured = type === 'object' || type === 'array';
            return (
              <label key={field} className="modal-form-field">
                <span className="modal-label">{label}</span>
                {structured ? (
                  <textarea className="result-textarea modal-field-textarea" rows={4} value={formValues[field] ?? ''}
                    onChange={e => { const next = { ...formValues, [field]: e.target.value }; setFormValues(next); syncJson(next); }}
                    spellCheck={false} />
                ) : (
                  <input className="filter-input" value={formValues[field] ?? ''}
                    onChange={e => { const next = { ...formValues, [field]: e.target.value }; setFormValues(next); syncJson(next); }}
                    placeholder={type || 'string'} />
                )}
              </label>
            );
          })}
        </div>
      )}

      {activeTab === 'json' && (
        <textarea className="result-textarea" value={resultJson} rows={8} spellCheck={false}
          onChange={e => {
            setResultJson(e.target.value);
            if (schemaObj) setFormValues(prev => formFromJson(schemaObj, e.target.value, prev));
          }} />
      )}

      {!schemaObj && (
        <div className="modal-field-help" style={{ marginTop: 8 }}>
          No form schema for this task — enter the result as JSON.
        </div>
      )}

      {error && <div className="complete-error">{error}</div>}
      <div className="complete-actions">
        <button className="search-btn" onClick={submit} disabled={submitting}>
          {submitting ? 'Completing…' : 'Complete Task'}
        </button>
        <button className="back-btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export function FailForm({ taskId, onDone, onCancel }) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    if (!reason.trim()) { setError('Reason is required'); return; }
    setSubmitting(true); setError(null);
    try { await failHumanTask(taskId, reason.trim()); onDone(); }
    catch (e) { setError(e.message); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="complete-form">
      <div className="complete-form-label">Rejection Reason</div>
      <textarea className="result-textarea" value={reason} onChange={e => setReason(e.target.value)}
        rows={3} placeholder="Enter the reason for rejection…" />
      {error && <div className="complete-error">{error}</div>}
      <div className="complete-actions">
        <button className="fail-task-btn" onClick={submit} disabled={submitting}>
          {submitting ? 'Rejecting…' : 'Confirm Rejection'}
        </button>
        <button className="back-btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export function CancelConfirm({ taskId, onDone, onCancel }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const confirm = async () => {
    setSubmitting(true); setError(null);
    try { await cancelHumanTask(taskId); onDone(); }
    catch (e) { setError(e.message); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="complete-form">
      <div className="cancel-confirm-msg">Cancel this task? The parent workflow will receive a cancellation error.</div>
      {error && <div className="complete-error">{error}</div>}
      <div className="complete-actions">
        <button className="cancel-task-btn" onClick={confirm} disabled={submitting}>
          {submitting ? 'Canceling…' : 'Confirm Cancel'}
        </button>
        <button className="back-btn" onClick={onCancel}>Back</button>
      </div>
    </div>
  );
}

export function TaskRow({ task, isSelected, onClick }) {
  const isPending = isRunningStatus(task.status);
  return (
    <div className={`ht-row${isSelected ? ' selected' : ''}`} onClick={onClick}>
      <div className="ht-row-main">
        <span className={`ht-indicator${isPending ? ' pending' : ''}`} />
        <div className="ht-row-info">
          <div className="ht-title">{task.title || task.taskName}</div>
          <div className="ht-sub">
            <span className="ht-name">{task.taskName}</span>
            {task.parentWorkflowId && <span className="ht-parent" title={task.parentWorkflowId}>↑ {task.parentWorkflowId}</span>}
          </div>
        </div>
        <div className="ht-row-right">
          <StatusBadge status={task.status} />
          <div className="ht-time">{fmtTime(task.createdAt)}</div>
        </div>
      </div>
    </div>
  );
}

export function TaskDetailPanel({ taskId, onClose, onActionDone }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [action, setAction] = useState(null);

  const load = useCallback(() => {
    if (!taskId) return;
    setLoading(true); setError(null);
    getHumanTask(taskId)
      .then(d => setDetail(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [taskId]);

  useEffect(load, [load]);

  useEffect(() => {
    const onChange = () => { setAction(null); load(); };
    window.addEventListener(USER_CONTEXT_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(USER_CONTEXT_CHANGED_EVENT, onChange);
  }, [load]);

  const actionDone = () => { setAction(null); load(); if (onActionDone) onActionDone(); };

  return (
    <div className="task-detail-panel">
      <div className="task-detail-header">
        <button className="back-btn" onClick={onClose}>← Back</button>
        {detail && <StatusBadge status={detail.status} />}
      </div>

      {loading && <div className="loading">Loading…</div>}
      {error && <div className="error-msg">{error}</div>}

      {detail && !action && (
        <div className="task-detail-body">
          <div className="task-detail-title">{detail.title || detail.taskName}</div>
          <div className="task-detail-sub">{detail.taskId}</div>

          {detail.description && (
            <div className="task-detail-section">
              <div className="task-section-label">Description</div>
              <div className="task-detail-desc">{detail.description}</div>
            </div>
          )}

          <div className="task-detail-grid">
            <div className="task-meta-card">
              <div className="task-meta-label">Task Name</div>
              <div className="task-meta-value">{detail.taskName || '—'}</div>
            </div>
            <div className="task-meta-card">
              <div className="task-meta-label">Status</div>
              <div className="task-meta-value"><StatusBadge status={detail.status} /></div>
            </div>
            <div className="task-meta-card">
              <div className="task-meta-label">Allowed Roles</div>
              <div className="task-meta-value">
                {detail.userRoles?.length
                  ? detail.userRoles.map(r => <span key={r} className="role-pill" style={{ color: roleColor(r), borderColor: roleColor(r) + '40', background: roleColor(r) + '18' }}>{r}</span>)
                  : '—'}
              </div>
            </div>
            <div className="task-meta-card">
              <div className="task-meta-label">Created</div>
              <div className="task-meta-value">{fmtTime(detail.createdAt)}</div>
            </div>
            <div className="task-meta-card">
              <div className="task-meta-label">Parent Workflow</div>
              <div className="task-meta-value mono" title={detail.parentWorkflowId}>{detail.parentWorkflowId || '—'}</div>
            </div>
            <div className="task-meta-card">
              <div className="task-meta-label">Closed</div>
              <div className="task-meta-value">{fmtTime(detail.closeTime)}</div>
            </div>
          </div>

          <div className="task-detail-section">
            <div className="task-section-label">Payload (read-only context)</div>
            <PayloadTable payload={detail.payload} />
          </div>

          {detail.completedBy && (
            <div className="task-detail-section">
              <div className="task-section-label">Completed by</div>
              <div className="task-detail-desc">{detail.completedBy} &nbsp;·&nbsp; {fmtTime(detail.completedAt)}</div>
            </div>
          )}

          {isRunningStatus(detail.status) && (
            <div className="task-actions">
              <button className="search-btn" onClick={() => setAction('complete')} disabled={detail.canComplete === false}
                title={detail.canComplete === false ? 'Current user lacks a required role' : ''}>
                Complete Task
              </button>
              <button className="fail-task-btn" onClick={() => setAction('fail')} disabled={detail.canComplete === false}>
                Reject / Fail
              </button>
              <button className="cancel-task-btn" onClick={() => setAction('cancel')} disabled={detail.canComplete === false}>
                Cancel Task
              </button>
            </div>
          )}

          {isRunningStatus(detail.status) && detail.canComplete === false && (
            <div className="task-actions-note">
              You cannot act on this task as <strong>{detail.userRoles?.join(', ') || 'the required role'}</strong> is needed.
              Switch to a user with one of the allowed roles.
            </div>
          )}
        </div>
      )}

      {action === 'complete' && (
        <CompleteForm taskId={taskId} formSchema={detail?.formSchema} onDone={actionDone} onCancel={() => setAction(null)} />
      )}
      {action === 'fail' && <FailForm taskId={taskId} onDone={actionDone} onCancel={() => setAction(null)} />}
      {action === 'cancel' && <CancelConfirm taskId={taskId} onDone={actionDone} onCancel={() => setAction(null)} />}
    </div>
  );
}
