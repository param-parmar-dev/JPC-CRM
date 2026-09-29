import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft,
  Edit2,
  Trash2,
  Phone,
  Mail,
  MapPin,
  Briefcase,
  Sparkles,
  Calendar,
  Clock,
  DollarSign,
  FileText,
  Upload,
  CheckCircle2,
  Send,
  User as UserIcon,
  MessageSquare,
  Video,
  History,
  X,
  Save,
  Plus,
  ExternalLink,
} from 'lucide-react';
import { doc, onSnapshot, query, collection, where } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  Candidate,
  FollowUp,
  ActivityLog,
  User,
  InterviewSupportRequest,
} from '../../types';
import {
  subscribeToCollection,
  updateAurrumCandidate,
  addAurrumFollowUp,
  updateFollowUp,
  logActivity,
  deleteCandidate,
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

export const AurrumCandidateDetail: React.FC = () => {
  const { user, isAuthReady } = useAuth();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const params = new URLSearchParams(window.location.hash.split('?')[1]);
  const id = params.get('id');

  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [interviews, setInterviews] = useState<InterviewSupportRequest[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isUploadingResume, setIsUploadingResume] = useState(false);

  // 15-Day Free Trial states
  const [isUpdatingTrial, setIsUpdatingTrial] = useState(false);
  const [isEditingTrialDates, setIsEditingTrialDates] = useState(false);
  const [trialDatesForm, setTrialDatesForm] = useState({ start_date: '', end_date: '' });

  // Deal & Payment quick edit
  const [isEditingDeal, setIsEditingDeal] = useState(false);
  const [dealForm, setDealForm] = useState({
    package_name: '',
    package_amount: 0,
    total_paid: 0,
  });

  // Follow-up & Notes states
  const [newFollowUpDate, setNewFollowUpDate] = useState('');
  const [newFollowUpNote, setNewFollowUpNote] = useState('');
  const [isAddingFollowUp, setIsAddingFollowUp] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  const canEditFreeTrial = canManageFreeTrial(user);
  const canDelete =
    user?.role === 'administrator' ||
    user?.role === 'jpc_sysadmin' ||
    user?.role === 'aurrum_admin';

  useEffect(() => {
    if (!isAuthReady || !id) return;

    const unsubCandidate = onSnapshot(doc(db, 'jpc_candidates', id), snap => {
      if (snap.exists()) {
        const data = { ...(snap.data() as Candidate), id: snap.id };
        setCandidate(data);
        setNotesValue(data.notes || '');
        setDealForm({
          package_name: data.package_name || 'Aurrum Interview Support',
          package_amount: Number(data.package_amount) || 0,
          total_paid: Number(data.total_paid) || 0,
        });
        setTrialDatesForm({
          start_date: data.free_trial_start_date || '',
          end_date: data.free_trial_end_date || '',
        });
      } else {
        setCandidate(null);
      }
      setIsLoading(false);
    });

    const unsubFollowUps = onSnapshot(
      query(collection(db, 'jpc_followups'), where('candidate_id', '==', id)),
      snap => {
        const list = snap.docs
          .map(d => ({ ...(d.data() as FollowUp), id: d.id }))
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setFollowUps(list);
      }
    );

    const unsubActivity = onSnapshot(
      query(collection(db, 'jpc_activity_logs'), where('candidate_id', '==', id)),
      snap => {
        const list = snap.docs
          .map(d => ({ ...(d.data() as ActivityLog), id: d.id }))
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setActivityLogs(list);
      }
    );

    const unsubInterviews = subscribeToCollection<InterviewSupportRequest>(
      'jpc_interview_requests',
      setInterviews
    );

    const unsubUsers = subscribeToCollection<User>('jpc_users', setAllUsers);

    return () => {
      unsubCandidate();
      unsubFollowUps();
      unsubActivity();
      unsubInterviews();
      unsubUsers();
    };
  }, [isAuthReady, id]);

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

  const resolveUserName = (uid?: string | number | null) => {
    if (!uid) return 'Unassigned';
    const found = allUsers.find(u => String(u.id) === String(uid));
    return found?.display_name || found?.username || 'Unassigned';
  };

  const handleStageChange = async (nextStage: NonNullable<Candidate['aurrum_stage']>) => {
    if (!candidate) return;
    try {
      const systemStageMap: Record<NonNullable<Candidate['aurrum_stage']>, Candidate['current_stage']> = {
        lead: 'lead_generation',
        sales: 'sales',
        converted: 'interviewing',
        interview_support: 'interviewing',
        not_interested: 'not_interested',
        not_eligible: 'not_eligible',
      };
      const updates: Partial<Candidate> = {
        aurrum_stage: nextStage,
        current_stage: systemStageMap[nextStage],
      };
      if (nextStage === 'converted' || nextStage === 'interview_support') {
        updates.aurrum_sales_status = 'Converted';
      } else if (nextStage === 'not_interested') {
        updates.aurrum_sales_status = 'Not Interested';
      } else if (nextStage === 'not_eligible') {
        updates.aurrum_sales_status = 'Not Eligible';
      }

      await updateAurrumCandidate(candidate.id, updates);
      await logActivity(
        candidate.id,
        'Aurrum Stage Updated',
        `Stage changed to ${nextStage} by ${user?.display_name || 'User'}`,
        user?.id ? String(user.id) : null
      );
      showToast(`Moved ${candidate.full_name} to ${nextStage.replace('_', ' ')}`, 'success');
    } catch (error) {
      console.error('Stage update error:', error);
      showToast('Failed to update stage.', 'error');
    }
  };

  const handleEnableFreeTrial = async () => {
    if (!id || !candidate || isUpdatingTrial) return;
    setIsUpdatingTrial(true);
    try {
      const today = new Date();
      const startStr = today.toISOString().split('T')[0];
      const endDate = new Date(today);
      endDate.setDate(today.getDate() + 15);
      const endStr = endDate.toISOString().split('T')[0];

      const updates: Partial<Candidate> = {
        is_free_trial: true,
        free_trial_start_date: startStr,
        free_trial_end_date: endStr,
        free_trial_managed_by: user?.id ? String(user.id) : null,
        free_trial_updated_at: new Date().toISOString(),
      };

      await updateAurrumCandidate(id, updates);
      await logActivity(
        candidate.id,
        'Enabled 15-day Free Trial',
        `15-day Free Trial enabled (${startStr} to ${endStr}) by ${user?.display_name || 'User'}`,
        user?.id ? String(user.id) : null
      );

      setTrialDatesForm({ start_date: startStr, end_date: endStr });
      showToast('15-Day Free Trial activated successfully!', 'success');
    } catch (err) {
      console.error('Failed to enable free trial:', err);
      showToast('Failed to enable free trial', 'error');
    } finally {
      setIsUpdatingTrial(false);
    }
  };

  const handleDisableFreeTrial = async () => {
    if (!id || !candidate || isUpdatingTrial) return;
    if (!window.confirm('Are you sure you want to end the 15-Day Free Trial for this candidate?')) return;
    setIsUpdatingTrial(true);
    try {
      const updates: Partial<Candidate> = {
        is_free_trial: false,
        free_trial_managed_by: user?.id ? String(user.id) : null,
        free_trial_updated_at: new Date().toISOString(),
      };

      await updateAurrumCandidate(id, updates);
      await logActivity(
        candidate.id,
        'Ended 15-day Free Trial',
        `Free Trial ended by ${user?.display_name || 'User'}`,
        user?.id ? String(user.id) : null
      );

      showToast('Free Trial ended successfully', 'success');
    } catch (err) {
      console.error('Failed to disable free trial:', err);
      showToast('Failed to end free trial', 'error');
    } finally {
      setIsUpdatingTrial(false);
    }
  };

  const handleSaveTrialDates = async () => {
    if (!id || !candidate || isUpdatingTrial) return;
    if (!trialDatesForm.start_date || !trialDatesForm.end_date) {
      showToast('Please specify both start date and end date', 'error');
      return;
    }
    setIsUpdatingTrial(true);
    try {
      const updates: Partial<Candidate> = {
        free_trial_start_date: trialDatesForm.start_date,
        free_trial_end_date: trialDatesForm.end_date,
        free_trial_managed_by: user?.id ? String(user.id) : null,
        free_trial_updated_at: new Date().toISOString(),
      };

      await updateAurrumCandidate(id, updates);
      await logActivity(
        candidate.id,
        'Updated Free Trial Dates',
        `Free Trial dates updated to ${trialDatesForm.start_date} - ${trialDatesForm.end_date} by ${user?.display_name || 'User'}`,
        user?.id ? String(user.id) : null
      );

      setIsEditingTrialDates(false);
      showToast('Free Trial dates updated successfully', 'success');
    } catch (err) {
      console.error('Failed to update trial dates:', err);
      showToast('Failed to update trial dates', 'error');
    } finally {
      setIsUpdatingTrial(false);
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
      });
      await updateAurrumCandidate(candidate.id, {
        resume_url: uploadedUrl,
        resume_base64: uploadedUrl,
        resume_filename: file.name,
      });
      await logActivity(
        candidate.id,
        'Resume Uploaded',
        `Uploaded resume (${file.name}) by ${user?.display_name || 'User'}`,
        user?.id ? String(user.id) : null
      );
      showToast('Resume uploaded successfully!', 'success');
    } catch (error) {
      console.error('Resume upload error:', error);
      showToast('Failed to upload resume.', 'error');
    } finally {
      setIsUploadingResume(false);
    }
  };

  const handleSaveDeal = async () => {
    if (!candidate) return;
    try {
      const pkgAmt = Number(dealForm.package_amount) || 0;
      const paidAmt = Number(dealForm.total_paid) || 0;
      await updateAurrumCandidate(candidate.id, {
        package_name: dealForm.package_name.trim() || 'Aurrum Interview Support',
        package_amount: pkgAmt,
        total_paid: paidAmt,
        balance_remaining: Math.max(0, pkgAmt - paidAmt),
      });
      await logActivity(
        candidate.id,
        'Updated Deal & Payment',
        `Updated deal ($${pkgAmt.toLocaleString()}) and collected ($${paidAmt.toLocaleString()}) by ${user?.display_name || 'User'}`,
        user?.id ? String(user.id) : null
      );
      setIsEditingDeal(false);
      showToast('Deal & payment summary updated!', 'success');
    } catch (error) {
      console.error('Save deal error:', error);
      showToast('Failed to update deal.', 'error');
    }
  };

  const handleAddFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidate || !newFollowUpDate) {
      showToast('Please select a follow-up date.', 'error');
      return;
    }
    setIsAddingFollowUp(true);
    try {
      await addAurrumFollowUp({
        candidate_id: candidate.id,
        stage: resolveAurrumStage(candidate),
        followup_date: newFollowUpDate,
        note: newFollowUpNote.trim() || 'Scheduled Aurrum Follow-Up',
        done: false,
        created_by: user?.id || null,
      });
      await logActivity(
        candidate.id,
        'Scheduled Follow-Up',
        `Follow-up scheduled for ${newFollowUpDate}: ${newFollowUpNote.trim() || 'Follow-up'}`,
        user?.id ? String(user.id) : null
      );
      setNewFollowUpDate('');
      setNewFollowUpNote('');
      showToast('Follow-up scheduled!', 'success');
    } catch (error) {
      console.error('Follow-up error:', error);
      showToast('Failed to schedule follow-up.', 'error');
    } finally {
      setIsAddingFollowUp(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!candidate) return;
    setIsSavingNotes(true);
    try {
      await updateAurrumCandidate(candidate.id, { notes: notesValue.trim() });
      await logActivity(
        candidate.id,
        'Updated Candidate Notes',
        `Candidate notes updated by ${user?.display_name || 'User'}`,
        user?.id ? String(user.id) : null
      );
      showToast('Notes saved!', 'success');
    } catch (error) {
      console.error('Save notes error:', error);
      showToast('Failed to save notes.', 'error');
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleDeleteCandidate = async () => {
    if (!candidate || !canDelete) return;
    if (!window.confirm(`Are you sure you want to permanently delete ${candidate.full_name}?`)) return;
    try {
      await deleteCandidate(candidate.id);
      showToast('Candidate deleted.', 'success');
      window.location.hash = '#aurrum-candidates';
    } catch (error) {
      console.error('Delete candidate error:', error);
      showToast('Failed to delete candidate.', 'error');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-20">
        <div className="w-10 h-10 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className="space-y-6">
        <AurrumFlowHeader
          activeStep="candidates"
          title="Aurrum Candidate Profile"
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

  return (
    <div className="space-y-6">
      <AurrumFlowHeader
        activeStep={currentStage === 'sales' ? 'sales' : 'candidates'}
        title={candidate.full_name}
        subtitle="Aurrum Candidate Detail, 15-Day Free Trial & Sales Progression"
      />

      {/* Top Navigation & Candidate Header Card */}
      <div className="bg-bg-secondary border border-border-primary rounded-3xl p-6 shadow-sm space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                window.location.hash = '#aurrum-candidates';
              }}
              className="px-3.5 py-2 rounded-xl bg-bg-tertiary border border-border-primary text-xs font-bold text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Aurrum Candidates
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.hash = '#aurrum-sales';
              }}
              className="px-3.5 py-2 rounded-xl bg-bg-tertiary border border-border-primary text-xs font-bold text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              Aurrum Sales
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsEditModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-accent-blue text-white text-xs font-bold hover:bg-accent-blue/90 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5" />
              Edit Candidate
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

        {/* Candidate Identity Row */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pt-2 border-t border-border-primary">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white font-black text-2xl flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/20">
              {(candidate.full_name || 'A').charAt(0).toUpperCase()}
            </div>
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-black text-text-primary tracking-tight">
                  {candidate.full_name}
                </h1>
                <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] font-black text-amber-500 uppercase tracking-wider">
                  Aurrum Careers
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
              <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
                {candidate.job_interest && (
                  <span className="flex items-center gap-1 font-bold text-text-primary">
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
                <span className="text-text-muted font-mono text-[11px]">ID: {candidate.id}</span>
              </div>
            </div>
          </div>

          {/* Current Stage & Quick Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider border"
              style={{
                backgroundColor: `${stageMeta.color}15`,
                color: stageMeta.color,
                borderColor: `${stageMeta.color}40`,
              }}
            >
              {stageMeta.label}
            </span>

            {currentStage === 'lead' && (
              <button
                type="button"
                onClick={() => handleStageChange('sales')}
                className="px-3.5 py-1.5 rounded-xl bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                Move to Sales
              </button>
            )}
            {(currentStage === 'lead' || currentStage === 'sales') && (
              <button
                type="button"
                onClick={() => handleStageChange('converted')}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Mark Converted
              </button>
            )}
            {currentStage !== 'interview_support' && (
              <button
                type="button"
                onClick={() => handleStageChange('interview_support')}
                className="px-3.5 py-1.5 rounded-xl bg-purple-500 text-white text-xs font-bold hover:bg-purple-600 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Video className="w-3.5 h-3.5" />
                Send to Interview Support
              </button>
            )}
          </div>
        </div>

        {/* Stage Selector Pills */}
        <div className="pt-4 border-t border-border-primary flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-text-muted mr-2">
            Pipeline Stage:
          </span>
          {AURRUM_STAGES.map(st => {
            const active = currentStage === st.value;
            return (
              <button
                key={st.value}
                type="button"
                onClick={() => handleStageChange(st.value)}
                className={cn(
                  'px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border',
                  active
                    ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                    : 'bg-bg-tertiary border-border-primary text-text-secondary hover:text-text-primary'
                )}
              >
                {st.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 15-Day Free Trial Management Section */}
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
                    <X className="w-3.5 h-3.5" />
                    End Free Trial
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleEnableFreeTrial}
                  disabled={isUpdatingTrial}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-xs shadow-md shadow-amber-500/20 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-bg-tertiary rounded-2xl border border-border-primary">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                    Trial Status
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    <span className="text-sm font-bold text-emerald-500">Active 15-Day Free Trial</span>
                  </div>
                </div>

                <div className="p-4 bg-bg-tertiary rounded-2xl border border-border-primary">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                    Trial Period
                  </span>
                  <p className="text-sm font-bold text-text-primary mt-1">
                    {candidate.free_trial_start_date
                      ? new Date(candidate.free_trial_start_date).toLocaleDateString()
                      : 'Today'}
                    {' → '}
                    {candidate.free_trial_end_date
                      ? new Date(candidate.free_trial_end_date).toLocaleDateString()
                      : '15 Days'}
                  </p>
                </div>

                <div className="p-4 bg-bg-tertiary rounded-2xl border border-border-primary">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                    Days Remaining
                  </span>
                  <p className="text-sm font-bold text-amber-500 mt-1 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-amber-500" />
                    {(() => {
                      if (!candidate.free_trial_end_date) return '15 Days Left';
                      const end = new Date(candidate.free_trial_end_date);
                      end.setHours(23, 59, 59, 999);
                      const diff = end.getTime() - Date.now();
                      const days = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
                      return days === 0 ? 'Expired Today' : `${days} Day${days === 1 ? '' : 's'} Left`;
                    })()}
                  </p>
                </div>
              </div>

              {isEditingTrialDates && canEditFreeTrial && (
                <div className="p-4 bg-bg-tertiary/60 border border-amber-500/30 rounded-2xl space-y-3">
                  <p className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-amber-500" />
                    Adjust 15-Day Free Trial Date Window
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-text-muted uppercase">Start Date</label>
                      <input
                        type="date"
                        value={trialDatesForm.start_date}
                        onChange={e => setTrialDatesForm({ ...trialDatesForm, start_date: e.target.value })}
                        className="w-full bg-bg-secondary border border-border-primary rounded-xl px-3.5 py-2 text-sm text-text-primary"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-text-muted uppercase">End Date</label>
                      <input
                        type="date"
                        value={trialDatesForm.end_date}
                        onChange={e => setTrialDatesForm({ ...trialDatesForm, end_date: e.target.value })}
                        className="w-full bg-bg-secondary border border-border-primary rounded-xl px-3.5 py-2 text-sm text-text-primary"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsEditingTrialDates(false)}
                      className="px-3.5 py-1.5 bg-bg-secondary border border-border-primary text-text-secondary rounded-xl text-xs font-bold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveTrialDates}
                      disabled={isUpdatingTrial}
                      className="px-4 py-1.5 bg-amber-500 text-white rounded-xl text-xs font-bold hover:bg-amber-600 disabled:opacity-50 cursor-pointer"
                    >
                      Save Trial Dates
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-bg-tertiary/40 rounded-2xl border border-dashed border-border-primary">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-bg-tertiary flex items-center justify-center text-text-muted">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-bold text-text-primary">Standard Aurrum Enrollment</p>
                  <p className="text-xs text-text-muted">
                    This candidate is not currently enrolled in a 15-day Free Trial.
                  </p>
                </div>
              </div>
              {canEditFreeTrial && (
                <button
                  type="button"
                  onClick={handleEnableFreeTrial}
                  disabled={isUpdatingTrial}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-1.5 shrink-0 disabled:opacity-50 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Activate 15-Day Free Trial
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Main Two-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Personal Details, Sales & Deal, Follow-Ups */}
        <div className="lg:col-span-2 space-y-6">
          {/* Contact & Professional Profile */}
          <div className="bg-bg-secondary border border-border-primary rounded-3xl p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-black text-text-primary flex items-center gap-2">
                <UserIcon className="w-4 h-4 text-accent-blue" />
                Candidate Profile & Contact Info
              </h2>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(true)}
                className="text-xs font-bold text-accent-blue hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5" />
                Edit Details
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-3.5 bg-bg-tertiary rounded-2xl border border-border-primary">
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                  Phone Number
                </span>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-sm font-bold text-text-primary">{candidate.phone || '—'}</span>
                  {candidate.phone && (
                    <a
                      href={`tel:${candidate.phone}`}
                      className="p-1.5 rounded-lg bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20 transition-colors"
                      title="Call Candidate"
                    >
                      <Phone className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>

              <div className="p-3.5 bg-bg-tertiary rounded-2xl border border-border-primary">
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                  WhatsApp
                </span>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-sm font-bold text-text-primary">
                    {candidate.whatsapp || candidate.phone || '—'}
                  </span>
                  {(candidate.whatsapp || candidate.phone) && (
                    <a
                      href={`https://wa.me/${(candidate.whatsapp || candidate.phone).replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-500 text-[10px] font-bold hover:bg-emerald-500/20 transition-colors"
                    >
                      WhatsApp
                    </a>
                  )}
                </div>
              </div>

              <div className="p-3.5 bg-bg-tertiary rounded-2xl border border-border-primary">
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                  Email Address
                </span>
                <div className="flex items-center justify-between mt-1 gap-2">
                  <span className="text-sm font-bold text-text-primary truncate">
                    {candidate.email || '—'}
                  </span>
                  {candidate.email && (
                    <a
                      href={`mailto:${candidate.email}`}
                      className="p-1.5 rounded-lg bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20 transition-colors shrink-0"
                      title="Send Email"
                    >
                      <Mail className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>

              <div className="p-3.5 bg-bg-tertiary rounded-2xl border border-border-primary">
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                  Location
                </span>
                <p className="text-sm font-bold text-text-primary mt-1">{candidate.location || '—'}</p>
              </div>

              <div className="p-3.5 bg-bg-tertiary rounded-2xl border border-border-primary">
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                  Target Role / Domain
                </span>
                <p className="text-sm font-bold text-text-primary mt-1">
                  {candidate.job_interest || '—'}
                  {candidate.domain_interested ? ` (${candidate.domain_interested})` : ''}
                </p>
              </div>

              <div className="p-3.5 bg-bg-tertiary rounded-2xl border border-border-primary">
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                  Experience & Lead Source
                </span>
                <p className="text-sm font-bold text-text-primary mt-1">
                  {candidate.experience_years ? `${candidate.experience_years} yrs` : '—'} •{' '}
                  {candidate.lead_source || 'LinkedIn'}
                </p>
              </div>
            </div>

            {candidate.skills && (
              <div className="p-3.5 bg-bg-tertiary rounded-2xl border border-border-primary">
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block mb-2">
                  Key Skills
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {candidate.skills
                    .split(',')
                    .map(s => s.trim())
                    .filter(Boolean)
                    .map(skill => (
                      <span
                        key={skill}
                        className="px-2.5 py-1 rounded-lg bg-bg-secondary border border-border-primary text-xs font-bold text-text-primary"
                      >
                        {skill}
                      </span>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* Sales, Package & Payment Summary */}
          <div className="bg-bg-secondary border border-border-primary rounded-3xl p-6 shadow-sm space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-black text-text-primary flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-500" />
                Aurrum Sales & Package Summary
              </h2>
              <button
                type="button"
                onClick={() => setIsEditingDeal(!isEditingDeal)}
                className="px-3 py-1.5 rounded-xl bg-bg-tertiary border border-border-primary text-xs font-bold text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
              >
                {isEditingDeal ? 'Cancel' : 'Update Deal / Payment'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 bg-bg-tertiary rounded-2xl border border-border-primary">
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                  Package Value
                </span>
                <p className="text-xl font-black text-text-primary mt-1">
                  ${pkgAmount.toLocaleString()}
                </p>
                <span className="text-[11px] text-text-secondary">
                  {candidate.package_name || 'Aurrum Interview Support'}
                </span>
              </div>

              <div className="p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/20">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 block">
                  Collected Amount
                </span>
                <p className="text-xl font-black text-emerald-500 mt-1">
                  ${totalPaid.toLocaleString()}
                </p>
                <span className="text-[11px] text-text-secondary">Paid to date</span>
              </div>

              <div className="p-4 bg-amber-500/5 rounded-2xl border border-amber-500/20">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500 block">
                  Pending Balance
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
                  const nextStatus = e.target.value as NonNullable<Candidate['aurrum_sales_status']>;
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
                      Deal Amount ($)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={dealForm.package_amount}
                      onChange={e => setDealForm({ ...dealForm, package_amount: Number(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-bg-secondary border border-border-primary rounded-xl text-xs font-bold text-text-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">
                      Collected Paid ($)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={dealForm.total_paid}
                      onChange={e => setDealForm({ ...dealForm, total_paid: Number(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-bg-secondary border border-border-primary rounded-xl text-xs font-bold text-text-primary"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingDeal(false)}
                    className="px-3.5 py-1.5 rounded-xl bg-bg-secondary border border-border-primary text-xs font-bold text-text-secondary cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveDeal}
                    className="px-4 py-1.5 rounded-xl bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 cursor-pointer flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save Deal
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Follow-Ups & Notes Card */}
          <div className="bg-bg-secondary border border-border-primary rounded-3xl p-6 shadow-sm space-y-6">
            <h2 className="text-base font-black text-text-primary flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-amber-500" />
              Sales Follow-Ups & Notes
            </h2>

            {/* Schedule Follow-up Form */}
            <form onSubmit={handleAddFollowUp} className="p-4 bg-bg-tertiary rounded-2xl border border-border-primary space-y-3">
              <span className="text-[10px] font-black uppercase tracking-wider text-text-muted block">
                Schedule New Follow-Up
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="date"
                  value={newFollowUpDate}
                  onChange={e => setNewFollowUpDate(e.target.value)}
                  className="px-3.5 py-2 bg-bg-secondary border border-border-primary rounded-xl text-xs font-bold text-text-primary outline-none"
                />
                <input
                  type="text"
                  value={newFollowUpNote}
                  onChange={e => setNewFollowUpNote(e.target.value)}
                  placeholder="Follow-up note or call reminder..."
                  className="sm:col-span-2 px-3.5 py-2 bg-bg-secondary border border-border-primary rounded-xl text-xs text-text-primary outline-none"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isAddingFollowUp}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Follow-Up
                </button>
              </div>
            </form>

            {/* Follow-up List */}
            {followUps.length > 0 && (
              <div className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-text-muted block">
                  Follow-Up History ({followUps.length})
                </span>
                <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                  {followUps.map(f => (
                    <div
                      key={f.id}
                      className="p-3 bg-bg-tertiary rounded-xl border border-border-primary flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className={cn('text-xs font-bold text-text-primary', f.done && 'line-through opacity-60')}>
                          {f.note}
                        </p>
                        <p className="text-[10px] text-text-muted mt-0.5">
                          Due: {new Date(f.followup_date).toLocaleDateString()} • By {resolveUserName(f.created_by)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          await updateFollowUp({ ...f, done: !f.done });
                          showToast(f.done ? 'Marked pending' : 'Follow-up completed!', 'success');
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
                placeholder="Add sales notes, candidate preferences, or interview instructions..."
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
                  onClick={() => handleViewFile(candidate.resume_url!, candidate.resume_filename || 'Resume')}
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

          {/* Activity Timeline Card */}
          <div className="bg-bg-secondary border border-border-primary rounded-3xl p-6 shadow-sm space-y-4">
            <h2 className="text-base font-black text-text-primary flex items-center gap-2">
              <History className="w-4 h-4 text-text-muted" />
              Activity Timeline
            </h2>

            {activityLogs.length === 0 ? (
              <p className="text-xs text-text-muted">No activity recorded yet.</p>
            ) : (
              <div className="space-y-3 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                {activityLogs.map(log => (
                  <div
                    key={log.id}
                    className="p-3 bg-bg-tertiary rounded-xl border border-border-primary space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-text-primary">{log.action}</span>
                      <span className="text-[10px] text-text-muted">
                        {new Date(log.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-[11px] text-text-secondary leading-relaxed">{log.details}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <AurrumCandidateModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        candidate={candidate}
        salesUsers={salesUsers}
      />
    </div>
  );
};
