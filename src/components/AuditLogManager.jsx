import React, { useState, useEffect } from 'react';
import { 
  Clock, Search, Filter, Download, Eye, RefreshCw, 
  ShieldCheck, AlertTriangle, CheckCircle2, Lock, FileText, X, ChevronLeft, ChevronRight 
} from 'lucide-react';
import { formatISTDateTimeWithZone } from '../utils/dateTime.js';

export default function AuditLogManager({ currentUser }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Filters & Search
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [outcomeFilter, setOutcomeFilter] = useState('all');
  const [dateRange, setDateRange] = useState('all'); // 'all' | 'today' | '7d' | '30d'
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });

  // Inspection modal
  const [selectedLog, setSelectedLog] = useState(null);
  const [exporting, setExporting] = useState(false);

  const fetchLogs = async (targetPage = 1) => {
    try {
      setLoading(true);
      setErrorMsg('');

      let startDate = '';
      let endDate = '';
      if (dateRange === 'today') {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        startDate = d.toISOString();
      } else if (dateRange === '7d') {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        startDate = d.toISOString();
      } else if (dateRange === '30d') {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        startDate = d.toISOString();
      }

      const params = new URLSearchParams({
        paginated: 'true',
        page: String(targetPage),
        limit: '20',
        search: search.trim(),
        category: categoryFilter,
        role: roleFilter,
        severity: severityFilter,
        outcome: outcomeFilter
      });
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const res = await fetch(`/api/admin/audit-logs?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to load audit logs');
      }
      const data = await res.json();
      setLogs(data.logs || []);
      setPagination(data.pagination || { total: 0, page: 1, limit: 20, totalPages: 1 });
      setPage(targetPage);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(1);
  }, [categoryFilter, roleFilter, severityFilter, outcomeFilter, dateRange]);

  const handleExport = async (format = 'csv') => {
    try {
      setExporting(true);
      setErrorMsg('');
      const res = await fetch(`/api/admin/audit-logs/export?format=${format}`);
      if (!res.ok) {
        throw new Error('Audit export failed');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `verdant_mind_audit_export_${Date.now()}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setSuccessMsg(`Audit report successfully exported as ${format.toUpperCase()}.`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setExporting(false);
    }
  };

  const getSeverityBadge = (sev) => {
    switch (sev) {
      case 'critical':
        return <span style={{ padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700, background: '#FEE2E2', color: '#991B1B' }}>CRITICAL</span>;
      case 'high':
        return <span style={{ padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700, background: '#FFEDD5', color: '#9A3412' }}>HIGH</span>;
      case 'medium':
        return <span style={{ padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600, background: '#FEF3C7', color: '#92400E' }}>MEDIUM</span>;
      case 'low':
        return <span style={{ padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600, background: '#E0F2FE', color: '#0369A1' }}>LOW</span>;
      default:
        return <span style={{ padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600, background: 'var(--color-slate-10)', color: 'var(--color-slate-dark)' }}>INFO</span>;
    }
  };

  const getOutcomeBadge = (outcome) => {
    switch (outcome) {
      case 'success':
        return <span style={{ padding: '0.15rem 0.45rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600, background: '#DCFCE7', color: '#166534' }}>Success</span>;
      case 'denied':
        return <span style={{ padding: '0.15rem 0.45rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600, background: '#FEE2E2', color: '#991B1B' }}>Denied (403)</span>;
      case 'failure':
        return <span style={{ padding: '0.15rem 0.45rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600, background: '#FEF3C7', color: '#B45309' }}>Failed</span>;
      default:
        return outcome || '—';
    }
  };

  return (
    <div className="audit-log-manager-container" style={{ padding: '1rem 0' }}>
      
      {/* Title & Actions Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--color-slate-dark)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Clock size={20} style={{ color: 'var(--color-slate)' }} />
            Immutable Audit Trail & Compliance Log
          </h4>
          <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.84rem', color: 'var(--color-slate-light)' }}>
            Append-only legal record of all authentication, clinical documentation, consent, and administrative actions.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => handleExport('csv')}
            disabled={exporting}
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.85rem', background: '#FFF', border: '1px solid var(--color-slate-20)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}
          >
            <Download size={14} /> Export CSV
          </button>
          <button
            type="button"
            onClick={() => handleExport('json')}
            disabled={exporting}
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.85rem', background: '#FFF', border: '1px solid var(--color-slate-20)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}
          >
            <Download size={14} /> Export JSON
          </button>
          <button
            type="button"
            onClick={() => fetchLogs(page)}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.85rem', background: 'var(--color-slate-05)', border: '1px solid var(--color-slate-20)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', cursor: 'pointer' }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.84rem' }}>
          <AlertTriangle size={16} /> <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div style={{ background: '#DCFCE7', color: '#166534', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.84rem' }}>
          <CheckCircle2 size={16} /> <span>{successMsg}</span>
        </div>
      )}

      {/* Comprehensive Filter Controls */}
      <div className="card" style={{ padding: '1rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)', marginBottom: '1.25rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.65rem' }}>
          
          <div>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-slate-light)' }} />
              <input
                type="text"
                placeholder="Search actor, action, IP..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') fetchLogs(1); }}
                style={{ width: '100%', padding: '0.4rem 0.65rem 0.4rem 2rem', fontSize: '0.8rem', border: '1px solid var(--color-slate-20)', borderRadius: 'var(--radius-sm)' }}
              />
            </div>
          </div>

          <div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{ width: '100%', padding: '0.4rem 0.65rem', fontSize: '0.8rem', border: '1px solid var(--color-slate-20)', borderRadius: 'var(--radius-sm)' }}
            >
              <option value="all">All Categories</option>
              <option value="Authentication">Authentication</option>
              <option value="Profile Management">Profile Management</option>
              <option value="Clinical Documentation">Clinical Documentation</option>
              <option value="Appointments">Appointments</option>
              <option value="Assessments">Assessments</option>
              <option value="Document Management">Document Management</option>
              <option value="Security Administration">Security Administration</option>
              <option value="Privacy & Consent">Privacy & Consent</option>
            </select>
          </div>

          <div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              style={{ width: '100%', padding: '0.4rem 0.65rem', fontSize: '0.8rem', border: '1px solid var(--color-slate-20)', borderRadius: 'var(--radius-sm)' }}
            >
              <option value="all">All Roles</option>
              <option value="Super Admin">Super Admin</option>
              <option value="Administrator">Administrator</option>
              <option value="Counsellor">Counsellor</option>
              <option value="client">Client / Student</option>
              <option value="system">System / Background</option>
            </select>
          </div>

          <div>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              style={{ width: '100%', padding: '0.4rem 0.65rem', fontSize: '0.8rem', border: '1px solid var(--color-slate-20)', borderRadius: 'var(--radius-sm)' }}
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="info">Info</option>
            </select>
          </div>

          <div>
            <select
              value={outcomeFilter}
              onChange={(e) => setOutcomeFilter(e.target.value)}
              style={{ width: '100%', padding: '0.4rem 0.65rem', fontSize: '0.8rem', border: '1px solid var(--color-slate-20)', borderRadius: 'var(--radius-sm)' }}
            >
              <option value="all">All Outcomes</option>
              <option value="success">Success</option>
              <option value="failure">Failure</option>
              <option value="denied">Access Denied (403)</option>
            </select>
          </div>

          <div>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              style={{ width: '100%', padding: '0.4rem 0.65rem', fontSize: '0.8rem', border: '1px solid var(--color-slate-20)', borderRadius: 'var(--radius-sm)' }}
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="7d">Past 7 Days</option>
              <option value="30d">Past 30 Days</option>
            </select>
          </div>

        </div>
      </div>

      {/* Audit Log Table */}
      <div className="card" style={{ padding: '1.25rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
        {logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--color-slate-light)', fontSize: '0.86rem' }}>
            <Clock size={36} style={{ opacity: 0.35, marginBottom: '0.5rem' }} />
            <p>No audit log events located matching the query criteria.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-slate-10)', textAlign: 'left', color: 'var(--color-slate-light)' }}>
                  <th style={{ padding: '0.5rem' }}>Severity</th>
                  <th style={{ padding: '0.5rem' }}>Timestamp (IST)</th>
                  <th style={{ padding: '0.5rem' }}>Event ID</th>
                  <th style={{ padding: '0.5rem' }}>Actor & Role</th>
                  <th style={{ padding: '0.5rem' }}>Action Code</th>
                  <th style={{ padding: '0.5rem' }}>Category</th>
                  <th style={{ padding: '0.5rem' }}>Resource</th>
                  <th style={{ padding: '0.5rem' }}>Outcome</th>
                  <th style={{ padding: '0.5rem' }}>IP Address</th>
                  <th style={{ padding: '0.5rem' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l, idx) => (
                  <tr key={l._id || l.id || idx} style={{ borderBottom: '1px solid var(--color-slate-05)' }}>
                    <td style={{ padding: '0.55rem 0.5rem' }}>{getSeverityBadge(l.severity)}</td>
                    <td style={{ padding: '0.55rem 0.5rem', whiteSpace: 'nowrap', color: 'var(--color-slate-dark)' }}>
                      {formatISTDateTimeWithZone(l.timestamp || l.createdAt)}
                    </td>
                    <td style={{ padding: '0.55rem 0.5rem', fontFamily: 'monospace', fontWeight: 600 }}>{l.eventId || '—'}</td>
                    <td style={{ padding: '0.55rem 0.5rem' }}>
                      <div style={{ fontWeight: 600, color: 'var(--color-slate-dark)' }}>{l.actorEmail || 'system'}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--color-slate-light)' }}>{l.actorRole || 'system'}</div>
                    </td>
                    <td style={{ padding: '0.55rem 0.5rem', fontFamily: 'monospace', color: 'var(--color-slate-dark)', fontWeight: 600 }}>
                      {l.action}
                    </td>
                    <td style={{ padding: '0.55rem 0.5rem', color: 'var(--color-slate-light)' }}>{l.eventCategory || 'Security'}</td>
                    <td style={{ padding: '0.55rem 0.5rem', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.targetResource}>
                      {l.targetResource || '—'}
                    </td>
                    <td style={{ padding: '0.55rem 0.5rem' }}>{getOutcomeBadge(l.outcome)}</td>
                    <td style={{ padding: '0.55rem 0.5rem', fontFamily: 'monospace', fontSize: '0.74rem' }}>{l.ipAddress || '—'}</td>
                    <td style={{ padding: '0.55rem 0.5rem' }}>
                      <button
                        type="button"
                        onClick={() => setSelectedLog(l)}
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.74rem', background: 'var(--color-slate-05)', border: '1px solid var(--color-slate-20)', borderRadius: '3px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                      >
                        <Eye size={12} /> Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination Controls */}
            {pagination.totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid var(--color-slate-10)', fontSize: '0.8rem', color: 'var(--color-slate-light)' }}>
                <span>Showing Page {pagination.page} of {pagination.totalPages} ({pagination.total} total immutable events)</span>
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  <button
                    type="button"
                    disabled={pagination.page <= 1}
                    onClick={() => fetchLogs(pagination.page - 1)}
                    style={{ padding: '0.3rem 0.65rem', border: '1px solid var(--color-slate-20)', borderRadius: '3px', background: '#FFF', cursor: pagination.page <= 1 ? 'not-allowed' : 'pointer' }}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => fetchLogs(pagination.page + 1)}
                    style={{ padding: '0.3rem 0.65rem', border: '1px solid var(--color-slate-20)', borderRadius: '3px', background: '#FFF', cursor: pagination.page >= pagination.totalPages ? 'not-allowed' : 'pointer' }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* MODAL: AUDIT RECORD DEEP INSPECTION */}
      {/* ===================================================================== */}
      {selectedLog && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="glass-card" style={{ background: '#FFF', maxWidth: '650px', width: '100%', borderRadius: 'var(--radius-md)', padding: '1.75rem', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', borderBottom: '1px solid var(--color-slate-10)', paddingBottom: '0.75rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-terracotta)', fontWeight: 600 }}>Audit Verification</span>
                <h4 style={{ margin: '0.2rem 0 0 0', fontSize: '1.2rem', color: 'var(--color-slate-dark)', fontFamily: 'monospace' }}>
                  {selectedLog.eventId || 'AUDIT EVENT'}
                </h4>
                <div style={{ fontSize: '0.76rem', color: 'var(--color-slate-light)', marginTop: '0.2rem' }}>
                  Recorded at: {formatISTDateTimeWithZone(selectedLog.timestamp || selectedLog.createdAt)}
                </div>
              </div>
              <button type="button" onClick={() => setSelectedLog(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-slate-light)' }}>
                <X size={20} />
              </button>
            </div>

            {/* Immutability Alert Banner */}
            <div style={{ background: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0', padding: '0.65rem 0.85rem', borderRadius: '4px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1rem' }}>
              <ShieldCheck size={16} />
              <span><strong>Immutable Append-Only Record:</strong> This entry is cryptographically protected from alteration or deletion.</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.82rem', marginBottom: '1rem', background: 'var(--color-slate-05)', padding: '0.85rem', borderRadius: '4px' }}>
              <div><strong>Action:</strong> <span style={{ fontFamily: 'monospace' }}>{selectedLog.action}</span></div>
              <div><strong>Category:</strong> {selectedLog.eventCategory}</div>
              <div><strong>Actor:</strong> {selectedLog.actorEmail} ({selectedLog.actorRole})</div>
              <div><strong>Outcome:</strong> {getOutcomeBadge(selectedLog.outcome)}</div>
              <div><strong>Target:</strong> {selectedLog.targetResource || '—'}</div>
              <div><strong>Severity:</strong> {getSeverityBadge(selectedLog.severity)}</div>
              <div><strong>Client IP:</strong> <span style={{ fontFamily: 'monospace' }}>{selectedLog.ipAddress || '—'}</span></div>
              <div><strong>Request ID:</strong> <span style={{ fontFamily: 'monospace', fontSize: '0.74rem' }}>{selectedLog.requestId || '—'}</span></div>
            </div>

            {selectedLog.userAgent && (
              <div style={{ marginBottom: '1rem', fontSize: '0.8rem' }}>
                <strong style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--color-slate-light)' }}>User Agent Client:</strong>
                <div style={{ padding: '0.5rem', background: 'var(--color-slate-05)', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}>
                  {selectedLog.userAgent}
                </div>
              </div>
            )}

            {/* Structured Details JSON */}
            <div style={{ marginBottom: '1.25rem' }}>
              <strong style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.35rem', color: 'var(--color-slate-dark)' }}>Payload Metadata & Context:</strong>
              <pre style={{ margin: 0, padding: '0.75rem', background: '#1E293B', color: '#F8FAFC', borderRadius: '4px', fontSize: '0.75rem', overflowX: 'auto', maxHeight: '180px' }}>
                {JSON.stringify(selectedLog.details || {}, null, 2)}
              </pre>
            </div>

            {/* Before / After Diff */}
            {selectedLog.beforeAfter && (
              <div style={{ marginBottom: '1.25rem' }}>
                <strong style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.35rem', color: 'var(--color-slate-dark)' }}>Change Diff (Before / After):</strong>
                <pre style={{ margin: 0, padding: '0.75rem', background: '#0F172A', color: '#38BDF8', borderRadius: '4px', fontSize: '0.74rem', overflowX: 'auto', maxHeight: '140px' }}>
                  {JSON.stringify(selectedLog.beforeAfter, null, 2)}
                </pre>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                style={{ padding: '0.45rem 1rem', background: 'var(--color-slate-10)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '0.82rem' }}
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

