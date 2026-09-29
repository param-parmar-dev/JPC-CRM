import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft,
  Edit2,
  MapPin,
  Linkedin,
  GraduationCap,
  Briefcase,
  Package,
  DollarSign,
  Calendar,
  Clock,
  FileText,
  Upload,
  ExternalLink,
  Sparkles,
  CheckCircle2,
  Video,
  TrendingUp,
  User as UserIcon,
  MessageSquare,
  History,
  Trash2,
  Plus,
  Copy,
  Check,
  Building,
  LayoutDashboard,
  Send,
  Activity,
  Search,
  ChevronRight,
} from 'lucide-react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  Candidate,
  FollowUp,
  ActivityLog,
  User,
  InterviewSupportRequest,
  InterviewRound,
} from '../../types';
import {
  subscribeToCollection,
  subscribeToAurrumCandidates,
  updateAurrumCandidate,
  addAurrumFollowUp,
  updateFollowUp,
  deleteCandidate,
  logActivity,
} from '../../services/storage';
import { uploadFile, handleViewFile } from '../../services/fileService';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { canManageFreeTrial } from '../../lib/permissions';
import { FreeTrialBadge } from '../../components/FreeTrialBadge';
import { AurrumFlowHeader } from './AurrumFlowHeader';
import {
  AurrumCandidateModal,
  AURRUM_STAGES,
  AURRUM_SALES_STATUSES,
  resolveAurrumStage,
} from './AurrumCandidateModal';
import { cn } from '../../lib/utils';

type DashboardTab = 'overview' | 'interviews' | 'activities' | 'profile';

