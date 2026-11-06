import React, { useState, useEffect } from 'react';
import { 
  Users, User, Search, Filter, Plus, Eye, Edit3, Shield, CheckCircle2, 
  AlertCircle, Clock, HeartHandshake, ChevronLeft, ChevronRight, Lock, 
  Save, X, RefreshCw, FilePlus, ChevronDown, ChevronUp, Calendar, 
  Phone, Mail, MapPin, Activity, Baby, BookOpen, FileText, Check, AlertTriangle
} from 'lucide-react';
import { formatISTDate } from '../utils/dateTime.js';
import { safeJson, getResponseError } from '../utils/api.js';

// Calculate age helper with future date detection
function calculateAgeClient(dobStr) {
  if (!dobStr) return { age: null, isFuture: false };
  let d = null;
  if (typeof dobStr === 'string' && /^\d{2}-\d{2}-\d{4}$/.test(dobStr)) {
    const parts = dobStr.split('-');
    d = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
  } else {
    d = new Date(dobStr);
  }
  if (isNaN(d.getTime())) return { age: null, isFuture: false };
  const today = new Date();
  if (d > today) {
    return { age: null, isFuture: true };
  }
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) {
    age--;
  }
  return { age: age >= 0 && age < 130 ? age : null, isFuture: false };
}

// Blank registration form model
const getBlankFormData = (userEmail = '') => ({
  category: 'General Patient',
  profileStatus: 'pending_verification',
  personalInfo: {
    fullName: '',
    email: '',
    phone: '',
    alternatePhone: '',
    dateOfBirth: '',
    age: '',
    gender: 'Unknown / Not Available',
    selfDescribedGender: '',
    occupation: '',
    address: '',
    city: '',
    state: '',
    pinCode: '',
    postalCode: '',
    preferredLanguage: 'English'
  },
  emergencyContact: {
    contactPersonName: '',
    name: '',
    relationship: '',
    phone: '',
    altPhone: '',
    address: '',
    authorizedForClinicalDisclosure: false
  },
  pastMedicalPsychiatricHistory: {
    assessmentStatus: 'None reported',
    previousMedicalIllnesses: '',
    previousPsychiatricHistory: '',
    previousPsychologicalCounselling: '',
    previousPsychiatricConsultation: '',
    previousHospitalisation: '',
    previousSurgeries: '',
    previousTreatments: '',
    currentMedications: '',
    previousMedications: '',
    knownAllergies: '',
    substanceUseHistory: '',
    relevantMedicalNotes: '',
    structuredConditions: []
  },
  familyHistory: {
    familyMedicalHistory: '',
    familyPsychiatricHistory: '',
    hereditaryConditions: '',
    historyOfSubstanceUseInFamily: '',
    relevantFamilyStressors: '',
    familyStructure: '',
    familySupportSystem: '',
    additionalFamilyNotes: '',
    structuredMembers: []
  },
  birthDevelopmentalHistory: {
    status: 'Not Applicable',
    pregnancyHistory: '',
    maternalPregnancyComplications: '',
    birthType: 'Unknown',
    gestationalAge: '',
    prematureBirth: 'Unknown',
    birthComplications: '',
    birthWeight: '',
    neonatalComplications: '',
    developmentalMilestones: '',
    speechLanguageDevelopment: '',
    motorDevelopment: '',
    cognitiveLearningDevelopment: '',
    childhoodDevelopmentalConcerns: '',
    relevantAdditionalNotes: ''
  },
  personalSocialHistory: {
    educationalBackground: '',
    occupationalHistory: '',
    employmentStatus: '',
    maritalStatus: '',
    livingArrangements: '',
    socialSupport: '',
    sleepPattern: '',
    appetite: '',
    lifestyleInformation: '',
    relevantPersonalHistory: '',
    additionalNotes: ''
  },
  clinicalInfo: {
    presentingConcerns: '',
    durationOfConcerns: '',
    onsetAndCourse: '',
    previousCounsellingExperience: '',
    previousMentalHealthTreatment: '',
    relevantClinicalObservations: '',
    initialClinicalImpression: '',
    additionalClinicalNotes: '',
    currentCareStatus: 'Intake',
    followUpRecommendations: ''
  },
  consentAndPrivacy: {
    patientConsentStatus: 'Pending',
    consentDateTime: new Date().toISOString().slice(0, 16),
    consentRecordedBy: userEmail || '',
    guardianDetails: {
      hasGuardian: false,
      guardianName: '',
      guardianRelationship: '',
      guardianPhone: '',
      guardianEmail: '',
      guardianConsentStatus: 'Not Applicable'
    },
    privacyNoticeAcknowledged: false,
    counsellingConsent: false,
    assessmentConsent: false,
    audioRecordingConsent: false,
    consentVersion: '2.0'
  }
});

