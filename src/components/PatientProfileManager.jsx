import React, { useState, useEffect } from 'react';
import { 
  Users, User, Search, Filter, Plus, Eye, Edit3, Shield, CheckCircle2, 
  AlertCircle, Clock, GraduationCap, 
  HeartHandshake, ChevronLeft, ChevronRight, Lock, Save, X, 
  RefreshCw, FilePlus
} from 'lucide-react';
import { formatISTDate } from '../utils/dateTime.js';
import { safeJson, getResponseError } from '../utils/api.js';

export default function PatientProfileManager({ currentUser, mode = 'directory', onProfileSelect }) {
  const isStudent = currentUser?.role === 'client';
  const isAdmin = currentUser && ['Super Admin', 'Administrator', 'provider'].includes(currentUser.role);
  const isClinician = currentUser && ['Counsellor', 'Super Admin', 'Administrator', 'provider'].includes(currentUser.role);

  // Directory State
  const [profiles, setProfiles] = useState([]);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Filtering & Pagination
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [programmeFilter, setProgrammeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 });

  // Single Profile View & Modals
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [activeProfileTab, setActiveProfileTab] = useState('overview'); // 'overview'|'personal'|'academic'|'emergency'|'appointments'|'clinical'|'documents'|'consent'
  const [profileAppointments, setProfileAppointments] = useState([]);
  const [profileClinicalRecords, setProfileClinicalRecords] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Edit / Create Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [editFormData, setEditFormData] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // Status Change Modal State
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusChangeTarget, setStatusChangeTarget] = useState(null);
  const [newStatus, setNewStatus] = useState('active');
  const [statusReason, setStatusReason] = useState('');

  // Provider Assignment Modal State
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignTarget, setAssignTarget] = useState(null);
  const [counsellorsList, setCounsellorsList] = useState([]);
  const [selectedProviderEmail, setSelectedProviderEmail] = useState('');
  const [assignReason, setAssignReason] = useState('');

  // Document Upload State
  const [docTitle, setDocTitle] = useState('');
  const [docCategory, setDocCategory] = useState('Referral');

  // Load Directory Profiles & Stats
  const fetchProfiles = async () => {
    if (mode === 'self' || isStudent) return;
    setIsLoading(true);
    setErrorMsg('');
    try {
      const queryParams = new URLSearchParams({
        search,
        department: departmentFilter,
        programmeLevel: programmeFilter,
        status: statusFilter,
        category: categoryFilter,
        page: String(page),
        limit: '10'
      });

      const res = await fetch(`/api/profiles?${queryParams.toString()}`, { credentials: 'include' });
      if (!res.ok) {
        const errorText = await getResponseError(res, 'Failed to fetch profiles');
        throw new Error(errorText);
      }
      const data = await safeJson(res);
      setProfiles(data?.profiles || []);
      setPagination(data?.pagination || { total: 0, page: 1, limit: 10, totalPages: 1 });
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStats = async () => {
    if (mode === 'self' || isStudent) return;
    try {
      const res = await fetch('/api/profiles/stats', { credentials: 'include' });
      if (res.ok) {
        const data = await safeJson(res);
        if (data) setStats(data);
      }
    } catch {
      // stats fallback
    }
  };

  const fetchSelfProfile = async () => {
    if (mode !== 'self' && !isStudent) return;
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/profiles/me', { credentials: 'include' });
      if (!res.ok) {
        const errorText = await getResponseError(res, 'Could not load your profile');
        throw new Error(errorText);
      }
      const data = await safeJson(res);
      if (data) {
        setSelectedProfile(data);
        loadAssociatedData(data.profileId);
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCounsellors = async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch('/api/admin/users', { credentials: 'include' });
      if (res.ok) {
        const users = await safeJson(res);
        if (Array.isArray(users)) {
          const clinicians = users.filter(u => ['Counsellor', 'Super Admin', 'Administrator', 'provider'].includes(u.role) && u.status === 'approved');
          setCounsellorsList(clinicians);
        }
      }
    } catch {
      // silently fallback
    }
  };

  useEffect(() => {
    if (mode === 'self' || isStudent) {
      fetchSelfProfile();
    } else {
      fetchProfiles();
      fetchStats();
      fetchCounsellors();
    }
  }, [mode, isStudent, page, departmentFilter, programmeFilter, statusFilter, categoryFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchProfiles();
  };

  // Load appointments & clinical records for an opened profile
  const loadAssociatedData = async (profileId) => {
    setLoadingDetails(true);
    try {
      // 1. Appointments
      const aptRes = await fetch(`/api/profiles/${profileId}/appointments`);
      if (aptRes.ok) {
        const apts = await aptRes.json();
        setProfileAppointments(apts);
      }

      // 2. Clinical records (if permitted)
      if (isClinician) {
        const clinRes = await fetch(`/api/profiles/${profileId}/clinical-records`);
        if (clinRes.ok) {
          const clinData = await clinRes.json();
          setProfileClinicalRecords(clinData);
        }
      }
    } catch {
      // graceful fallback
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleOpenProfileDetails = async (profile) => {
    setSelectedProfile(profile);
    setActiveProfileTab('overview');
    if (onProfileSelect) onProfileSelect(profile);
    await loadAssociatedData(profile.profileId);
  };

  const handleOpenCreateModal = () => {
    setIsCreatingNew(true);
    setEditFormData({
      category: 'student',
      personalInfo: {
        fullName: '',
        email: '',
        phone: '',
        dateOfBirth: '',
        gender: 'Self-described',
        selfDescribedGender: '',
        address: '',
        city: '',
        state: '',
        postalCode: '',
        preferredLanguage: 'English'
      },
      academicInfo: {
        isStudent: true,
        registrationNumber: '',
        department: '',
        schoolFaculty: '',
        programme: '',
        programmeLevel: 'UG',
        currentSemester: '',
        academicSession: '',
        enrollmentStatus: 'Active'
      },
      emergencyContact: {
        name: '',
        relationship: '',
        phone: '',
        altPhone: ''
      },
      clinicalInfo: {
        presentingConcerns: '',
        relevantClinicalHistory: '',
        currentCareStatus: 'Intake',
        followUpRecommendations: ''
      }
    });
    setShowEditModal(true);
  };

  const handleOpenEditModal = (profile) => {
    setIsCreatingNew(false);
    setEditFormData(JSON.parse(JSON.stringify(profile)));
    setShowEditModal(true);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (isCreatingNew) {
        const res = await fetch('/api/profiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editFormData)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create profile');

        setSuccessMsg(`Profile ${data.profileId} created successfully.`);
        setShowEditModal(false);
        fetchProfiles();
        fetchStats();
      } else {
        const profileId = editFormData.profileId;
        const res = await fetch(`/api/profiles/${profileId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editFormData)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update profile');

        setSuccessMsg(`Profile ${profileId} updated successfully.`);
        setSelectedProfile(data);
        setShowEditModal(false);
        if (mode !== 'self') {
          fetchProfiles();
        }
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangeStatusSubmit = async (e) => {
    e.preventDefault();
    if (!statusChangeTarget) return;

    try {
      const res = await fetch(`/api/profiles/${statusChangeTarget.profileId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, reason: statusReason })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update status');

      setSuccessMsg(`Status updated to ${newStatus}.`);
      setShowStatusModal(false);
      setStatusReason('');
      if (selectedProfile && selectedProfile.profileId === statusChangeTarget.profileId) {
        setSelectedProfile({ ...selectedProfile, profileStatus: newStatus });
      }
      fetchProfiles();
      fetchStats();
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleAssignProviderSubmit = async (e) => {
    e.preventDefault();
    if (!assignTarget || !selectedProviderEmail) return;

    const counsellor = counsellorsList.find(c => c.email.toLowerCase() === selectedProviderEmail.toLowerCase());
    if (!counsellor) {
      setErrorMsg('Selected clinician could not be resolved.');
      return;
    }

    try {
      const res = await fetch(`/api/profiles/${assignTarget.profileId}/assign-provider`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: counsellor._id || counsellor.id,
          providerName: counsellor.name,
          providerEmail: counsellor.email,
          reason: assignReason
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to assign provider');

      setSuccessMsg(`Assigned to ${counsellor.name}.`);
      setShowAssignModal(false);
      setAssignReason('');
      if (selectedProfile && selectedProfile.profileId === assignTarget.profileId) {
        setSelectedProfile({
          ...selectedProfile,
          assignedProvider: data.assignedProvider
        });
      }
      fetchProfiles();
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleConsentToggle = async (key, val) => {
    if (!selectedProfile) return;
    try {
      const payload = {
        ...selectedProfile.consentAndPrivacy,
        [key]: val,
        withdrawConsent: false
      };
      const res = await fetch(`/api/profiles/${selectedProfile.profileId}/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedProfile({
          ...selectedProfile,
          consentAndPrivacy: data.consentAndPrivacy
        });
        setSuccessMsg('Consent preference updated.');
      }
    } catch {
      setErrorMsg('Failed to update consent preference.');
    }
  };

  const handleWithdrawConsent = async () => {
    if (!selectedProfile) return;
    const confirmWithdraw = window.confirm('Are you sure you wish to withdraw all counselling and data consent? Active therapy sessions will be put on hold.');
    if (!confirmWithdraw) return;

    try {
      const res = await fetch(`/api/profiles/${selectedProfile.profileId}/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ withdrawConsent: true, withdrawnReason: 'Withdrawn by student/patient' })
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedProfile({
          ...selectedProfile,
          consentAndPrivacy: data.consentAndPrivacy
        });
        setSuccessMsg('Consent has been revoked.');
      }
    } catch {
      setErrorMsg('Failed to withdraw consent.');
    }
  };

  const handleAttachDocument = async (e) => {
    e.preventDefault();
    if (!docTitle.trim() || !selectedProfile) return;

    try {
      const res = await fetch(`/api/profiles/${selectedProfile.profileId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: docTitle.trim(),
          category: docCategory,
          fileUrl: '#'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to attach document');

      setSelectedProfile({
        ...selectedProfile,
        documents: [...(selectedProfile.documents || []), data.document]
      });
      setDocTitle('');
      setSuccessMsg('Document record attached.');
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const getStatusBadgeStyle = (status) => {
    switch (status) {
      case 'active':
        return { background: '#E8F5E9', color: '#1B5E20', border: '1px solid #C8E6C9' };
      case 'pending_verification':
        return { background: '#FFF8E1', color: '#F57F17', border: '1px solid #FFE082' };
      case 'inactive':
        return { background: '#ECEFF1', color: '#455A64', border: '1px solid #CFD8DC' };
      case 'archived':
        return { background: '#FFEBEE', color: '#B71C1C', border: '1px solid #FFCDD2' };
      default:
        return { background: '#E0F2F1', color: '#004D40', border: '1px solid #B2DFDB' };
    }
  };

  return (
    <div className="patient-profile-manager" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Alert Notices */}
      {errorMsg && (
        <div style={{ background: '#FFEBEE', border: '1px solid #EF9A9A', color: '#C62828', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={18} />
            <span style={{ fontSize: '0.88rem' }}>{errorMsg}</span>
          </div>
          <button type="button" onClick={() => setErrorMsg('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C62828' }}><X size={16} /></button>
        </div>
      )}

      {successMsg && (
        <div style={{ background: '#E8F5E9', border: '1px solid #A5D6A7', color: '#2E7D32', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle2 size={18} />
            <span style={{ fontSize: '0.88rem' }}>{successMsg}</span>
          </div>
          <button type="button" onClick={() => setSuccessMsg('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2E7D32' }}><X size={16} /></button>
        </div>
      )}

      {/* =========================================================================
          VIEW A: STUDENT / PATIENT SELF-SERVICE VIEW (MODE = SELF)
          ========================================================================= */}
      {(mode === 'self' || isStudent) && selectedProfile && (
        <div className="self-profile-view" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Header Card */}
          <div className="card" style={{ padding: '1.5rem', background: '#FFFFFF', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-slate-10)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--color-primary-05, #E2ECE9)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary, #0F383D)', fontSize: '1.5rem', fontWeight: 700, border: '2px solid var(--color-primary-20, #CBDCD7)' }}>
                {selectedProfile.personalInfo?.fullName ? selectedProfile.personalInfo.fullName.charAt(0).toUpperCase() : 'P'}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <h2 style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0, color: 'var(--color-slate-dark)' }}>
                    {selectedProfile.personalInfo?.fullName}
                  </h2>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: '12px', ...getStatusBadgeStyle(selectedProfile.profileStatus) }}>
                    {selectedProfile.profileStatus?.replace('_', ' ').toUpperCase()}
                  </span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: '12px', background: 'var(--color-slate-10)', color: 'var(--color-slate-dark)' }}>
                    {selectedProfile.profileId}
                  </span>
                </div>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--color-slate)' }}>
                  {selectedProfile.academicInfo?.isStudent 
                    ? `${selectedProfile.academicInfo.programmeLevel || 'UG'} Student • ${selectedProfile.academicInfo.department || 'Department Pending'} (${selectedProfile.academicInfo.registrationNumber || 'No Reg No'})`
                    : 'Registered Clinical Patient'}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button 
                type="button" 
                className="premium-btn" 
                onClick={() => handleOpenEditModal(selectedProfile)}
                style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Edit3 size={15} /> Edit My Profile
              </button>
            </div>
          </div>

          {/* Sub Navigation Tabs */}
          <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--color-slate-20)', paddingBottom: '0.5rem', overflowX: 'auto' }}>
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'personal', label: 'Personal Information' },
              { id: 'academic', label: 'Academic Details' },
              { id: 'emergency', label: 'Emergency Contact' },
              { id: 'appointments', label: 'My Appointments' },
              { id: 'consent', label: 'Consent & Privacy' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveProfileTab(tab.id)}
                className={`tab-btn ${activeProfileTab === tab.id ? 'active' : ''}`}
                style={{
                  padding: '0.45rem 1rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  cursor: 'pointer',
                  background: activeProfileTab === tab.id ? 'var(--color-primary, #0F383D)' : 'transparent',
                  color: activeProfileTab === tab.id ? '#FFF' : 'var(--color-slate-dark)'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content Display */}
          {activeProfileTab === 'overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              <div className="card" style={{ padding: '1.25rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', color: 'var(--color-slate)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <User size={16} /> Contact Summary
                </h4>
                <p style={{ margin: '0.25rem 0', fontSize: '0.85rem' }}><strong>Email:</strong> {selectedProfile.personalInfo?.email}</p>
                <p style={{ margin: '0.25rem 0', fontSize: '0.85rem' }}><strong>Phone:</strong> {selectedProfile.personalInfo?.phone || 'Not provided'}</p>
                <p style={{ margin: '0.25rem 0', fontSize: '0.85rem' }}><strong>Language:</strong> {selectedProfile.personalInfo?.preferredLanguage || 'English'}</p>
              </div>

              <div className="card" style={{ padding: '1.25rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', color: 'var(--color-slate)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <GraduationCap size={16} /> Academic Status
                </h4>
                <p style={{ margin: '0.25rem 0', fontSize: '0.85rem' }}><strong>Department:</strong> {selectedProfile.academicInfo?.department || 'Unassigned'}</p>
                <p style={{ margin: '0.25rem 0', fontSize: '0.85rem' }}><strong>Level:</strong> {selectedProfile.academicInfo?.programmeLevel || 'UG'}</p>
                <p style={{ margin: '0.25rem 0', fontSize: '0.85rem' }}><strong>Enrollment:</strong> {selectedProfile.academicInfo?.enrollmentStatus || 'Active'}</p>
              </div>

              <div className="card" style={{ padding: '1.25rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', color: 'var(--color-slate)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <HeartHandshake size={16} /> Care Allocation
                </h4>
                <p style={{ margin: '0.25rem 0', fontSize: '0.85rem' }}><strong>Assigned Practitioner:</strong> {selectedProfile.assignedProvider?.providerName || 'Pending intake review'}</p>
                <p style={{ margin: '0.25rem 0', fontSize: '0.85rem' }}><strong>Status:</strong> {selectedProfile.profileStatus?.replace('_', ' ').toUpperCase()}</p>
                <p style={{ margin: '0.25rem 0', fontSize: '0.85rem' }}><strong>Registered Date:</strong> {formatISTDate(selectedProfile.createdAt)}</p>
              </div>
            </div>
          )}

          {activeProfileTab === 'personal' && (
            <div className="card" style={{ padding: '1.5rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
              <h3 style={{ fontSize: '1.05rem', margin: '0 0 1rem 0' }}>Personal Details</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', fontSize: '0.88rem' }}>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Full Name</span><strong>{selectedProfile.personalInfo?.fullName}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Email Address</span><strong>{selectedProfile.personalInfo?.email}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Phone Number</span><strong>{selectedProfile.personalInfo?.phone || '—'}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Date of Birth</span><strong>{selectedProfile.personalInfo?.dateOfBirth || '—'}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Age</span><strong>{selectedProfile.personalInfo?.age !== undefined ? `${selectedProfile.personalInfo.age} years` : '—'}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Gender</span><strong>{selectedProfile.personalInfo?.gender || '—'}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Preferred Language</span><strong>{selectedProfile.personalInfo?.preferredLanguage || 'English'}</strong></div>
                <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Residential Address</span><strong>{[selectedProfile.personalInfo?.address, selectedProfile.personalInfo?.city, selectedProfile.personalInfo?.state, selectedProfile.personalInfo?.postalCode].filter(Boolean).join(', ') || 'Not specified'}</strong></div>
              </div>
            </div>
          )}

          {activeProfileTab === 'academic' && (
            <div className="card" style={{ padding: '1.5rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
              <h3 style={{ fontSize: '1.05rem', margin: '0 0 1rem 0' }}>Academic & University Enrollment</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', fontSize: '0.88rem' }}>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Registration Number</span><strong>{selectedProfile.academicInfo?.registrationNumber || '—'}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Department</span><strong>{selectedProfile.academicInfo?.department || '—'}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>School / Faculty</span><strong>{selectedProfile.academicInfo?.schoolFaculty || '—'}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Academic Programme</span><strong>{selectedProfile.academicInfo?.programme || '—'}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Classification Level</span><strong>{selectedProfile.academicInfo?.programmeLevel || 'UG'}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Current Semester / Year</span><strong>{selectedProfile.academicInfo?.currentSemester || '—'}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Academic Session</span><strong>{selectedProfile.academicInfo?.academicSession || '—'}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Enrollment Status</span><strong>{selectedProfile.academicInfo?.enrollmentStatus || 'Active'}</strong></div>
              </div>
            </div>
          )}

          {activeProfileTab === 'emergency' && (
            <div className="card" style={{ padding: '1.5rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
              <h3 style={{ fontSize: '1.05rem', margin: '0 0 0.5rem 0' }}>Emergency Contact Information</h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--color-slate)', margin: '0 0 1.25rem 0' }}>
                Designated emergency contacts are contacted exclusively during medical or psychological safety emergencies. Clinical session notes are never disclosed to emergency contacts without explicit written consent.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', fontSize: '0.88rem' }}>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Contact Name</span><strong>{selectedProfile.emergencyContact?.name || 'Not provided'}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Relationship</span><strong>{selectedProfile.emergencyContact?.relationship || '—'}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Primary Phone</span><strong>{selectedProfile.emergencyContact?.phone || '—'}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Alternate Phone</span><strong>{selectedProfile.emergencyContact?.altPhone || '—'}</strong></div>
              </div>
            </div>
          )}

          {activeProfileTab === 'appointments' && (
            <div className="card" style={{ padding: '1.5rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
              <h3 style={{ fontSize: '1.05rem', margin: '0 0 1rem 0' }}>Session & Appointment History</h3>
              {loadingDetails ? (
                <p style={{ fontSize: '0.88rem', color: 'var(--color-slate)' }}>Loading appointments...</p>
              ) : profileAppointments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--color-slate)' }}>
                  <Clock size={32} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
                  <p style={{ margin: 0, fontSize: '0.88rem' }}>No consultation sessions on record.</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--color-slate-05)', borderBottom: '1px solid var(--color-slate-20)', textAlign: 'left' }}>
                        <th style={{ padding: '0.6rem 0.75rem' }}>Date</th>
                        <th style={{ padding: '0.6rem 0.75rem' }}>Time (IST)</th>
                        <th style={{ padding: '0.6rem 0.75rem' }}>Type</th>
                        <th style={{ padding: '0.6rem 0.75rem' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profileAppointments.map(apt => (
                        <tr key={apt._id || apt.id} style={{ borderBottom: '1px solid var(--color-slate-10)' }}>
                          <td style={{ padding: '0.6rem 0.75rem' }}>{apt.date}</td>
                          <td style={{ padding: '0.6rem 0.75rem' }}>{apt.time}</td>
                          <td style={{ padding: '0.6rem 0.75rem' }}>{apt.type}</td>
                          <td style={{ padding: '0.6rem 0.75rem' }}>
                            <span style={{ padding: '0.2rem 0.5rem', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 600, background: apt.status === 'Confirmed' ? '#E8F5E9' : '#FFF8E1', color: apt.status === 'Confirmed' ? '#2E7D32' : '#F57F17' }}>
                              {apt.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeProfileTab === 'consent' && (
            <div className="card" style={{ padding: '1.5rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h3 style={{ fontSize: '1.05rem', margin: 0 }}>Informed Consent & Privacy Rights</h3>
                {selectedProfile.consentAndPrivacy?.consentWithdrawn ? (
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#C62828', background: '#FFEBEE', padding: '0.25rem 0.6rem', borderRadius: '12px' }}>
                    Consent Withdrawn on {formatISTDate(selectedProfile.consentAndPrivacy.withdrawnTimestamp)}
                  </span>
                ) : (
                  <button 
                    type="button" 
                    onClick={handleWithdrawConsent}
                    style={{ fontSize: '0.78rem', color: '#C62828', background: 'transparent', border: '1px solid #FFCDD2', padding: '0.3rem 0.7rem', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    Withdraw Counselling Consent
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.88rem' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={!!selectedProfile.consentAndPrivacy?.privacyNoticeAcknowledged} 
                    onChange={(e) => handleConsentToggle('privacyNoticeAcknowledged', e.target.checked)}
                    style={{ marginTop: '0.2rem' }}
                  />
                  <span>I acknowledge receipt and understanding of the institutional <strong>Verdant Mind Mental Health Privacy Notice</strong>.</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={!!selectedProfile.consentAndPrivacy?.counsellingConsent} 
                    onChange={(e) => handleConsentToggle('counsellingConsent', e.target.checked)}
                    style={{ marginTop: '0.2rem' }}
                  />
                  <span>I grant voluntary consent to receive psychological counselling and therapeutic consultations from authorized mental health practitioners.</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={!!selectedProfile.consentAndPrivacy?.assessmentConsent} 
                    onChange={(e) => handleConsentToggle('assessmentConsent', e.target.checked)}
                    style={{ marginTop: '0.2rem' }}
                  />
                  <span>I consent to standardized psychological screening assessments (ADHD, Depression, DBT screening) as part of my clinical care journey.</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={!!selectedProfile.consentAndPrivacy?.audioRecordingConsent} 
                    onChange={(e) => handleConsentToggle('audioRecordingConsent', e.target.checked)}
                    style={{ marginTop: '0.2rem' }}
                  />
                  <span>I consent to encrypted audio recording of sessions when deemed clinically helpful by my practitioner (optional; default is off).</span>
                </label>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          VIEW B: CLINICIAN & ADMIN PROFILE DIRECTORY (MODE = DIRECTORY)
          ========================================================================= */}
      {mode !== 'self' && !isStudent && (
        <>
          {/* Dashboard Metrics (from live authorized DB records) */}
          {stats && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
              <div className="card" style={{ padding: '1rem 1.25rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--color-slate)', fontWeight: 600 }}>Total Registered</span>
                <div style={{ fontSize: '1.65rem', fontWeight: 700, color: 'var(--color-slate-dark)', margin: '0.25rem 0' }}>{stats.total}</div>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-primary)' }}>{stats.students} Students • {stats.patients} Patients</span>
              </div>

              <div className="card" style={{ padding: '1rem 1.25rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
                <span style={{ fontSize: '0.78rem', color: '#1B5E20', fontWeight: 600 }}>Active Profiles</span>
                <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#1B5E20', margin: '0.25rem 0' }}>{stats.active}</div>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-slate)' }}>In active counselling care</span>
              </div>

              <div className="card" style={{ padding: '1rem 1.25rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
                <span style={{ fontSize: '0.78rem', color: '#F57F17', fontWeight: 600 }}>Pending Verification</span>
                <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#F57F17', margin: '0.25rem 0' }}>{stats.pendingVerification}</div>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-slate)' }}>Awaiting intake triage</span>
              </div>

              <div className="card" style={{ padding: '1rem 1.25rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
                <span style={{ fontSize: '0.78rem', color: '#455A64', fontWeight: 600 }}>Inactive / Archived</span>
                <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#455A64', margin: '0.25rem 0' }}>{stats.inactive + stats.archived}</div>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-slate)' }}>Closed or graduated cases</span>
              </div>
            </div>
          )}

          {/* Search, Filter & Actions Bar */}
          <div className="card" style={{ padding: '1.25rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem', flex: '1 1 300px' }}>
                <div style={{ position: 'relative', width: '100%' }}>
                  <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-slate)' }} />
                  <input 
                    type="text" 
                    placeholder="Search by student name, ID, email, or registration number..." 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ width: '100%', padding: '0.45rem 0.75rem 0.45rem 2.25rem', fontSize: '0.85rem', border: '1px solid var(--color-slate-20)', borderRadius: 'var(--radius-sm)' }}
                  />
                </div>
                <button type="submit" className="premium-btn" style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem' }}>
                  Search
                </button>
              </form>

              {isAdmin && (
                <button 
                  type="button" 
                  className="premium-btn" 
                  onClick={handleOpenCreateModal}
                  style={{ padding: '0.45rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <Plus size={15} /> Add Patient / Student Record
                </button>
              )}
            </div>

            {/* Filter Dropdowns */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', fontSize: '0.82rem' }}>
              <span style={{ color: 'var(--color-slate)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Filter size={14} /> Filter:
              </span>

              <select 
                value={categoryFilter} 
                onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
                style={{ padding: '0.35rem 0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-20)', fontSize: '0.82rem' }}
              >
                <option value="all">All Categories</option>
                <option value="student">Students</option>
                <option value="patient">General Patients</option>
              </select>

              <select 
                value={departmentFilter} 
                onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1); }}
                style={{ padding: '0.35rem 0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-20)', fontSize: '0.82rem' }}
              >
                <option value="all">All Departments</option>
                <option value="Computer Science & Engineering">CSE</option>
                <option value="Psychology & Behavioural Sciences">Psychology</option>
                <option value="Management & Commerce">Management</option>
                <option value="Natural Sciences & Biotechnology">Natural Sciences</option>
                <option value="Humanities & Social Sciences">Humanities</option>
              </select>

              <select 
                value={programmeFilter} 
                onChange={(e) => { setProgrammeFilter(e.target.value); setPage(1); }}
                style={{ padding: '0.35rem 0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-20)', fontSize: '0.82rem' }}
              >
                <option value="all">All Levels</option>
                <option value="UG">Undergraduate (UG)</option>
                <option value="PG">Postgraduate (PG)</option>
                <option value="PhD">Doctoral (PhD)</option>
              </select>

              <select 
                value={statusFilter} 
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                style={{ padding: '0.35rem 0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-20)', fontSize: '0.82rem' }}
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="pending_verification">Pending Verification</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          {/* Profile Data Table */}
          <div className="card" style={{ padding: '1rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)', overflowX: 'auto' }}>
            {isLoading ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-slate)' }}>
                <RefreshCw size={24} className="spin" style={{ marginBottom: '0.5rem' }} />
                <p style={{ margin: 0, fontSize: '0.88rem' }}>Loading profiles from database...</p>
              </div>
            ) : profiles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--color-slate)' }}>
                <Users size={36} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>No matching patient or student profiles found.</p>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.82rem' }}>Adjust search terms or create a new student record.</p>
              </div>
            ) : (
              <>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--color-slate-05)', borderBottom: '2px solid var(--color-slate-20)', textAlign: 'left' }}>
                      <th style={{ padding: '0.75rem 0.85rem' }}>Profile ID</th>
                      <th style={{ padding: '0.75rem 0.85rem' }}>Full Name</th>
                      <th style={{ padding: '0.75rem 0.85rem' }}>Category & Level</th>
                      <th style={{ padding: '0.75rem 0.85rem' }}>Department</th>
                      <th style={{ padding: '0.75rem 0.85rem' }}>Assigned Practitioner</th>
                      <th style={{ padding: '0.75rem 0.85rem' }}>Status</th>
                      <th style={{ padding: '0.75rem 0.85rem', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profiles.map(p => (
                      <tr key={p._id || p.profileId} style={{ borderBottom: '1px solid var(--color-slate-10)' }}>
                        <td style={{ padding: '0.75rem 0.85rem', fontWeight: 600 }}>
                          <span style={{ color: 'var(--color-primary)' }}>{p.profileId}</span>
                        </td>
                        <td style={{ padding: '0.75rem 0.85rem' }}>
                          <div style={{ fontWeight: 600, color: 'var(--color-slate-dark)' }}>{p.personalInfo?.fullName}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-slate)' }}>{p.personalInfo?.email}</div>
                        </td>
                        <td style={{ padding: '0.75rem 0.85rem' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'capitalize' }}>
                            {p.category} {p.academicInfo?.programmeLevel ? `(${p.academicInfo.programmeLevel})` : ''}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 0.85rem' }}>
                          {p.academicInfo?.department || '—'}
                        </td>
                        <td style={{ padding: '0.75rem 0.85rem' }}>
                          {p.assignedProvider?.providerName ? (
                            <span style={{ color: 'var(--color-slate-dark)', fontWeight: 500 }}>{p.assignedProvider.providerName}</span>
                          ) : (
                            <span style={{ color: 'var(--color-slate)', fontStyle: 'italic', fontSize: '0.8rem' }}>Unassigned</span>
                          )}
                        </td>
                        <td style={{ padding: '0.75rem 0.85rem' }}>
                          <span style={{ padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600, ...getStatusBadgeStyle(p.profileStatus) }}>
                            {p.profileStatus?.replace('_', ' ').toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 0.85rem', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                            <button 
                              type="button" 
                              onClick={() => handleOpenProfileDetails(p)}
                              title="View Full Profile"
                              style={{ padding: '0.35rem 0.6rem', background: 'var(--color-slate-05)', border: '1px solid var(--color-slate-20)', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.78rem' }}
                            >
                              <Eye size={13} /> View
                            </button>

                            <button 
                              type="button" 
                              onClick={() => handleOpenEditModal(p)}
                              title="Edit Record"
                              style={{ padding: '0.35rem 0.6rem', background: 'var(--color-slate-05)', border: '1px solid var(--color-slate-20)', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.78rem' }}
                            >
                              <Edit3 size={13} />
                            </button>

                            {isAdmin && (
                              <>
                                <button 
                                  type="button" 
                                  onClick={() => { setAssignTarget(p); setSelectedProviderEmail(p.assignedProvider?.providerEmail || ''); setShowAssignModal(true); }}
                                  title="Assign Care Provider"
                                  style={{ padding: '0.35rem 0.6rem', background: 'var(--color-primary-05)', border: '1px solid var(--color-primary-20)', color: 'var(--color-primary)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem' }}
                                >
                                  Assign
                                </button>
                                <button 
                                  type="button" 
                                  onClick={() => { setStatusChangeTarget(p); setNewStatus(p.profileStatus); setShowStatusModal(true); }}
                                  title="Change Profile Status"
                                  style={{ padding: '0.35rem 0.6rem', background: 'var(--color-slate-05)', border: '1px solid var(--color-slate-20)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem' }}
                                >
                                  Status
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Pagination Controls */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--color-slate-10)', fontSize: '0.82rem' }}>
                  <span style={{ color: 'var(--color-slate)' }}>
                    Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} total records)
                  </span>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button 
                      type="button" 
                      disabled={pagination.page <= 1}
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      style={{ padding: '0.35rem 0.75rem', borderRadius: '4px', border: '1px solid var(--color-slate-20)', background: pagination.page <= 1 ? '#F5F5F5' : '#FFF', cursor: pagination.page <= 1 ? 'not-allowed' : 'pointer' }}
                    >
                      <ChevronLeft size={14} style={{ verticalAlign: 'middle' }} /> Previous
                    </button>
                    <button 
                      type="button" 
                      disabled={pagination.page >= pagination.totalPages}
                      onClick={() => setPage(p => p + 1)}
                      style={{ padding: '0.35rem 0.75rem', borderRadius: '4px', border: '1px solid var(--color-slate-20)', background: pagination.page >= pagination.totalPages ? '#F5F5F5' : '#FFF', cursor: pagination.page >= pagination.totalPages ? 'not-allowed' : 'pointer' }}
                    >
                      Next <ChevronRight size={14} style={{ verticalAlign: 'middle' }} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* =========================================================================
          DETAILED PROFILE MODAL VIEWER (TABS 1-8)
          ========================================================================= */}
      {selectedProfile && mode !== 'self' && (
        <div className="profile-detail-modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="card" style={{ width: '900px', maxWidth: '100%', maxHeight: '90vh', background: '#FFF', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Modal Header */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--color-slate-20)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>{selectedProfile.personalInfo?.fullName}</h3>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: '12px', ...getStatusBadgeStyle(selectedProfile.profileStatus) }}>
                    {selectedProfile.profileStatus?.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--color-slate)', marginTop: '0.25rem' }}>
                  ID: <strong>{selectedProfile.profileId}</strong> • {selectedProfile.personalInfo?.email}
                </div>
              </div>
              <button type="button" onClick={() => setSelectedProfile(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-slate)' }}>
                <X size={20} />
              </button>
            </div>

            {/* Modal Tabs Navigation */}
            <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--color-slate-10)', background: 'var(--color-slate-05)', overflowX: 'auto' }}>
              {[
                { id: 'overview', label: 'Overview' },
                { id: 'personal', label: 'Personal' },
                { id: 'academic', label: 'Academic' },
                { id: 'emergency', label: 'Emergency' },
                { id: 'appointments', label: 'Appointments' },
                ...(isClinician ? [{ id: 'clinical', label: 'Clinical Documentation' }] : []),
                { id: 'documents', label: 'Documents' },
                { id: 'consent', label: 'Consent' }
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveProfileTab(tab.id)}
                  style={{
                    padding: '0.4rem 0.85rem',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    cursor: 'pointer',
                    background: activeProfileTab === tab.id ? 'var(--color-primary, #0F383D)' : '#FFF',
                    color: activeProfileTab === tab.id ? '#FFF' : 'var(--color-slate-dark)',
                    boxShadow: activeProfileTab === tab.id ? 'none' : '0 1px 2px rgba(0,0,0,0.05)'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Modal Scrollable Body */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
              {activeProfileTab === 'overview' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', fontSize: '0.85rem' }}>
                  <div style={{ padding: '1rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)' }}>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--color-slate)' }}>Personal Information</h4>
                    <p style={{ margin: '0.2rem 0' }}><strong>DOB:</strong> {selectedProfile.personalInfo?.dateOfBirth || '—'}</p>
                    <p style={{ margin: '0.2rem 0' }}><strong>Age:</strong> {selectedProfile.personalInfo?.age ? `${selectedProfile.personalInfo.age} yrs` : '—'}</p>
                    <p style={{ margin: '0.2rem 0' }}><strong>Phone:</strong> {selectedProfile.personalInfo?.phone || '—'}</p>
                    <p style={{ margin: '0.2rem 0' }}><strong>Language:</strong> {selectedProfile.personalInfo?.preferredLanguage || 'English'}</p>
                  </div>
                  <div style={{ padding: '1rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)' }}>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--color-slate)' }}>Academic Context</h4>
                    <p style={{ margin: '0.2rem 0' }}><strong>Category:</strong> {selectedProfile.category}</p>
                    <p style={{ margin: '0.2rem 0' }}><strong>Department:</strong> {selectedProfile.academicInfo?.department || '—'}</p>
                    <p style={{ margin: '0.2rem 0' }}><strong>Level:</strong> {selectedProfile.academicInfo?.programmeLevel || 'UG'}</p>
                    <p style={{ margin: '0.2rem 0' }}><strong>Reg No:</strong> {selectedProfile.academicInfo?.registrationNumber || '—'}</p>
                  </div>
                  <div style={{ padding: '1rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)' }}>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--color-slate)' }}>Care Allocation</h4>
                    <p style={{ margin: '0.2rem 0' }}><strong>Provider:</strong> {selectedProfile.assignedProvider?.providerName || 'Unassigned'}</p>
                    <p style={{ margin: '0.2rem 0' }}><strong>Care Status:</strong> {selectedProfile.clinicalInfo?.currentCareStatus || 'Intake'}</p>
                    <p style={{ margin: '0.2rem 0' }}><strong>Consent Version:</strong> {selectedProfile.consentAndPrivacy?.consentVersion || '1.0'}</p>
                  </div>
                </div>
              )}

              {activeProfileTab === 'personal' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', fontSize: '0.85rem' }}>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Full Name</span><strong>{selectedProfile.personalInfo?.fullName}</strong></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Email</span><strong>{selectedProfile.personalInfo?.email}</strong></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Phone</span><strong>{selectedProfile.personalInfo?.phone || '—'}</strong></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>DOB</span><strong>{selectedProfile.personalInfo?.dateOfBirth || '—'}</strong></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Calculated Age</span><strong>{selectedProfile.personalInfo?.age ? `${selectedProfile.personalInfo.age} yrs` : '—'}</strong></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Gender</span><strong>{selectedProfile.personalInfo?.gender || '—'}</strong></div>
                  <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Residential Address</span><strong>{[selectedProfile.personalInfo?.address, selectedProfile.personalInfo?.city, selectedProfile.personalInfo?.state, selectedProfile.personalInfo?.postalCode].filter(Boolean).join(', ') || 'Not specified'}</strong></div>
                </div>
              )}

              {activeProfileTab === 'academic' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', fontSize: '0.85rem' }}>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Registration Number</span><strong>{selectedProfile.academicInfo?.registrationNumber || '—'}</strong></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Department</span><strong>{selectedProfile.academicInfo?.department || '—'}</strong></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Faculty</span><strong>{selectedProfile.academicInfo?.schoolFaculty || '—'}</strong></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Programme</span><strong>{selectedProfile.academicInfo?.programme || '—'}</strong></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Classification</span><strong>{selectedProfile.academicInfo?.programmeLevel || 'UG'}</strong></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Semester / Year</span><strong>{selectedProfile.academicInfo?.currentSemester || '—'}</strong></div>
                </div>
              )}

              {activeProfileTab === 'emergency' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', fontSize: '0.85rem' }}>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Emergency Contact</span><strong>{selectedProfile.emergencyContact?.name || 'Not provided'}</strong></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Relationship</span><strong>{selectedProfile.emergencyContact?.relationship || '—'}</strong></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Contact Phone</span><strong>{selectedProfile.emergencyContact?.phone || '—'}</strong></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Alternate Phone</span><strong>{selectedProfile.emergencyContact?.altPhone || '—'}</strong></div>
                </div>
              )}

              {activeProfileTab === 'appointments' && (
                <div style={{ fontSize: '0.85rem' }}>
                  {profileAppointments.length === 0 ? (
                    <p style={{ color: 'var(--color-slate)' }}>No appointment records found for this patient.</p>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'var(--color-slate-05)', borderBottom: '1px solid var(--color-slate-20)', textAlign: 'left' }}>
                          <th style={{ padding: '0.5rem' }}>Date</th>
                          <th style={{ padding: '0.5rem' }}>Time</th>
                          <th style={{ padding: '0.5rem' }}>Type</th>
                          <th style={{ padding: '0.5rem' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profileAppointments.map(a => (
                          <tr key={a._id || a.id} style={{ borderBottom: '1px solid var(--color-slate-10)' }}>
                            <td style={{ padding: '0.5rem' }}>{a.date}</td>
                            <td style={{ padding: '0.5rem' }}>{a.time}</td>
                            <td style={{ padding: '0.5rem' }}>{a.type}</td>
                            <td style={{ padding: '0.5rem' }}>{a.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {activeProfileTab === 'clinical' && isClinician && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.85rem' }}>
                  <div style={{ background: '#FFF8E1', padding: '0.75rem', borderRadius: '4px', border: '1px solid #FFE082', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#B78103' }}>
                    <Lock size={16} /> <strong>Confidential Clinical Notes</strong> (Restricted to Authorized Care Providers)
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-slate)', fontSize: '0.78rem', display: 'block' }}>Presenting Concerns</span>
                    <p style={{ margin: '0.2rem 0', background: 'var(--color-slate-05)', padding: '0.6rem', borderRadius: '4px' }}>
                      {selectedProfile.clinicalInfo?.presentingConcerns || 'No intake concerns documented.'}
                    </p>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-slate)', fontSize: '0.78rem', display: 'block' }}>Relevant Clinical & Therapeutic History</span>
                    <p style={{ margin: '0.2rem 0', background: 'var(--color-slate-05)', padding: '0.6rem', borderRadius: '4px' }}>
                      {selectedProfile.clinicalInfo?.relevantClinicalHistory || 'No prior psychiatric/medical history entered.'}
                    </p>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-slate)', fontSize: '0.78rem', display: 'block' }}>Follow-up & Therapeutic Recommendations</span>
                    <p style={{ margin: '0.2rem 0', background: 'var(--color-slate-05)', padding: '0.6rem', borderRadius: '4px' }}>
                      {selectedProfile.clinicalInfo?.followUpRecommendations || 'Standard ongoing counselling protocol.'}
                    </p>
                  </div>

                  {profileClinicalRecords && (
                    <div style={{ marginTop: '0.5rem', background: '#F8F9FA', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--color-slate-10)' }}>
                      <strong style={{ display: 'block', marginBottom: '0.35rem', color: 'var(--color-slate-dark)' }}>Linked Electronic Health Records:</strong>
                      <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--color-slate-light)' }}>
                        <li>Case History Assessments: {profileClinicalRecords.caseHistories?.length || 0}</li>
                        <li>Mental Status Examinations (MSE): {profileClinicalRecords.mses?.length || 0}</li>
                        <li>SOAP Clinical Notes: {profileClinicalRecords.soapNotes?.length || 0}</li>
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {activeProfileTab === 'documents' && (
                <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <form onSubmit={handleAttachDocument} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <input 
                      type="text" 
                      placeholder="Document title / description..." 
                      value={docTitle}
                      onChange={(e) => setDocTitle(e.target.value)}
                      style={{ flex: 1, padding: '0.4rem 0.6rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px' }}
                    />
                    <select 
                      value={docCategory}
                      onChange={(e) => setDocCategory(e.target.value)}
                      style={{ padding: '0.4rem 0.6rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px' }}
                    >
                      <option value="Referral">Referral Form</option>
                      <option value="Consent">Signed Consent</option>
                      <option value="Academic">Academic Document</option>
                      <option value="Clinical">Clinical Record</option>
                      <option value="Other">Other</option>
                    </select>
                    <button type="submit" className="premium-btn" style={{ padding: '0.4rem 0.8rem' }}>
                      <FilePlus size={14} style={{ marginRight: '4px' }} /> Attach
                    </button>
                  </form>

                  {(selectedProfile.documents || []).length === 0 ? (
                    <p style={{ color: 'var(--color-slate)' }}>No documents attached to this profile.</p>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'var(--color-slate-05)', borderBottom: '1px solid var(--color-slate-20)', textAlign: 'left' }}>
                          <th style={{ padding: '0.5rem' }}>Title</th>
                          <th style={{ padding: '0.5rem' }}>Category</th>
                          <th style={{ padding: '0.5rem' }}>Uploaded Date</th>
                          <th style={{ padding: '0.5rem' }}>Uploaded By</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedProfile.documents.map(d => (
                          <tr key={d.docId || d._id} style={{ borderBottom: '1px solid var(--color-slate-10)' }}>
                            <td style={{ padding: '0.5rem', fontWeight: 600 }}>{d.title}</td>
                            <td style={{ padding: '0.5rem' }}>{d.category}</td>
                            <td style={{ padding: '0.5rem' }}>{formatISTDate(d.uploadedAt)}</td>
                            <td style={{ padding: '0.5rem' }}>{d.uploadedBy}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {activeProfileTab === 'consent' && (
                <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div><strong>Privacy Notice Acknowledged:</strong> {selectedProfile.consentAndPrivacy?.privacyNoticeAcknowledged ? 'Yes' : 'No'}</div>
                  <div><strong>Counselling Consent Granted:</strong> {selectedProfile.consentAndPrivacy?.counsellingConsent ? 'Yes' : 'No'}</div>
                  <div><strong>Assessment Consent Granted:</strong> {selectedProfile.consentAndPrivacy?.assessmentConsent ? 'Yes' : 'No'}</div>
                  <div><strong>Audio Recording Consent Granted:</strong> {selectedProfile.consentAndPrivacy?.audioRecordingConsent ? 'Yes (Opted In)' : 'No (Default Off)'}</div>
                  <div><strong>Consent Timestamp:</strong> {formatISTDate(selectedProfile.consentAndPrivacy?.consentTimestamp)}</div>
                  {selectedProfile.consentAndPrivacy?.consentWithdrawn && (
                    <div style={{ color: '#C62828' }}><strong>Consent Status:</strong> Withdrawn ({selectedProfile.consentAndPrivacy.withdrawnReason})</div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--color-slate-20)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button 
                type="button" 
                onClick={() => { setSelectedProfile(null); handleOpenEditModal(selectedProfile); }}
                className="premium-btn"
                style={{ padding: '0.45rem 1rem', fontSize: '0.85rem' }}
              >
                <Edit3 size={14} style={{ marginRight: '4px' }} /> Edit Details
              </button>
              <button 
                type="button" 
                onClick={() => setSelectedProfile(null)}
                style={{ padding: '0.45rem 1rem', fontSize: '0.85rem', border: '1px solid var(--color-slate-20)', background: '#FFF', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          CREATE / EDIT PROFILE MODAL
          ========================================================================= */}
      {showEditModal && editFormData && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <form onSubmit={handleSaveProfile} className="card" style={{ width: '800px', maxWidth: '100%', maxHeight: '90vh', background: '#FFF', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--color-slate-20)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
                {isCreatingNew ? 'Create New Patient / Student Record' : `Edit Profile: ${editFormData.profileId}`}
              </h3>
              <button type="button" onClick={() => setShowEditModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Category */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Profile Category *</label>
                <select 
                  value={editFormData.category || 'student'}
                  onChange={(e) => setEditFormData({ ...editFormData, category: e.target.value })}
                  style={{ width: '100%', padding: '0.45rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-20)', fontSize: '0.85rem' }}
                >
                  <option value="student">University Student</option>
                  <option value="patient">General Patient</option>
                  <option value="staff_referral">Staff Referral</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Personal Information Section */}
              <fieldset style={{ border: '1px solid var(--color-slate-20)', borderRadius: 'var(--radius-sm)', padding: '1rem' }}>
                <legend style={{ fontSize: '0.85rem', fontWeight: 700, padding: '0 0.5rem', color: 'var(--color-primary)' }}>Personal Information</legend>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block' }}>Full Name *</label>
                    <input 
                      type="text" 
                      required
                      value={editFormData.personalInfo?.fullName || ''}
                      onChange={(e) => setEditFormData({
                        ...editFormData,
                        personalInfo: { ...editFormData.personalInfo, fullName: e.target.value }
                      })}
                      style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block' }}>Email Address *</label>
                    <input 
                      type="email" 
                      required
                      value={editFormData.personalInfo?.email || ''}
                      onChange={(e) => setEditFormData({
                        ...editFormData,
                        personalInfo: { ...editFormData.personalInfo, email: e.target.value }
                      })}
                      style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block' }}>Phone Number</label>
                    <input 
                      type="text" 
                      value={editFormData.personalInfo?.phone || ''}
                      onChange={(e) => setEditFormData({
                        ...editFormData,
                        personalInfo: { ...editFormData.personalInfo, phone: e.target.value }
                      })}
                      style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block' }}>Date of Birth (DD-MM-YYYY)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 15-08-2002"
                      value={editFormData.personalInfo?.dateOfBirth || ''}
                      onChange={(e) => setEditFormData({
                        ...editFormData,
                        personalInfo: { ...editFormData.personalInfo, dateOfBirth: e.target.value }
                      })}
                      style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block' }}>Gender</label>
                    <select
                      value={editFormData.personalInfo?.gender || 'Self-described'}
                      onChange={(e) => setEditFormData({
                        ...editFormData,
                        personalInfo: { ...editFormData.personalInfo, gender: e.target.value }
                      })}
                      style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                    >
                      <option value="Self-described">Self-described</option>
                      <option value="Female">Female</option>
                      <option value="Male">Male</option>
                      <option value="Non-Binary">Non-Binary</option>
                      <option value="Prefer not to say">Prefer not to say</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block' }}>Preferred Language</label>
                    <input 
                      type="text" 
                      value={editFormData.personalInfo?.preferredLanguage || 'English'}
                      onChange={(e) => setEditFormData({
                        ...editFormData,
                        personalInfo: { ...editFormData.personalInfo, preferredLanguage: e.target.value }
                      })}
                      style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                    />
                  </div>

                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block' }}>Address</label>
                    <input 
                      type="text" 
                      value={editFormData.personalInfo?.address || ''}
                      onChange={(e) => setEditFormData({
                        ...editFormData,
                        personalInfo: { ...editFormData.personalInfo, address: e.target.value }
                      })}
                      style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                    />
                  </div>
                </div>
              </fieldset>

              {/* Academic Section */}
              <fieldset style={{ border: '1px solid var(--color-slate-20)', borderRadius: 'var(--radius-sm)', padding: '1rem' }}>
                <legend style={{ fontSize: '0.85rem', fontWeight: 700, padding: '0 0.5rem', color: 'var(--color-primary)' }}>Academic Information (For Students)</legend>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block' }}>Registration Number</label>
                    <input 
                      type="text" 
                      value={editFormData.academicInfo?.registrationNumber || ''}
                      onChange={(e) => setEditFormData({
                        ...editFormData,
                        academicInfo: { ...editFormData.academicInfo, registrationNumber: e.target.value }
                      })}
                      style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block' }}>Department</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Psychology, Computer Science"
                      value={editFormData.academicInfo?.department || ''}
                      onChange={(e) => setEditFormData({
                        ...editFormData,
                        academicInfo: { ...editFormData.academicInfo, department: e.target.value }
                      })}
                      style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block' }}>Level</label>
                    <select
                      value={editFormData.academicInfo?.programmeLevel || 'UG'}
                      onChange={(e) => setEditFormData({
                        ...editFormData,
                        academicInfo: { ...editFormData.academicInfo, programmeLevel: e.target.value }
                      })}
                      style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                    >
                      <option value="UG">Undergraduate (UG)</option>
                      <option value="PG">Postgraduate (PG)</option>
                      <option value="PhD">Doctoral (PhD)</option>
                      <option value="Diploma">Diploma</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block' }}>Current Semester / Year</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Sem 4 / Year 2"
                      value={editFormData.academicInfo?.currentSemester || ''}
                      onChange={(e) => setEditFormData({
                        ...editFormData,
                        academicInfo: { ...editFormData.academicInfo, currentSemester: e.target.value }
                      })}
                      style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                    />
                  </div>
                </div>
              </fieldset>

              {/* Emergency Contact */}
              <fieldset style={{ border: '1px solid var(--color-slate-20)', borderRadius: 'var(--radius-sm)', padding: '1rem' }}>
                <legend style={{ fontSize: '0.85rem', fontWeight: 700, padding: '0 0.5rem', color: 'var(--color-primary)' }}>Emergency Contact</legend>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block' }}>Contact Person Name</label>
                    <input 
                      type="text" 
                      value={editFormData.emergencyContact?.name || ''}
                      onChange={(e) => setEditFormData({
                        ...editFormData,
                        emergencyContact: { ...editFormData.emergencyContact, name: e.target.value }
                      })}
                      style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block' }}>Relationship</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Parent, Guardian, Spouse"
                      value={editFormData.emergencyContact?.relationship || ''}
                      onChange={(e) => setEditFormData({
                        ...editFormData,
                        emergencyContact: { ...editFormData.emergencyContact, relationship: e.target.value }
                      })}
                      style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block' }}>Mobile Number</label>
                    <input 
                      type="text" 
                      value={editFormData.emergencyContact?.phone || ''}
                      onChange={(e) => setEditFormData({
                        ...editFormData,
                        emergencyContact: { ...editFormData.emergencyContact, phone: e.target.value }
                      })}
                      style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                    />
                  </div>
                </div>
              </fieldset>

              {/* Clinician fields (only visible if staff) */}
              {isClinician && !isStudent && (
                <fieldset style={{ border: '1px solid #FFE082', borderRadius: 'var(--radius-sm)', padding: '1rem', background: '#FFFDF5' }}>
                  <legend style={{ fontSize: '0.85rem', fontWeight: 700, padding: '0 0.5rem', color: '#B78103' }}>Clinical Information (Provider Only)</legend>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block' }}>Presenting Concerns</label>
                      <textarea 
                        rows={2}
                        value={editFormData.clinicalInfo?.presentingConcerns || ''}
                        onChange={(e) => setEditFormData({
                          ...editFormData,
                          clinicalInfo: { ...editFormData.clinicalInfo, presentingConcerns: e.target.value }
                        })}
                        style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block' }}>Relevant Clinical History</label>
                      <textarea 
                        rows={2}
                        value={editFormData.clinicalInfo?.relevantClinicalHistory || ''}
                        onChange={(e) => setEditFormData({
                          ...editFormData,
                          clinicalInfo: { ...editFormData.clinicalInfo, relevantClinicalHistory: e.target.value }
                        })}
                        style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                      />
                    </div>
                  </div>
                </fieldset>
              )}
            </div>

            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--color-slate-20)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button 
                type="button" 
                onClick={() => setShowEditModal(false)}
                style={{ padding: '0.45rem 1rem', fontSize: '0.85rem', border: '1px solid var(--color-slate-20)', background: '#FFF', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={savingProfile}
                className="premium-btn"
                style={{ padding: '0.45rem 1.25rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <Save size={15} /> {savingProfile ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =========================================================================
          CHANGE STATUS MODAL
          ========================================================================= */}
      {showStatusModal && statusChangeTarget && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <form onSubmit={handleChangeStatusSubmit} className="card" style={{ width: '450px', background: '#FFF', padding: '1.5rem', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Change Profile Status</h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-slate)' }}>
              Updating status for <strong>{statusChangeTarget.personalInfo?.fullName}</strong> ({statusChangeTarget.profileId})
            </p>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Select New Status</label>
              <select 
                value={newStatus} 
                onChange={(e) => setNewStatus(e.target.value)}
                style={{ width: '100%', padding: '0.45rem', borderRadius: '4px', border: '1px solid var(--color-slate-20)', fontSize: '0.85rem' }}
              >
                <option value="pending_verification">Pending Verification</option>
                <option value="active">Active (In Care)</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Audit Reason</label>
              <input 
                type="text" 
                placeholder="e.g. Intake verified, student graduated, etc."
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                style={{ width: '100%', padding: '0.45rem', borderRadius: '4px', border: '1px solid var(--color-slate-20)', fontSize: '0.85rem' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="button" onClick={() => setShowStatusModal(false)} style={{ padding: '0.45rem 1rem', border: '1px solid var(--color-slate-20)', background: '#FFF', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
              <button type="submit" className="premium-btn" style={{ padding: '0.45rem 1rem' }}>Update Status</button>
            </div>
          </form>
        </div>
      )}

      {/* =========================================================================
          ASSIGN CARE PROVIDER MODAL
          ========================================================================= */}
      {showAssignModal && assignTarget && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <form onSubmit={handleAssignProviderSubmit} className="card" style={{ width: '480px', background: '#FFF', padding: '1.5rem', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Assign Care Provider</h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-slate)' }}>
              Assigning practitioner for <strong>{assignTarget.personalInfo?.fullName}</strong> ({assignTarget.profileId})
            </p>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Select Practitioner / Clinician</label>
              <select 
                value={selectedProviderEmail} 
                onChange={(e) => setSelectedProviderEmail(e.target.value)}
                required
                style={{ width: '100%', padding: '0.45rem', borderRadius: '4px', border: '1px solid var(--color-slate-20)', fontSize: '0.85rem' }}
              >
                <option value="">-- Choose Approved Clinician --</option>
                {counsellorsList.map(c => (
                  <option key={c._id || c.email} value={c.email}>
                    {c.name} ({c.email}) - {c.role}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Clinical Assignment Notes / Reason</label>
              <input 
                type="text" 
                placeholder="e.g. Specialized in ADHD intake, regional language match"
                value={assignReason}
                onChange={(e) => setAssignReason(e.target.value)}
                style={{ width: '100%', padding: '0.45rem', borderRadius: '4px', border: '1px solid var(--color-slate-20)', fontSize: '0.85rem' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="button" onClick={() => setShowAssignModal(false)} style={{ padding: '0.45rem 1rem', border: '1px solid var(--color-slate-20)', background: '#FFF', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
              <button type="submit" className="premium-btn" style={{ padding: '0.45rem 1rem' }}>Confirm Assignment</button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