export const AurrumCandidateDetail: React.FC = () => {
  const { user, isAuthReady } = useAuth();
  const { showToast } = useToast();

  const getCandidateIdFromHash = () => {
    const queryStr = window.location.hash.split('?')[1] || '';
    const params = new URLSearchParams(queryStr);
    return params.get('id');
  };

  const [candidateId, setCandidateId] = useState<string | null>(getCandidateIdFromHash);
  const [allAurrumCandidates, setAllAurrumCandidates] = useState<Candidate[]>([]);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [interviews, setInterviews] = useState<InterviewSupportRequest[]>([]);
  const [interviewRounds, setInterviewRounds] = useState<InterviewRound[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');

  // Edit Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Free Trial Management State
  const [isUpdatingTrial, setIsUpdatingTrial] = useState(false);
  const [isEditingTrialDates, setIsEditingTrialDates] = useState(false);
  const [trialDatesForm, setTrialDatesForm] = useState({
    start_date: '',
    end_date: '',
  });

  // Quick Follow-Up Form
  const [followupDate, setFollowupDate] = useState('');
  const [followupNote, setFollowupNote] = useState('');
  const [isAddingFollowUp, setIsAddingFollowUp] = useState(false);

  // Quick Progress / Activity Update Form
  const [updateTitle, setUpdateTitle] = useState('Progress Update');
  const [updateDetails, setUpdateDetails] = useState('');
  const [isPostingUpdate, setIsPostingUpdate] = useState(false);
  const [activitySearch, setActivitySearch] = useState('');

  // Notes & Package quick edit
  const [notesValue, setNotesValue] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [isEditingDeal, setIsEditingDeal] = useState(false);
  const [dealForm, setDealForm] = useState({
    package_name: '',
    package_amount: 0,
    total_paid: 0,
  });

  // Resume upload
  const [isUploadingResume, setIsUploadingResume] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const canEditFreeTrial = canManageFreeTrial(user);
  const canDelete =
    user?.role === 'administrator' ||
    user?.role === 'jpc_sysadmin' ||
    user?.role === 'aurrum_admin';

  useEffect(() => {
    const onHashChange = () => {
      setCandidateId(getCandidateIdFromHash());
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Subscribe to all Aurrum candidates for the Candidate Switcher
  useEffect(() => {
    if (!isAuthReady) return;
    const unsubAllAurrum = subscribeToAurrumCandidates(data => {
      const sorted = [...data].sort(
        (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      );
      setAllAurrumCandidates(sorted);
      if (!candidateId && sorted.length > 0) {
        setCandidateId(sorted[0].id);
      }
    });
    return () => unsubAllAurrum();
  }, [isAuthReady, candidateId]);

  useEffect(() => {
    if (!isAuthReady || !candidateId) {
      if (isAuthReady && !candidateId) setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const unsubCandidate = onSnapshot(doc(db, 'jpc_candidates', candidateId), snap => {
      if (snap.exists()) {
        const data = { ...(snap.data() as Candidate), id: snap.id };
        setCandidate(data);
        setNotesValue(data.notes || '');
        setDealForm({
          package_name: data.package_name || 'Aurrum Interview Support',
          package_amount: Number(data.package_amount) || 0,
          total_paid: Number(data.total_paid) || 0,
        });
      } else {
        setCandidate(null);
      }
      setIsLoading(false);
    });

    const unsubFollowUps = onSnapshot(
      query(collection(db, 'jpc_followups'), where('candidate_id', '==', candidateId)),
      snap => {
        const items = snap.docs.map(d => ({ ...(d.data() as FollowUp), id: d.id }));
        items.sort(
          (a, b) => new Date(a.followup_date).getTime() - new Date(b.followup_date).getTime()
        );
        setFollowUps(items);
      }
    );

    const unsubActivity = onSnapshot(
      query(collection(db, 'jpc_activity_logs'), where('candidate_id', '==', candidateId)),
      snap => {
        const items = snap.docs.map(d => ({ ...(d.data() as ActivityLog), id: d.id }));
        items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setActivityLogs(items);
      }
    );

    const unsubUsers = subscribeToCollection<User>('jpc_users', data => {
      setAllUsers(data);
    });

    const unsubInterviews = subscribeToCollection<InterviewSupportRequest>(
      'jpc_interview_requests',
      data => {
        setInterviews(data);
      }
    );

    const unsubRounds = subscribeToCollection<InterviewRound>('jpc_interview_rounds', data => {
      setInterviewRounds(data);
    });

    return () => {
      unsubCandidate();
      unsubFollowUps();
      unsubActivity();
      unsubUsers();
      unsubInterviews();
      unsubRounds();
    };
  }, [isAuthReady, candidateId]);

  useEffect(() => {
    if (candidate) {
      const today = new Date();
      const end = new Date();
      end.setDate(today.getDate() + 15);
      setTrialDatesForm({
        start_date: candidate.free_trial_start_date || today.toISOString().split('T')[0],
        end_date: candidate.free_trial_end_date || end.toISOString().split('T')[0],
      });
    }
  }, [candidate?.id, candidate?.free_trial_start_date, candidate?.free_trial_end_date]);

  const salesUsers = useMemo(() => {
    return allUsers.filter(
      u =>
        !u.deleted_at &&
        (u.role === 'aurrum_sales' ||
          u.role === 'aurrum_admin' ||
          u.role === 'aurrum_team' ||
          u.role === 'jpc_sales' ||
          u.role === 'jpc_lead_gen' ||
          u.role === 'jpc_manager' ||
          u.role === 'administrator' ||
          u.role === 'jpc_sysadmin')
    );
  }, [allUsers]);

  const candidateInterviews = useMemo(() => {
    if (!candidate) return [];
    return interviews.filter(req => String(req.candidate_id) === String(candidate.id));
  }, [interviews, candidate]);

  const candidateRounds = useMemo(() => {
    const reqIds = new Set(candidateInterviews.map(r => r.id));
    return interviewRounds.filter(round => reqIds.has(round.request_id));
  }, [candidateInterviews, interviewRounds]);

  const filteredActivityLogs = useMemo(() => {
    const q = activitySearch.toLowerCase().trim();
    if (!q) return activityLogs;
    return activityLogs.filter(
      log =>
        (log.action || '').toLowerCase().includes(q) ||
        (log.details || '').toLowerCase().includes(q)
    );
  }, [activityLogs, activitySearch]);

  const resolveUserName = (uid?: string | number | null) => {
    if (!uid) return 'System';
    const found = allUsers.find(u => String(u.id) === String(uid));
    return found?.display_name || found?.username || 'Team Member';
  };

  const handleStageChange = async (nextStage: NonNullable<Candidate['aurrum_stage']>) => {
    if (!candidate) return;
    try {
      const systemStageMap: Record<
        NonNullable<Candidate['aurrum_stage']>,
        Candidate['current_stage']
      > = {
        lead: 'lead_generation',
        sales: 'sales',
        converted: 'interviewing',
        interview_support: 'interviewing',
        not_interested: 'not_interested',
        not_eligible: 'not_eligible',
      };

      const nextSalesStatus =
        nextStage === 'converted' || nextStage === 'interview_support'
          ? 'Converted'
          : nextStage === 'not_interested'
          ? 'Not Interested'
          : nextStage === 'not_eligible'
          ? 'Not Eligible'
          : candidate.aurrum_sales_status || 'Contacted';

      await updateAurrumCandidate(candidate.id, {
        aurrum_stage: nextStage,
        current_stage: systemStageMap[nextStage],
        aurrum_sales_status: nextSalesStatus,
      });

      await logActivity(
        candidate.id,
        'AURRUM_STAGE_UPDATE',
        `Aurrum candidate stage updated to ${nextStage}`,
        user?.id ?? null
      );
      showToast(`Stage updated to ${nextStage.replace('_', ' ')}`, 'success');
    } catch (err) {
      console.error('Failed to update stage:', err);
      showToast('Failed to update stage', 'error');
    }
  };

  // 15-Day Free Trial Handlers
  const handleEnableFreeTrial = async () => {
    if (!candidate || !canEditFreeTrial) return;
    setIsUpdatingTrial(true);
    try {
      const start = new Date();
      const end = new Date();
      end.setDate(start.getDate() + 15);
      const startStr = start.toISOString().split('T')[0];
      const endStr = end.toISOString().split('T')[0];

      await updateAurrumCandidate(candidate.id, {
        is_free_trial: true,
        free_trial_start_date: startStr,
        free_trial_end_date: endStr,
        free_trial_managed_by: user?.id || null,
        free_trial_updated_at: new Date().toISOString(),
      });

      await logActivity(
        candidate.id,
        'AURRUM_FREE_TRIAL_STARTED',
        `15-Day Free Trial activated (${startStr} to ${endStr})`,
        user?.id || null
      );
      showToast('15-Day Free Trial activated for this candidate!', 'success');
    } catch (err) {
      console.error('Error enabling Free Trial:', err);
      showToast('Failed to enable 15-Day Free Trial', 'error');
    } finally {
      setIsUpdatingTrial(false);
    }
  };

  const handleDisableFreeTrial = async () => {
    if (!candidate || !canEditFreeTrial) return;
    setIsUpdatingTrial(true);
    try {
      await updateAurrumCandidate(candidate.id, {
        is_free_trial: false,
        free_trial_managed_by: user?.id || null,
        free_trial_updated_at: new Date().toISOString(),
      });
      await logActivity(
        candidate.id,
        'AURRUM_FREE_TRIAL_ENDED',
        '15-Day Free Trial disabled',
        user?.id || null
      );
      setIsEditingTrialDates(false);
      showToast('15-Day Free Trial disabled.', 'info');
    } catch (err) {
      console.error('Error disabling Free Trial:', err);
      showToast('Failed to disable Free Trial', 'error');
    } finally {
      setIsUpdatingTrial(false);
    }
  };

  const handleSaveTrialDates = async () => {
    if (!candidate || !canEditFreeTrial) return;
    if (!trialDatesForm.start_date || !trialDatesForm.end_date) {
      showToast('Please select both start and end dates', 'error');
      return;
    }
    if (new Date(trialDatesForm.end_date) < new Date(trialDatesForm.start_date)) {
      showToast('End date cannot be earlier than start date', 'error');
      return;
    }
    setIsUpdatingTrial(true);
    try {
      await updateAurrumCandidate(candidate.id, {
        is_free_trial: true,
        free_trial_start_date: trialDatesForm.start_date,
        free_trial_end_date: trialDatesForm.end_date,
        free_trial_managed_by: user?.id || null,
        free_trial_updated_at: new Date().toISOString(),
      });
      await logActivity(
        candidate.id,
        'AURRUM_FREE_TRIAL_UPDATED',
        `Free Trial dates updated (${trialDatesForm.start_date} to ${trialDatesForm.end_date})`,
        user?.id || null
      );
      setIsEditingTrialDates(false);
      showToast('Free Trial dates updated!', 'success');
    } catch (err) {
      console.error('Error updating Free Trial dates:', err);
      showToast('Failed to update Free Trial dates', 'error');
    } finally {
      setIsUpdatingTrial(false);
    }
  };

  const handlePostProgressUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidate || !updateDetails.trim()) return;
    setIsPostingUpdate(true);
    try {
      await logActivity(
        candidate.id,
        updateTitle.trim() || 'Progress Update',
        updateDetails.trim(),
        user?.id ?? null
      );
      setUpdateDetails('');
      showToast('Candidate progress update recorded!', 'success');
    } catch (err) {
      console.error('Error posting progress update:', err);
      showToast('Failed to post update', 'error');
    } finally {
      setIsPostingUpdate(false);
    }
  };

  const handleSaveDeal = async () => {
    if (!candidate) return;
    try {
      const pkgAmt = Number(dealForm.package_amount) || 0;
      const paidAmt = Number(dealForm.total_paid) || 0;
      await updateAurrumCandidate(candidate.id, {
        package_name: dealForm.package_name,
        package_amount: pkgAmt,
        total_paid: paidAmt,
        balance_remaining: Math.max(0, pkgAmt - paidAmt),
      });
      await logActivity(
        candidate.id,
        'AURRUM_PACKAGE_UPDATED',
        `Package updated: ${dealForm.package_name} ($${pkgAmt}, Paid: $${paidAmt})`,
        user?.id ?? null
      );
      setIsEditingDeal(false);
      showToast('Package & payment details saved!', 'success');
    } catch (err) {
      console.error('Failed to save package details:', err);
      showToast('Failed to save package details', 'error');
    }
  };

  const handleSaveNotes = async () => {
    if (!candidate) return;
    setIsSavingNotes(true);
    try {
      await updateAurrumCandidate(candidate.id, { notes: notesValue });
      await logActivity(
        candidate.id,
        'AURRUM_NOTES_UPDATED',
        'Updated candidate notes',
        user?.id ?? null
      );
      showToast('Candidate notes saved!', 'success');
    } catch (err) {
      console.error('Failed to save notes:', err);
      showToast('Failed to save notes', 'error');
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleAddFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidate || !followupDate || !followupNote.trim()) return;
    setIsAddingFollowUp(true);
    try {
      await addAurrumFollowUp({
        candidate_id: candidate.id,
        stage: 'aurrum_sales',
        followup_date: followupDate,
        note: followupNote.trim(),
        done: false,
        created_by: user?.id ?? null,
      });
      await logActivity(
        candidate.id,
        'AURRUM_FOLLOWUP_ADDED',
        `Scheduled follow-up for ${followupDate}: ${followupNote.trim()}`,
        user?.id ?? null
      );
      setFollowupDate('');
      setFollowupNote('');
      showToast('Follow-up scheduled!', 'success');
    } catch (err) {
      console.error('Failed to add follow-up:', err);
      showToast('Failed to add follow-up', 'error');
    } finally {
      setIsAddingFollowUp(false);
    }
  };

  const handleResumeUpload = async (file: File) => {
    if (!candidate) return;
    setIsUploadingResume(true);
    try {
      const uploadedUrl = await uploadFile(file, {
        name: candidate.full_name,
        email: candidate.email,
        phone: candidate.phone,
        filename: file.name,
      });
      await updateAurrumCandidate(candidate.id, {
        resume_url: uploadedUrl,
        resume_filename: file.name,
      });
      await logActivity(
        candidate.id,
        'AURRUM_RESUME_UPLOADED',
        `Uploaded resume: ${file.name}`,
        user?.id ?? null
      );
      showToast('Resume uploaded successfully!', 'success');
    } catch (err) {
      console.error('Error uploading resume:', err);
      showToast('Failed to upload resume', 'error');
    } finally {
      setIsUploadingResume(false);
    }
  };

  const handleCopy = (val: string, label: string) => {
    navigator.clipboard.writeText(val);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 1800);
  };

  const handleDeleteCandidate = async () => {
    if (!candidate) return;
    if (
      !window.confirm(
        `Are you sure you want to delete Aurrum candidate "${candidate.full_name}"?`
      )
    ) {
      return;
    }
    try {
      await deleteCandidate(candidate.id);
      showToast('Aurrum candidate deleted.', 'info');
      window.location.hash = '#aurrum-candidates';
    } catch (err) {
      console.error('Failed to delete candidate:', err);
      showToast('Failed to delete candidate', 'error');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className="space-y-6">
        <AurrumFlowHeader
          activeStep="candidates"
          title="Aurrum Candidate Dashboard"
          subtitle="Candidate record not found"
        />
        <div className="bg-bg-secondary border border-border-primary rounded-2xl p-12 text-center space-y-4">
          <p className="text-lg font-bold text-text-primary">Aurrum Candidate Not Found</p>
          <p className="text-xs text-text-secondary">
            The requested candidate record could not be found or has been removed.
          </p>
          <button
            type="button"
            onClick={() => {
              window.location.hash = '#aurrum-candidates';
            }}
            className="px-5 py-2.5 bg-accent-blue text-white rounded-xl text-xs font-bold hover:bg-accent-blue/90 transition-all inline-flex items-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Aurrum Candidates
          </button>
        </div>
      </div>
    );
  }

  const currentStage = resolveAurrumStage(candidate);
  const stageMeta = AURRUM_STAGES.find(s => s.value === currentStage) || AURRUM_STAGES[0];
  const pkgAmount = Number(candidate.package_amount) || 0;
  const totalPaid = Number(candidate.total_paid) || 0;
  const balanceRemaining = Math.max(0, pkgAmount - totalPaid);

  const journeyOrder: NonNullable<Candidate['aurrum_stage']>[] = [
    'lead',
    'sales',
    'converted',
    'interview_support',
  ];
  const stageIdx = journeyOrder.indexOf(currentStage);
  const journeyProgressPct =
    stageIdx >= 0 ? Math.round(((stageIdx + 1) / journeyOrder.length) * 100) : 25;

  const pendingFollowUpsCount = followUps.filter(f => !f.done).length;

  return (
    <div className="space-y-6 pb-16">
      <AurrumFlowHeader
        activeStep={currentStage === 'sales' ? 'sales' : 'candidates'}
        title={`${candidate.full_name} — Candidate Dashboard`}
        subtitle="Complete candidate journey, status, progress, interviews, and activity log in one place."
        actions={
          allAurrumCandidates.length > 1 ? (
            <div className="flex items-center gap-2 bg-bg-secondary border border-border-primary rounded-xl px-3 py-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-text-muted shrink-0">
                Switch Candidate:
              </span>
              <select
                value={candidate.id}
                onChange={e => {
                  window.location.hash = `#aurrum-candidate?id=${e.target.value}`;
                }}
                className="bg-transparent text-xs font-bold text-text-primary outline-none cursor-pointer max-w-[200px] truncate"
              >
                {allAurrumCandidates.map(c => (
                  <option key={c.id} value={c.id} className="bg-bg-secondary text-text-primary">
                    {c.full_name} ({resolveAurrumStage(c).replace('_', ' ')})
                  </option>
                ))}
              </select>
            </div>
          ) : undefined
        }
      />

      {/* Top Navigation & Candidate Hero Banner */}
      <div className="bg-bg-secondary border border-border-primary rounded-3xl p-6 shadow-sm space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                window.location.hash = '#aurrum-candidates';
              }}
              className="px-3.5 py-2 rounded-xl bg-bg-tertiary border border-border-primary text-xs font-bold text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              All Candidates
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.hash = '#aurrum-sales';
              }}
              className="px-3.5 py-2 rounded-xl bg-bg-tertiary border border-border-primary text-xs font-bold text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <TrendingUp className="w-3.5 h-3.5 text-amber-500" />
              Sales Pipeline
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.hash = '#aurrum-interviews';
              }}
              className="px-3.5 py-2 rounded-xl bg-bg-tertiary border border-border-primary text-xs font-bold text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Video className="w-3.5 h-3.5 text-purple-500" />
              Interview Support
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsEditModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-bg-tertiary border border-border-primary text-xs font-bold text-text-primary hover:border-accent-blue transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5 text-accent-blue" />
              Edit Profile
            </button>
            {canDelete && (
              <button
                type="button"
                onClick={handleDeleteCandidate}
                className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500 hover:text-white transition-all cursor-pointer"
                title="Delete Candidate"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Candidate Profile Summary + Stage Action Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pt-2 border-t border-border-primary">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center font-black text-xl shadow-lg shadow-amber-500/20 shrink-0">
              {(candidate.full_name || 'A')
                .split(' ')
                .filter(Boolean)
                .map(n => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-black text-text-primary tracking-tight">
                  {candidate.full_name}
                </h1>
                <span
                  className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border"
                  style={{
                    color: stageMeta.color,
                    borderColor: `${stageMeta.color}40`,
                    backgroundColor: `${stageMeta.color}15`,
                  }}
                >
                  {stageMeta.label}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-bg-tertiary border border-border-primary text-text-secondary">
                  Sales: {candidate.aurrum_sales_status || 'New Lead'}
                </span>
                {candidate.is_free_trial && (
                  <FreeTrialBadge
                    startDate={candidate.free_trial_start_date}
                    endDate={candidate.free_trial_end_date}
                    size="md"
                    showDaysRemaining={true}
                  />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs text-text-secondary">
                {candidate.job_interest && (
                  <span className="flex items-center gap-1.5 font-semibold text-text-primary">
                    <Briefcase className="w-3.5 h-3.5 text-amber-500" />
                    {candidate.job_interest}
                  </span>
                )}
                {candidate.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-text-muted" />
                    {candidate.location}
                  </span>
                )}
                {candidate.experience_years && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-text-muted" />
                    {candidate.experience_years} yrs exp
                  </span>
                )}
                <span className="text-text-muted">
                  Added {new Date(candidate.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Stage Progression Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {currentStage !== 'sales' && (
              <button
                type="button"
                onClick={() => handleStageChange('sales')}
                className="px-3.5 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500 text-amber-500 hover:text-white border border-amber-500/25 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <TrendingUp className="w-3.5 h-3.5" />
                Move to Sales
              </button>
            )}
            {currentStage !== 'converted' && (
              <button
                type="button"
                onClick={() => handleStageChange('converted')}
                className="px-3.5 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-white border border-emerald-500/25 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Mark Converted
              </button>
            )}
            <button
              type="button"
              onClick={async () => {
                await handleStageChange('interview_support');
                window.location.hash = '#aurrum-interviews';
              }}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg shadow-purple-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Video className="w-3.5 h-3.5" />
              Send to Interview Support
            </button>
          </div>
        </div>

        {/* Visual Candidate Journey Progress Bar & Stage Selector */}
        <div className="space-y-3 pt-4 border-t border-border-primary">
          <div className="flex items-center justify-between text-xs">
            <span className="font-black uppercase tracking-wider text-text-muted text-[10px]">
              Candidate Journey Progress
            </span>
            <span className="font-black text-amber-500">{journeyProgressPct}% Complete</span>
          </div>
          <div className="h-2 bg-bg-tertiary rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-500 via-emerald-500 to-purple-500 transition-all duration-500"
              style={{ width: `${journeyProgressPct}%` }}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1">
            {AURRUM_STAGES.map(st => {
              const isCurrent = currentStage === st.value;
              return (
                <button
                  key={st.value}
                  type="button"
                  onClick={() => handleStageChange(st.value)}
                  className={cn(
                    'px-3 py-2 rounded-xl text-[11px] font-bold border transition-all flex items-center justify-center gap-1.5 cursor-pointer',
                    isCurrent
                      ? 'bg-accent-blue text-white border-accent-blue shadow-md shadow-accent-blue/20'
                      : 'bg-bg-tertiary border-border-primary text-text-secondary hover:text-text-primary'
                  )}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: isCurrent ? '#fff' : st.color }}
                  />
                  <span className="truncate">{st.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Candidate KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => setActiveTab('interviews')}
          className="bg-bg-secondary border border-border-primary hover:border-purple-500/40 rounded-2xl p-4 cursor-pointer transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">
              Interviews & Rounds
            </span>
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
              <Video className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-text-primary mt-2">
            {candidateInterviews.length}
          </p>
          <p className="text-[11px] text-purple-400 font-semibold mt-0.5">
            {candidateRounds.length} scheduled round(s)
          </p>
        </div>

        <div className="bg-bg-secondary border border-border-primary rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">
              Current Status
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-base font-black text-text-primary mt-2 truncate">
            {stageMeta.label.replace(/^\d+\.\s*/, '')}
          </p>
          <p className="text-[11px] text-amber-500 font-semibold mt-0.5 truncate">
            Sales: {candidate.aurrum_sales_status || 'New Lead'}
          </p>
        </div>

        <div
          onClick={() => setActiveTab('profile')}
          className="bg-bg-secondary border border-border-primary hover:border-emerald-500/40 rounded-2xl p-4 cursor-pointer transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">
              Package & Balance
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-text-primary mt-2">
            ${pkgAmount.toLocaleString()}
          </p>
          <p className="text-[11px] text-text-secondary mt-0.5">
            Paid: <span className="text-emerald-500 font-bold">${totalPaid.toLocaleString()}</span> • Due: ${balanceRemaining.toLocaleString()}
          </p>
        </div>

        <div
          onClick={() => setActiveTab('activities')}
          className="bg-bg-secondary border border-border-primary hover:border-amber-500/40 rounded-2xl p-4 cursor-pointer transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">
              Activities & Updates
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-text-primary mt-2">{activityLogs.length}</p>
          <p className="text-[11px] text-text-secondary mt-0.5">
            {pendingFollowUpsCount} pending follow-up(s)
          </p>
        </div>
      </div>

      {/* Dashboard Section Tabs */}
      <div className="bg-bg-secondary border border-border-primary rounded-2xl p-1.5 flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
        {[
          {
            id: 'overview' as const,
            label: 'Candidate Journey Dashboard',
            icon: LayoutDashboard,
          },
          {
            id: 'interviews' as const,
            label: `Interviews & Rounds (${candidateInterviews.length})`,
            icon: Video,
          },
          {
            id: 'activities' as const,
            label: `Activities & Updates (${activityLogs.length})`,
            icon: History,
          },
          {
            id: 'profile' as const,
            label: 'Profile, Sales & Resume',
            icon: UserIcon,
          },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer',
                isActive
                  ? 'bg-accent-blue text-white shadow-md shadow-accent-blue/20'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
              )}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 15-Day Free Trial Management Section (Always accessible on Overview & Profile) */}
      {(activeTab === 'overview' || activeTab === 'profile') && (
        <section className="bg-bg-secondary border border-amber-500/30 rounded-3xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-border-primary bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-text-primary">15-Day Free Trial</h3>
                  {candidate.is_free_trial && (
                    <FreeTrialBadge
                      startDate={candidate.free_trial_start_date}
                      endDate={candidate.free_trial_end_date}
                      size="sm"
                      showDaysRemaining={true}
                    />
                  )}
                </div>
                <p className="text-xs text-text-secondary">
                  Enroll or manage this Aurrum candidate&apos;s 15-day Free Trial window
                </p>
              </div>
            </div>

            {canEditFreeTrial && (
              <div className="flex items-center gap-2">
                {candidate.is_free_trial ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsEditingTrialDates(!isEditingTrialDates)}
                      className="px-3.5 py-1.5 rounded-xl border border-border-primary bg-bg-tertiary text-text-secondary hover:text-text-primary font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      {isEditingTrialDates ? 'Cancel Edit' : 'Edit Dates'}
                    </button>
                    <button
                      type="button"
                      onClick={handleDisableFreeTrial}
                      disabled={isUpdatingTrial}
                      className="px-3.5 py-1.5 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white font-bold text-xs transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      End Free Trial
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleEnableFreeTrial}
                    disabled={isUpdatingTrial}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-xs shadow-lg shadow-amber-500/20 hover:opacity-95 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Start 15-Day Free Trial
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="p-6">
            {candidate.is_free_trial ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-2xl bg-bg-tertiary/60 border border-border-primary">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted block mb-1">
                      Trial Status
                    </span>
                    <FreeTrialBadge
                      startDate={candidate.free_trial_start_date}
                      endDate={candidate.free_trial_end_date}
                      size="md"
                      showDaysRemaining={true}
                    />
                  </div>
                  <div className="p-4 rounded-2xl bg-bg-tertiary/60 border border-border-primary">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted block mb-1">
                      Start Date
                    </span>
                    <span className="text-sm font-bold text-text-primary">
                      {candidate.free_trial_start_date
                        ? new Date(candidate.free_trial_start_date).toLocaleDateString()
                        : 'Not set'}
                    </span>
                  </div>
                  <div className="p-4 rounded-2xl bg-bg-tertiary/60 border border-border-primary">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted block mb-1">
                      End Date (15 Days)
                    </span>
                    <span className="text-sm font-bold text-text-primary">
                      {candidate.free_trial_end_date
                        ? new Date(candidate.free_trial_end_date).toLocaleDateString()
                        : 'Not set'}
                    </span>
                  </div>
                </div>

                {isEditingTrialDates && canEditFreeTrial && (
                  <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted block mb-1.5">
                          Trial Start Date
                        </label>
                        <input
                          type="date"
                          value={trialDatesForm.start_date}
                          onChange={e => {
                            const newStart = e.target.value;
                            const endD = new Date(newStart);
                            if (!isNaN(endD.getTime())) {
                              endD.setDate(endD.getDate() + 15);
                              setTrialDatesForm({
                                start_date: newStart,
                                end_date: endD.toISOString().split('T')[0],
                              });
                            } else {
                              setTrialDatesForm(prev => ({ ...prev, start_date: newStart }));
                            }
                          }}
                          className="w-full p-2.5 bg-bg-secondary border border-border-primary rounded-xl text-sm text-text-primary outline-none focus:border-amber-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted block mb-1.5">
                          Trial End Date
                        </label>
                        <input
                          type="date"
                          value={trialDatesForm.end_date}
                          onChange={e =>
                            setTrialDatesForm(prev => ({ ...prev, end_date: e.target.value }))
                          }
                          className="w-full p-2.5 bg-bg-secondary border border-border-primary rounded-xl text-sm text-text-primary outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const start = new Date();
                          const end = new Date();
                          end.setDate(start.getDate() + 15);
                          setTrialDatesForm({
                            start_date: start.toISOString().split('T')[0],
                            end_date: end.toISOString().split('T')[0],
                          });
                        }}
                        className="px-3 py-1.5 rounded-xl bg-bg-tertiary text-text-secondary hover:text-text-primary text-xs font-bold cursor-pointer"
                      >
                        Reset to 15 Days from Today
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveTrialDates}
                        disabled={isUpdatingTrial}
                        className="px-4 py-1.5 rounded-xl bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition-all cursor-pointer"
                      >
                        Save Trial Window
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-text-secondary">
                <p>
                  This candidate is not currently enrolled in a 15-Day Free Trial. Click{' '}
                  <strong className="text-amber-500">Start 15-Day Free Trial</strong> to begin a
                  15-day trial period.
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* TAB: INTERVIEWS & ROUNDS */}
      {activeTab === 'interviews' && (
        <div className="bg-bg-secondary border border-border-primary rounded-3xl p-6 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-text-primary flex items-center gap-2">
                <Video className="w-5 h-5 text-purple-500" />
                Candidate Interviews & Rounds ({candidateInterviews.length})
              </h2>
              <p className="text-xs text-text-secondary mt-0.5">
                All Interview Support bookings and round schedules linked to {candidate.full_name}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                window.location.hash = '#aurrum-interviews';
              }}
              className="px-4 py-2.5 rounded-xl bg-purple-600 text-white text-xs font-bold hover:bg-purple-500 transition-all flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
            >
              <Video className="w-4 h-4" />
              Open Aurrum Interview Support
            </button>
          </div>

          {candidateInterviews.length > 0 ? (
            <div className="space-y-4">
              {candidateInterviews.map(req => {
                const rounds = candidateRounds.filter(r => r.request_id === req.id);
                return (
                  <div
                    key={req.id}
                    className="p-5 rounded-2xl bg-bg-tertiary/60 border border-border-primary space-y-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-black text-text-primary">
                            {req.interview_company_name || req.company_name || 'Company'}
                          </h3>
                          <span className="px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[10px] font-black uppercase">
                            {req.overall_status.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-accent-blue mt-0.5">
                          {req.job_title || 'Role'} • {req.interview_type.replace(/_/g, ' ')} •{' '}
                          {req.timezone}
                        </p>
                      </div>
                      {req.job_link && (
                        <a
                          href={req.job_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-xl bg-bg-secondary border border-border-primary text-xs font-bold text-text-secondary hover:text-accent-blue flex items-center gap-1.5"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Job Link
                        </a>
                      )}
                    </div>

                    {rounds.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-border-primary/60">
                        {rounds.map(round => (
                          <div
                            key={round.id}
                            className="p-3.5 rounded-xl bg-bg-secondary border border-border-primary flex items-center justify-between gap-3"
                          >
                            <div>
                              <p className="text-xs font-black text-text-primary">
                                {round.round_label} ({round.round_type})
                              </p>
                              <p className="text-[11px] text-text-secondary mt-0.5">
                                {round.booked_slot_time
                                  ? new Date(round.booked_slot_time).toLocaleString()
                                  : round.interview_date || 'Slot TBD'}{' '}
                                • {round.duration_minutes} mins
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 text-[10px] font-bold uppercase block">
                                {round.status}
                              </span>
                              {round.result && (
                                <span className="text-[10px] text-emerald-500 font-bold uppercase mt-1 block">
                                  Result: {round.result}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-text-muted italic">
                        No individual rounds scheduled yet for this request.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-12 text-center bg-bg-tertiary/40 rounded-2xl border border-dashed border-border-primary space-y-2">
              <Video className="w-8 h-8 text-text-muted mx-auto opacity-50" />
              <p className="text-sm font-bold text-text-primary">
                No Interview Support requests yet
              </p>
              <p className="text-xs text-text-secondary">
                When this candidate has an upcoming interview, send them to Aurrum Interview Support.
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB: ACTIVITIES & UPDATES */}
      {activeTab === 'activities' && (
        <div className="space-y-6">
          <div className="bg-bg-secondary border border-border-primary rounded-3xl p-6 shadow-sm space-y-5">
            <div>
              <h2 className="text-lg font-black text-text-primary flex items-center gap-2">
                <History className="w-5 h-5 text-amber-500" />
                Complete Candidate Activity & Progress Log ({activityLogs.length})
              </h2>
              <p className="text-xs text-text-secondary mt-0.5">
                Record progress updates, notes, or milestones and review every historical action for{' '}
                {candidate.full_name}.
              </p>
            </div>

            {/* Post Progress Update Form */}
            <form
              onSubmit={handlePostProgressUpdate}
              className="p-4 bg-bg-tertiary/70 border border-border-primary rounded-2xl space-y-3"
            >
              <div className="flex flex-col sm:flex-row gap-3">
                <select
                  value={updateTitle}
                  onChange={e => setUpdateTitle(e.target.value)}
                  className="px-3.5 py-2.5 bg-bg-secondary border border-border-primary rounded-xl text-xs font-bold text-text-primary outline-none cursor-pointer sm:w-52"
                >
                  <option value="Progress Update">Progress Update</option>
                  <option value="Candidate Call Note">Candidate Call Note</option>
                  <option value="Interview Update">Interview Update</option>
                  <option value="Status Check-In">Status Check-In</option>
                </select>
                <input
                  type="text"
                  required
                  value={updateDetails}
                  onChange={e => setUpdateDetails(e.target.value)}
                  placeholder="Write a candidate progress update, activity note, or status summary..."
                  className="flex-1 px-4 py-2.5 bg-bg-secondary border border-border-primary rounded-xl text-xs text-text-primary outline-none focus:border-accent-blue"
                />
                <button
                  type="submit"
                  disabled={isPostingUpdate}
                  className="px-5 py-2.5 bg-accent-blue text-white rounded-xl text-xs font-bold hover:bg-accent-blue/90 transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  {isPostingUpdate ? 'Posting...' : 'Log Update'}
                </button>
              </div>
            </form>

            <div className="relative">
              <Search className="w-4 h-4 text-text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={activitySearch}
                onChange={e => setActivitySearch(e.target.value)}
                placeholder="Search candidate activity log..."
                className="w-full pl-10 pr-4 py-2.5 bg-bg-tertiary border border-border-primary rounded-xl text-xs text-text-primary outline-none focus:border-accent-blue"
              />
            </div>

            {filteredActivityLogs.length > 0 ? (
              <div className="space-y-3">
                {filteredActivityLogs.map(log => (
                  <div
                    key={log.id}
                    className="p-4 bg-bg-tertiary/50 rounded-2xl border border-border-primary flex items-start justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-md bg-amber-500/10 text-amber-500 text-[10px] font-black uppercase tracking-wider">
                          {log.action.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[11px] text-text-muted">
                          By {resolveUserName(log.user_id)}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-text-primary">{log.details}</p>
                    </div>
                    <span className="text-[10px] text-text-muted shrink-0">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-text-secondary text-center py-8">
                No activity logs match your search.
              </p>
            )}
          </div>
        </div>
      )}

      {/* TAB: OVERVIEW DASHBOARD & PROFILE, SALES & RESUME */}
      {(activeTab === 'overview' || activeTab === 'profile') && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Columns */}
          <div className="lg:col-span-2 space-y-6">
            {/* On Overview Tab: Show Quick Progress Logger */}
            {activeTab === 'overview' && (
              <div className="bg-bg-secondary border border-border-primary rounded-3xl p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-black text-text-primary flex items-center gap-2">
                    <Activity className="w-4 h-4 text-amber-500" />
                    Quick Candidate Progress Update
                  </h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab('activities')}
                    className="text-xs font-bold text-accent-blue hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    View All Updates ({activityLogs.length})
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                <form
                  onSubmit={handlePostProgressUpdate}
                  className="flex flex-col sm:flex-row gap-2.5"
                >
                  <select
                    value={updateTitle}
                    onChange={e => setUpdateTitle(e.target.value)}
                    className="px-3 py-2.5 bg-bg-tertiary border border-border-primary rounded-xl text-xs font-bold text-text-primary outline-none cursor-pointer sm:w-44"
                  >
                    <option value="Progress Update">Progress Update</option>
                    <option value="Candidate Call Note">Candidate Call Note</option>
                    <option value="Interview Update">Interview Update</option>
                    <option value="Status Check-In">Status Check-In</option>
                  </select>
                  <input
                    type="text"
                    required
                    value={updateDetails}
                    onChange={e => setUpdateDetails(e.target.value)}
                    placeholder="Log a quick progress update or activity for this candidate..."
                    className="flex-1 px-3.5 py-2.5 bg-bg-tertiary border border-border-primary rounded-xl text-xs text-text-primary outline-none focus:border-accent-blue"
                  />
                  <button
                    type="submit"
                    disabled={isPostingUpdate}
                    className="px-4 py-2.5 bg-accent-blue text-white rounded-xl text-xs font-bold hover:bg-accent-blue/90 transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Log Update
                  </button>
                </form>
              </div>
            )}

            {/* Contact & Professional Overview */}
            <div className="bg-bg-secondary border border-border-primary rounded-3xl p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-black text-text-primary flex items-center gap-2">
                  <UserIcon className="w-4 h-4 text-accent-blue" />
                  Contact & Professional Profile
                </h2>
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(true)}
                  className="text-xs font-bold text-accent-blue hover:underline cursor-pointer"
                >
                  Edit Details
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-2xl bg-bg-tertiary/60 border border-border-primary flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                      Phone Number
                    </span>
                    <p className="text-xs sm:text-sm font-bold text-text-primary truncate mt-0.5">
                      {candidate.phone || '—'}
                    </p>
                  </div>
                  {candidate.phone && (
                    <button
                      type="button"
                      onClick={() => handleCopy(candidate.phone, 'phone')}
                      className="p-2 rounded-xl bg-bg-secondary border border-border-primary text-text-muted hover:text-text-primary cursor-pointer"
                    >
                      {copiedField === 'phone' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>

                <div className="p-3.5 rounded-2xl bg-bg-tertiary/60 border border-border-primary flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                      WhatsApp
                    </span>
                    <p className="text-xs sm:text-sm font-bold text-text-primary truncate mt-0.5">
                      {candidate.whatsapp || candidate.phone || '—'}
                    </p>
                  </div>
                  {(candidate.whatsapp || candidate.phone) && (
                    <button
                      type="button"
                      onClick={() => handleCopy(candidate.whatsapp || candidate.phone, 'whatsapp')}
                      className="p-2 rounded-xl bg-bg-secondary border border-border-primary text-text-muted hover:text-text-primary cursor-pointer"
                    >
                      {copiedField === 'whatsapp' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>

                <div className="p-3.5 rounded-2xl bg-bg-tertiary/60 border border-border-primary flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                      Email Address
                    </span>
                    <p className="text-xs sm:text-sm font-bold text-text-primary truncate mt-0.5">
                      {candidate.email || '—'}
                    </p>
                  </div>
                  {candidate.email && (
                    <button
                      type="button"
                      onClick={() => handleCopy(candidate.email, 'email')}
                      className="p-2 rounded-xl bg-bg-secondary border border-border-primary text-text-muted hover:text-text-primary cursor-pointer"
                    >
                      {copiedField === 'email' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>

                <div className="p-3.5 rounded-2xl bg-bg-tertiary/60 border border-border-primary flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                      LinkedIn Profile
                    </span>
                    {candidate.linkedin_url ? (
                      <a
                        href={candidate.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs sm:text-sm font-bold text-accent-blue hover:underline truncate flex items-center gap-1 mt-0.5"
                      >
                        <Linkedin className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{candidate.linkedin_url}</span>
                      </a>
                    ) : (
                      <p className="text-xs sm:text-sm font-bold text-text-muted mt-0.5">—</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="p-3 rounded-2xl bg-bg-tertiary/40 border border-border-primary">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                    Target Job Role
                  </span>
                  <p className="text-xs font-bold text-text-primary mt-1 truncate">
                    {candidate.job_interest || '—'}
                  </p>
                </div>
                <div className="p-3 rounded-2xl bg-bg-tertiary/40 border border-border-primary">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                    Domain
                  </span>
                  <p className="text-xs font-bold text-text-primary mt-1 truncate">
                    {candidate.domain_interested || '—'}
                  </p>
                </div>
                <div className="p-3 rounded-2xl bg-bg-tertiary/40 border border-border-primary">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                    Experience
                  </span>
                  <p className="text-xs font-bold text-text-primary mt-1 truncate">
                    {candidate.experience_years ? `${candidate.experience_years} Years` : '—'}
                  </p>
                </div>
                <div className="p-3 rounded-2xl bg-bg-tertiary/40 border border-border-primary">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                    Lead Source
                  </span>
                  <p className="text-xs font-bold text-text-primary mt-1 truncate">
                    {candidate.lead_source || '—'}
                  </p>
                </div>
              </div>

              {(candidate.current_company || candidate.degree || candidate.university) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-2xl bg-bg-tertiary/40 border border-border-primary flex items-center gap-3">
                    <Building className="w-4 h-4 text-text-muted shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                        Current Company & Role
                      </span>
                      <p className="text-xs font-bold text-text-primary truncate">
                        {[candidate.current_designation, candidate.current_company]
                          .filter(Boolean)
                          .join(' @ ') || '—'}
                      </p>
                    </div>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-bg-tertiary/40 border border-border-primary flex items-center gap-3">
                    <GraduationCap className="w-4 h-4 text-text-muted shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                        Education
                      </span>
                      <p className="text-xs font-bold text-text-primary truncate">
                        {[candidate.degree, candidate.university, candidate.graduation_year]
                          .filter(Boolean)
                          .join(' • ') || '—'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {candidate.skills && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                    Key Skills & Tech Stack
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {candidate.skills
                      .split(',')
                      .map(s => s.trim())
                      .filter(Boolean)
                      .map((skill, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 rounded-xl bg-bg-tertiary border border-border-primary text-xs font-semibold text-text-primary"
                        >
                          {skill}
                        </span>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Aurrum Sales & Package Summary Card */}
            <div className="bg-bg-secondary border border-border-primary rounded-3xl p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-black text-text-primary flex items-center gap-2">
                  <Package className="w-4 h-4 text-emerald-500" />
                  Aurrum Sales & Package Summary
                </h2>
                <button
                  type="button"
                  onClick={() => setIsEditingDeal(!isEditingDeal)}
                  className="text-xs font-bold text-accent-blue hover:underline cursor-pointer"
                >
                  {isEditingDeal ? 'Cancel' : 'Edit Package / Payment'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-bg-tertiary/60 border border-border-primary">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                    Package Value
                  </span>
                  <p className="text-xl font-black text-text-primary mt-1">
                    ${pkgAmount.toLocaleString()}
                  </p>
                  <span className="text-[11px] text-text-secondary truncate block">
                    {candidate.package_name || 'Aurrum Interview Support'}
                  </span>
                </div>
                <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 block">
                    Total Paid
                  </span>
                  <p className="text-xl font-black text-emerald-500 mt-1">
                    ${totalPaid.toLocaleString()}
                  </p>
                  <span className="text-[11px] text-text-secondary">Collected amount</span>
                </div>
                <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500 block">
                    Balance Due
                  </span>
                  <p className="text-xl font-black text-amber-500 mt-1">
                    ${balanceRemaining.toLocaleString()}
                  </p>
                  <span className="text-[11px] text-text-secondary">Remaining balance</span>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-text-muted mb-1.5">
                  Aurrum Sales Status
                </label>
                <select
                  value={candidate.aurrum_sales_status || 'New Lead'}
                  onChange={async e => {
                    const nextStatus = e.target.value as NonNullable<
                      Candidate['aurrum_sales_status']
                    >;
                    await updateAurrumCandidate(candidate.id, { aurrum_sales_status: nextStatus });
                    showToast(`Sales status updated to ${nextStatus}`, 'success');
                  }}
                  className="w-full px-3.5 py-2.5 bg-bg-tertiary border border-border-primary rounded-xl text-xs font-bold text-text-primary outline-none cursor-pointer"
                >
                  {AURRUM_SALES_STATUSES.map(st => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              {isEditingDeal && (
                <div className="p-4 bg-bg-tertiary/70 border border-border-primary rounded-2xl space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">
                        Package Plan
                      </label>
                      <input
                        type="text"
                        value={dealForm.package_name}
                        onChange={e => setDealForm({ ...dealForm, package_name: e.target.value })}
                        className="w-full px-3 py-2 bg-bg-secondary border border-border-primary rounded-xl text-xs font-bold text-text-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">
                        Package Amount ($)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={dealForm.package_amount}
                        onChange={e =>
                          setDealForm({
                            ...dealForm,
                            package_amount: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full px-3 py-2 bg-bg-secondary border border-border-primary rounded-xl text-xs font-bold text-text-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">
                        Total Paid ($)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={dealForm.total_paid}
                        onChange={e =>
                          setDealForm({
                            ...dealForm,
                            total_paid: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full px-3 py-2 bg-bg-secondary border border-border-primary rounded-xl text-xs font-bold text-text-primary"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleSaveDeal}
                      className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 transition-colors cursor-pointer"
                    >
                      Save Package & Payment
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Follow-Ups & Candidate Notes */}
            <div className="bg-bg-secondary border border-border-primary rounded-3xl p-6 shadow-sm space-y-5">
              <h2 className="text-base font-black text-text-primary flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-amber-500" />
                Follow-Ups & Candidate Notes
              </h2>

              <form
                onSubmit={handleAddFollowUp}
                className="p-4 bg-bg-tertiary/60 border border-border-primary rounded-2xl space-y-3"
              >
                <span className="text-[10px] font-black uppercase tracking-wider text-text-muted block">
                  Schedule Sales / Candidate Follow-Up
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="datetime-local"
                    required
                    value={followupDate}
                    onChange={e => setFollowupDate(e.target.value)}
                    className="px-3 py-2 bg-bg-secondary border border-border-primary rounded-xl text-xs text-text-primary outline-none"
                  />
                  <input
                    type="text"
                    required
                    value={followupNote}
                    onChange={e => setFollowupNote(e.target.value)}
                    placeholder="Follow-up agenda or reminder note..."
                    className="sm:col-span-2 px-3 py-2 bg-bg-secondary border border-border-primary rounded-xl text-xs text-text-primary outline-none"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isAddingFollowUp}
                    className="px-4 py-2 bg-amber-500 text-white rounded-xl text-xs font-bold hover:bg-amber-600 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Follow-Up
                  </button>
                </div>
              </form>

              {followUps.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-text-muted block">
                    Scheduled Follow-Ups ({followUps.length})
                  </span>
                  <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                    {followUps.map(f => (
                      <div
                        key={f.id}
                        className={cn(
                          'p-3 rounded-xl border flex items-center justify-between gap-3',
                          f.done
                            ? 'bg-bg-tertiary/30 border-border-primary opacity-60'
                            : 'bg-bg-tertiary border-amber-500/30'
                        )}
                      >
                        <div className="min-w-0">
                          <p
                            className={cn(
                              'text-xs font-bold text-text-primary',
                              f.done && 'line-through opacity-60'
                            )}
                          >
                            {f.note}
                          </p>
                          <p className="text-[10px] text-text-muted mt-0.5">
                            Due: {new Date(f.followup_date).toLocaleDateString()} • By{' '}
                            {resolveUserName(f.created_by)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            await updateFollowUp({ ...f, done: !f.done });
                            showToast(
                              f.done ? 'Marked pending' : 'Follow-up completed!',
                              'success'
                            );
                          }}
                          className={cn(
                            'px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-colors cursor-pointer shrink-0',
                            f.done
                              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                              : 'bg-bg-secondary text-text-secondary border-border-primary hover:text-text-primary'
                          )}
                        >
                          {f.done ? 'Completed' : 'Mark Done'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Candidate Notes */}
              <div className="space-y-2 pt-2 border-t border-border-primary">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase tracking-wider text-text-muted">
                    Candidate Notes & Remarks
                  </label>
                  <button
                    type="button"
                    onClick={handleSaveNotes}
                    disabled={isSavingNotes}
                    className="px-3 py-1 rounded-lg bg-accent-blue text-white text-[11px] font-bold hover:bg-accent-blue/90 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isSavingNotes ? 'Saving...' : 'Save Notes'}
                  </button>
                </div>
                <textarea
                  rows={4}
                  value={notesValue}
                  onChange={e => setNotesValue(e.target.value)}
                  placeholder="Add candidate preferences, background notes, or interview instructions..."
                  className="w-full p-3.5 bg-bg-tertiary border border-border-primary rounded-2xl text-xs text-text-primary focus:border-accent-blue outline-none resize-none"
                />
              </div>
            </div>
          </div>

          {/* Right Column: Resume, Interview Support Link, Activity Timeline */}
          <div className="space-y-6">
            {/* Resume / CV Card */}
            <div className="bg-bg-secondary border border-border-primary rounded-3xl p-6 shadow-sm space-y-4">
              <h2 className="text-base font-black text-text-primary flex items-center gap-2">
                <FileText className="w-4 h-4 text-accent-blue" />
                Candidate Resume / CV
              </h2>

              {candidate.resume_url ? (
                <div className="p-4 bg-bg-tertiary rounded-2xl border border-border-primary space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-accent-blue/10 text-accent-blue flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-text-primary truncate">
                        {candidate.resume_filename || 'Candidate_Resume.pdf'}
                      </p>
                      <p className="text-[10px] text-text-muted">Uploaded Document</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleViewFile(
                        candidate.resume_url!,
                        candidate.resume_filename || 'Resume'
                      )
                    }
                    className="w-full py-2.5 bg-accent-blue text-white rounded-xl text-xs font-bold hover:bg-accent-blue/90 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    View / Download Resume
                  </button>
                </div>
              ) : (
                <div className="p-6 bg-bg-tertiary/50 border border-dashed border-border-primary rounded-2xl text-center space-y-2">
                  <FileText className="w-8 h-8 text-text-muted mx-auto" />
                  <p className="text-xs font-bold text-text-secondary">No resume uploaded yet</p>
                </div>
              )}

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingResume}
                className="w-full py-2.5 px-4 bg-bg-tertiary border border-border-primary hover:border-accent-blue rounded-xl text-xs font-bold text-text-secondary hover:text-text-primary transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-accent-blue" />
                {isUploadingResume
                  ? 'Uploading...'
                  : candidate.resume_url
                  ? 'Replace Resume'
                  : 'Upload Resume'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx"
                className="hidden"
                onChange={e => {
                  if (e.target.files?.[0]) handleResumeUpload(e.target.files[0]);
                }}
              />
            </div>

            {/* Interview Support Card */}
            <div className="bg-bg-secondary border border-border-primary rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-black text-text-primary flex items-center gap-2">
                  <Video className="w-4 h-4 text-purple-500" />
                  Interview Support
                </h2>
                <span className="px-2 py-0.5 rounded-lg bg-purple-500/10 text-purple-500 text-[10px] font-black">
                  {candidateInterviews.length}
                </span>
              </div>

              {candidateInterviews.length > 0 ? (
                <div className="space-y-2.5 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                  {candidateInterviews.map(req => (
                    <div
                      key={req.id}
                      className="p-3 bg-bg-tertiary rounded-xl border border-border-primary space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-text-primary truncate">
                          {req.company_name || 'Company'}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-500 text-[10px] font-bold uppercase">
                          {req.overall_status}
                        </span>
                      </div>
                      <p className="text-[11px] text-text-secondary truncate">
                        {req.job_title || 'Role'} • {req.interview_type || 'Interview'}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-text-secondary">
                  No Interview Support bookings linked to this candidate yet.
                </p>
              )}

              <button
                type="button"
                onClick={() => {
                  window.location.hash = '#aurrum-interviews';
                }}
                className="w-full py-2.5 px-4 bg-purple-500/10 hover:bg-purple-500/20 text-purple-500 border border-purple-500/25 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Video className="w-4 h-4" />
                Open Aurrum Interview Support
              </button>
            </div>

            {/* Activity Timeline */}
            <div className="bg-bg-secondary border border-border-primary rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-black text-text-primary flex items-center gap-2">
                  <History className="w-4 h-4 text-amber-500" />
                  Activity Timeline
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('activities')}
                  className="text-[11px] font-bold text-accent-blue hover:underline cursor-pointer"
                >
                  Full Log
                </button>
              </div>
              {activityLogs.length > 0 ? (
                <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar pr-1">
                  {activityLogs.slice(0, 15).map(log => (
                    <div
                      key={log.id}
                      className="p-3 bg-bg-tertiary/60 rounded-xl border border-border-primary space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-amber-500">
                          {log.action.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[10px] text-text-muted">
                          {new Date(log.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-xs text-text-primary">{log.details}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-text-secondary">No activity logged yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Candidate Modal */}
      <AurrumCandidateModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        candidate={candidate}
        salesUsers={salesUsers}
      />
    </div>
  );
};