export default function PatientProfileManager({ currentUser, mode = 'directory', onProfileSelect }) {
  const isClientUser = currentUser?.role === 'client';
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
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 });
  const [mobileDirectoryView, setMobileDirectoryView] = useState('cards'); // 'cards' | 'table' on mobile screens

  // Single Profile View & Modals
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [activeProfileTab, setActiveProfileTab] = useState('overview');
  const [profileAppointments, setProfileAppointments] = useState([]);
  const [profileClinicalRecords, setProfileClinicalRecords] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Edit / Create Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [editFormData, setEditFormData] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [isFormDirty, setIsFormDirty] = useState(false);

  // Accordion State for Modal Form Sections A - H
  const [accordionOpen, setAccordionOpen] = useState({
    sectionA: true,
    sectionB: true,
    sectionC: false,
    sectionD: false,
    sectionE: false,
    sectionF: false,
    sectionG: false,
    sectionH: false
  });

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
    if (mode === 'self' || isClientUser) return;
    setIsLoading(true);
    setErrorMsg('');
    try {
      const queryParams = new URLSearchParams({
        search,
        status: statusFilter,
        category: categoryFilter,
        page: String(page),
        limit: '10'
      });

      const res = await fetch(`/api/profiles?${queryParams.toString()}`, { credentials: 'include' });
      if (!res.ok) {
        const errorText = await getResponseError(res, 'Failed to fetch patient records');
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
    if (mode === 'self' || isClientUser) return;
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
    if (mode !== 'self' && !isClientUser) return;
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/profiles/me', { credentials: 'include' });
      if (!res.ok) {
        const errorText = await getResponseError(res, 'Could not load your patient profile');
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
    if (mode === 'self' || isClientUser) {
      fetchSelfProfile();
    } else {
      fetchProfiles();
      fetchStats();
      fetchCounsellors();
    }
  }, [mode, isClientUser, page, statusFilter, categoryFilter]);

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
      const aptRes = await fetch(`/api/profiles/${profileId}/appointments`, { credentials: 'include' });
      if (aptRes.ok) {
        const apts = await safeJson(aptRes);
        setProfileAppointments(Array.isArray(apts) ? apts : []);
      }

      // 2. Clinical records (if permitted)
      if (isClinician) {
        const clinRes = await fetch(`/api/profiles/${profileId}/clinical-records`, { credentials: 'include' });
        if (clinRes.ok) {
          const clinData = await safeJson(clinRes);
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
    setEditFormData(getBlankFormData(currentUser?.email));
    setIsFormDirty(false);
    setAccordionOpen({
      sectionA: true,
      sectionB: true,
      sectionC: false,
      sectionD: false,
      sectionE: false,
      sectionF: false,
      sectionG: false,
      sectionH: false
    });
    setShowEditModal(true);
  };

  const handleOpenEditModal = (profile) => {
    setIsCreatingNew(false);
    const cloned = JSON.parse(JSON.stringify(profile));
    // Ensure all new section objects exist for safe binding
    cloned.category = cloned.category || 'General Patient';
    cloned.personalInfo = cloned.personalInfo || {};
    cloned.emergencyContact = cloned.emergencyContact || {};
    cloned.pastMedicalPsychiatricHistory = cloned.pastMedicalPsychiatricHistory || {
      assessmentStatus: 'None reported',
      structuredConditions: []
    };
    cloned.familyHistory = cloned.familyHistory || { structuredMembers: [] };
    cloned.birthDevelopmentalHistory = cloned.birthDevelopmentalHistory || { status: 'Not Applicable' };
    cloned.personalSocialHistory = cloned.personalSocialHistory || {};
    cloned.clinicalInfo = cloned.clinicalInfo || {};
    cloned.consentAndPrivacy = cloned.consentAndPrivacy || { patientConsentStatus: 'Pending', guardianDetails: {} };

    setEditFormData(cloned);
    setIsFormDirty(false);
    setAccordionOpen({
      sectionA: true,
      sectionB: true,
      sectionC: true,
      sectionD: false,
      sectionE: false,
      sectionF: false,
      sectionG: isClinician,
      sectionH: true
    });
    setShowEditModal(true);
  };

  const handleCloseEditModal = () => {
    if (isFormDirty) {
      const confirmDiscard = window.confirm('You have unsaved form changes. Are you sure you wish to discard them?');
      if (!confirmDiscard) return;
    }
    setShowEditModal(false);
    setEditFormData(null);
    setIsFormDirty(false);
  };

  const handleSaveProfile = async (e, saveAsDraft = false) => {
    if (e && e.preventDefault) e.preventDefault();
    setSavingProfile(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const payload = JSON.parse(JSON.stringify(editFormData));
      if (saveAsDraft) {
        payload.profileStatus = 'pending_verification';
      }

      // Check DOB future validation on client
      if (payload.personalInfo?.dateOfBirth) {
        const { isFuture } = calculateAgeClient(payload.personalInfo.dateOfBirth);
        if (isFuture) {
          throw new Error('Date of birth cannot be in the future. Please enter a valid past date.');
        }
      }

      if (isCreatingNew) {
        const res = await fetch('/api/profiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        });
        const data = await safeJson(res);
        if (!res.ok) throw new Error(data?.error || 'Failed to create patient profile');

        setSuccessMsg(`Patient profile ${data.profileId} successfully registered.`);
        setShowEditModal(false);
        setIsFormDirty(false);
        fetchProfiles();
        fetchStats();
      } else {
        const profileId = payload.profileId;
        const res = await fetch(`/api/profiles/${profileId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        });
        const data = await safeJson(res);
        if (!res.ok) throw new Error(data?.error || 'Failed to update patient profile');

        setSuccessMsg(`Patient record ${profileId} updated successfully.`);
        setSelectedProfile(data);
        setShowEditModal(false);
        setIsFormDirty(false);
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
        credentials: 'include',
        body: JSON.stringify({ status: newStatus, reason: statusReason })
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || 'Failed to update status');

      setSuccessMsg(`Patient status updated to ${newStatus}.`);
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
        credentials: 'include',
        body: JSON.stringify({
          providerId: counsellor._id || counsellor.id,
          providerName: counsellor.name,
          providerEmail: counsellor.email,
          reason: assignReason
        })
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || 'Failed to assign care provider');

      setSuccessMsg(`Care provider successfully assigned to ${counsellor.name}.`);
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
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await safeJson(res);
        setSelectedProfile({
          ...selectedProfile,
          consentAndPrivacy: data?.consentAndPrivacy || payload
        });
        setSuccessMsg('Consent preference updated.');
      }
    } catch {
      setErrorMsg('Failed to update consent preference.');
    }
  };

  const handleWithdrawConsent = async () => {
    if (!selectedProfile) return;
    const confirmWithdraw = window.confirm('Are you sure you wish to withdraw all clinical and data consent? Active therapy sessions will be put on hold.');
    if (!confirmWithdraw) return;

    try {
      const res = await fetch(`/api/profiles/${selectedProfile.profileId}/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ withdrawConsent: true, withdrawnReason: 'Withdrawn by patient / service user' })
      });
      if (res.ok) {
        const data = await safeJson(res);
        setSelectedProfile({
          ...selectedProfile,
          consentAndPrivacy: data?.consentAndPrivacy
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
        credentials: 'include',
        body: JSON.stringify({
          title: docTitle.trim(),
          category: docCategory,
          fileUrl: '#'
        })
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || 'Failed to attach document');

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

  const toggleAllAccordions = (open) => {
    setAccordionOpen({
      sectionA: open,
      sectionB: open,
      sectionC: open,
      sectionD: open,
      sectionE: open,
      sectionF: open,
      sectionG: isClinician && open,
      sectionH: open
    });
  };

  const toggleSection = (sectionKey) => {
    setAccordionOpen(prev => ({ ...prev, [sectionKey]: !prev[sectionKey] }));
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

  // DOB Change Handler with calculated age
  const handleDobChange = (e) => {
    const dob = e.target.value;
    const { age } = calculateAgeClient(dob);
    setEditFormData(prev => ({
      ...prev,
      personalInfo: {
        ...prev.personalInfo,
        dateOfBirth: dob,
        age: age !== null ? age : prev.personalInfo.age
      }
    }));
    setIsFormDirty(true);
  };

  // Structured condition helpers
  const handleAddCondition = () => {
    const list = editFormData.pastMedicalPsychiatricHistory?.structuredConditions || [];
    setEditFormData({
      ...editFormData,
      pastMedicalPsychiatricHistory: {
        ...editFormData.pastMedicalPsychiatricHistory,
        structuredConditions: [
          ...list,
          { condition: '', approximateYear: '', treatmentReceived: '', currentStatus: 'Ongoing', notes: '' }
        ]
      }
    });
    setIsFormDirty(true);
  };

  const handleRemoveCondition = (idx) => {
    const list = [...(editFormData.pastMedicalPsychiatricHistory?.structuredConditions || [])];
    list.splice(idx, 1);
    setEditFormData({
      ...editFormData,
      pastMedicalPsychiatricHistory: {
        ...editFormData.pastMedicalPsychiatricHistory,
        structuredConditions: list
      }
    });
    setIsFormDirty(true);
  };

  const handleConditionChange = (idx, field, val) => {
    const list = [...(editFormData.pastMedicalPsychiatricHistory?.structuredConditions || [])];
    list[idx] = { ...list[idx], [field]: val };
    setEditFormData({
      ...editFormData,
      pastMedicalPsychiatricHistory: {
        ...editFormData.pastMedicalPsychiatricHistory,
        structuredConditions: list
      }
    });
    setIsFormDirty(true);
  };

  // Structured family member helpers
  const handleAddFamilyMember = () => {
    const list = editFormData.familyHistory?.structuredMembers || [];
    setEditFormData({
      ...editFormData,
      familyHistory: {
        ...editFormData.familyHistory,
        structuredMembers: [
          ...list,
          { relationship: '', condition: '', clinicalDetails: '' }
        ]
      }
    });
    setIsFormDirty(true);
  };

  const handleRemoveFamilyMember = (idx) => {
    const list = [...(editFormData.familyHistory?.structuredMembers || [])];
    list.splice(idx, 1);
    setEditFormData({
      ...editFormData,
      familyHistory: {
        ...editFormData.familyHistory,
        structuredMembers: list
      }
    });
    setIsFormDirty(true);
  };

  const handleFamilyMemberChange = (idx, field, val) => {
    const list = [...(editFormData.familyHistory?.structuredMembers || [])];
    list[idx] = { ...list[idx], [field]: val };
    setEditFormData({
      ...editFormData,
      familyHistory: {
        ...editFormData.familyHistory,
        structuredMembers: list
      }
    });
    setIsFormDirty(true);
  };

  const dobValidation = editFormData?.personalInfo?.dateOfBirth 
    ? calculateAgeClient(editFormData.personalInfo.dateOfBirth) 
    : { age: null, isFuture: false };

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
          VIEW A: PATIENT / SERVICE USER SELF-SERVICE VIEW (MODE = SELF)
          ========================================================================= */}
      {(mode === 'self' || isClientUser) && selectedProfile && (
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
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: '12px', background: '#E0F2F1', color: '#00695C' }}>
                    {selectedProfile.category || 'General Patient'}
                  </span>
                </div>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--color-slate)' }}>
                  {selectedProfile.personalInfo?.occupation ? `${selectedProfile.personalInfo.occupation} • ` : ''}
                  Registered Service User & Patient Portal Record
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
                <Edit3 size={15} /> Edit My Record
              </button>
            </div>
          </div>

          {/* Sub Navigation Tabs */}
          <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--color-slate-20)', paddingBottom: '0.5rem', overflowX: 'auto' }}>
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'personal', label: 'Personal Information' },
              { id: 'emergency', label: 'Emergency Contact' },
              { id: 'medical', label: 'Medical History' },
              { id: 'social', label: 'Personal & Social' },
              { id: 'appointments', label: 'Consultations' },
              { id: 'consent', label: 'Consent & Privacy' },
              ...(selectedProfile.academicInfo?.department || selectedProfile.academicInfo?.registrationNumber 
                ? [{ id: 'academic', label: 'Academic (Historical)' }] 
                : [])
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveProfileTab(tab.id)}
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
                <p style={{ margin: '0.25rem 0', fontSize: '0.85rem' }}><strong>Occupation:</strong> {selectedProfile.personalInfo?.occupation || 'Not specified'}</p>
                <p style={{ margin: '0.25rem 0', fontSize: '0.85rem' }}><strong>Language:</strong> {selectedProfile.personalInfo?.preferredLanguage || 'English'}</p>
              </div>

              <div className="card" style={{ padding: '1.25rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', color: 'var(--color-slate)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <HeartHandshake size={16} /> Care Allocation
                </h4>
                <p style={{ margin: '0.25rem 0', fontSize: '0.85rem' }}><strong>Assigned Practitioner:</strong> {selectedProfile.assignedProvider?.providerName || 'Pending intake review'}</p>
                <p style={{ margin: '0.25rem 0', fontSize: '0.85rem' }}><strong>Status:</strong> {selectedProfile.profileStatus?.replace('_', ' ').toUpperCase()}</p>
                <p style={{ margin: '0.25rem 0', fontSize: '0.85rem' }}><strong>Registered Date:</strong> {formatISTDate(selectedProfile.createdAt)}</p>
              </div>

              <div className="card" style={{ padding: '1.25rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', color: 'var(--color-slate)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Shield size={16} /> Emergency Contact
                </h4>
                <p style={{ margin: '0.25rem 0', fontSize: '0.85rem' }}><strong>Contact:</strong> {selectedProfile.emergencyContact?.contactPersonName || selectedProfile.emergencyContact?.name || 'Not provided'}</p>
                <p style={{ margin: '0.25rem 0', fontSize: '0.85rem' }}><strong>Relationship:</strong> {selectedProfile.emergencyContact?.relationship || '—'}</p>
                <p style={{ margin: '0.25rem 0', fontSize: '0.85rem' }}><strong>Mobile:</strong> {selectedProfile.emergencyContact?.phone || '—'}</p>
              </div>
            </div>
          )}

          {activeProfileTab === 'personal' && (
            <div className="card" style={{ padding: '1.5rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
              <h3 style={{ fontSize: '1.05rem', margin: '0 0 1rem 0' }}>Section A — Personal Information</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', fontSize: '0.88rem' }}>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Full Name</span><strong>{selectedProfile.personalInfo?.fullName}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Email Address</span><strong>{selectedProfile.personalInfo?.email}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Mobile Number</span><strong>{selectedProfile.personalInfo?.phone || '—'}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Alternate Mobile</span><strong>{selectedProfile.personalInfo?.alternatePhone || '—'}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Date of Birth</span><strong>{selectedProfile.personalInfo?.dateOfBirth || '—'}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Age</span><strong>{selectedProfile.personalInfo?.age !== undefined && selectedProfile.personalInfo?.age !== null ? `${selectedProfile.personalInfo.age} years` : '—'}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Gender</span><strong>{selectedProfile.personalInfo?.gender || '—'}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Occupation</span><strong>{selectedProfile.personalInfo?.occupation || '—'}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Preferred Language</span><strong>{selectedProfile.personalInfo?.preferredLanguage || 'English'}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Profile Category</span><strong>{selectedProfile.category || 'General Patient'}</strong></div>
                <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Residential Address</span><strong>{[selectedProfile.personalInfo?.address, selectedProfile.personalInfo?.city, selectedProfile.personalInfo?.state, selectedProfile.personalInfo?.pinCode || selectedProfile.personalInfo?.postalCode].filter(Boolean).join(', ') || 'Not specified'}</strong></div>
              </div>
            </div>
          )}

          {activeProfileTab === 'emergency' && (
            <div className="card" style={{ padding: '1.5rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
              <h3 style={{ fontSize: '1.05rem', margin: '0 0 0.5rem 0' }}>Section B — Emergency Contact Information</h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--color-slate)', margin: '0 0 1.25rem 0' }}>
                Emergency contacts are contacted exclusively in acute clinical or safety emergencies.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', fontSize: '0.88rem' }}>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Contact Person Name</span><strong>{selectedProfile.emergencyContact?.contactPersonName || selectedProfile.emergencyContact?.name || 'Not provided'}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Relationship</span><strong>{selectedProfile.emergencyContact?.relationship || '—'}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Mobile Number</span><strong>{selectedProfile.emergencyContact?.phone || '—'}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Alternate Contact Number</span><strong>{selectedProfile.emergencyContact?.altPhone || '—'}</strong></div>
                <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Address</span><strong>{selectedProfile.emergencyContact?.address || '—'}</strong></div>
              </div>
            </div>
          )}

          {activeProfileTab === 'medical' && (
            <div className="card" style={{ padding: '1.5rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
              <h3 style={{ fontSize: '1.05rem', margin: '0 0 1rem 0' }}>Section C — Past Medical & Psychiatric History</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', fontSize: '0.88rem' }}>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Assessment Status</span><strong>{selectedProfile.pastMedicalPsychiatricHistory?.assessmentStatus || 'None reported'}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Known Allergies</span><strong>{selectedProfile.pastMedicalPsychiatricHistory?.knownAllergies || 'None reported'}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Current Medications</span><strong>{selectedProfile.pastMedicalPsychiatricHistory?.currentMedications || 'None reported'}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Previous Medications</span><strong>{selectedProfile.pastMedicalPsychiatricHistory?.previousMedications || 'None reported'}</strong></div>
                <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Previous Medical Illnesses</span><p style={{ margin: '0.2rem 0' }}>{selectedProfile.pastMedicalPsychiatricHistory?.previousMedicalIllnesses || 'None reported'}</p></div>
                <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Previous Psychiatric / Mental Health History</span><p style={{ margin: '0.2rem 0' }}>{selectedProfile.pastMedicalPsychiatricHistory?.previousPsychiatricHistory || 'None reported'}</p></div>
                <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Previous Psychological Counselling</span><p style={{ margin: '0.2rem 0' }}>{selectedProfile.pastMedicalPsychiatricHistory?.previousPsychologicalCounselling || 'None reported'}</p></div>
                <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Hospitalisation & Surgeries</span><p style={{ margin: '0.2rem 0' }}>{selectedProfile.pastMedicalPsychiatricHistory?.previousHospitalisation || selectedProfile.pastMedicalPsychiatricHistory?.previousSurgeries || 'None reported'}</p></div>
              </div>
            </div>
          )}

          {activeProfileTab === 'social' && (
            <div className="card" style={{ padding: '1.5rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
              <h3 style={{ fontSize: '1.05rem', margin: '0 0 1rem 0' }}>Section F — Personal & Social History</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', fontSize: '0.88rem' }}>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Educational Background</span><strong>{selectedProfile.personalSocialHistory?.educationalBackground || '—'}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Employment Status</span><strong>{selectedProfile.personalSocialHistory?.employmentStatus || '—'}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Marital Status</span><strong>{selectedProfile.personalSocialHistory?.maritalStatus || '—'}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Living Arrangements</span><strong>{selectedProfile.personalSocialHistory?.livingArrangements || '—'}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Sleep Pattern</span><strong>{selectedProfile.personalSocialHistory?.sleepPattern || '—'}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Appetite & Nutrition</span><strong>{selectedProfile.personalSocialHistory?.appetite || '—'}</strong></div>
                <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Social Support Network</span><strong>{selectedProfile.personalSocialHistory?.socialSupport || '—'}</strong></div>
                <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Lifestyle & Personal History</span><p style={{ margin: '0.2rem 0' }}>{selectedProfile.personalSocialHistory?.lifestyleInformation || selectedProfile.personalSocialHistory?.relevantPersonalHistory || '—'}</p></div>
              </div>
            </div>
          )}

          {activeProfileTab === 'appointments' && (
            <div className="card" style={{ padding: '1.5rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
              <h3 style={{ fontSize: '1.05rem', margin: '0 0 1rem 0' }}>Consultation & Appointment History</h3>
              {loadingDetails ? (
                <p style={{ fontSize: '0.88rem', color: 'var(--color-slate)' }}>Loading consultations...</p>
              ) : profileAppointments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--color-slate)' }}>
                  <Clock size={32} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
                  <p style={{ margin: 0, fontSize: '0.88rem' }}>No consultation sessions on record.</p>
                </div>
              ) : (
                <div className="responsive-table-wrapper" style={{ margin: 0 }}>
                  <table className="responsive-table" style={{ width: '100%', minWidth: '480px', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--color-slate-05)', borderBottom: '1px solid var(--color-slate-20)', textAlign: 'left' }}>
                        <th style={{ padding: '0.6rem 0.75rem', whiteSpace: 'nowrap' }}>Date</th>
                        <th style={{ padding: '0.6rem 0.75rem', whiteSpace: 'nowrap' }}>Time (IST)</th>
                        <th style={{ padding: '0.6rem 0.75rem', whiteSpace: 'nowrap' }}>Type</th>
                        <th style={{ padding: '0.6rem 0.75rem', whiteSpace: 'nowrap' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profileAppointments.map(apt => (
                        <tr key={apt._id || apt.id} style={{ borderBottom: '1px solid var(--color-slate-10)' }}>
                          <td style={{ padding: '0.6rem 0.75rem', whiteSpace: 'nowrap' }}>{apt.date}</td>
                          <td style={{ padding: '0.6rem 0.75rem', whiteSpace: 'nowrap' }}>{apt.time}</td>
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
                <h3 style={{ fontSize: '1.05rem', margin: 0 }}>Section H — Informed Consent & Privacy Rights</h3>
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
                    Withdraw Care Consent
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
                  <span>I acknowledge receipt and understanding of the <strong>Verdant Mind Clinical Privacy Notice</strong>.</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={!!selectedProfile.consentAndPrivacy?.counsellingConsent} 
                    onChange={(e) => handleConsentToggle('counsellingConsent', e.target.checked)}
                    style={{ marginTop: '0.2rem' }}
                  />
                  <span>I grant voluntary consent to receive psychological counselling and mental health consultations from authorized practitioners.</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={!!selectedProfile.consentAndPrivacy?.assessmentConsent} 
                    onChange={(e) => handleConsentToggle('assessmentConsent', e.target.checked)}
                    style={{ marginTop: '0.2rem' }}
                  />
                  <span>I consent to psychological screening assessments as part of my clinical care journey.</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={!!selectedProfile.consentAndPrivacy?.audioRecordingConsent} 
                    onChange={(e) => handleConsentToggle('audioRecordingConsent', e.target.checked)}
                    style={{ marginTop: '0.2rem' }}
                  />
                  <span>I consent to encrypted audio recording of sessions when deemed clinically helpful (optional; default off).</span>
                </label>
              </div>
            </div>
          )}

          {activeProfileTab === 'academic' && (
            <div className="card" style={{ padding: '1.5rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
              <h3 style={{ fontSize: '1.05rem', margin: '0 0 1rem 0' }}>Academic Record (Historical University Data)</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', fontSize: '0.88rem' }}>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Registration Number</span><strong>{selectedProfile.academicInfo?.registrationNumber || '—'}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Department</span><strong>{selectedProfile.academicInfo?.department || '—'}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Classification Level</span><strong>{selectedProfile.academicInfo?.programmeLevel || 'UG'}</strong></div>
                <div><span style={{ color: 'var(--color-slate)', display: 'block', fontSize: '0.78rem' }}>Current Semester</span><strong>{selectedProfile.academicInfo?.currentSemester || '—'}</strong></div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          VIEW B: CLINICIAN & ADMIN PATIENT DIRECTORY (MODE = DIRECTORY)
          ========================================================================= */}
      {mode !== 'self' && !isClientUser && (
        <>
          {/* Dashboard Metrics */}
          {stats && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
              <div className="card" style={{ padding: '1rem 1.25rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--color-slate)', fontWeight: 600 }}>Total Registered</span>
                <div style={{ fontSize: '1.65rem', fontWeight: 700, color: 'var(--color-slate-dark)', margin: '0.25rem 0' }}>{stats.total || 0}</div>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-primary)' }}>
                  {stats.generalPatients || stats.patients || 0} Patients • {stats.staffReferrals || 0} Referrals
                </span>
              </div>

              <div className="card" style={{ padding: '1rem 1.25rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
                <span style={{ fontSize: '0.78rem', color: '#1B5E20', fontWeight: 600 }}>Active Care Cases</span>
                <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#1B5E20', margin: '0.25rem 0' }}>{stats.active || 0}</div>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-slate)' }}>In active therapy</span>
              </div>

              <div className="card" style={{ padding: '1rem 1.25rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
                <span style={{ fontSize: '0.78rem', color: '#F57F17', fontWeight: 600 }}>Pending Verification</span>
                <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#F57F17', margin: '0.25rem 0' }}>{stats.pendingVerification || 0}</div>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-slate)' }}>Awaiting intake triage</span>
              </div>

              <div className="card" style={{ padding: '1rem 1.25rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
                <span style={{ fontSize: '0.78rem', color: '#455A64', fontWeight: 600 }}>Inactive / Archived</span>
                <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#455A64', margin: '0.25rem 0' }}>{(stats.inactive || 0) + (stats.archived || 0)}</div>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-slate)' }}>Closed clinical files</span>
              </div>
            </div>
          )}

          {/* Search, Filter & Actions Bar */}
          <div className="card" style={{ padding: '1.25rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem', flex: '1 1 min(100%, 360px)', maxWidth: '100%' }}>
                <div style={{ position: 'relative', width: '100%' }}>
                  <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-slate)' }} />
                  <input 
                    type="text" 
                    placeholder="Search by patient / service user name, ID, email, phone, occupation..." 
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
                  <Plus size={15} /> Register Patient / Service User
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
                <option value="all">All Profile Categories</option>
                <option value="General Patient">General Patient</option>
                <option value="Staff Referral">Staff Referral</option>
                <option value="Self-Referral">Self-Referral</option>
                <option value="Professional Referral">Professional Referral</option>
                <option value="Other">Other Category</option>
                <option value="student">Historical Student Records</option>
              </select>

              <select 
                value={statusFilter} 
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                style={{ padding: '0.35rem 0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-20)', fontSize: '0.82rem' }}
              >
                <option value="all">All Clinical Statuses</option>
                <option value="active">Active Care</option>
                <option value="pending_verification">Pending Intake / Verification</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          {/* Patient Directory Data Table & Mobile Cards */}
          <div className="card" style={{ padding: '1rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
            {isLoading ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-slate)' }}>
                <RefreshCw size={24} className="spin" style={{ marginBottom: '0.5rem' }} />
                <p style={{ margin: 0, fontSize: '0.88rem' }}>Loading patient registry from database...</p>
              </div>
            ) : profiles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--color-slate)' }}>
                <Users size={36} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>No matching patient or service user records found.</p>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.82rem' }}>Adjust search criteria or register a new patient.</p>
              </div>
            ) : (
              <>
                {/* Segmented View Switcher on Mobile (<768px) */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div className="table-scroll-hint" style={{ margin: 0 }}>
                    {mobileDirectoryView === 'table' ? 'Scroll horizontally to view all columns ⇄' : 'Viewing responsive cards'}
                  </div>
                  <div className="table-view-toggle">
                    <button
                      type="button"
                      className={`table-view-toggle-btn ${mobileDirectoryView === 'cards' ? 'active' : ''}`}
                      onClick={() => setMobileDirectoryView('cards')}
                    >
                      Cards View
                    </button>
                    <button
                      type="button"
                      className={`table-view-toggle-btn ${mobileDirectoryView === 'table' ? 'active' : ''}`}
                      onClick={() => setMobileDirectoryView('table')}
                    >
                      Table View
                    </button>
                  </div>
                </div>

                {/* MOBILE CARDS VIEW */}
                {mobileDirectoryView === 'cards' && (
                  <div className="mobile-only-card-view mobile-card-list">
                    {profiles.map(p => (
                      <div key={p._id || p.profileId} className="mobile-record-card">
                        <div className="mobile-card-header">
                          <div>
                            <div className="mobile-card-title">{p.personalInfo?.fullName || 'Unnamed Record'}</div>
                            <div className="mobile-card-subtitle" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
                              {p.profileId} {p.personalInfo?.age ? `• ${p.personalInfo.age} yrs` : ''}
                            </div>
                          </div>
                          <span style={{ padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.74rem', fontWeight: 600, ...getStatusBadgeStyle(p.profileStatus) }}>
                            {p.profileStatus?.replace('_', ' ').toUpperCase()}
                          </span>
                        </div>

                        <div className="mobile-card-grid">
                          <div className="mobile-card-field">
                            <span className="mobile-field-label">Category</span>
                            <span className="mobile-field-value">
                              <span style={{ fontSize: '0.74rem', fontWeight: 600, padding: '0.15rem 0.45rem', borderRadius: '8px', background: '#E0F2F1', color: '#00695C', display: 'inline-block' }}>
                                {p.category || 'General Patient'}
                              </span>
                            </span>
                          </div>

                          <div className="mobile-card-field">
                            <span className="mobile-field-label">Assigned Practitioner</span>
                            <span className="mobile-field-value">
                              {p.assignedProvider?.providerName ? (
                                <span style={{ fontWeight: 500, color: 'var(--color-slate-dark)' }}>{p.assignedProvider.providerName}</span>
                              ) : (
                                <span style={{ color: 'var(--color-slate-light)', fontStyle: 'italic', fontSize: '0.8rem' }}>Unassigned</span>
                              )}
                            </span>
                          </div>

                          <div className="mobile-card-field">
                            <span className="mobile-field-label">Contact</span>
                            <span className="mobile-field-value">
                              <div>{p.personalInfo?.email || '—'}</div>
                              <div style={{ fontSize: '0.78rem', color: 'var(--color-slate-light)' }}>{p.personalInfo?.phone || '—'}</div>
                            </span>
                          </div>

                          <div className="mobile-card-field">
                            <span className="mobile-field-label">Location & Role</span>
                            <span className="mobile-field-value">
                              {[p.personalInfo?.city, p.personalInfo?.state].filter(Boolean).join(', ') || '—'}
                              {p.personalInfo?.occupation ? ` • ${p.personalInfo.occupation}` : ''}
                            </span>
                          </div>
                        </div>

                        <div className="mobile-card-actions">
                          <button 
                            type="button" 
                            onClick={() => handleOpenProfileDetails(p)}
                            title="View Clinical Profile"
                            style={{ padding: '0.35rem 0.65rem', background: 'var(--color-slate-05)', border: '1px solid var(--color-slate-20)', borderRadius: '4px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.76rem' }}
                          >
                            <Eye size={13} /> View
                          </button>

                          <button 
                            type="button" 
                            onClick={() => handleOpenEditModal(p)}
                            title="Edit Record"
                            style={{ padding: '0.35rem 0.65rem', background: 'var(--color-slate-05)', border: '1px solid var(--color-slate-20)', borderRadius: '4px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.76rem' }}
                          >
                            <Edit3 size={13} /> Edit
                          </button>

                          {isAdmin && (
                            <>
                              <button 
                                type="button" 
                                onClick={() => { setAssignTarget(p); setSelectedProviderEmail(p.assignedProvider?.providerEmail || ''); setShowAssignModal(true); }}
                                title="Assign Practitioner"
                                style={{ padding: '0.35rem 0.65rem', background: 'var(--color-primary-05)', border: '1px solid var(--color-primary-20)', color: 'var(--color-primary)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.76rem' }}
                              >
                                Assign
                              </button>
                              <button 
                                type="button" 
                                onClick={() => { setStatusChangeTarget(p); setNewStatus(p.profileStatus); setShowStatusModal(true); }}
                                title="Change Status"
                                style={{ padding: '0.35rem 0.65rem', background: 'var(--color-slate-05)', border: '1px solid var(--color-slate-20)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.76rem' }}
                              >
                                Status
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* DESKTOP & SCROLLABLE TABLE VIEW */}
                <div className={`desktop-table-container responsive-table-wrapper ${mobileDirectoryView === 'cards' ? 'mobile-hidden' : ''}`} style={{ margin: 0 }}>
                  <table className="responsive-table responsive-table-wide" style={{ borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--color-slate-05)', borderBottom: '2px solid var(--color-slate-20)', textAlign: 'left' }}>
                        <th style={{ padding: '0.75rem 0.85rem', whiteSpace: 'nowrap' }}>Profile ID</th>
                        <th style={{ padding: '0.75rem 0.85rem' }}>Patient / Service User</th>
                        <th style={{ padding: '0.75rem 0.85rem' }}>Category</th>
                        <th style={{ padding: '0.75rem 0.85rem' }}>Contact & Location</th>
                        <th style={{ padding: '0.75rem 0.85rem' }}>Assigned Practitioner</th>
                        <th style={{ padding: '0.75rem 0.85rem' }}>Status</th>
                        <th style={{ padding: '0.75rem 0.85rem', textAlign: 'right', whiteSpace: 'nowrap' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profiles.map(p => (
                        <tr key={p._id || p.profileId} style={{ borderBottom: '1px solid var(--color-slate-10)' }}>
                          <td style={{ padding: '0.75rem 0.85rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            <span style={{ color: 'var(--color-primary)' }}>{p.profileId}</span>
                          </td>
                          <td style={{ padding: '0.75rem 0.85rem' }}>
                            <div style={{ fontWeight: 600, color: 'var(--color-slate-dark)' }}>{p.personalInfo?.fullName}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-slate)' }}>
                              {p.personalInfo?.email}
                              {p.personalInfo?.age ? ` • ${p.personalInfo.age} yrs` : ''}
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem 0.85rem' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: '10px', background: '#E0F2F1', color: '#00695C' }}>
                              {p.category || 'General Patient'}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 0.85rem' }}>
                            <div style={{ fontSize: '0.82rem' }}>{p.personalInfo?.phone || '—'}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-slate)' }}>
                              {[p.personalInfo?.city, p.personalInfo?.state].filter(Boolean).join(', ') || (p.personalInfo?.occupation || '—')}
                            </div>
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
                                title="View Clinical Profile"
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
                                    title="Assign Practitioner"
                                    style={{ padding: '0.35rem 0.6rem', background: 'var(--color-primary-05)', border: '1px solid var(--color-primary-20)', color: 'var(--color-primary)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem' }}
                                  >
                                    Assign
                                  </button>
                                  <button 
                                    type="button" 
                                    onClick={() => { setStatusChangeTarget(p); setNewStatus(p.profileStatus); setShowStatusModal(true); }}
                                    title="Change Status"
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
                </div>

                {/* Pagination Controls */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--color-slate-10)', fontSize: '0.82rem' }}>
                  <span style={{ color: 'var(--color-slate)' }}>
                    Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} total registered records)
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
          DETAILED PATIENT PROFILE MODAL VIEWER (SECTIONS A - H & RECORDS)
          ========================================================================= */}
      {selectedProfile && mode !== 'self' && (
        <div className="profile-detail-modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="card" style={{ width: '960px', maxWidth: '100%', maxHeight: '92vh', background: '#FFF', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Modal Header */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--color-slate-20)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>{selectedProfile.personalInfo?.fullName}</h3>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: '12px', ...getStatusBadgeStyle(selectedProfile.profileStatus) }}>
                    {selectedProfile.profileStatus?.replace('_', ' ').toUpperCase()}
                  </span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: '12px', background: '#E0F2F1', color: '#00695C' }}>
                    {selectedProfile.category || 'General Patient'}
                  </span>
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--color-slate)', marginTop: '0.25rem' }}>
                  ID: <strong>{selectedProfile.profileId}</strong> • {selectedProfile.personalInfo?.email} • {selectedProfile.personalInfo?.phone || 'No phone'}
                </div>
              </div>
              <button type="button" onClick={() => setSelectedProfile(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-slate)' }}>
                <X size={20} />
              </button>
            </div>

            {/* Modal Tabs Navigation */}
            <div style={{ display: 'flex', gap: '0.4rem', padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--color-slate-10)', background: 'var(--color-slate-05)', overflowX: 'auto' }}>
              {[
                { id: 'overview', label: 'Overview' },
                { id: 'personal', label: 'Personal (A)' },
                { id: 'emergency', label: 'Emergency (B)' },
                { id: 'medical', label: 'Medical History (C)' },
                { id: 'family', label: 'Family History (D)' },
                { id: 'developmental', label: 'Developmental (E)' },
                { id: 'social', label: 'Personal & Social (F)' },
                ...(isClinician ? [{ id: 'clinical', label: 'Clinical (G)' }] : []),
                { id: 'consent', label: 'Consent (H)' },
                { id: 'appointments', label: 'Appointments' },
                { id: 'documents', label: 'Documents' },
                ...(selectedProfile.academicInfo?.department || selectedProfile.academicInfo?.registrationNumber 
                  ? [{ id: 'academic', label: 'Historical Student' }] 
                  : [])
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveProfileTab(tab.id)}
                  style={{
                    padding: '0.4rem 0.75rem',
                    fontSize: '0.8rem',
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
                    <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--color-slate)' }}>Demographics</h4>
                    <p style={{ margin: '0.2rem 0' }}><strong>DOB:</strong> {selectedProfile.personalInfo?.dateOfBirth || '—'}</p>
                    <p style={{ margin: '0.2rem 0' }}><strong>Age:</strong> {selectedProfile.personalInfo?.age ? `${selectedProfile.personalInfo.age} yrs` : '—'}</p>
                    <p style={{ margin: '0.2rem 0' }}><strong>Gender:</strong> {selectedProfile.personalInfo?.gender || '—'}</p>
                    <p style={{ margin: '0.2rem 0' }}><strong>Occupation:</strong> {selectedProfile.personalInfo?.occupation || '—'}</p>
                    <p style={{ margin: '0.2rem 0' }}><strong>Category:</strong> {selectedProfile.category || 'General Patient'}</p>
                  </div>
                  <div style={{ padding: '1rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)' }}>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--color-slate)' }}>Care Allocation</h4>
                    <p style={{ margin: '0.2rem 0' }}><strong>Provider:</strong> {selectedProfile.assignedProvider?.providerName || 'Unassigned'}</p>
                    <p style={{ margin: '0.2rem 0' }}><strong>Care Status:</strong> {selectedProfile.clinicalInfo?.currentCareStatus || 'Intake'}</p>
                    <p style={{ margin: '0.2rem 0' }}><strong>Consent:</strong> {selectedProfile.consentAndPrivacy?.patientConsentStatus || 'Pending'}</p>
                    <p style={{ margin: '0.2rem 0' }}><strong>Version:</strong> {selectedProfile.consentAndPrivacy?.consentVersion || '2.0'}</p>
                  </div>
                  <div style={{ padding: '1rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)' }}>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--color-slate)' }}>Emergency Contact</h4>
                    <p style={{ margin: '0.2rem 0' }}><strong>Name:</strong> {selectedProfile.emergencyContact?.contactPersonName || selectedProfile.emergencyContact?.name || '—'}</p>
                    <p style={{ margin: '0.2rem 0' }}><strong>Relation:</strong> {selectedProfile.emergencyContact?.relationship || '—'}</p>
                    <p style={{ margin: '0.2rem 0' }}><strong>Phone:</strong> {selectedProfile.emergencyContact?.phone || '—'}</p>
                  </div>
                </div>
              )}

              {activeProfileTab === 'personal' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', fontSize: '0.85rem' }}>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Full Name</span><strong>{selectedProfile.personalInfo?.fullName}</strong></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Email</span><strong>{selectedProfile.personalInfo?.email}</strong></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Mobile Number</span><strong>{selectedProfile.personalInfo?.phone || '—'}</strong></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Alternate Mobile</span><strong>{selectedProfile.personalInfo?.alternatePhone || '—'}</strong></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Date of Birth</span><strong>{selectedProfile.personalInfo?.dateOfBirth || '—'}</strong></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Calculated Age</span><strong>{selectedProfile.personalInfo?.age ? `${selectedProfile.personalInfo.age} yrs` : '—'}</strong></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Gender</span><strong>{selectedProfile.personalInfo?.gender || '—'}</strong></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Occupation</span><strong>{selectedProfile.personalInfo?.occupation || '—'}</strong></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Preferred Language</span><strong>{selectedProfile.personalInfo?.preferredLanguage || 'English'}</strong></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Category</span><strong>{selectedProfile.category || 'General Patient'}</strong></div>
                  <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Residential Address</span><strong>{[selectedProfile.personalInfo?.address, selectedProfile.personalInfo?.city, selectedProfile.personalInfo?.state, selectedProfile.personalInfo?.pinCode || selectedProfile.personalInfo?.postalCode].filter(Boolean).join(', ') || 'Not specified'}</strong></div>
                </div>
              )}

              {activeProfileTab === 'emergency' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', fontSize: '0.85rem' }}>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Contact Person Name</span><strong>{selectedProfile.emergencyContact?.contactPersonName || selectedProfile.emergencyContact?.name || 'Not provided'}</strong></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Relationship</span><strong>{selectedProfile.emergencyContact?.relationship || '—'}</strong></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Mobile Number</span><strong>{selectedProfile.emergencyContact?.phone || '—'}</strong></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Alternate Contact Number</span><strong>{selectedProfile.emergencyContact?.altPhone || '—'}</strong></div>
                  <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Address</span><strong>{selectedProfile.emergencyContact?.address || '—'}</strong></div>
                </div>
              )}

              {activeProfileTab === 'medical' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.85rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                    <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Status</span><strong>{selectedProfile.pastMedicalPsychiatricHistory?.assessmentStatus || 'None reported'}</strong></div>
                    <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Known Allergies</span><strong>{selectedProfile.pastMedicalPsychiatricHistory?.knownAllergies || 'None reported'}</strong></div>
                    <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Current Medications</span><strong>{selectedProfile.pastMedicalPsychiatricHistory?.currentMedications || 'None reported'}</strong></div>
                    <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Previous Medications</span><strong>{selectedProfile.pastMedicalPsychiatricHistory?.previousMedications || 'None reported'}</strong></div>
                  </div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Previous Medical Illnesses</span><p style={{ margin: '0.2rem 0', background: 'var(--color-slate-05)', padding: '0.5rem', borderRadius: '4px' }}>{selectedProfile.pastMedicalPsychiatricHistory?.previousMedicalIllnesses || 'None reported'}</p></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Previous Psychiatric / Mental Health History</span><p style={{ margin: '0.2rem 0', background: 'var(--color-slate-05)', padding: '0.5rem', borderRadius: '4px' }}>{selectedProfile.pastMedicalPsychiatricHistory?.previousPsychiatricHistory || 'None reported'}</p></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Previous Psychological Counselling</span><p style={{ margin: '0.2rem 0', background: 'var(--color-slate-05)', padding: '0.5rem', borderRadius: '4px' }}>{selectedProfile.pastMedicalPsychiatricHistory?.previousPsychologicalCounselling || 'None reported'}</p></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Previous Surgeries & Hospitalisation</span><p style={{ margin: '0.2rem 0', background: 'var(--color-slate-05)', padding: '0.5rem', borderRadius: '4px' }}>{selectedProfile.pastMedicalPsychiatricHistory?.previousHospitalisation || selectedProfile.pastMedicalPsychiatricHistory?.previousSurgeries || 'None reported'}</p></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Substance Use History</span><p style={{ margin: '0.2rem 0', background: 'var(--color-slate-05)', padding: '0.5rem', borderRadius: '4px' }}>{selectedProfile.pastMedicalPsychiatricHistory?.substanceUseHistory || 'None reported'}</p></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Relevant Medical Notes</span><p style={{ margin: '0.2rem 0', background: 'var(--color-slate-05)', padding: '0.5rem', borderRadius: '4px' }}>{selectedProfile.pastMedicalPsychiatricHistory?.relevantMedicalNotes || '—'}</p></div>
                </div>
              )}

              {activeProfileTab === 'family' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem' }}>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Family Medical History</span><p style={{ margin: '0.2rem 0', background: 'var(--color-slate-05)', padding: '0.5rem', borderRadius: '4px' }}>{selectedProfile.familyHistory?.familyMedicalHistory || 'None reported'}</p></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Family Psychiatric History</span><p style={{ margin: '0.2rem 0', background: 'var(--color-slate-05)', padding: '0.5rem', borderRadius: '4px' }}>{selectedProfile.familyHistory?.familyPsychiatricHistory || 'None reported'}</p></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Hereditary Conditions</span><p style={{ margin: '0.2rem 0', background: 'var(--color-slate-05)', padding: '0.5rem', borderRadius: '4px' }}>{selectedProfile.familyHistory?.hereditaryConditions || 'None reported'}</p></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Family Structure & Support System</span><p style={{ margin: '0.2rem 0', background: 'var(--color-slate-05)', padding: '0.5rem', borderRadius: '4px' }}>{[selectedProfile.familyHistory?.familyStructure, selectedProfile.familyHistory?.familySupportSystem].filter(Boolean).join(' • ') || '—'}</p></div>
                </div>
              )}

              {activeProfileTab === 'developmental' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', fontSize: '0.85rem' }}>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Section Status</span><strong>{selectedProfile.birthDevelopmentalHistory?.status || 'Not Applicable'}</strong></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Birth Type</span><strong>{selectedProfile.birthDevelopmentalHistory?.birthType || '—'}</strong></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Premature Birth</span><strong>{selectedProfile.birthDevelopmentalHistory?.prematureBirth || '—'}</strong></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Gestational Age</span><strong>{selectedProfile.birthDevelopmentalHistory?.gestationalAge || '—'}</strong></div>
                  <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Developmental Milestones</span><p style={{ margin: '0.2rem 0' }}>{selectedProfile.birthDevelopmentalHistory?.developmentalMilestones || '—'}</p></div>
                  <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Childhood Concerns & Additional Notes</span><p style={{ margin: '0.2rem 0' }}>{selectedProfile.birthDevelopmentalHistory?.childhoodDevelopmentalConcerns || selectedProfile.birthDevelopmentalHistory?.relevantAdditionalNotes || '—'}</p></div>
                </div>
              )}

              {activeProfileTab === 'social' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', fontSize: '0.85rem' }}>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Educational Background</span><strong>{selectedProfile.personalSocialHistory?.educationalBackground || '—'}</strong></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Employment Status</span><strong>{selectedProfile.personalSocialHistory?.employmentStatus || '—'}</strong></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Marital Status</span><strong>{selectedProfile.personalSocialHistory?.maritalStatus || '—'}</strong></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Living Arrangements</span><strong>{selectedProfile.personalSocialHistory?.livingArrangements || '—'}</strong></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Sleep Pattern</span><strong>{selectedProfile.personalSocialHistory?.sleepPattern || '—'}</strong></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Appetite</span><strong>{selectedProfile.personalSocialHistory?.appetite || '—'}</strong></div>
                  <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Lifestyle & Personal History</span><p style={{ margin: '0.2rem 0' }}>{selectedProfile.personalSocialHistory?.lifestyleInformation || selectedProfile.personalSocialHistory?.relevantPersonalHistory || '—'}</p></div>
                </div>
              )}

              {activeProfileTab === 'clinical' && isClinician && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.85rem' }}>
                  <div style={{ background: '#FFF8E1', padding: '0.75rem', borderRadius: '4px', border: '1px solid #FFE082', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#B78103' }}>
                    <Lock size={16} /> <strong>Confidential Clinical Notes</strong> (Restricted to Authorized Mental Health Practitioners)
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-slate)', fontSize: '0.78rem', display: 'block' }}>Presenting Concerns</span>
                    <p style={{ margin: '0.2rem 0', background: 'var(--color-slate-05)', padding: '0.6rem', borderRadius: '4px' }}>
                      {selectedProfile.clinicalInfo?.presentingConcerns || 'No intake concerns documented.'}
                    </p>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                    <div>
                      <span style={{ color: 'var(--color-slate)', fontSize: '0.78rem', display: 'block' }}>Duration of Concerns</span>
                      <strong>{selectedProfile.clinicalInfo?.durationOfConcerns || '—'}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--color-slate)', fontSize: '0.78rem', display: 'block' }}>Onset and Course</span>
                      <strong>{selectedProfile.clinicalInfo?.onsetAndCourse || '—'}</strong>
                    </div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-slate)', fontSize: '0.78rem', display: 'block' }}>Relevant Clinical Observations</span>
                    <p style={{ margin: '0.2rem 0', background: 'var(--color-slate-05)', padding: '0.6rem', borderRadius: '4px' }}>
                      {selectedProfile.clinicalInfo?.relevantClinicalObservations || '—'}
                    </p>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-slate)', fontSize: '0.78rem', display: 'block' }}>Initial Clinical Impression</span>
                    <p style={{ margin: '0.2rem 0', background: 'var(--color-slate-05)', padding: '0.6rem', borderRadius: '4px' }}>
                      {selectedProfile.clinicalInfo?.initialClinicalImpression || '—'}
                    </p>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-slate)', fontSize: '0.78rem', display: 'block' }}>Follow-up & Therapeutic Recommendations</span>
                    <p style={{ margin: '0.2rem 0', background: 'var(--color-slate-05)', padding: '0.6rem', borderRadius: '4px' }}>
                      {selectedProfile.clinicalInfo?.followUpRecommendations || 'Standard ongoing counselling protocol.'}
                    </p>
                  </div>
                </div>
              )}

              {activeProfileTab === 'consent' && (
                <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div><strong>Patient Consent Status:</strong> {selectedProfile.consentAndPrivacy?.patientConsentStatus || 'Pending'}</div>
                  <div><strong>Privacy Notice Acknowledged:</strong> {selectedProfile.consentAndPrivacy?.privacyNoticeAcknowledged ? 'Yes' : 'No'}</div>
                  <div><strong>Counselling Consent Granted:</strong> {selectedProfile.consentAndPrivacy?.counsellingConsent ? 'Yes' : 'No'}</div>
                  <div><strong>Assessment Consent Granted:</strong> {selectedProfile.consentAndPrivacy?.assessmentConsent ? 'Yes' : 'No'}</div>
                  <div><strong>Audio Recording Consent Granted:</strong> {selectedProfile.consentAndPrivacy?.audioRecordingConsent ? 'Yes (Opted In)' : 'No (Default Off)'}</div>
                  <div><strong>Consent Timestamp:</strong> {formatISTDate(selectedProfile.consentAndPrivacy?.consentTimestamp)}</div>
                  {selectedProfile.consentAndPrivacy?.guardianDetails?.hasGuardian && (
                    <div style={{ background: '#F8F9FA', padding: '0.75rem', borderRadius: '4px' }}>
                      <strong>Guardian Details:</strong> {selectedProfile.consentAndPrivacy.guardianDetails.guardianName} ({selectedProfile.consentAndPrivacy.guardianDetails.guardianRelationship}) • {selectedProfile.consentAndPrivacy.guardianDetails.guardianPhone}
                    </div>
                  )}
                  {selectedProfile.consentAndPrivacy?.consentWithdrawn && (
                    <div style={{ color: '#C62828' }}><strong>Consent Status:</strong> Withdrawn ({selectedProfile.consentAndPrivacy.withdrawnReason})</div>
                  )}
                </div>
              )}

              {activeProfileTab === 'appointments' && (
                <div style={{ fontSize: '0.85rem' }}>
                  {profileAppointments.length === 0 ? (
                    <p style={{ color: 'var(--color-slate)' }}>No appointment records found for this patient.</p>
                  ) : (
                    <div className="responsive-table-wrapper" style={{ margin: 0 }}>
                      <table className="responsive-table" style={{ width: '100%', minWidth: '450px', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: 'var(--color-slate-05)', borderBottom: '1px solid var(--color-slate-20)', textAlign: 'left' }}>
                            <th style={{ padding: '0.5rem', whiteSpace: 'nowrap' }}>Date</th>
                            <th style={{ padding: '0.5rem', whiteSpace: 'nowrap' }}>Time</th>
                            <th style={{ padding: '0.5rem', whiteSpace: 'nowrap' }}>Type</th>
                            <th style={{ padding: '0.5rem', whiteSpace: 'nowrap' }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profileAppointments.map(a => (
                            <tr key={a._id || a.id} style={{ borderBottom: '1px solid var(--color-slate-10)' }}>
                              <td style={{ padding: '0.5rem', whiteSpace: 'nowrap' }}>{a.date}</td>
                              <td style={{ padding: '0.5rem', whiteSpace: 'nowrap' }}>{a.time}</td>
                              <td style={{ padding: '0.5rem' }}>{a.type}</td>
                              <td style={{ padding: '0.5rem' }}>{a.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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
                    <div className="responsive-table-wrapper" style={{ margin: 0 }}>
                      <table className="responsive-table" style={{ width: '100%', minWidth: '480px', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: 'var(--color-slate-05)', borderBottom: '1px solid var(--color-slate-20)', textAlign: 'left' }}>
                            <th style={{ padding: '0.5rem', whiteSpace: 'nowrap' }}>Title</th>
                            <th style={{ padding: '0.5rem', whiteSpace: 'nowrap' }}>Category</th>
                            <th style={{ padding: '0.5rem', whiteSpace: 'nowrap' }}>Uploaded Date</th>
                            <th style={{ padding: '0.5rem', whiteSpace: 'nowrap' }}>Uploaded By</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedProfile.documents.map(d => (
                            <tr key={d.docId || d._id} style={{ borderBottom: '1px solid var(--color-slate-10)' }}>
                              <td style={{ padding: '0.5rem', fontWeight: 600 }}>{d.title}</td>
                              <td style={{ padding: '0.5rem' }}>{d.category}</td>
                              <td style={{ padding: '0.5rem', whiteSpace: 'nowrap' }}>{formatISTDate(d.uploadedAt)}</td>
                              <td style={{ padding: '0.5rem' }}>{d.uploadedBy}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {activeProfileTab === 'academic' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', fontSize: '0.85rem' }}>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Registration Number</span><strong>{selectedProfile.academicInfo?.registrationNumber || '—'}</strong></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Department</span><strong>{selectedProfile.academicInfo?.department || '—'}</strong></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Classification</span><strong>{selectedProfile.academicInfo?.programmeLevel || 'UG'}</strong></div>
                  <div><span style={{ color: 'var(--color-slate)', fontSize: '0.75rem', display: 'block' }}>Semester / Year</span><strong>{selectedProfile.academicInfo?.currentSemester || '—'}</strong></div>
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
                <Edit3 size={14} style={{ marginRight: '4px' }} /> Edit Record
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
          COMPREHENSIVE PATIENT REGISTRATION & CLINICAL HISTORY MODAL (SECTIONS A - H)
          ========================================================================= */}
      {showEditModal && editFormData && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <form onSubmit={(e) => handleSaveProfile(e, false)} className="card" style={{ width: '980px', maxWidth: '100%', maxHeight: '92vh', background: '#FFF', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            
            {/* Modal Header */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--color-slate-20)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FAFAFA' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-slate-dark)' }}>
                  {isCreatingNew ? 'Patient / Service User Registration & Clinical History' : `Edit Record: ${editFormData.profileId}`}
                </h3>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: 'var(--color-slate)' }}>
                  Verdant Mind Clinical EMR • Comprehensive Intake and Psychological History
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => toggleAllAccordions(true)}
                  style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem', border: '1px solid var(--color-slate-20)', background: '#FFF', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Expand All
                </button>
                <button
                  type="button"
                  onClick={() => toggleAllAccordions(false)}
                  style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem', border: '1px solid var(--color-slate-20)', background: '#FFF', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Collapse All
                </button>
                <button type="button" onClick={handleCloseEditModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-slate)' }}>
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Scrollable Form Body */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              {/* SECTION A: Personal Information */}
              <div style={{ border: '1px solid var(--color-slate-20)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => toggleSection('sectionA')}
                  style={{ width: '100%', padding: '0.75rem 1rem', background: '#F8F9FA', border: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontWeight: 700, fontSize: '0.92rem', color: 'var(--color-primary)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <User size={18} />
                    <span>Section A — Personal Information</span>
                    {editFormData.personalInfo?.fullName && editFormData.personalInfo?.email && (
                      <span style={{ fontSize: '0.72rem', background: '#E8F5E9', color: '#2E7D32', padding: '0.15rem 0.5rem', borderRadius: '10px', fontWeight: 600 }}>Required Filled</span>
                    )}
                  </div>
                  {accordionOpen.sectionA ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>

                {accordionOpen.sectionA && (
                  <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', background: '#FFF' }}>
                    
                    {/* Top Row: Category Selection */}
                    <div>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                        Profile Category *
                      </label>
                      <select 
                        value={editFormData.category || 'General Patient'}
                        onChange={(e) => {
                          setEditFormData({ ...editFormData, category: e.target.value });
                          setIsFormDirty(true);
                        }}
                        style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-20)', fontSize: '0.88rem' }}
                      >
                        <option value="General Patient">General Patient (Default)</option>
                        <option value="Staff Referral">Staff Referral</option>
                        <option value="Self-Referral">Self-Referral</option>
                        <option value="Professional Referral">Professional Referral</option>
                        <option value="Other">Other</option>
                      </select>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-slate)', display: 'block', marginTop: '0.2rem' }}>
                        Verdant Mind is open to all patients, families, and professionals. No institutional or student ID is required.
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.85rem' }}>
                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Full Name *</label>
                        <input 
                          type="text" 
                          required
                          placeholder="e.g. Priyanshu Sen"
                          value={editFormData.personalInfo?.fullName || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              personalInfo: { ...editFormData.personalInfo, fullName: e.target.value }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Email Address *</label>
                        <input 
                          type="email" 
                          required
                          placeholder="patient@example.com"
                          value={editFormData.personalInfo?.email || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              personalInfo: { ...editFormData.personalInfo, email: e.target.value }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Mobile Number</label>
                        <input 
                          type="tel" 
                          placeholder="+91 98765 43210"
                          value={editFormData.personalInfo?.phone || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              personalInfo: { ...editFormData.personalInfo, phone: e.target.value }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Alternate Mobile Number</label>
                        <input 
                          type="tel" 
                          placeholder="Optional secondary phone"
                          value={editFormData.personalInfo?.alternatePhone || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              personalInfo: { ...editFormData.personalInfo, alternatePhone: e.target.value }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>

                      {/* DOB with Live Age Calculation */}
                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>
                          Date of Birth (YYYY-MM-DD or DD-MM-YYYY)
                        </label>
                        <input 
                          type="date"
                          value={editFormData.personalInfo?.dateOfBirth || ''}
                          onChange={handleDobChange}
                          style={{ width: '100%', padding: '0.45rem', border: dobValidation.isFuture ? '1px solid #D32F2F' : '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                        {dobValidation.isFuture && (
                          <span style={{ color: '#D32F2F', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.25rem' }}>
                            <AlertTriangle size={13} /> Date of birth cannot be in the future.
                          </span>
                        )}
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Age (Calculated)</label>
                        <input 
                          type="text" 
                          readOnly
                          placeholder="Auto-calculated from DOB"
                          value={editFormData.personalInfo?.age !== undefined && editFormData.personalInfo?.age !== '' ? `${editFormData.personalInfo.age} years old` : 'Unknown / Not Provided'}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-10)', background: '#F5F5F5', borderRadius: '4px', fontSize: '0.85rem', color: '#555' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Gender</label>
                        <select
                          value={editFormData.personalInfo?.gender || 'Unknown / Not Available'}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              personalInfo: { ...editFormData.personalInfo, gender: e.target.value }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        >
                          <option value="Female">Female</option>
                          <option value="Male">Male</option>
                          <option value="Non-Binary">Non-Binary</option>
                          <option value="Prefer not to say">Prefer not to say</option>
                          <option value="Self-described">Self-described</option>
                          <option value="Unknown / Not Available">Unknown / Not Available</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Occupation</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Teacher, Engineer, Student, Homemaker"
                          value={editFormData.personalInfo?.occupation || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              personalInfo: { ...editFormData.personalInfo, occupation: e.target.value }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Preferred Language</label>
                        <input 
                          type="text" 
                          placeholder="e.g. English, Bengali, Hindi"
                          value={editFormData.personalInfo?.preferredLanguage || 'English'}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              personalInfo: { ...editFormData.personalInfo, preferredLanguage: e.target.value }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>City</label>
                        <input 
                          type="text" 
                          placeholder="City"
                          value={editFormData.personalInfo?.city || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              personalInfo: { ...editFormData.personalInfo, city: e.target.value }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>State</label>
                        <input 
                          type="text" 
                          placeholder="State"
                          value={editFormData.personalInfo?.state || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              personalInfo: { ...editFormData.personalInfo, state: e.target.value }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>PIN Code</label>
                        <input 
                          type="text" 
                          placeholder="PIN Code"
                          value={editFormData.personalInfo?.pinCode || editFormData.personalInfo?.postalCode || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              personalInfo: { ...editFormData.personalInfo, pinCode: e.target.value, postalCode: e.target.value }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>

                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Residential Address</label>
                        <input 
                          type="text" 
                          placeholder="Street Address, House / Flat number"
                          value={editFormData.personalInfo?.address || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              personalInfo: { ...editFormData.personalInfo, address: e.target.value }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION B: Emergency Contact */}
              <div style={{ border: '1px solid var(--color-slate-20)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => toggleSection('sectionB')}
                  style={{ width: '100%', padding: '0.75rem 1rem', background: '#F8F9FA', border: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontWeight: 700, fontSize: '0.92rem', color: 'var(--color-primary)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Shield size={18} />
                    <span>Section B — Emergency Contact</span>
                    {editFormData.emergencyContact?.contactPersonName && (
                      <span style={{ fontSize: '0.72rem', background: '#E8F5E9', color: '#2E7D32', padding: '0.15rem 0.5rem', borderRadius: '10px', fontWeight: 600 }}>Provided</span>
                    )}
                  </div>
                  {accordionOpen.sectionB ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>

                {accordionOpen.sectionB && (
                  <div style={{ padding: '1.25rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.85rem', background: '#FFF' }}>
                    <div>
                      <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Contact Person Name</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Anita Sharma"
                        value={editFormData.emergencyContact?.contactPersonName || editFormData.emergencyContact?.name || ''}
                        onChange={(e) => {
                          setEditFormData({
                            ...editFormData,
                            emergencyContact: { 
                              ...editFormData.emergencyContact, 
                              contactPersonName: e.target.value,
                              name: e.target.value 
                            }
                          });
                          setIsFormDirty(true);
                        }}
                        style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Relationship with Patient</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Spouse, Parent, Sibling, Friend, Guardian"
                        value={editFormData.emergencyContact?.relationship || ''}
                        onChange={(e) => {
                          setEditFormData({
                            ...editFormData,
                            emergencyContact: { ...editFormData.emergencyContact, relationship: e.target.value }
                          });
                          setIsFormDirty(true);
                        }}
                        style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Mobile Number</label>
                      <input 
                        type="tel" 
                        placeholder="Emergency contact mobile"
                        value={editFormData.emergencyContact?.phone || ''}
                        onChange={(e) => {
                          setEditFormData({
                            ...editFormData,
                            emergencyContact: { ...editFormData.emergencyContact, phone: e.target.value }
                          });
                          setIsFormDirty(true);
                        }}
                        style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Alternate Contact Number</label>
                      <input 
                        type="tel" 
                        placeholder="Secondary phone"
                        value={editFormData.emergencyContact?.altPhone || ''}
                        onChange={(e) => {
                          setEditFormData({
                            ...editFormData,
                            emergencyContact: { ...editFormData.emergencyContact, altPhone: e.target.value }
                          });
                          setIsFormDirty(true);
                        }}
                        style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                      />
                    </div>

                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Emergency Contact Address (Optional)</label>
                      <input 
                        type="text" 
                        placeholder="Full residential address of emergency contact"
                        value={editFormData.emergencyContact?.address || ''}
                        onChange={(e) => {
                          setEditFormData({
                            ...editFormData,
                            emergencyContact: { ...editFormData.emergencyContact, address: e.target.value }
                          });
                          setIsFormDirty(true);
                        }}
                        style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION C: Past Medical and Psychiatric History */}
              <div style={{ border: '1px solid var(--color-slate-20)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => toggleSection('sectionC')}
                  style={{ width: '100%', padding: '0.75rem 1rem', background: '#F8F9FA', border: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontWeight: 700, fontSize: '0.92rem', color: 'var(--color-primary)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Activity size={18} />
                    <span>Section C — Past Medical & Psychiatric History</span>
                  </div>
                  {accordionOpen.sectionC ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>

                {accordionOpen.sectionC && (
                  <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', background: '#FFF' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.85rem' }}>
                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>History Assessment Status</label>
                        <select
                          value={editFormData.pastMedicalPsychiatricHistory?.assessmentStatus || 'None reported'}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              pastMedicalPsychiatricHistory: {
                                ...editFormData.pastMedicalPsychiatricHistory,
                                assessmentStatus: e.target.value
                              }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        >
                          <option value="None reported">None reported</option>
                          <option value="Reported">Reported (Details below)</option>
                          <option value="Not known">Not known</option>
                          <option value="Not assessed">Not assessed</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Known Allergies</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Penicillin, Peanuts, Sulfa (or 'None reported')"
                          value={editFormData.pastMedicalPsychiatricHistory?.knownAllergies || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              pastMedicalPsychiatricHistory: {
                                ...editFormData.pastMedicalPsychiatricHistory,
                                knownAllergies: e.target.value
                              }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Current Medications</label>
                        <input 
                          type="text" 
                          placeholder="Prescriptions, dosages, OTC supplements"
                          value={editFormData.pastMedicalPsychiatricHistory?.currentMedications || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              pastMedicalPsychiatricHistory: {
                                ...editFormData.pastMedicalPsychiatricHistory,
                                currentMedications: e.target.value
                              }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Previous Medications</label>
                        <input 
                          type="text" 
                          placeholder="Past psychiatric or long-term medical drugs"
                          value={editFormData.pastMedicalPsychiatricHistory?.previousMedications || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              pastMedicalPsychiatricHistory: {
                                ...editFormData.pastMedicalPsychiatricHistory,
                                previousMedications: e.target.value
                              }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '0.85rem' }}>
                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Previous Medical Illnesses</label>
                        <textarea 
                          rows={2}
                          placeholder="Chronic illnesses, asthma, diabetes, hypertension, epilepsy, etc."
                          value={editFormData.pastMedicalPsychiatricHistory?.previousMedicalIllnesses || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              pastMedicalPsychiatricHistory: {
                                ...editFormData.pastMedicalPsychiatricHistory,
                                previousMedicalIllnesses: e.target.value
                              }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Previous Psychiatric / Mental Health History</label>
                        <textarea 
                          rows={2}
                          placeholder="Prior diagnoses, episodes, panic attacks, depression, ADHD, etc."
                          value={editFormData.pastMedicalPsychiatricHistory?.previousPsychiatricHistory || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              pastMedicalPsychiatricHistory: {
                                ...editFormData.pastMedicalPsychiatricHistory,
                                previousPsychiatricHistory: e.target.value
                              }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Previous Psychological Counselling & Therapy</label>
                        <textarea 
                          rows={2}
                          placeholder="Counselling modalities attended, duration, outcomes"
                          value={editFormData.pastMedicalPsychiatricHistory?.previousPsychologicalCounselling || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              pastMedicalPsychiatricHistory: {
                                ...editFormData.pastMedicalPsychiatricHistory,
                                previousPsychologicalCounselling: e.target.value
                              }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Substance Use History (where clinically relevant)</label>
                        <textarea 
                          rows={2}
                          placeholder="Tobacco, alcohol, cannabis, prescription misuse, or none reported"
                          value={editFormData.pastMedicalPsychiatricHistory?.substanceUseHistory || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              pastMedicalPsychiatricHistory: {
                                ...editFormData.pastMedicalPsychiatricHistory,
                                substanceUseHistory: e.target.value
                              }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Previous Hospitalisations & Surgeries</label>
                        <textarea 
                          rows={2}
                          placeholder="Hospital admissions, major surgical procedures, approximate dates"
                          value={editFormData.pastMedicalPsychiatricHistory?.previousHospitalisation || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              pastMedicalPsychiatricHistory: {
                                ...editFormData.pastMedicalPsychiatricHistory,
                                previousHospitalisation: e.target.value
                              }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Relevant Medical Notes</label>
                        <textarea 
                          rows={2}
                          placeholder="Additional clinical context or physician advisories"
                          value={editFormData.pastMedicalPsychiatricHistory?.relevantMedicalNotes || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              pastMedicalPsychiatricHistory: {
                                ...editFormData.pastMedicalPsychiatricHistory,
                                relevantMedicalNotes: e.target.value
                              }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>
                    </div>

                    {/* Structured Conditions List */}
                    <div style={{ marginTop: '0.5rem', background: '#F8F9FA', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--color-slate-10)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-slate-dark)' }}>
                          Structured Chronic Conditions Table (Optional)
                        </span>
                        <button
                          type="button"
                          onClick={handleAddCondition}
                          style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', background: '#FFF', border: '1px solid var(--color-slate-20)', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                        >
                          <Plus size={12} /> Add Condition
                        </button>
                      </div>

                      {(editFormData.pastMedicalPsychiatricHistory?.structuredConditions || []).length === 0 ? (
                        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-slate)', fontStyle: 'italic' }}>
                          No specific condition cards added. Use button above to record structured history entries.
                        </p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {editFormData.pastMedicalPsychiatricHistory.structuredConditions.map((cond, idx) => (
                            <div key={idx} className="condition-row-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr 1fr auto', gap: '0.4rem', alignItems: 'center', background: '#FFF', padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--color-slate-10)' }}>
                              <input 
                                type="text"
                                placeholder="Condition (e.g. Asthma)"
                                value={cond.condition || ''}
                                onChange={(e) => handleConditionChange(idx, 'condition', e.target.value)}
                                style={{ padding: '0.35rem', fontSize: '0.8rem', border: '1px solid var(--color-slate-20)', borderRadius: '3px' }}
                              />
                              <input 
                                type="text"
                                placeholder="Year (e.g. 2019)"
                                value={cond.approximateYear || ''}
                                onChange={(e) => handleConditionChange(idx, 'approximateYear', e.target.value)}
                                style={{ padding: '0.35rem', fontSize: '0.8rem', border: '1px solid var(--color-slate-20)', borderRadius: '3px' }}
                              />
                              <input 
                                type="text"
                                placeholder="Treatment received"
                                value={cond.treatmentReceived || ''}
                                onChange={(e) => handleConditionChange(idx, 'treatmentReceived', e.target.value)}
                                style={{ padding: '0.35rem', fontSize: '0.8rem', border: '1px solid var(--color-slate-20)', borderRadius: '3px' }}
                              />
                              <select
                                value={cond.currentStatus || 'Ongoing'}
                                onChange={(e) => handleConditionChange(idx, 'currentStatus', e.target.value)}
                                style={{ padding: '0.35rem', fontSize: '0.8rem', border: '1px solid var(--color-slate-20)', borderRadius: '3px' }}
                              >
                                <option value="Ongoing">Ongoing</option>
                                <option value="Resolved">Resolved</option>
                                <option value="In Remission">In Remission</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => handleRemoveCondition(idx)}
                                style={{ background: 'none', border: 'none', color: '#C62828', cursor: 'pointer' }}
                              >
                                <X size={16} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION D: Family History */}
              <div style={{ border: '1px solid var(--color-slate-20)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => toggleSection('sectionD')}
                  style={{ width: '100%', padding: '0.75rem 1rem', background: '#F8F9FA', border: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontWeight: 700, fontSize: '0.92rem', color: 'var(--color-primary)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Users size={18} />
                    <span>Section D — Family History</span>
                  </div>
                  {accordionOpen.sectionD ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>

                {accordionOpen.sectionD && (
                  <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', background: '#FFF' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '0.85rem' }}>
                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Family Medical History</label>
                        <textarea 
                          rows={2}
                          placeholder="Cardiovascular disease, diabetes, neurological illness in family"
                          value={editFormData.familyHistory?.familyMedicalHistory || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              familyHistory: { ...editFormData.familyHistory, familyMedicalHistory: e.target.value }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Family Psychiatric History</label>
                        <textarea 
                          rows={2}
                          placeholder="Depression, bipolar, psychosis, severe anxiety, suicide in family"
                          value={editFormData.familyHistory?.familyPsychiatricHistory || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              familyHistory: { ...editFormData.familyHistory, familyPsychiatricHistory: e.target.value }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Hereditary / Genetic Conditions</label>
                        <textarea 
                          rows={2}
                          placeholder="Genetic syndromes or hereditary mental health conditions"
                          value={editFormData.familyHistory?.hereditaryConditions || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              familyHistory: { ...editFormData.familyHistory, hereditaryConditions: e.target.value }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Family Substance Use History</label>
                        <textarea 
                          rows={2}
                          placeholder="Alcohol dependence, substance abuse patterns in family"
                          value={editFormData.familyHistory?.historyOfSubstanceUseInFamily || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              familyHistory: { ...editFormData.familyHistory, historyOfSubstanceUseInFamily: e.target.value }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Relevant Family Stressors & Context</label>
                        <textarea 
                          rows={2}
                          placeholder="Bereavement, divorce, financial stressors, intergenerational conflict"
                          value={editFormData.familyHistory?.relevantFamilyStressors || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              familyHistory: { ...editFormData.familyHistory, relevantFamilyStressors: e.target.value }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Family Structure & Support System</label>
                        <textarea 
                          rows={2}
                          placeholder="Nuclear, joint, single-parent; quality of perceived familial emotional support"
                          value={editFormData.familyHistory?.familySupportSystem || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              familyHistory: { ...editFormData.familyHistory, familySupportSystem: e.target.value }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>
                    </div>

                    {/* Structured Family Members */}
                    <div style={{ marginTop: '0.5rem', background: '#F8F9FA', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--color-slate-10)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-slate-dark)' }}>
                          Structured Family Members Condition Register (Optional)
                        </span>
                        <button
                          type="button"
                          onClick={handleAddFamilyMember}
                          style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', background: '#FFF', border: '1px solid var(--color-slate-20)', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                        >
                          <Plus size={12} /> Add Relative
                        </button>
                      </div>

                      {(editFormData.familyHistory?.structuredMembers || []).length === 0 ? (
                        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-slate)', fontStyle: 'italic' }}>
                          No specific relatives recorded.
                        </p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {editFormData.familyHistory.structuredMembers.map((mem, idx) => (
                            <div key={idx} className="family-row-grid" style={{ display: 'grid', gridTemplateColumns: '1.5fr 2fr 3fr auto', gap: '0.4rem', alignItems: 'center', background: '#FFF', padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--color-slate-10)' }}>
                              <input 
                                type="text"
                                placeholder="Relation (e.g. Maternal Uncle)"
                                value={mem.relationship || ''}
                                onChange={(e) => handleFamilyMemberChange(idx, 'relationship', e.target.value)}
                                style={{ padding: '0.35rem', fontSize: '0.8rem', border: '1px solid var(--color-slate-20)', borderRadius: '3px' }}
                              />
                              <input 
                                type="text"
                                placeholder="Condition (e.g. Bipolar Affective Disorder)"
                                value={mem.condition || ''}
                                onChange={(e) => handleFamilyMemberChange(idx, 'condition', e.target.value)}
                                style={{ padding: '0.35rem', fontSize: '0.8rem', border: '1px solid var(--color-slate-20)', borderRadius: '3px' }}
                              />
                              <input 
                                type="text"
                                placeholder="Clinical details / notes"
                                value={mem.clinicalDetails || ''}
                                onChange={(e) => handleFamilyMemberChange(idx, 'clinicalDetails', e.target.value)}
                                style={{ padding: '0.35rem', fontSize: '0.8rem', border: '1px solid var(--color-slate-20)', borderRadius: '3px' }}
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveFamilyMember(idx)}
                                style={{ background: 'none', border: 'none', color: '#C62828', cursor: 'pointer' }}
                              >
                                <X size={16} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION E: Birth & Developmental History */}
              <div style={{ border: '1px solid var(--color-slate-20)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => toggleSection('sectionE')}
                  style={{ width: '100%', padding: '0.75rem 1rem', background: '#F8F9FA', border: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontWeight: 700, fontSize: '0.92rem', color: 'var(--color-primary)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Baby size={18} />
                    <span>Section E — Birth & Developmental History</span>
                    <span style={{ fontSize: '0.72rem', background: '#ECEFF1', color: '#455A64', padding: '0.15rem 0.5rem', borderRadius: '10px', fontWeight: 600 }}>
                      {editFormData.birthDevelopmentalHistory?.status || 'Not Applicable'}
                    </span>
                  </div>
                  {accordionOpen.sectionE ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>

                {accordionOpen.sectionE && (
                  <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', background: '#FFF' }}>
                    <div style={{ background: '#F0F7F6', padding: '0.65rem 0.85rem', borderRadius: '4px', fontSize: '0.8rem', color: 'var(--color-primary)' }}>
                      <strong>Clinical Guidance:</strong> Primary importance for children, adolescents, or when developmental conditions (e.g. ADHD, Autism Spectrum) are suspected. Defaults to <em>Not Applicable</em> for general adult intake unless indicated.
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.85rem' }}>
                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Section Assessment Status</label>
                        <select
                          value={editFormData.birthDevelopmentalHistory?.status || 'Not Applicable'}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              birthDevelopmentalHistory: { ...editFormData.birthDevelopmentalHistory, status: e.target.value }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        >
                          <option value="Not Applicable">Not Applicable</option>
                          <option value="Not Assessed">Not Assessed</option>
                          <option value="Unknown">Unknown</option>
                          <option value="Assessed">Assessed (Details documented below)</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Birth Delivery Type</label>
                        <select
                          value={editFormData.birthDevelopmentalHistory?.birthType || 'Unknown'}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              birthDevelopmentalHistory: { ...editFormData.birthDevelopmentalHistory, birthType: e.target.value }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        >
                          <option value="Normal Vaginal Delivery">Normal Vaginal Delivery</option>
                          <option value="Caesarean Section">Caesarean Section</option>
                          <option value="Assisted Delivery">Assisted Delivery (Forceps/Vacuum)</option>
                          <option value="Unknown">Unknown</option>
                          <option value="Not Applicable">Not Applicable</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Premature Birth</label>
                        <select
                          value={editFormData.birthDevelopmentalHistory?.prematureBirth || 'Unknown'}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              birthDevelopmentalHistory: { ...editFormData.birthDevelopmentalHistory, prematureBirth: e.target.value }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        >
                          <option value="No">No (Full Term)</option>
                          <option value="Yes">Yes (Premature)</option>
                          <option value="Unknown">Unknown</option>
                          <option value="Not Applicable">Not Applicable</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Gestational Age / Birth Weight</label>
                        <input 
                          type="text" 
                          placeholder="e.g. 38 weeks, 3.2 kg"
                          value={editFormData.birthDevelopmentalHistory?.gestationalAge || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              birthDevelopmentalHistory: { ...editFormData.birthDevelopmentalHistory, gestationalAge: e.target.value }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '0.85rem' }}>
                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Pregnancy & Maternal Complications</label>
                        <textarea 
                          rows={2}
                          placeholder="Gestational diabetes, pre-eclampsia, infections, medication exposures"
                          value={editFormData.birthDevelopmentalHistory?.maternalPregnancyComplications || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              birthDevelopmentalHistory: { ...editFormData.birthDevelopmentalHistory, maternalPregnancyComplications: e.target.value }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Developmental Milestones</label>
                        <textarea 
                          rows={2}
                          placeholder="Sitting, walking, early motor milestones (on time vs delayed)"
                          value={editFormData.birthDevelopmentalHistory?.developmentalMilestones || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              birthDevelopmentalHistory: { ...editFormData.birthDevelopmentalHistory, developmentalMilestones: e.target.value }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Speech, Language & Cognitive Development</label>
                        <textarea 
                          rows={2}
                          placeholder="First words, sentences, language milestones, learning pace"
                          value={editFormData.birthDevelopmentalHistory?.speechLanguageDevelopment || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              birthDevelopmentalHistory: { ...editFormData.birthDevelopmentalHistory, speechLanguageDevelopment: e.target.value }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Childhood Developmental / Behavioral Concerns</label>
                        <textarea 
                          rows={2}
                          placeholder="Attention difficulties, sensory sensitivities, school refusal, socialization"
                          value={editFormData.birthDevelopmentalHistory?.childhoodDevelopmentalConcerns || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              birthDevelopmentalHistory: { ...editFormData.birthDevelopmentalHistory, childhoodDevelopmentalConcerns: e.target.value }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION F: Personal and Social History */}
              <div style={{ border: '1px solid var(--color-slate-20)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => toggleSection('sectionF')}
                  style={{ width: '100%', padding: '0.75rem 1rem', background: '#F8F9FA', border: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontWeight: 700, fontSize: '0.92rem', color: 'var(--color-primary)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <BookOpen size={18} />
                    <span>Section F — Personal & Social History</span>
                  </div>
                  {accordionOpen.sectionF ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>

                {accordionOpen.sectionF && (
                  <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', background: '#FFF' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.85rem' }}>
                      
                      {/* Educational Background (Optional general, open to all) */}
                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Educational Background (Optional)</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Higher Secondary, Bachelor's, Master's, Professional"
                          value={editFormData.personalSocialHistory?.educationalBackground || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              personalSocialHistory: { ...editFormData.personalSocialHistory, educationalBackground: e.target.value }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Employment Status</label>
                        <select
                          value={editFormData.personalSocialHistory?.employmentStatus || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              personalSocialHistory: { ...editFormData.personalSocialHistory, employmentStatus: e.target.value }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        >
                          <option value="">-- Select Status --</option>
                          <option value="Employed Full-Time">Employed Full-Time</option>
                          <option value="Employed Part-Time">Employed Part-Time</option>
                          <option value="Self-Employed / Business">Self-Employed / Business</option>
                          <option value="Student">Student</option>
                          <option value="Homemaker">Homemaker</option>
                          <option value="Retired">Retired</option>
                          <option value="Unemployed / Seeking">Unemployed / Seeking</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Marital / Relationship Status (Optional)</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Single, Married, Partnered, Divorced"
                          value={editFormData.personalSocialHistory?.maritalStatus || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              personalSocialHistory: { ...editFormData.personalSocialHistory, maritalStatus: e.target.value }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Living Arrangements</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Lives with spouse & child, alone, with parents"
                          value={editFormData.personalSocialHistory?.livingArrangements || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              personalSocialHistory: { ...editFormData.personalSocialHistory, livingArrangements: e.target.value }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '0.85rem' }}>
                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Social Support System & Network</label>
                        <textarea 
                          rows={2}
                          placeholder="Close friends, community groups, mentor, family members"
                          value={editFormData.personalSocialHistory?.socialSupport || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              personalSocialHistory: { ...editFormData.personalSocialHistory, socialSupport: e.target.value }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Sleep Pattern & Quality</label>
                        <textarea 
                          rows={2}
                          placeholder="Hours per night, difficulty falling asleep, middle of night awakenings"
                          value={editFormData.personalSocialHistory?.sleepPattern || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              personalSocialHistory: { ...editFormData.personalSocialHistory, sleepPattern: e.target.value }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Appetite & Nutrition</label>
                        <textarea 
                          rows={2}
                          placeholder="Appetite changes, meal regularity, significant weight changes"
                          value={editFormData.personalSocialHistory?.appetite || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              personalSocialHistory: { ...editFormData.personalSocialHistory, appetite: e.target.value }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Lifestyle, Hobbies & Personal Routine</label>
                        <textarea 
                          rows={2}
                          placeholder="Physical activity, hobbies, coping activities, work schedule"
                          value={editFormData.personalSocialHistory?.lifestyleInformation || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              personalSocialHistory: { ...editFormData.personalSocialHistory, lifestyleInformation: e.target.value }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION G: Current Clinical Information (Provider Only) */}
              {isClinician && !isClientUser && (
                <div style={{ border: '1px solid #FFE082', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => toggleSection('sectionG')}
                    style={{ width: '100%', padding: '0.75rem 1rem', background: '#FFFDF5', border: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontWeight: 700, fontSize: '0.92rem', color: '#B78103' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Lock size={18} />
                      <span>Section G — Current Clinical Information (Clinician / Provider Only)</span>
                      <span style={{ fontSize: '0.72rem', background: '#FFF8E1', color: '#B78103', padding: '0.15rem 0.5rem', borderRadius: '10px', fontWeight: 600 }}>Confidential</span>
                    </div>
                    {accordionOpen.sectionG ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>

                  {accordionOpen.sectionG && (
                    <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', background: '#FFFDF9' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.85rem' }}>
                        <div>
                          <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Current Care Status</label>
                          <select
                            value={editFormData.clinicalInfo?.currentCareStatus || 'Intake'}
                            onChange={(e) => {
                              setEditFormData({
                                ...editFormData,
                                clinicalInfo: { ...editFormData.clinicalInfo, currentCareStatus: e.target.value }
                              });
                              setIsFormDirty(true);
                            }}
                            style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                          >
                            <option value="Intake">Intake (Initial Evaluation)</option>
                            <option value="Active Therapy">Active Therapy</option>
                            <option value="On Hold">On Hold</option>
                            <option value="Maintenance">Maintenance / Periodic Follow-up</option>
                            <option value="Completed">Completed Care Plan</option>
                            <option value="Referred Out">Referred Out to Specialist</option>
                            <option value="Discharged">Discharged</option>
                          </select>
                        </div>

                        <div>
                          <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Duration of Concerns</label>
                          <input 
                            type="text" 
                            placeholder="e.g. 3 months, 2 years, episodic"
                            value={editFormData.clinicalInfo?.durationOfConcerns || ''}
                            onChange={(e) => {
                              setEditFormData({
                                ...editFormData,
                                clinicalInfo: { ...editFormData.clinicalInfo, durationOfConcerns: e.target.value }
                              });
                              setIsFormDirty(true);
                            }}
                            style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Onset and Course</label>
                          <input 
                            type="text" 
                            placeholder="e.g. Acute following job loss, insidious onset"
                            value={editFormData.clinicalInfo?.onsetAndCourse || ''}
                            onChange={(e) => {
                              setEditFormData({
                                ...editFormData,
                                clinicalInfo: { ...editFormData.clinicalInfo, onsetAndCourse: e.target.value }
                              });
                              setIsFormDirty(true);
                            }}
                            style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '0.85rem' }}>
                        <div>
                          <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Presenting Concerns</label>
                          <textarea 
                            rows={3}
                            placeholder="Primary symptoms, triggers, client's chief complaints in their own words"
                            value={editFormData.clinicalInfo?.presentingConcerns || ''}
                            onChange={(e) => {
                              setEditFormData({
                                ...editFormData,
                                clinicalInfo: { ...editFormData.clinicalInfo, presentingConcerns: e.target.value }
                              });
                              setIsFormDirty(true);
                            }}
                            style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Relevant Clinical Observations</label>
                          <textarea 
                            rows={3}
                            placeholder="Appearance, affect, psychomotor activity, thought form, engagement during session"
                            value={editFormData.clinicalInfo?.relevantClinicalObservations || ''}
                            onChange={(e) => {
                              setEditFormData({
                                ...editFormData,
                                clinicalInfo: { ...editFormData.clinicalInfo, relevantClinicalObservations: e.target.value }
                              });
                              setIsFormDirty(true);
                            }}
                            style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Initial Clinical Impression / Working Formulation</label>
                          <textarea 
                            rows={2}
                            placeholder="Diagnostic impression, provisional biopsychosocial formulation"
                            value={editFormData.clinicalInfo?.initialClinicalImpression || ''}
                            onChange={(e) => {
                              setEditFormData({
                                ...editFormData,
                                clinicalInfo: { ...editFormData.clinicalInfo, initialClinicalImpression: e.target.value }
                              });
                              setIsFormDirty(true);
                            }}
                            style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Therapeutic Plan & Follow-Up Recommendations</label>
                          <textarea 
                            rows={2}
                            placeholder="Recommended session cadence, screening tools, homework tasks"
                            value={editFormData.clinicalInfo?.followUpRecommendations || ''}
                            onChange={(e) => {
                              setEditFormData({
                                ...editFormData,
                                clinicalInfo: { ...editFormData.clinicalInfo, followUpRecommendations: e.target.value }
                              });
                              setIsFormDirty(true);
                            }}
                            style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* SECTION H: Consent & Documentation */}
              <div style={{ border: '1px solid var(--color-slate-20)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => toggleSection('sectionH')}
                  style={{ width: '100%', padding: '0.75rem 1rem', background: '#F8F9FA', border: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontWeight: 700, fontSize: '0.92rem', color: 'var(--color-primary)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <FileText size={18} />
                    <span>Section H — Consent & Documentation</span>
                    <span style={{ fontSize: '0.72rem', background: '#E0F2F1', color: '#004D40', padding: '0.15rem 0.5rem', borderRadius: '10px', fontWeight: 600 }}>
                      Status: {editFormData.consentAndPrivacy?.patientConsentStatus || 'Pending'}
                    </span>
                  </div>
                  {accordionOpen.sectionH ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>

                {accordionOpen.sectionH && (
                  <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', background: '#FFF' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.85rem' }}>
                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Patient Consent Status</label>
                        <select
                          value={editFormData.consentAndPrivacy?.patientConsentStatus || 'Pending'}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              consentAndPrivacy: { ...editFormData.consentAndPrivacy, patientConsentStatus: e.target.value }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        >
                          <option value="Granted">Granted</option>
                          <option value="Pending">Pending</option>
                          <option value="Refused">Refused</option>
                          <option value="Withdrawn">Withdrawn</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Consent Date & Time</label>
                        <input 
                          type="datetime-local"
                          value={editFormData.consentAndPrivacy?.consentDateTime ? new Date(editFormData.consentAndPrivacy.consentDateTime).toISOString().slice(0, 16) : ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              consentAndPrivacy: { ...editFormData.consentAndPrivacy, consentDateTime: e.target.value }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Consent Recorded By</label>
                        <input 
                          type="text"
                          placeholder="Staff email or system recorder"
                          value={editFormData.consentAndPrivacy?.consentRecordedBy || currentUser?.email || ''}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              consentAndPrivacy: { ...editFormData.consentAndPrivacy, consentRecordedBy: e.target.value }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-20)', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                      </div>
                    </div>

                    {/* Guardian Details for Minor / Dependent */}
                    <div style={{ background: '#F8F9FA', padding: '0.85rem', borderRadius: '4px', border: '1px solid var(--color-slate-10)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <input 
                          type="checkbox"
                          id="hasGuardianCheckbox"
                          checked={!!editFormData.consentAndPrivacy?.guardianDetails?.hasGuardian}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              consentAndPrivacy: {
                                ...editFormData.consentAndPrivacy,
                                guardianDetails: {
                                  ...editFormData.consentAndPrivacy?.guardianDetails,
                                  hasGuardian: e.target.checked
                                }
                              }
                            });
                            setIsFormDirty(true);
                          }}
                        />
                        <label htmlFor="hasGuardianCheckbox" style={{ fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
                          Patient is a minor or dependent requiring Parent / Guardian Consent
                        </label>
                      </div>

                      {editFormData.consentAndPrivacy?.guardianDetails?.hasGuardian && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.65rem', marginTop: '0.5rem' }}>
                          <div>
                            <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block' }}>Guardian Full Name</label>
                            <input 
                              type="text" 
                              placeholder="Guardian Name"
                              value={editFormData.consentAndPrivacy?.guardianDetails?.guardianName || ''}
                              onChange={(e) => {
                                setEditFormData({
                                  ...editFormData,
                                  consentAndPrivacy: {
                                    ...editFormData.consentAndPrivacy,
                                    guardianDetails: { ...editFormData.consentAndPrivacy.guardianDetails, guardianName: e.target.value }
                                  }
                                });
                                setIsFormDirty(true);
                              }}
                              style={{ width: '100%', padding: '0.35rem', border: '1px solid var(--color-slate-20)', borderRadius: '3px', fontSize: '0.82rem' }}
                            />
                          </div>

                          <div>
                            <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block' }}>Guardian Relationship</label>
                            <input 
                              type="text" 
                              placeholder="e.g. Mother, Father, Legal Guardian"
                              value={editFormData.consentAndPrivacy?.guardianDetails?.guardianRelationship || ''}
                              onChange={(e) => {
                                setEditFormData({
                                  ...editFormData,
                                  consentAndPrivacy: {
                                    ...editFormData.consentAndPrivacy,
                                    guardianDetails: { ...editFormData.consentAndPrivacy.guardianDetails, guardianRelationship: e.target.value }
                                  }
                                });
                                setIsFormDirty(true);
                              }}
                              style={{ width: '100%', padding: '0.35rem', border: '1px solid var(--color-slate-20)', borderRadius: '3px', fontSize: '0.82rem' }}
                            />
                          </div>

                          <div>
                            <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block' }}>Guardian Phone</label>
                            <input 
                              type="tel" 
                              placeholder="Guardian phone"
                              value={editFormData.consentAndPrivacy?.guardianDetails?.guardianPhone || ''}
                              onChange={(e) => {
                                setEditFormData({
                                  ...editFormData,
                                  consentAndPrivacy: {
                                    ...editFormData.consentAndPrivacy,
                                    guardianDetails: { ...editFormData.consentAndPrivacy.guardianDetails, guardianPhone: e.target.value }
                                  }
                                });
                                setIsFormDirty(true);
                              }}
                              style={{ width: '100%', padding: '0.35rem', border: '1px solid var(--color-slate-20)', borderRadius: '3px', fontSize: '0.82rem' }}
                            />
                          </div>

                          <div>
                            <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block' }}>Guardian Consent Status</label>
                            <select
                              value={editFormData.consentAndPrivacy?.guardianDetails?.guardianConsentStatus || 'Not Applicable'}
                              onChange={(e) => {
                                setEditFormData({
                                  ...editFormData,
                                  consentAndPrivacy: {
                                    ...editFormData.consentAndPrivacy,
                                    guardianDetails: { ...editFormData.consentAndPrivacy.guardianDetails, guardianConsentStatus: e.target.value }
                                  }
                                });
                                setIsFormDirty(true);
                              }}
                              style={{ width: '100%', padding: '0.35rem', border: '1px solid var(--color-slate-20)', borderRadius: '3px', fontSize: '0.82rem' }}
                            >
                              <option value="Granted">Granted</option>
                              <option value="Pending">Pending</option>
                              <option value="Not Applicable">Not Applicable</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Specific Clinical Consents */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.84rem' }}>
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
                        <input 
                          type="checkbox"
                          checked={!!editFormData.consentAndPrivacy?.privacyNoticeAcknowledged}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              consentAndPrivacy: { ...editFormData.consentAndPrivacy, privacyNoticeAcknowledged: e.target.checked }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ marginTop: '0.2rem' }}
                        />
                        <span>Clinical Privacy Notice explained and acknowledged</span>
                      </label>

                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
                        <input 
                          type="checkbox"
                          checked={!!editFormData.consentAndPrivacy?.counsellingConsent}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              consentAndPrivacy: { ...editFormData.consentAndPrivacy, counsellingConsent: e.target.checked }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ marginTop: '0.2rem' }}
                        />
                        <span>Voluntary consent granted for psychological counselling & therapy</span>
                      </label>

                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
                        <input 
                          type="checkbox"
                          checked={!!editFormData.consentAndPrivacy?.assessmentConsent}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              consentAndPrivacy: { ...editFormData.consentAndPrivacy, assessmentConsent: e.target.checked }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ marginTop: '0.2rem' }}
                        />
                        <span>Consent granted for psychological screening & standardized assessments</span>
                      </label>

                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
                        <input 
                          type="checkbox"
                          checked={!!editFormData.consentAndPrivacy?.audioRecordingConsent}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              consentAndPrivacy: { ...editFormData.consentAndPrivacy, audioRecordingConsent: e.target.checked }
                            });
                            setIsFormDirty(true);
                          }}
                          style={{ marginTop: '0.2rem' }}
                        />
                        <span>Consent granted for encrypted audio session recording (optional; default off)</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

            </div>

            {/* Modal Footer Actions */}
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--color-slate-20)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FAFAFA' }}>
              <div style={{ fontSize: '0.8rem', color: isFormDirty ? '#F57F17' : 'var(--color-slate)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                {isFormDirty ? <AlertCircle size={14} /> : <Check size={14} />}
                <span>{isFormDirty ? 'Unsaved edits detected' : 'All changes saved'}</span>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button 
                  type="button" 
                  onClick={handleCloseEditModal}
                  style={{ padding: '0.45rem 1rem', fontSize: '0.85rem', border: '1px solid var(--color-slate-20)', background: '#FFF', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                >
                  Cancel
                </button>

                {isCreatingNew && (
                  <button 
                    type="button" 
                    disabled={savingProfile}
                    onClick={(e) => handleSaveProfile(e, true)}
                    style={{ padding: '0.45rem 1rem', fontSize: '0.85rem', border: '1px solid var(--color-slate-20)', background: '#FFF', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                  >
                    Save as Draft
                  </button>
                )}

                <button 
                  type="submit" 
                  disabled={savingProfile || dobValidation.isFuture}
                  className="premium-btn"
                  style={{ padding: '0.45rem 1.25rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem', opacity: dobValidation.isFuture ? 0.6 : 1 }}
                >
                  <Save size={15} /> {savingProfile ? 'Saving Record...' : isCreatingNew ? 'Register Patient Profile' : 'Save Changes'}
                </button>
              </div>
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
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Change Patient Profile Status</h3>
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
                <option value="pending_verification">Pending Intake / Verification</option>
                <option value="active">Active Care (In Therapy)</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived / Discharged</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Audit Reason</label>
              <input 
                type="text" 
                placeholder="e.g. Intake verified, case completed, etc."
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
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Assign Practitioner / Clinician</h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-slate)' }}>
              Assigning care practitioner for <strong>{assignTarget.personalInfo?.fullName}</strong> ({assignTarget.profileId})
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
                placeholder="e.g. Specialized in anxiety, matched on language"
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
