import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Plus,
  Phone,
  Mail,
  DollarSign,
  Calendar,
  ArrowRight,
  CheckCircle2,
  Clock,
  Video,
  Edit2,
  User as UserIcon,
  Briefcase,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  subscribeToAurrumCandidates,
  subscribeToAurrumFollowUps,
  subscribeToCollection,
  updateAurrumCandidate,
  addAurrumFollowUp,
  updateFollowUp,
} from '../../services/storage';
import { Candidate, FollowUp, User } from '../../types';
import { useDebounce } from '../../lib/hooks';
import { FreeTrialBadge } from '../../components/FreeTrialBadge';
import { AurrumFlowHeader } from './AurrumFlowHeader';
import {
  AurrumCandidateModal,
  AURRUM_SALES_STATUSES,
  resolveAurrumStage,
} from './AurrumCandidateModal';
import { cn } from '../../lib/utils';

const SALES_COLUMNS: {
  id: NonNullable<Candidate['aurrum_sales_status']>;
  label: string;
  color: string;
}[] = [
  { id: 'New Lead', label: 'New Leads', color: '#3B82F6' },
  { id: 'Contacted', label: 'Contacted', color: '#06B6D4' },
  { id: 'Follow-Up', label: 'Follow-Up', color: '#F59E0B' },
  { id: 'Interested', label: 'Interested', color: '#8B5CF6' },
  { id: 'Converted', label: 'Converted (To Support)', color: '#10B981' },
  { id: 'Not Interested', label: 'Not Interested', color: '#6B7280' },
  { id: 'Not Eligible', label: 'Not Eligible', color: '#F43F5E' },
];

