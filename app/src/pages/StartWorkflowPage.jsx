import { useState, useEffect, useCallback, useMemo } from 'react';
import { getDefinitions, startWorkflow, getInitiatorContext, getSelectedUser } from '../api/managementApi';

// Filled automatically by the App from the signed-in user — never shown as
// editable form fields.
const MANAGED_FIELDS = new Set(['initiatedBy', 'initiatorRole']);

function parseSchema(inputSchema) {
  if (!inputSchema || typeof inputSchema !== 'string') return null;
  try {
    const parsed = JSON.parse(inputSchema);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function schemaType(schema) {
  if (!schema || typeof schema !== 'object') return undefined;
  if (Array.isArray(schema.type)) return schema.type.find(t => t !== 'null') || schema.type[0];
  return schema.type;
}

function initialValues(schema) {
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

function inputFromForm(schema, formValues) {
  const props = schema?.properties;
  if (!props || typeof props !== 'object') return {};
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  const input = {};
  for (const [field, fieldSchema] of Object.entries(props)) {
    if (MANAGED_FIELDS.has(field)) continue; // App injects these on launch
    const type = schemaType(fieldSchema);
    const raw = formValues[field];
    if (type === 'boolean') { input[field] = !!raw; continue; }
    const trimmed = String(raw ?? '').trim();
    if (!trimmed) { if (required.has(field)) throw new Error(`Field '${field}' is required`); continue; }
    if (type === 'number') { const n = Number(trimmed); if (Number.isNaN(n)) throw new Error(`Field '${field}' must be a number`); input[field] = n; continue; }
    if (type === 'integer') { const n = Number(trimmed); if (!Number.isInteger(n)) throw new Error(`Field '${field}' must be an integer`); input[field] = n; continue; }
    if (type === 'array' || type === 'object') {
      let parsed;
      try { parsed = JSON.parse(trimmed); } catch { throw new Error(`Field '${field}' must be valid JSON`); }
      input[field] = parsed; continue;
    }
    input[field] = trimmed;
  }
  return input;
}

function LaunchModal({ workflowType, inputSchema, onClose }) {
  const parsed = useMemo(() => parseSchema(inputSchema), [inputSchema]);
  const formSchema = useMemo(() => {
    if (!parsed) return null;
    if (schemaType(parsed) === 'object' || parsed.properties) return parsed;
    return null;
  }, [parsed]);

  const [activeTab, setActiveTab] = useState(formSchema ? 'form' : 'json');
  const [formValues, setFormValues] = useState(() => initialValues(formSchema));
  const [inputJson, setInputJson] = useState('{\n  \n}');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    const values = initialValues(formSchema);
    setFormValues(values);
    if (formSchema) {
      try { setInputJson(JSON.stringify(inputFromForm(formSchema, values), null, 2)); }
      catch { setInputJson('{\n  \n}'); }
      setActiveTab('form');
    } else {
      setInputJson('{\n  \n}'); setActiveTab('json');
    }
    setError(null); setSuccess(null);
  }, [formSchema, workflowType]);

  const fields = formSchema?.properties
    ? Object.entries(formSchema.properties).filter(([f]) => !MANAGED_FIELDS.has(f))
    : [];

  const initiator = getInitiatorContext();

  const launch = async () => {
    let input;
    try {
      input = (activeTab === 'form' && formSchema) ? inputFromForm(formSchema, formValues) : JSON.parse(inputJson);
    } catch (e) { setError(e.message || 'Invalid input'); return; }
    // The App stamps who is initiating so the workflow can scope the Select-Pet
    // human task to this shop's role. User-supplied fields win if present.
    input = { initiatedBy: initiator.initiatedBy, initiatorRole: initiator.initiatorRole, ...input };
    setSubmitting(true); setError(null);
    try {
      const data = await startWorkflow({ workflowType, input });
      setSuccess(data.workflowId || 'Workflow started');
    } catch (e) { setError(e.message); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-header">
          <div className="modal-title">
            <span className="modal-title-icon">▶</span>
            Start <span className="modal-wf-type">{workflowType}</span>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {success ? (
          <div className="modal-success">
            <div className="modal-success-icon">✓</div>
            <div className="modal-success-msg">Adoption workflow started</div>
            <div className="modal-success-id">{success}</div>
            <div className="modal-success-actions">
              <button className="search-btn" onClick={onClose}>Done</button>
              <button className="back-btn" onClick={() => setSuccess(null)}>Start Another</button>
            </div>
          </div>
        ) : (
          <>
            <div className="modal-body">
              <div className="initiator-note">
                Initiated by <code>{initiator.initiatedBy}</code> as role <code>{initiator.initiatorRole}</code>.
                The App adds <code>initiatedBy</code> and <code>initiatorRole</code> to the workflow input so the
                Select-Pet task is routed to this shop.
              </div>
              <div className="tabs modal-tabs" style={{ borderBottom: 'none', marginBottom: 0 }}>
                <button className={`tab-btn${activeTab === 'form' ? ' active' : ''}`} disabled={!formSchema}
                  onClick={() => setActiveTab('form')}>Form</button>
                <button className={`tab-btn${activeTab === 'json' ? ' active' : ''}`} onClick={() => setActiveTab('json')}>JSON</button>
              </div>

              {activeTab === 'form' && formSchema && (
                <div className="modal-section">
                  <div className="modal-label">Workflow Input</div>
                  <div className="modal-form-grid">
                    {fields.map(([field, fieldSchema]) => {
                      const type = schemaType(fieldSchema);
                      const required = Array.isArray(formSchema.required) && formSchema.required.includes(field);
                      const description = fieldSchema?.description;
                      return (
                        <div key={field} className="modal-form-field">
                          <span className="modal-label">{field}{required ? ' *' : ''}</span>
                          {type === 'boolean' ? (
                            <label className="modal-check-row">
                              <input type="checkbox" checked={!!formValues[field]}
                                onChange={e => setFormValues(v => ({ ...v, [field]: e.target.checked }))} />
                              <span>{description || 'Enabled'}</span>
                            </label>
                          ) : (type === 'array' || type === 'object') ? (
                            <textarea className="result-textarea modal-field-textarea" rows={4}
                              value={formValues[field] ?? ''} spellCheck={false}
                              onChange={e => setFormValues(v => ({ ...v, [field]: e.target.value }))} />
                          ) : (
                            <input className="filter-input"
                              type={(type === 'number' || type === 'integer') ? 'number' : 'text'}
                              value={formValues[field] ?? ''}
                              placeholder={fieldSchema?.default !== undefined ? String(fieldSchema.default) : ''}
                              onChange={e => setFormValues(v => ({ ...v, [field]: e.target.value }))} />
                          )}
                          {description && type !== 'boolean' && <div className="modal-field-help">{description}</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeTab === 'json' && (
                <div className="modal-section">
                  <div className="modal-label">Input JSON</div>
                  <textarea className="result-textarea modal-textarea" value={inputJson} rows={8} spellCheck={false}
                    onChange={e => { setInputJson(e.target.value); setError(null); }} />
                </div>
              )}

              {!formSchema && (
                <div className="modal-field-help">Input schema not available — use the JSON tab.</div>
              )}
            </div>

            {error && <div className="complete-error modal-error">{error}</div>}

            <div className="modal-footer">
              <button className="search-btn" onClick={launch} disabled={submitting}>
                {submitting ? 'Starting…' : '▶ Start Workflow'}
              </button>
              <button className="back-btn" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function StartWorkflowPage() {
  const [defs, setDefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [launchDef, setLaunchDef] = useState(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    getDefinitions()
      .then(d => {
        const list = (d.definitions || []).slice().sort((a, b) => a.workflowType.localeCompare(b.workflowType));
        setDefs(list);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (getSelectedUser().persona !== 'Shop') {
    return (
      <div className="page">
        <div className="page-header"><h2 className="page-title">Start an Adoption</h2></div>
        <div className="notice">
          Starting an adoption is a <strong>Shop</strong> action.<br />
          Switch to a Shop user (<code>abc_shop</code> or <code>pqr_shop</code>) to initiate a workflow.
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">Workflows</h2>
        <span className="type-count">{defs.length} workflow{defs.length !== 1 ? 's' : ''}</span>
        <button className="refresh-btn" onClick={load}>↺ Refresh</button>
      </div>
      <p className="page-subtitle">
        Start a pet-adoption workflow run. It will then create human tasks for the Shop and
        Shelter teams as it progresses.
      </p>

      {loading && <div className="loading">Loading…</div>}
      {error && <div className="error-msg">{error}</div>}

      {!loading && !error && (
        <div className="def-flat-list">
          {defs.length === 0 && <div className="loading">No workflow definitions found.</div>}
          {defs.map(def => (
            <div key={def.workflowType} className="def-flat-row">
              <span className={`worker-dot ${def.isActive ? 'active' : 'inactive'}`}
                title={def.isActive ? 'Active' : 'Inactive'} />
              <div className="def-flat-info">
                <span className="def-flat-name">{def.workflowType}</span>
                <span className="def-flat-meta">
                  <span className={`worker-label ${def.isActive ? 'active' : 'inactive'}`}>
                    {def.isActive ? 'Active' : 'Inactive'}
                  </span>
                </span>
              </div>
              <button className="def-launch-btn-inline" disabled={!def.isActive} onClick={() => setLaunchDef(def)}
                title={def.isActive ? `Start ${def.workflowType}` : 'Inactive — cannot start'}>
                ▶ Start
              </button>
            </div>
          ))}
        </div>
      )}

      {launchDef && (
        <LaunchModal workflowType={launchDef.workflowType} inputSchema={launchDef.inputSchema}
          onClose={() => setLaunchDef(null)} />
      )}
    </div>
  );
}
