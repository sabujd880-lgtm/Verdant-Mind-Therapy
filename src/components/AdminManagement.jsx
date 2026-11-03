import React, { useState, useEffect } from 'react';
import { Users, Shield, CheckCircle2, RefreshCw, Clock, AlertTriangle, UserPlus, Search, Lock, CalendarDays, Save, Trash2, Plus, Bell } from 'lucide-react';
import { formatISTDateTimeWithZone, normalizeToISTDate } from '../utils/dateTime.js';

export default function AdminManagement({ currentUser }) {
  const [activeSubTab, setActiveSubTab] = useState('users'); // 'users' | 'audit' | 'assignments' | 'scheduling'
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [schedConfig, setSchedConfig] = useState({
    workingDays: [1, 2, 3, 4, 5],
    startHour: '09:00',
    endHour: '17:00',
    breakStart: '13:00',
    breakEnd: '14:00',
    defaultDurationMinutes: 60,
    permittedDurations: [30, 45, 60],
    bufferMinutes: 15,
    minAdvanceHours: 2,
    maxAdvanceDays: 60,
    maxAppointmentsPerDay: 8,
    cancellationDeadlineHours: 24,
    reschedulingDeadlineHours: 12,
    blockedDates: [],
    holidays: []
  });
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');
  const [reminderStatus, setReminderStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Add User Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUserData, setNewUserData] = useState({
    name: '',
    email: '',
    role: 'Counsellor',
    assignedClients: ''
  });

  // Selected Counsellor for Client Assignment
  const [selectedCounsellor, setSelectedCounsellor] = useState(null);
  const [assignmentInput, setAssignmentInput] = useState('');

  const isSuperAdmin = currentUser?.role === 'Super Admin' || currentUser?.role === 'provider';

  const fetchUsers = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/admin/users', { credentials: 'include' });
      if (!res.ok) throw new Error('Could not fetch user directory.');
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/admin/audit-logs', { credentials: 'include' });
      if (!res.ok) throw new Error('Could not fetch audit logs.');
      const data = await res.json();
      setAuditLogs(data);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSchedulingConfig = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/admin/scheduling-config', { credentials: 'include' });
      if (!res.ok) throw new Error('Could not fetch scheduling configuration.');
      const data = await res.json();
      setSchedConfig(prev => ({ ...prev, ...data }));
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSchedulingConfig = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch('/api/admin/scheduling-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(schedConfig)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save practice scheduling configuration.');
      setSchedConfig(data);
      setSuccessMsg('Practice scheduling governance and IST configuration saved successfully.');
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleAddHoliday = (e) => {
    e.preventDefault();
    if (!newHolidayDate || !newHolidayName) return;
    const normDate = normalizeToISTDate(newHolidayDate);
    const existing = schedConfig.holidays || [];
    if (!existing.some(h => h.date === normDate)) {
      setSchedConfig(prev => ({
        ...prev,
        holidays: [...(prev.holidays || []), { date: normDate, name: newHolidayName, type: 'holiday' }]
      }));
    }
    setNewHolidayDate('');
    setNewHolidayName('');
  };

  const handleRemoveHoliday = (dateToRemove) => {
    setSchedConfig(prev => ({
      ...prev,
      holidays: (prev.holidays || []).filter(h => h.date !== dateToRemove)
    }));
  };

  const handleTriggerReminders = async () => {
    setReminderStatus('Dispatching automated IST session reminders...');
    try {
      const res = await fetch('/api/appointments/process-reminders', {
        method: 'POST',
        credentials: 'include'
      });
      const data = await res.json();
      setReminderStatus(`Dispatched: ${data.reminders24hSent} (24h) and ${data.reminders1hSent} (1h) notices dispatched.`);
    } catch (err) {
      setReminderStatus('Failed to dispatch reminders.');
    }
  };

  useEffect(() => {
    if (activeSubTab === 'users' || activeSubTab === 'assignments') {
      fetchUsers();
    } else if (activeSubTab === 'audit') {
      fetchAuditLogs();
    } else if (activeSubTab === 'scheduling') {
      fetchSchedulingConfig();
    }
  }, [activeSubTab]);

  const handleStatusChange = async (userId, newStatus) => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch(`/api/admin/users/${userId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update user status.');
      setSuccessMsg(`User status updated to ${newStatus}.`);
      setUsers(prev => prev.map(u => (u._id === userId || u.id === userId) ? data : u));
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role: newRole })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update user role.');
      setSuccessMsg(`User role assigned to ${newRole}.`);
      setUsers(prev => prev.map(u => (u._id === userId || u.id === userId) ? data : u));
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleRevokeSessions = async (userId, userEmail) => {
    if (!window.confirm(`Revoke all active sessions for ${userEmail}? The user will be immediately logged out.`)) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch(`/api/admin/users/${userId}/revoke-sessions`, {
        method: 'POST',
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to revoke sessions.');
      setSuccessMsg(`All active sessions for ${userEmail} were revoked.`);
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleAddUserSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const clientsList = newUserData.assignedClients
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);

      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: newUserData.name.trim(),
          email: newUserData.email.trim(),
          role: newUserData.role,
          assignedClients: clientsList
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create user account.');
      setSuccessMsg(`User ${data.email} successfully added.`);
      setShowAddModal(false);
      setNewUserData({ name: '', email: '', role: 'Counsellor', assignedClients: '' });
      fetchUsers();
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleSaveAssignments = async () => {
    if (!selectedCounsellor) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const clientsList = assignmentInput
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);

      const res = await fetch(`/api/admin/counsellors/${selectedCounsellor._id || selectedCounsellor.id}/assignments`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ assignedClients: clientsList })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update assignments.');
      setSuccessMsg(`Client assignments updated for ${selectedCounsellor.name}.`);
      setSelectedCounsellor(null);
      fetchUsers();
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const filteredUsers = users.filter(u => {
    const term = searchTerm.toLowerCase();
    return (u.name || '').toLowerCase().includes(term) || (u.email || '').toLowerCase().includes(term) || (u.role || '').toLowerCase().includes(term);
  });

  return (
    <div className="admin-management-module">
      {/* Subtab Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--color-slate-10)', paddingBottom: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className={`tab-btn ${activeSubTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('users')}
            style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
          >
            <Users size={15} style={{ marginRight: '0.35rem' }} /> Registered Users ({users.length})
          </button>
          <button
            type="button"
            className={`tab-btn ${activeSubTab === 'assignments' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('assignments')}
            style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
          >
            <Shield size={15} style={{ marginRight: '0.35rem' }} /> Counsellor Assignments
          </button>
          <button
            type="button"
            className={`tab-btn ${activeSubTab === 'audit' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('audit')}
            style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
          >
            <Clock size={15} style={{ marginRight: '0.35rem' }} /> Security Audit Logs
          </button>
          <button
            type="button"
            className={`tab-btn ${activeSubTab === 'scheduling' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('scheduling')}
            style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
          >
            <CalendarDays size={15} style={{ marginRight: '0.35rem' }} /> Practice Scheduling & IST
          </button>
        </div>

        {activeSubTab === 'users' && (
          <button
            type="button"
            className="premium-btn"
            style={{ padding: '0.45rem 1rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            onClick={() => setShowAddModal(true)}
          >
            <UserPlus size={14} /> Add / Pre-Approve User
          </button>
        )}
      </div>

      {/* Messages */}
      {errorMsg && (
        <div style={{ background: 'rgba(201,93,93,0.1)', color: 'var(--color-accent-terracotta)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertTriangle size={16} /> <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div style={{ background: 'rgba(74,140,112,0.1)', color: '#2A5D48', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle2 size={16} /> <span>{successMsg}</span>
        </div>
      )}

      {/* TAB 1: USERS LIST & GOVERNANCE */}
      {activeSubTab === 'users' && (
        <div>
          {/* Search Bar */}
          <div style={{ marginBottom: '1rem', position: 'relative', maxWidth: '350px' }}>
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-slate-light)' }} />
            <input
              type="text"
              placeholder="Search by name, email, or role..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: '100%', padding: '0.5rem 0.5rem 0.5rem 2.25rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}
            />
          </div>

          <div className="glass-card" style={{ overflowX: 'auto', borderRadius: 'var(--radius-sm)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'rgba(42,71,62,0.06)', borderBottom: '1px solid var(--color-slate-10)', color: 'var(--color-slate-dark)' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>User / Email</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Role</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Last Login</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-slate-light)' }}>
                      No matching user accounts found.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map(user => {
                    const isSelf = user.email.toLowerCase() === (currentUser?.email || '').toLowerCase();
                    const isSuper = user.role === 'Super Admin';

                    return (
                      <tr key={user._id || user.id} style={{ borderBottom: '1px solid var(--color-slate-05)' }}>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {user.picture ? (
                              <img src={user.picture} alt="" style={{ width: '28px', height: '28px', borderRadius: '50%' }} />
                            ) : (
                              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--color-slate-10)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: 'var(--color-slate-dark)' }}>
                                {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                              </div>
                            )}
                            <div>
                              <strong style={{ display: 'block', color: 'var(--color-slate-dark)' }}>
                                {user.name} {isSelf && <span style={{ fontSize: '0.7rem', color: 'var(--color-slate-light)' }}>(You)</span>}
                              </strong>
                              <span style={{ fontSize: '0.78rem', color: 'var(--color-slate-light)' }}>{user.email}</span>
                            </div>
                          </div>
                        </td>

                        {/* Role Selector */}
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <select
                            value={user.role}
                            disabled={isSelf || (!isSuperAdmin && isSuper)}
                            onChange={(e) => handleRoleChange(user._id || user.id, e.target.value)}
                            style={{
                              padding: '0.3rem 0.5rem',
                              borderRadius: '4px',
                              border: '1px solid var(--color-slate-10)',
                              fontSize: '0.8rem',
                              background: '#fff',
                              cursor: isSelf ? 'not-allowed' : 'pointer'
                            }}
                          >
                            {isSuperAdmin && <option value="Super Admin">Super Admin</option>}
                            <option value="Administrator">Administrator</option>
                            <option value="Counsellor">Counsellor</option>
                            <option value="Viewer">Viewer</option>
                            <option value="client">Client</option>
                          </select>
                        </td>

                        {/* Status Badge */}
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            textTransform: 'capitalize',
                            background: 
                              user.status === 'approved' ? 'rgba(74,140,112,0.15)' :
                              user.status === 'pending' ? 'rgba(223,155,52,0.15)' :
                              user.status === 'suspended' ? 'rgba(201,93,93,0.15)' : 'rgba(100,100,100,0.1)',
                            color: 
                              user.status === 'approved' ? '#2A5D48' :
                              user.status === 'pending' ? '#B8761E' :
                              user.status === 'suspended' ? '#C95D5D' : '#555'
                          }}>
                            {user.status || 'approved'}
                          </span>
                        </td>

                        {/* Last Login Info */}
                        <td style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--color-slate-light)' }}>
                          {user.lastLoginAt ? formatISTDateTimeWithZone(user.lastLoginAt) : 'Never'}
                          {user.lastLoginIp && <div style={{ fontSize: '0.7rem' }}>IP: {user.lastLoginIp}</div>}
                        </td>

                        {/* Action Buttons */}
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem' }}>
                            {user.status === 'pending' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleStatusChange(user._id || user.id, 'approved')}
                                  style={{ background: '#E8F5E9', color: '#2E7D32', border: '1px solid #A5D6A7', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer' }}
                                  title="Approve Account"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleStatusChange(user._id || user.id, 'rejected')}
                                  style={{ background: '#FFEBEE', color: '#C62828', border: '1px solid #FFCDD2', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer' }}
                                  title="Reject Application"
                                >
                                  Reject
                                </button>
                              </>
                            )}

                            {user.status === 'approved' && !isSelf && (
                              <button
                                type="button"
                                onClick={() => handleStatusChange(user._id || user.id, 'suspended')}
                                style={{ background: '#FFF3E0', color: '#E65100', border: '1px solid #FFE0B2', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer' }}
                                title="Suspend Access"
                              >
                                Suspend
                              </button>
                            )}

                            {user.status === 'suspended' && !isSelf && (
                              <button
                                type="button"
                                onClick={() => handleStatusChange(user._id || user.id, 'approved')}
                                style={{ background: '#E8F5E9', color: '#2E7D32', border: '1px solid #A5D6A7', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer' }}
                                title="Reactivate Account"
                              >
                                Reactivate
                              </button>
                            )}

                            {!isSelf && (
                              <button
                                type="button"
                                onClick={() => handleRevokeSessions(user._id || user.id, user.email)}
                                style={{ background: '#F5F5F5', color: '#616161', border: '1px solid #E0E0E0', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer' }}
                                title="Revoke all active sessions immediately"
                              >
                                <Lock size={12} style={{ display: 'inline', marginRight: '2px' }} /> Invalidate
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: COUNSELLOR CLIENT ASSIGNMENTS */}
      {activeSubTab === 'assignments' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '1.5rem' }}>
          <div className="glass-card" style={{ padding: '1.25rem', borderRadius: 'var(--radius-sm)' }}>
            <h4 style={{ margin: '0 0 1rem 0', color: 'var(--color-slate-dark)', fontSize: '0.95rem' }}>
              Select Counsellor to Manage
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {users.filter(u => u.role === 'Counsellor' || u.role === 'Viewer').map(c => {
                const isSelected = selectedCounsellor?._id === c._id || selectedCounsellor?.id === c.id;
                return (
                  <div
                    key={c._id || c.id}
                    onClick={() => {
                      setSelectedCounsellor(c);
                      setAssignmentInput((c.assignedClients || []).join(', '));
                    }}
                    style={{
                      padding: '0.75rem',
                      borderRadius: 'var(--radius-sm)',
                      border: isSelected ? '2px solid var(--color-slate)' : '1px solid var(--color-slate-10)',
                      background: isSelected ? 'rgba(42,71,62,0.05)' : '#fff',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ fontWeight: 600, color: 'var(--color-slate-dark)' }}>{c.name}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--color-slate-light)' }}>{c.email} ({c.role})</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-primary-forest)', marginTop: '0.25rem' }}>
                      {c.assignedClients?.length || 0} clients explicitly assigned
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="glass-card" style={{ padding: '1.25rem', borderRadius: 'var(--radius-sm)' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--color-slate-dark)', fontSize: '0.95rem' }}>
              Assign Client Records
            </h4>
            {selectedCounsellor ? (
              <div>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-slate-light)', marginBottom: '1rem' }}>
                  Managing assigned clients for <strong>{selectedCounsellor.name}</strong> ({selectedCounsellor.email}).
                  Under IDOR protection, this practitioner will only be authorized to view the clients listed below.
                </p>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                  Client Email Addresses (comma separated):
                </label>
                <textarea
                  rows="5"
                  value={assignmentInput}
                  onChange={(e) => setAssignmentInput(e.target.value)}
                  placeholder="e.g. client1@example.com, client2@example.com"
                  style={{ width: '100%', padding: '0.65rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', fontFamily: 'monospace' }}
                />
                <button
                  type="button"
                  className="premium-btn"
                  onClick={handleSaveAssignments}
                  style={{ marginTop: '1rem', width: '100%' }}
                >
                  Save Client Access Permissions
                </button>
              </div>
            ) : (
              <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--color-slate-light)', fontSize: '0.85rem' }}>
                Select a counsellor from the left to view or adjust their assigned client records.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: AUDIT TRAIL & LOGIN HISTORY */}
      {activeSubTab === 'audit' && (
        <div className="glass-card" style={{ overflowX: 'auto', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--color-slate-10)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--color-slate-dark)' }}>
              Security & Authentication Audit Trail (Latest 100 Events)
            </h4>
            <button
              type="button"
              onClick={fetchAuditLogs}
              style={{ background: 'none', border: '1px solid var(--color-slate-10)', padding: '0.3rem 0.75rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
            >
              <RefreshCw size={12} /> Refresh Logs
            </button>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: 'rgba(42,71,62,0.06)', borderBottom: '1px solid var(--color-slate-10)' }}>
                <th style={{ padding: '0.65rem 0.85rem' }}>Timestamp</th>
                <th style={{ padding: '0.65rem 0.85rem' }}>Actor</th>
                <th style={{ padding: '0.65rem 0.85rem' }}>Action Event</th>
                <th style={{ padding: '0.65rem 0.85rem' }}>Target Resource</th>
                <th style={{ padding: '0.65rem 0.85rem' }}>IP & Agent</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-slate-light)' }}>
                    No audit records recorded yet.
                  </td>
                </tr>
              ) : (
                auditLogs.map((log, i) => (
                  <tr key={log._id || log.id || i} style={{ borderBottom: '1px solid var(--color-slate-05)' }}>
                    <td style={{ padding: '0.65rem 0.85rem', color: 'var(--color-slate-light)', whiteSpace: 'nowrap' }}>
                      {formatISTDateTimeWithZone(log.timestamp)}
                    </td>
                    <td style={{ padding: '0.65rem 0.85rem' }}>
                      <strong style={{ color: 'var(--color-slate-dark)' }}>{log.actorEmail}</strong>
                      <span style={{ fontSize: '0.7rem', display: 'block', color: 'var(--color-slate-light)' }}>({log.actorRole})</span>
                    </td>
                    <td style={{ padding: '0.65rem 0.85rem' }}>
                      <code style={{ background: 'rgba(42,71,62,0.08)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, color: 'var(--color-primary-forest)' }}>
                        {log.action}
                      </code>
                    </td>
                    <td style={{ padding: '0.65rem 0.85rem', color: 'var(--color-slate-dark)' }}>
                      {log.targetResource || 'system'}
                    </td>
                    <td style={{ padding: '0.65rem 0.85rem', fontSize: '0.75rem', color: 'var(--color-slate-light)' }}>
                      {log.ipAddress || 'internal'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 4: PRACTICE SCHEDULING & IST GOVERNANCE */}
      {activeSubTab === 'scheduling' && (
        <div className="glass-card" style={{ padding: '1.5rem', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--color-slate-10)', paddingBottom: '0.75rem' }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--color-slate-dark)' }}>
                Practice Scheduling Governance & Time Zone Management
              </h4>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-slate-light)' }}>
                Configure working schedules, buffer intervals, operating hours, and Indian Standard Time (IST) rules.
              </span>
            </div>
            <div style={{ background: 'rgba(74,140,112,0.1)', color: '#2A5D48', padding: '0.4rem 0.8rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600 }}>
              Authoritative Time Zone: Asia/Kolkata (IST, UTC+05:30)
            </div>
          </div>

          <form onSubmit={handleSaveSchedulingConfig} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Working Days */}
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem', color: 'var(--color-slate-dark)' }}>
                Active Practice Consultation Days:
              </label>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {[
                  { day: 0, label: 'Sunday' },
                  { day: 1, label: 'Monday' },
                  { day: 2, label: 'Tuesday' },
                  { day: 3, label: 'Wednesday' },
                  { day: 4, label: 'Thursday' },
                  { day: 5, label: 'Friday' },
                  { day: 6, label: 'Saturday' }
                ].map(({ day, label }) => {
                  const isChecked = (schedConfig.workingDays || []).includes(day);
                  return (
                    <label key={day} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', cursor: 'pointer', background: isChecked ? 'rgba(42,71,62,0.08)' : 'transparent', padding: '0.4rem 0.65rem', borderRadius: '4px', border: '1px solid var(--color-slate-10)' }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          const current = schedConfig.workingDays || [];
                          const updated = e.target.checked
                            ? [...current, day].sort()
                            : current.filter(d => d !== day);
                          setSchedConfig(prev => ({ ...prev, workingDays: updated }));
                        }}
                      />
                      <span>{label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Operating Hours & Breaks */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                  Daily Start Hour (IST):
                </label>
                <input
                  type="text"
                  placeholder="09:00"
                  value={schedConfig.startHour || ''}
                  onChange={(e) => setSchedConfig(prev => ({ ...prev, startHour: e.target.value }))}
                  style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                  Daily End Hour (IST):
                </label>
                <input
                  type="text"
                  placeholder="17:00"
                  value={schedConfig.endHour || ''}
                  onChange={(e) => setSchedConfig(prev => ({ ...prev, endHour: e.target.value }))}
                  style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                  Lunch/Break Start (IST):
                </label>
                <input
                  type="text"
                  placeholder="13:00"
                  value={schedConfig.breakStart || ''}
                  onChange={(e) => setSchedConfig(prev => ({ ...prev, breakStart: e.target.value }))}
                  style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                  Lunch/Break End (IST):
                </label>
                <input
                  type="text"
                  placeholder="14:00"
                  value={schedConfig.breakEnd || ''}
                  onChange={(e) => setSchedConfig(prev => ({ ...prev, breakEnd: e.target.value }))}
                  style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)' }}
                />
              </div>
            </div>

            {/* Durations and Buffer Period */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                  Default Duration (Minutes):
                </label>
                <select
                  value={schedConfig.defaultDurationMinutes || 60}
                  onChange={(e) => setSchedConfig(prev => ({ ...prev, defaultDurationMinutes: Number(e.target.value) }))}
                  style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', background: '#fff' }}
                >
                  <option value={30}>30 Minutes</option>
                  <option value={45}>45 Minutes</option>
                  <option value={60}>60 Minutes</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                  Practice Buffer Interval (Minutes):
                </label>
                <select
                  value={schedConfig.bufferMinutes !== undefined ? schedConfig.bufferMinutes : 15}
                  onChange={(e) => setSchedConfig(prev => ({ ...prev, bufferMinutes: Number(e.target.value) }))}
                  style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', background: '#fff' }}
                >
                  <option value={0}>0 Minutes (No buffer)</option>
                  <option value={10}>10 Minutes</option>
                  <option value={15}>15 Minutes (Standard)</option>
                  <option value={20}>20 Minutes</option>
                  <option value={30}>30 Minutes</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                  Min Advance Notice (Hours):
                </label>
                <input
                  type="number"
                  min="0"
                  max="72"
                  value={schedConfig.minAdvanceHours !== undefined ? schedConfig.minAdvanceHours : 2}
                  onChange={(e) => setSchedConfig(prev => ({ ...prev, minAdvanceHours: Number(e.target.value) }))}
                  style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                  Max Advance Booking (Days):
                </label>
                <input
                  type="number"
                  min="7"
                  max="180"
                  value={schedConfig.maxAdvanceDays !== undefined ? schedConfig.maxAdvanceDays : 60}
                  onChange={(e) => setSchedConfig(prev => ({ ...prev, maxAdvanceDays: Number(e.target.value) }))}
                  style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)' }}
                />
              </div>
            </div>

            {/* Cancellation and Reschedule Policy */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                  Cancellation Notice Deadline (Hours):
                </label>
                <input
                  type="number"
                  min="1"
                  max="72"
                  value={schedConfig.cancellationDeadlineHours !== undefined ? schedConfig.cancellationDeadlineHours : 24}
                  onChange={(e) => setSchedConfig(prev => ({ ...prev, cancellationDeadlineHours: Number(e.target.value) }))}
                  style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                  Rescheduling Notice Deadline (Hours):
                </label>
                <input
                  type="number"
                  min="1"
                  max="48"
                  value={schedConfig.reschedulingDeadlineHours !== undefined ? schedConfig.reschedulingDeadlineHours : 12}
                  onChange={(e) => setSchedConfig(prev => ({ ...prev, reschedulingDeadlineHours: Number(e.target.value) }))}
                  style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                  Max Consultations / Day:
                </label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={schedConfig.maxAppointmentsPerDay !== undefined ? schedConfig.maxAppointmentsPerDay : 8}
                  onChange={(e) => setSchedConfig(prev => ({ ...prev, maxAppointmentsPerDay: Number(e.target.value) }))}
                  style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)' }}
                />
              </div>
            </div>

            {/* Practice Holidays & Special Closures */}
            <div style={{ borderTop: '1px solid var(--color-slate-10)', paddingTop: '1.25rem' }}>
              <h5 style={{ margin: '0 0 0.5rem 0', fontSize: '0.92rem', color: 'var(--color-slate-dark)' }}>
                Practice Holidays & Special Clinic Closures
              </h5>
              <p style={{ fontSize: '0.78rem', color: 'var(--color-slate-light)', margin: '0 0 0.75rem 0' }}>
                Dates entered here are blocked across all public calendars and cannot be booked.
              </p>

              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="Date (DD-MM-YYYY)"
                  value={newHolidayDate}
                  onChange={(e) => setNewHolidayDate(e.target.value)}
                  style={{ padding: '0.45rem 0.6rem', fontSize: '0.82rem', border: '1px solid var(--color-slate-10)', borderRadius: '4px', width: '160px' }}
                />
                <input
                  type="text"
                  placeholder="Holiday / Closure Name (e.g. Diwali)"
                  value={newHolidayName}
                  onChange={(e) => setNewHolidayName(e.target.value)}
                  style={{ padding: '0.45rem 0.6rem', fontSize: '0.82rem', border: '1px solid var(--color-slate-10)', borderRadius: '4px', flex: 1, minWidth: '200px' }}
                />
                <button
                  type="button"
                  onClick={handleAddHoliday}
                  style={{ padding: '0.45rem 0.8rem', fontSize: '0.82rem', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  <Plus size={14} /> Add Holiday
                </button>
              </div>

              {(schedConfig.holidays || []).length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--color-slate-light)', fontStyle: 'italic', marginBottom: '1rem' }}>
                  No holidays or special closures registered.
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                  {(schedConfig.holidays || []).map((h) => (
                    <div
                      key={h.date}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(201,93,93,0.08)', border: '1px solid rgba(201,93,93,0.2)', padding: '0.35rem 0.65rem', borderRadius: '6px', fontSize: '0.78rem' }}
                    >
                      <strong style={{ color: 'var(--color-cancelled)' }}>{h.date}</strong>
                      <span>{h.name}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveHoliday(h.date)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-cancelled)', padding: 0 }}
                        title="Remove Holiday"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Automated Reminder Dispatcher */}
            <div style={{ borderTop: '1px solid var(--color-slate-10)', paddingTop: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h5 style={{ margin: '0 0 0.25rem 0', fontSize: '0.92rem', color: 'var(--color-slate-dark)' }}>
                  Automated IST Session Reminders (24h & 1h)
                </h5>
                <span style={{ fontSize: '0.78rem', color: 'var(--color-slate-light)' }}>
                  Evaluates upcoming confirmed appointments and dispatches email notices.
                </span>
                {reminderStatus && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-confirmed)', fontWeight: 600, marginTop: '0.25rem' }}>
                    {reminderStatus}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleTriggerReminders}
                style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem', background: '#fff', border: '1px solid var(--color-slate-10)', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <Bell size={14} /> Dispatch Reminders Now
              </button>
            </div>

            {/* Save Button */}
            <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                className="premium-btn"
                style={{ padding: '0.65rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Save size={16} /> Save Practice Governance Settings
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: ADD / PRE-APPROVE USER */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(42,71,62,0.5)', backdropFilter: 'blur(6px)', padding: '1rem' }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '460px', padding: '2rem', borderRadius: 'var(--radius-md)', background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--color-slate-dark)' }}>Add & Pre-Approve User</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-slate-light)', fontSize: '1.2rem' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddUserSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Ananya Sen"
                  value={newUserData.name}
                  onChange={(e) => setNewUserData(prev => ({ ...prev, name: e.target.value }))}
                  style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Google / Account Email *</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. ananya.sen@gmail.com"
                  value={newUserData.email}
                  onChange={(e) => setNewUserData(prev => ({ ...prev, email: e.target.value }))}
                  style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Clinical Role *</label>
                <select
                  value={newUserData.role}
                  onChange={(e) => setNewUserData(prev => ({ ...prev, role: e.target.value }))}
                  style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', background: '#fff' }}
                >
                  {isSuperAdmin && <option value="Super Admin">Super Admin</option>}
                  <option value="Administrator">Administrator</option>
                  <option value="Counsellor">Counsellor</option>
                  <option value="Viewer">Viewer</option>
                  <option value="client">Client</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Assigned Clients (comma-separated, optional)</label>
                <input
                  type="text"
                  placeholder="e.g. client1@example.com, client2@example.com"
                  value={newUserData.assignedClients}
                  onChange={(e) => setNewUserData(prev => ({ ...prev, assignedClients: e.target.value }))}
                  style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{ flex: 1, padding: '0.65rem', background: 'var(--color-slate-05)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="premium-btn"
                  style={{ flex: 1, padding: '0.65rem' }}
                >
                  Pre-Approve Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