export const AurrumSales: React.FC = () => {
  const { user, isAuthReady } = useAuth();
  const { showToast } = useToast();

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [selectedRepFilter, setSelectedRepFilter] = useState<string>('all');
  const [onlyFreeTrial, setOnlyFreeTrial] = useState<boolean>(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);
  const [quickFollowUpCand, setQuickFollowUpCand] = useState<Candidate | null>(null);
  const [quickFollowUpDate, setQuickFollowUpDate] = useState('');
  const [quickFollowUpNote, setQuickFollowUpNote] = useState('');

  useEffect(() => {
    if (!isAuthReady) return;

    const unsubCandidates = subscribeToAurrumCandidates(data => {
      setCandidates(data);
      setIsLoading(false);
    });
    const unsubFollowUps = subscribeToAurrumFollowUps(setFollowUps);
    const unsubUsers = subscribeToCollection<User>('jpc_users', setAllUsers);

    return () => {
      unsubCandidates();
      unsubFollowUps();
      unsubUsers();
    };
  }, [isAuthReady]);

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

  const filteredCandidates = useMemo(() => {
    const q = debouncedSearch.toLowerCase().trim();
    return candidates.filter(c => {
      if (c.crm_brand !== 'aurrum') return false;
      if (onlyFreeTrial && !c.is_free_trial) return false;
      if (!q) return true;
      return (
        (c.full_name || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.job_interest || '').toLowerCase().includes(q)
      );
    });
  }, [candidates, debouncedSearch, onlyFreeTrial]);

  const resolveSalesStatus = (c: Candidate): NonNullable<Candidate['aurrum_sales_status']> => {
    if (c.aurrum_sales_status) return c.aurrum_sales_status;
    const stage = resolveAurrumStage(c);
    if (stage === 'converted' || stage === 'interview_support') return 'Converted';
    if (stage === 'not_interested') return 'Not Interested';
    if (stage === 'not_eligible') return 'Not Eligible';
    if (stage === 'sales') return 'Contacted';
    return 'New Lead';
  };

  const groupedByColumn = useMemo(() => {
    const map: Record<string, Candidate[]> = {};
    SALES_COLUMNS.forEach(col => {
      map[col.id] = [];
    });
    filteredCandidates.forEach(c => {
      const st = resolveSalesStatus(c);
      if (!map[st]) map[st] = [];
      map[st].push(c);
    });
    return map;
  }, [filteredCandidates]);

  const handleStatusChange = async (
    candidate: Candidate,
    nextStatus: NonNullable<Candidate['aurrum_sales_status']>
  ) => {
    let nextAurrumStage: NonNullable<Candidate['aurrum_stage']> = 'sales';
    let nextSystemStage: Candidate['current_stage'] = 'sales';

    if (nextStatus === 'New Lead') {
      nextAurrumStage = 'lead';
      nextSystemStage = 'lead_generation';
    } else if (nextStatus === 'Converted') {
      nextAurrumStage = 'interview_support';
      nextSystemStage = 'interviewing';
    } else if (nextStatus === 'Not Interested') {
      nextAurrumStage = 'not_interested';
      nextSystemStage = 'not_interested';
    } else if (nextStatus === 'Not Eligible') {
      nextAurrumStage = 'not_eligible';
      nextSystemStage = 'not_eligible';
    }

    try {
      await updateAurrumCandidate(candidate.id, {
        aurrum_sales_status: nextStatus,
        aurrum_stage: nextAurrumStage,
        current_stage: nextSystemStage,
      });
      showToast(`${candidate.full_name} updated to ${nextStatus}`, 'success');
    } catch (err) {
      showToast('Failed to update status', 'error');
    }
  };

  const handleConvertAndProceed = async (candidate: Candidate) => {
    try {
      await updateAurrumCandidate(candidate.id, {
        aurrum_sales_status: 'Converted',
        aurrum_stage: 'interview_support',
        current_stage: 'interviewing',
      });
      showToast(`${candidate.full_name} converted & sent to Interview Support!`, 'success');
      window.location.hash = '#aurrum-interviews';
    } catch (err) {
      showToast('Failed to convert candidate', 'error');
    }
  };

  const handleSaveQuickFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickFollowUpCand || !quickFollowUpDate) return;
    try {
      await addAurrumFollowUp({
        candidate_id: quickFollowUpCand.id,
        stage: 'sales',
        followup_date: quickFollowUpDate,
        note: quickFollowUpNote.trim() || 'Aurrum Sales Follow-Up',
        done: false,
        created_by: user?.id || null,
      });
      await updateAurrumCandidate(quickFollowUpCand.id, {
        aurrum_sales_status: 'Follow-Up',
        aurrum_stage: 'sales',
        current_stage: 'sales',
      });
      showToast('Aurrum Sales follow-up scheduled!', 'success');
      setQuickFollowUpCand(null);
      setQuickFollowUpDate('');
      setQuickFollowUpNote('');
    } catch (err) {
      showToast('Failed to schedule follow-up', 'error');
    }
  };

  const salesSummary = useMemo(() => {
    const total = filteredCandidates.length;
    const active = filteredCandidates.filter(c =>
      ['New Lead', 'Contacted', 'Follow-Up', 'Interested'].includes(resolveSalesStatus(c))
    ).length;
    const converted = filteredCandidates.filter(
      c => resolveSalesStatus(c) === 'Converted'
    ).length;
    const closedValue = filteredCandidates
      .filter(c => resolveSalesStatus(c) === 'Converted')
      .reduce((sum, c) => sum + (Number(c.package_amount) || 0), 0);

    return { total, active, converted, closedValue };
  }, [filteredCandidates]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center p-20">
        <div className="w-12 h-12 border-4 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16">
      <AurrumFlowHeader
        activeStep="sales"
        title="Aurrum Careers Sales Pipeline"
        subtitle="Dedicated sales board for Aurrum Careers leads, follow-ups, and conversions to Interview Support."
        actions={
          <>
            <button
              onClick={() => {
                setEditingCandidate(null);
                setIsModalOpen(true);
              }}
              className="flex items-center gap-2 px-5 py-2.5 bg-accent-blue text-white font-bold rounded-xl hover:bg-accent-blue/90 transition-all shadow-lg shadow-accent-blue/20 text-xs sm:text-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Sales Lead</span>
            </button>
          </>
        }
      />

      {/* Sales KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-bg-secondary border border-border-primary rounded-2xl p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-text-muted">
            Total Aurrum Leads
          </p>
          <p className="text-2xl font-black text-text-primary mt-1">{salesSummary.total}</p>
        </div>
        <div className="bg-bg-secondary border border-border-primary rounded-2xl p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-amber-500">
            Active Sales Discussions
          </p>
          <p className="text-2xl font-black text-text-primary mt-1">{salesSummary.active}</p>
        </div>
        <div className="bg-bg-secondary border border-border-primary rounded-2xl p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-emerald-500">
            Converted to Support
          </p>
          <p className="text-2xl font-black text-text-primary mt-1">{salesSummary.converted}</p>
        </div>
        <div className="bg-bg-secondary border border-border-primary rounded-2xl p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-purple-400">
            Converted Value
          </p>
          <p className="text-2xl font-black text-text-primary mt-1">
            ${salesSummary.closedValue.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-bg-secondary border border-border-primary rounded-2xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search Aurrum sales leads by name, phone, email, or role..."
            className="w-full pl-10 pr-4 py-2.5 bg-bg-tertiary border border-border-primary rounded-xl text-xs sm:text-sm text-text-primary focus:border-accent-blue outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setOnlyFreeTrial(prev => !prev)}
            className={cn(
              'px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border cursor-pointer',
              onlyFreeTrial
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white border-amber-500 shadow-sm'
                : 'bg-bg-tertiary border-border-primary text-text-secondary hover:text-text-primary'
            )}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>15-Day Free Trial ({candidates.filter(c => c.is_free_trial).length})</span>
          </button>
        </div>
      </div>

      {/* Kanban Pipeline Columns */}
      <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
        {SALES_COLUMNS.map(col => {
          const colCandidates = groupedByColumn[col.id] || [];
          return (
            <div
              key={col.id}
              className="w-[310px] min-w-[310px] bg-bg-secondary border border-border-primary rounded-3xl flex flex-col max-h-[680px]"
            >
              {/* Column Header */}
              <div className="p-4 border-b border-border-primary flex items-center justify-between bg-bg-tertiary/40 rounded-t-3xl">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: col.color }}
                  />
                  <h3 className="text-xs font-black uppercase tracking-wider text-text-primary truncate">
                    {col.label}
                  </h3>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-bg-tertiary border border-border-primary text-[11px] font-black text-text-secondary">
                  {colCandidates.length}
                </span>
              </div>

              {/* Column Cards */}
              <div className="flex-1 p-3 space-y-3 overflow-y-auto custom-scrollbar">
                {colCandidates.map(cand => {
                  const candFollowUps = followUps.filter(
                    f => f.candidate_id === cand.id && !f.done
                  );

                  return (
                    <div
                      key={cand.id}
                      className="p-4 rounded-2xl bg-bg-tertiary/70 border border-border-primary hover:border-accent-blue/40 transition-all space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4
                            onClick={() => {
                              window.location.hash = `#aurrum-candidate?id=${cand.id}`;
                            }}
                            className="text-sm font-bold text-text-primary hover:text-accent-blue truncate cursor-pointer"
                          >
                            {cand.full_name}
                          </h4>
                          {cand.is_free_trial && (
                            <div className="mt-1">
                              <FreeTrialBadge
                                startDate={cand.free_trial_start_date}
                                endDate={cand.free_trial_end_date}
                                size="sm"
                                showDaysRemaining={true}
                              />
                            </div>
                          )}
                          <p className="text-[11px] text-text-muted flex items-center gap-1 truncate mt-0.5">
                            <Briefcase className="w-3 h-3 shrink-0" />
                            {cand.job_interest || 'Target Role N/A'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => {
                              window.location.hash = `#aurrum-candidate?id=${cand.id}`;
                            }}
                            className="p-1.5 rounded-lg bg-bg-secondary border border-border-primary text-text-muted hover:text-accent-blue cursor-pointer"
                            title="Open Candidate Detail Page"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => {
                              setEditingCandidate(cand);
                              setIsModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg bg-bg-secondary border border-border-primary text-text-muted hover:text-text-primary cursor-pointer"
                            title="Edit Lead"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1 text-[11px] text-text-secondary">
                        {cand.phone && (
                          <p className="flex items-center gap-1.5 truncate">
                            <Phone className="w-3 h-3 text-text-muted shrink-0" />
                            {cand.phone}
                          </p>
                        )}
                        {cand.email && (
                          <p className="flex items-center gap-1.5 truncate">
                            <Mail className="w-3 h-3 text-text-muted shrink-0" />
                            {cand.email}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[11px] bg-bg-secondary/80 px-2.5 py-1.5 rounded-xl border border-border-primary/60">
                        <span className="text-text-secondary truncate">
                          {cand.package_name || 'Aurrum Package'}
                        </span>
                        <span className="font-bold text-emerald-500 shrink-0">
                          ${(Number(cand.package_amount) || 0).toLocaleString()}
                        </span>
                      </div>

                      {cand.notes && (
                        <p className="text-[11px] text-text-muted line-clamp-2 italic">
                          "{cand.notes}"
                        </p>
                      )}

                      {candFollowUps.length > 0 && (
                        <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold text-amber-500 truncate">
                              Follow-up: {candFollowUps[0].followup_date}
                            </p>
                            <p className="text-[10px] text-text-secondary truncate">
                              {candFollowUps[0].note}
                            </p>
                          </div>
                          <button
                            onClick={() =>
                              updateFollowUp({ ...candFollowUps[0], done: true })
                            }
                            className="p-1 rounded-lg bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500 hover:text-white transition-colors shrink-0 cursor-pointer"
                            title="Complete Follow-Up"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* Status Dropdown & Actions */}
                      <div className="pt-2 border-t border-border-primary/60 space-y-2">
                        <div className="flex items-center gap-1.5">
                          <select
                            value={resolveSalesStatus(cand)}
                            onChange={e =>
                              handleStatusChange(
                                cand,
                                e.target.value as NonNullable<Candidate['aurrum_sales_status']>
                              )
                            }
                            className="flex-1 px-2.5 py-1.5 bg-bg-secondary border border-border-primary rounded-xl text-[11px] font-bold text-text-primary outline-none cursor-pointer"
                          >
                            {AURRUM_SALES_STATUSES.map(st => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => {
                              setQuickFollowUpCand(cand);
                              setQuickFollowUpDate(new Date().toISOString().split('T')[0]);
                              setQuickFollowUpNote('');
                            }}
                            className="p-1.5 rounded-xl bg-bg-secondary border border-border-primary text-amber-500 hover:bg-amber-500/10 transition-colors cursor-pointer"
                            title="Schedule Follow-Up"
                          >
                            <Clock className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <button
                          onClick={() => handleConvertAndProceed(cand)}
                          className="w-full py-2 px-3 rounded-xl bg-accent-blue/10 hover:bg-accent-blue text-accent-blue hover:text-white text-[11px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Video className="w-3.5 h-3.5" />
                          <span>Send to Interview Support</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {colCandidates.length === 0 && (
                  <div className="py-12 text-center text-text-muted text-xs">
                    No candidates in {col.label}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Follow-Up Modal */}
      {quickFollowUpCand && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveQuickFollowUp}
            className="bg-bg-secondary border border-border-primary rounded-3xl p-6 w-full max-w-md space-y-4 shadow-2xl"
          >
            <h3 className="text-lg font-black text-text-primary">
              Schedule Follow-Up: {quickFollowUpCand.full_name}
            </h3>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-text-muted mb-1">
                Follow-Up Date *
              </label>
              <input
                required
                type="date"
                value={quickFollowUpDate}
                onChange={e => setQuickFollowUpDate(e.target.value)}
                className="w-full px-4 py-2.5 bg-bg-tertiary border border-border-primary rounded-xl text-sm text-text-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-text-muted mb-1">
                Follow-Up Note
              </label>
              <textarea
                rows={3}
                value={quickFollowUpNote}
                onChange={e => setQuickFollowUpNote(e.target.value)}
                placeholder="Call notes or next steps..."
                className="w-full px-4 py-2.5 bg-bg-tertiary border border-border-primary rounded-xl text-sm text-text-primary outline-none resize-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setQuickFollowUpCand(null)}
                className="px-4 py-2 bg-bg-tertiary rounded-xl text-xs font-bold text-text-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-accent-blue text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Save Follow-Up
              </button>
            </div>
          </form>
        </div>
      )}

      <AurrumCandidateModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingCandidate(null);
        }}
        candidate={editingCandidate}
        salesUsers={salesUsers}
      />
    </div>
  );
};
