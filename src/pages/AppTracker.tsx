import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { subscribeToCollection, subscribeToQuery, generateId, logActivity, handleFirestoreError, OperationType } from '../services/storage';
import { Application, Candidate, User, Notification } from '../types';
import { 
  FileText, 
  Search, 
  ExternalLink, 
  Calendar, 
  User as UserIcon,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  Target,
  ArrowRight,
  Plus,
  X,
  Trash2,
  Download
} from 'lucide-react';
import * as XLSX from 'xlsx';
import Select from 'react-select';
import { sharedSelectStyles } from '../lib/selectStyles';
import { motion, AnimatePresence } from 'motion/react';
import { cn, getEasternDate, formatDisplayDate } from '../lib/utils';
import { FreeTrialBadge } from '../components/FreeTrialBadge';
import { useDebounce } from '../lib/hooks';
import { db } from '../firebase';
import { collection, doc, setDoc, query, where, getDocs, deleteDoc, onSnapshot } from 'firebase/firestore';
import { useToast } from '../contexts/ToastContext';
import { CandidateSheet } from '../components/CandidateSheet';
import { TrackJobSheet } from '../components/TrackJobSheet';
import { BulkLinkImportModal } from '../components/BulkLinkImportModal';

export const AppTracker: React.FC = () => {
  const { user, isAuthReady } = useAuth();
  const { showToast } = useToast();
  const [applications, setApplications] = useState<Application[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [team, setTeam] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [trackingCandidate, setTrackingCandidate] = useState<Candidate | null>(null);
  const [isTrackSheetOpen, setIsTrackSheetOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [filterCandidateId, setFilterCandidateId] = useState<string | null>(() => {
    const hashParts = window.location.hash.split('?');
    if (hashParts[1]) {
      const params = new URLSearchParams(hashParts[1]);
      return params.get('candidate_id') || params.get('id') || null;
    }
    return null;
  });
  const [selectedRecruiterFilter, setSelectedRecruiterFilter] = useState<string>('all');
  const [inlineJobLink, setInlineJobLink] = useState('');
  const [isInlineSubmitting, setIsInlineSubmitting] = useState(false);
  
  const debouncedSearch = useDebounce(searchTerm, 300);
  
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isExportLoading, setIsExportLoading] = useState(false);
  const [exportFilters, setExportFilters] = useState({
    candidateId: '',
    recruiterScope: 'all' as 'all' | 'current' | 'previous',
    startDate: '',
    endDate: ''
  });

  const customSelectStyles = sharedSelectStyles;

  const resolveRecruiterName = (recId: string | number | null | undefined, candidateObj?: Candidate | null) => {
    if (!recId) return 'Unassigned';
    const matchedUser = team.find(u => String(u.id) === String(recId));
    if (matchedUser) return matchedUser.display_name || matchedUser.username;
    const matchedPrev = candidateObj?.previous_recruiters?.find(p => String(p.recruiter_id) === String(recId));
    if (matchedPrev?.recruiter_name) return matchedPrev.recruiter_name;
    return 'Previous Recruiter';
  };

  const handleExportXLSX = async () => {
    if (!exportFilters.candidateId) {
      showToast('Please select a candidate for export', 'error');
      return;
    }

    const candidate = candidates.find(c => c.id === exportFilters.candidateId);
    if (!candidate) return;

    setIsExportLoading(true);
    try {
      // Fetch ALL applications for this candidate across both current and previous recruiters
      let exportApps: Application[] = [];
      
      const q = query(
        collection(db, 'jpc_applications'),
        where('candidate_id', '==', exportFilters.candidateId)
      );
      const snap = await getDocs(q);
      exportApps = snap.docs
        .map(d => ({ ...d.data(), id: d.id } as Application))
        .sort((a, b) => new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime());

      // Filter applications by date and optional recruiter scope
      let exportData = exportApps;
      
      if (exportFilters.startDate) {
        exportData = exportData.filter(app => app.applied_at >= exportFilters.startDate);
      }
      if (exportFilters.endDate) {
        exportData = exportData.filter(app => app.applied_at <= exportFilters.endDate);
      }
      if (exportFilters.recruiterScope === 'current') {
        exportData = exportData.filter(app => String(app.recruiter_id) === String(candidate.assigned_recruiter));
      } else if (exportFilters.recruiterScope === 'previous') {
        exportData = exportData.filter(app => String(app.recruiter_id) !== String(candidate.assigned_recruiter));
      }

      if (exportData.length === 0) {
        showToast('No data found for the selected filters', 'info');
        return;
      }

      const currentAssignedName = resolveRecruiterName(candidate.assigned_recruiter, candidate);

      // Map to XLSX rows with explicit Current vs Previous Recruiter attribution
      const rows = exportData.map(app => {
        const isCurrentRecruiter = candidate.assigned_recruiter && String(app.recruiter_id) === String(candidate.assigned_recruiter);
        const recName = resolveRecruiterName(app.recruiter_id, candidate);
        
        return {
          'Candidate Name': candidate.full_name,
          'Submitted By (Recruiter)': recName,
          'Recruiter Status': isCurrentRecruiter ? 'Current Recruiter' : 'Previous Recruiter',
          'Current Assigned Recruiter': currentAssignedName,
          'Job Title': app.job_title || 'N/A',
          'Company Name': app.company_name || 'N/A',
          'Job Link': app.job_link,
          'Application Date': app.applied_at,
          'Application Status': app.status || 'Applied'
        };
      });

      // Build Recruiter Summary breakdown sheet (Current + Previous Recruiters)
      const summaryByRecruiter = new Map<string, { name: string; status: string; count: number; firstDate: string; lastDate: string }>();
      exportData.forEach(app => {
        const key = String(app.recruiter_id || 'unknown');
        const isCurrent = candidate.assigned_recruiter && String(app.recruiter_id) === String(candidate.assigned_recruiter);
        const name = resolveRecruiterName(app.recruiter_id, candidate);
        const existing = summaryByRecruiter.get(key);
        if (!existing) {
          summaryByRecruiter.set(key, {
            name,
            status: isCurrent ? 'Current Recruiter' : 'Previous Recruiter',
            count: 1,
            firstDate: app.applied_at,
            lastDate: app.applied_at
          });
        } else {
          existing.count += 1;
          if (app.applied_at < existing.firstDate) existing.firstDate = app.applied_at;
          if (app.applied_at > existing.lastDate) existing.lastDate = app.applied_at;
        }
      });

      const summaryRows = [
        ...Array.from(summaryByRecruiter.values()).map(item => ({
          'Candidate Name': candidate.full_name,
          'Recruiter Name': item.name,
          'Role Status': item.status,
          'Applications Submitted': item.count,
          'First Application Date': item.firstDate,
          'Last Application Date': item.lastDate
        })),
        {
          'Candidate Name': candidate.full_name,
          'Recruiter Name': 'TOTAL COMBINED (ALL RECRUITERS)',
          'Role Status': 'Current + Previous',
          'Applications Submitted': exportData.length,
          'First Application Date': exportData[exportData.length - 1]?.applied_at || '',
          'Last Application Date': exportData[0]?.applied_at || ''
        }
      ];

      // Generate workbook with Applications and Recruiter Summary sheets
      const ws = XLSX.utils.json_to_sheet(rows);
      const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Applications');
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Recruiter Summary');

      // Download
      XLSX.writeFile(wb, `${candidate.full_name}_Complete_Applications_${new Date().toISOString().split('T')[0]}.xlsx`);
      showToast('Complete XLSX report (Current + Previous Recruiters) generated', 'success');
      setIsExportModalOpen(false);
    } catch (err) {
      console.error('Export error:', err);
      showToast('Failed to export data', 'error');
    } finally {
      setIsExportLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthReady || !user) return;

    // Subscribe to non-deleted candidates so history & exports work even across stage/recruiter transitions
    const cQuery = query(collection(db, 'jpc_candidates'));

    const unsubCandidates = onSnapshot(cQuery, (snapshot) => {
      const data = snapshot.docs
        .map(doc => ({ ...doc.data(), id: doc.id } as Candidate))
        .filter(c => !c.deleted_at);
      setCandidates(data);
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'jpc_candidates');
      setIsLoading(false);
    });

    const unsubTeam = onSnapshot(query(collection(db, 'jpc_users')), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as User));
      setTeam(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'jpc_users');
    });

    return () => {
      unsubCandidates();
      unsubTeam();
    };
  }, [isAuthReady, user?.id, user?.role]);

  // Reset recruiter sub-filter whenever candidate changes
  useEffect(() => {
    setSelectedRecruiterFilter('all');
  }, [filterCandidateId]);

  // 2. Fetch applications for the selected candidate across ALL recruiters (current & previous)
  useEffect(() => {
    if (!filterCandidateId) {
      setApplications([]);
      return;
    }

    const q = query(
      collection(db, 'jpc_applications'),
      where('candidate_id', '==', filterCandidateId)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Application));
      setApplications(data.sort((a, b) => new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime()));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `jpc_applications/candidate/${filterCandidateId}`);
    });

    return () => {
      unsub();
    };
  }, [filterCandidateId]);

  // Complete breakdown of Current Recruiter vs Previous Recruiter(s) for the selected candidate
  const recruiterBreakdown = useMemo(() => {
    if (!filterCandidateId) return [];
    const candidate = candidates.find(c => c.id === filterCandidateId);
    if (!candidate) return [];

    const today = getEasternDate();
    const map = new Map<string, {
      recruiterId: string;
      recruiterName: string;
      isCurrent: boolean;
      totalCount: number;
      todayCount: number;
      firstDate: string | null;
      lastDate: string | null;
    }>();

    // Ensure current assigned recruiter is always represented
    if (candidate.assigned_recruiter) {
      const currId = String(candidate.assigned_recruiter);
      map.set(currId, {
        recruiterId: currId,
        recruiterName: resolveRecruiterName(currId, candidate),
        isCurrent: true,
        totalCount: 0,
        todayCount: 0,
        firstDate: null,
        lastDate: null
      });
    }

    // Ensure any explicitly recorded previous recruiters are represented
    if (Array.isArray(candidate.previous_recruiters)) {
      candidate.previous_recruiters.forEach(prev => {
        const prevId = String(prev.recruiter_id);
        if (!map.has(prevId)) {
          map.set(prevId, {
            recruiterId: prevId,
            recruiterName: prev.recruiter_name || resolveRecruiterName(prevId, candidate),
            isCurrent: String(candidate.assigned_recruiter) === prevId,
            totalCount: 0,
            todayCount: 0,
            firstDate: prev.assigned_at ? prev.assigned_at.slice(0, 10) : null,
            lastDate: prev.unassigned_at ? prev.unassigned_at.slice(0, 10) : null
          });
        }
      });
    }

    // Aggregate all applications by recruiter_id
    applications.forEach(app => {
      const recId = String(app.recruiter_id || 'unknown');
      const existing = map.get(recId);
      if (!existing) {
        map.set(recId, {
          recruiterId: recId,
          recruiterName: resolveRecruiterName(recId, candidate),
          isCurrent: Boolean(candidate.assigned_recruiter && String(candidate.assigned_recruiter) === recId),
          totalCount: 1,
          todayCount: app.applied_at === today ? 1 : 0,
          firstDate: app.applied_at,
          lastDate: app.applied_at
        });
      } else {
        existing.totalCount += 1;
        if (app.applied_at === today) existing.todayCount += 1;
        if (!existing.firstDate || app.applied_at < existing.firstDate) existing.firstDate = app.applied_at;
        if (!existing.lastDate || app.applied_at > existing.lastDate) existing.lastDate = app.applied_at;
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      if (a.isCurrent && !b.isCurrent) return -1;
      if (!a.isCurrent && b.isCurrent) return 1;
      return b.totalCount - a.totalCount;
    });
  }, [applications, candidates, team, filterCandidateId]);

  const filteredApps = useMemo(() => {
    if (!filterCandidateId) return [];

    return applications.filter(app => {
      const candidate = candidates.find(c => c.id === app.candidate_id);
      if (!candidate) return false;

      if (selectedRecruiterFilter !== 'all') {
        if (String(app.recruiter_id) !== String(selectedRecruiterFilter)) return false;
      }

      const recName = resolveRecruiterName(app.recruiter_id, candidate);
      const searchStr = `${candidate.full_name} ${recName} ${app.job_title || ''} ${app.company_name || ''} ${app.job_link}`.toLowerCase();
      return searchStr.includes(debouncedSearch.toLowerCase());
    });
  }, [applications, candidates, team, debouncedSearch, filterCandidateId, selectedRecruiterFilter]);

  const stats = useMemo(() => {
    const today = getEasternDate();
    
    // Total today is calculated across all recruiters for the selected candidate
    const todayApps = applications.filter(a => a.applied_at === today);
    
    // Calculate candidate-wise progress ONLY for the selected candidate if one exists
    const candidateProgress = candidates
      .filter(c => {
        if (filterCandidateId) return c.id === filterCandidateId;
        
        if (user?.role === 'jpc_recruiter') {
          return String(c.assigned_recruiter) === String(user.id);
        } else if (user?.role === 'jpc_marketing') {
          const isInCluster = team.some(u => String(u.id) === String(c.assigned_recruiter) && String(u.leader_id) === String(user.id));
          return String(c.assigned_marketing_leader) === String(user.id) || isInCluster;
        }
        return c.current_stage === 'marketing_active' || c.current_stage === 'interviewing';
      })
      .map(c => {
        const count = todayApps.filter(a => a.candidate_id === c.id).length;
        const profiles = c.profiles_count || 1;
        const target = profiles * (c.custom_daily_target || 40);
        return {
          id: c.id,
          name: c.full_name,
          count,
          target,
          profiles,
          recruiter_id: c.assigned_recruiter
        };
      });

    return {
      totalToday: filterCandidateId ? todayApps.length : 0,
      totalLifetime: filterCandidateId ? applications.length : 0,
      candidateProgress
    };
  }, [applications, team, candidates, user, filterCandidateId]);

  // My candidates filter (includes active assigned candidates and any candidate currently inspected via URL)
  const myCandidates = useMemo(() => {
    return candidates.filter(c => {
      if (filterCandidateId && c.id === filterCandidateId) return true;
      if (c.current_stage !== 'marketing_active' && c.current_stage !== 'interviewing') return false;
      if (user?.role === 'jpc_recruiter') {
        const wasPreviousRecruiter = Array.isArray(c.previous_recruiters) && c.previous_recruiters.some(p => String(p.recruiter_id) === String(user.id));
        return String(c.assigned_recruiter) === String(user.id) || wasPreviousRecruiter;
      } else if (user?.role === 'jpc_marketing') {
        const isInCluster = team.some(u => String(u.id) === String(c.assigned_recruiter) && String(u.leader_id) === String(user.id));
        return String(c.assigned_marketing_leader) === String(user.id) || isInCluster;
      }
      return true;
    });
  }, [candidates, user, team, filterCandidateId]);

  const handleInlineSubmit = async (e: React.KeyboardEvent | React.MouseEvent) => {
    if (!filterCandidateId || !inlineJobLink || isInlineSubmitting) return;
    
    // If keyboard event, only trigger on Enter
    if ('key' in e && e.key !== 'Enter') return;

    const candidate = candidates.find(c => c.id === filterCandidateId);
    if (!candidate) return;

    // Check for duplicate link for THIS candidate specifically
    const isDuplicate = applications.filter(app => app.candidate_id === candidate.id)
      .some(app => app.job_link.trim().toLowerCase() === inlineJobLink.trim().toLowerCase());
    
    if (isDuplicate) {
      showToast('DUPLICATE LINK! This job has already been applied for this candidate.', 'error');
      return;
    }

    setIsInlineSubmitting(true);
    const id = generateId();
    const newApp: Application = {
      id,
      candidate_id: candidate.id,
      recruiter_id: String(user?.id),
      job_link: inlineJobLink,
      company_name: 'N/A',
      sheet_type: candidate.job_interest,
      applied_at: getEasternDate(),
      created_at: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, 'jpc_applications', id), newApp);
      await logActivity(candidate.id, 'Job Applied (Inline)', `Applied via Link: ${inlineJobLink}`, user?.id || null);
      showToast('Entry added to sheet', 'success');
      setInlineJobLink('');
    } catch (error) {
      console.error('Save error:', error);
      showToast('Failed to save entry', 'error');
    } finally {
      setIsInlineSubmitting(false);
    }
  };

  const handleDeleteApplication = async (app: Application) => {
    if (user?.role !== 'administrator' && user?.role !== 'jpc_manager' && user?.role !== 'jpc_recruiter' && user?.role !== 'jpc_marketing') {
      showToast('You do not have permission to delete applications', 'error');
      return;
    }

    if (!window.confirm('Are you sure you want to delete this application entry?')) return;

    try {
      await deleteDoc(doc(db, 'jpc_applications', app.id));
      await logActivity(app.candidate_id, 'Job Application Deleted', `Deleted application for link: ${app.job_link}`, user?.id || null);
      showToast('Application deleted successfully', 'success');
    } catch (error) {
      console.error('Delete error:', error);
      showToast('Failed to delete application', 'error');
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-text-primary tracking-tight">Application Tracker</h1>
          <p className="text-text-secondary text-sm sm:text-base mt-1">Select a candidate to track their daily job applications.</p>
        </div>
        <button 
          onClick={() => {
            if (filterCandidateId && !exportFilters.candidateId) {
              setExportFilters(prev => ({ ...prev, candidateId: filterCandidateId }));
            }
            setIsExportModalOpen(true);
          }}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-bg-tertiary border border-border-primary rounded-2xl text-sm font-bold text-text-primary hover:bg-bg-tertiary/80 transition-all shadow-sm w-full sm:w-auto"
        >
          <Download className="w-4 h-4 text-accent-blue" />
          Export XLSX
        </button>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-xs font-bold text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
            <UserIcon className="w-4 h-4" />
            My Assigned Candidates
          </h2>
          <div className="w-full sm:w-64">
            <Select
              value={filterCandidateId ? { value: filterCandidateId, label: candidates.find(c => c.id === filterCandidateId)?.full_name || 'Selected Candidate' } : null}
              options={myCandidates.map(c => ({ value: c.id, label: c.full_name }))}
              onChange={(opt: any) => {
                setFilterCandidateId(opt?.value || null);
                setSelectedRecruiterFilter('all');
              }}
              styles={customSelectStyles}
              placeholder="Search Candidate..."
              isClearable
            />
          </div>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-4 touch-scroll scrollbar-hide">
          {myCandidates.map(candidate => (
            <motion.button
              key={candidate.id}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                setFilterCandidateId(candidate.id === filterCandidateId ? null : candidate.id);
                setSelectedRecruiterFilter('all');
                setTrackingCandidate(candidate);
              }}
              className={cn(
                "flex-shrink-0 w-64 border rounded-2xl p-4 shadow-sm transition-all group text-left relative overflow-hidden",
                filterCandidateId === candidate.id 
                  ? "bg-accent-blue border-accent-blue shadow-lg shadow-accent-blue/20" 
                  : "bg-bg-secondary border-border-primary hover:border-accent-blue"
              )}
            >
              <div className="flex items-start justify-between mb-3 relative z-10">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center font-bold",
                  filterCandidateId === candidate.id ? "bg-white/20 text-white" : "bg-accent-blue/10 text-accent-blue"
                )}>
                  {candidate.full_name.charAt(0)}
                </div>
                <div className={cn(
                  "p-1.5 rounded-lg transition-all",
                  filterCandidateId === candidate.id ? "bg-white/20 text-white" : "bg-bg-tertiary text-accent-blue"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  setTrackingCandidate(candidate);
                  setIsTrackSheetOpen(true);
                }}>
                  <Plus className="w-4 h-4" />
                </div>
              </div>
              <div className="relative z-10">
                <h3 className={cn(
                  "text-sm font-bold transition-colors truncate",
                  filterCandidateId === candidate.id ? "text-white" : "text-text-primary"
                )}>
                  {candidate.full_name}
                </h3>
                <p className={cn(
                  "text-[10px] uppercase tracking-wider font-bold mt-0.5 transition-colors truncate",
                  filterCandidateId === candidate.id ? "text-white/70" : "text-text-muted"
                )}>
                  {candidate.job_interest || 'General'}
                </p>
                <div className={cn(
                  "mt-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest py-1 px-2 rounded-md w-fit transition-colors",
                  filterCandidateId === candidate.id ? "bg-white/20 text-white" : "bg-accent-blue/5 text-accent-blue"
                )}>
                  {filterCandidateId === candidate.id ? 'Viewing Sheet' : 'Track Job'} <ArrowRight className="w-3 h-3" />
                </div>
              </div>
            </motion.button>
          ))}
          {myCandidates.length === 0 && (
            <div className="w-full py-12 bg-bg-secondary/50 border border-dashed border-border-primary rounded-3xl flex flex-col items-center justify-center text-text-muted">
              <UserIcon className="w-12 h-12 opacity-10 mb-2" />
              <p className="text-sm italic">No active candidates assigned to you.</p>
            </div>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-bg-secondary border border-border-primary rounded-3xl p-6 shadow-sm flex flex-col justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-accent-blue/10 rounded-2xl flex items-center justify-center text-accent-blue">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-text-muted uppercase tracking-widest">Total Today</p>
              <p className="text-2xl font-bold text-text-primary">{stats.totalToday}</p>
            </div>
          </div>
          {filterCandidateId && (
            <div className="pt-3 border-t border-border-primary/60 flex items-center justify-between">
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Total Lifetime (All Recruiters)</span>
              <span className="text-sm font-black text-accent-blue">{stats.totalLifetime}</span>
            </div>
          )}
        </div>
        
        <div className="bg-bg-secondary border border-border-primary rounded-3xl p-6 shadow-sm md:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-accent-teal/10 rounded-2xl flex items-center justify-center text-accent-teal">
                <Target className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-text-muted uppercase tracking-widest">Candidate Targets</p>
                <p className="text-sm text-text-secondary">Track progress for each assigned candidate</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {stats.candidateProgress.map(p => (
              <div key={p.id} className="space-y-2 p-4 bg-bg-tertiary/30 rounded-2xl border border-border-primary/50">
                <div className="flex justify-between items-start">
                  <div className="space-y-0.5">
                    <p className="text-sm font-bold text-text-primary truncate max-w-[150px]">{p.name}</p>
                    <p className="text-[10px] text-text-muted uppercase tracking-wider">{p.profiles} Profile(s) @ {candidates.find(c => c.id === p.id)?.custom_daily_target || 40}/profile</p>
                  </div>
                  <div className="text-right">
                    <span className={cn("text-xs font-bold", p.count >= p.target ? "text-accent-green" : "text-accent-amber")}>
                      {p.count} / {p.target}
                    </span>
                  </div>
                </div>
                <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min((p.count / p.target) * 100, 100)}%` }}
                    className={cn(
                      "h-full rounded-full transition-all",
                      p.count >= p.target ? "bg-accent-green" : "bg-accent-blue"
                    )}
                  />
                </div>
              </div>
            ))}
            {stats.candidateProgress.length === 0 && (
              <div className="col-span-full py-8 text-center text-text-muted text-sm italic">
                {filterCandidateId ? 'No active candidate progress to display.' : 'Select a candidate above to view target progress.'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recruiter Breakdown Panel (Current + Previous Recruiters) */}
      {filterCandidateId && recruiterBreakdown.length > 0 && (
        <div className="bg-bg-secondary border border-border-primary rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold text-text-muted uppercase tracking-widest flex items-center gap-2">
                <UserIcon className="w-4 h-4 text-accent-blue" />
                Recruiter Application History (Current & Previous)
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Complete application attribution across all recruiters who have worked on {candidates.find(c => c.id === filterCandidateId)?.full_name}. Click a card to filter the sheet.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedRecruiterFilter('all')}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border",
                  selectedRecruiterFilter === 'all'
                    ? "bg-accent-blue text-white border-accent-blue shadow-sm"
                    : "bg-bg-tertiary text-text-secondary border-border-primary hover:border-accent-blue/40"
                )}
              >
                All Recruiters ({applications.length})
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recruiterBreakdown.map((rec) => {
              const isSelected = selectedRecruiterFilter === rec.recruiterId;
              return (
                <button
                  key={rec.recruiterId}
                  onClick={() => setSelectedRecruiterFilter(isSelected ? 'all' : rec.recruiterId)}
                  className={cn(
                    "p-4 rounded-2xl border text-left transition-all flex flex-col justify-between gap-3",
                    isSelected
                      ? "bg-accent-blue/10 border-accent-blue ring-1 ring-accent-blue/30"
                      : "bg-bg-tertiary/30 border-border-primary/60 hover:border-accent-blue/40"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-text-primary truncate">{rec.recruiterName}</p>
                      <p className="text-[10px] text-text-muted mt-0.5">
                        {rec.firstDate && rec.lastDate
                          ? `${formatDisplayDate(rec.firstDate)} – ${formatDisplayDate(rec.lastDate)}`
                          : 'Assigned (No applications logged yet)'}
                      </p>
                    </div>
                    <span className={cn(
                      "px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider shrink-0",
                      rec.isCurrent
                        ? "bg-accent-green/10 text-accent-green border border-accent-green/20"
                        : "bg-accent-amber/10 text-accent-amber border border-accent-amber/20"
                    )}>
                      {rec.isCurrent ? 'Current Recruiter' : 'Previous Recruiter'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border-primary/50">
                    <div>
                      <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider block">Total Submitted</span>
                      <span className="text-lg font-black text-text-primary">{rec.totalCount} <span className="text-[10px] font-normal text-text-muted">apps</span></span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider block">Today</span>
                      <span className="text-sm font-bold text-accent-blue">{rec.todayCount}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Search & Table */}
      <div className="bg-bg-secondary border border-border-primary rounded-3xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-border-primary flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
            <input 
              type="text" 
              placeholder="Search sheet by job title, link, or recruiter..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-bg-tertiary border border-border-primary rounded-2xl pl-12 pr-4 py-3 text-text-primary focus:outline-none focus:border-accent-blue transition-colors"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {filterCandidateId && (
              <>
                <button 
                  onClick={() => {
                    const candidate = candidates.find(c => c.id === filterCandidateId);
                    if (candidate) {
                      setTrackingCandidate(candidate);
                      setIsBulkModalOpen(true);
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-blue/10 text-accent-blue rounded-xl text-[10px] font-bold uppercase tracking-wider hover:bg-accent-blue/20 transition-all border border-accent-blue/20"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Bulk Import Links
                </button>
                <button 
                  onClick={() => {
                    setFilterCandidateId(null);
                    setSelectedRecruiterFilter('all');
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-tertiary text-text-muted rounded-xl text-[10px] font-bold uppercase tracking-wider hover:bg-bg-tertiary/80 transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                  Close Sheet
                </button>
              </>
            )}
            <div className="flex items-center gap-2 text-xs font-bold text-text-muted uppercase tracking-widest ml-1">
              <FileText className="w-4 h-4" />
              <span>{filterCandidateId ? candidates.find(c => c.id === filterCandidateId)?.full_name + "'s Sheet" : "Master Sheet View"}</span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto touch-scroll">
          <table className="w-full text-left border-collapse table-fixed min-w-[800px]">
            <thead>
              <tr className="bg-bg-tertiary/80">
                <th className="w-12 border border-border-primary px-3 py-2 text-[10px] font-bold text-text-muted uppercase text-center">#</th>
                <th className="w-28 border border-border-primary px-3 py-2 text-[10px] font-bold text-text-muted uppercase tracking-widest">Date</th>
                <th className="w-32 border border-border-primary px-3 py-2 text-[10px] font-bold text-text-muted uppercase tracking-widest text-center">Status</th>
                <th className="w-48 border border-border-primary px-3 py-2 text-[10px] font-bold text-text-muted uppercase tracking-widest">Job Title</th>
                <th className="w-48 border border-border-primary px-3 py-2 text-[10px] font-bold text-text-muted uppercase tracking-widest">Candidate</th>
                <th className="w-48 border border-border-primary px-3 py-2 text-[10px] font-bold text-text-muted uppercase tracking-widest">Recruiter</th>
                <th className="border border-border-primary px-3 py-2 text-[10px] font-bold text-text-muted uppercase tracking-widest">Job Link</th>
                <th className="w-20 border border-border-primary px-3 py-2 text-[10px] font-bold text-text-muted uppercase tracking-widest text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-primary">
              {/* Excel-like Inline Quick Entry Row */}
              {filterCandidateId && (
                <tr className="bg-accent-blue/5 border-2 border-accent-blue/20 shadow-inner">
                  <td className="border border-border-primary px-3 py-2 text-center">
                    <div className="w-5 h-5 bg-accent-blue text-white rounded-full flex items-center justify-center text-[10px] mx-auto animate-pulse">
                      *
                    </div>
                  </td>
                  <td className="border border-border-primary px-3 py-2 bg-bg-secondary">
                    <span className="text-xs text-text-secondary font-bold truncate">Today</span>
                  </td>
                  <td className="border border-border-primary px-3 py-2 bg-bg-secondary text-center">
                    <span className="text-[10px] font-bold text-accent-blue uppercase bg-accent-blue/10 px-2 py-0.5 rounded-md">Applied</span>
                  </td>
                  <td className="border border-border-primary px-3 py-2 bg-bg-secondary">
                    <span className="text-xs font-medium text-text-muted italic">---</span>
                  </td>
                  <td className="border border-border-primary px-3 py-2 bg-bg-secondary">
                    <span className="text-xs font-bold text-text-primary truncate">
                      {candidates.find(c => c.id === filterCandidateId)?.full_name}
                    </span>
                  </td>
                  <td className="border border-border-primary px-3 py-2 bg-bg-secondary">
                    <span className="text-xs text-text-secondary font-medium italic underline underline-offset-4 decoration-accent-blue/30">
                      {user?.display_name}
                    </span>
                  </td>
                  <td className="border border-border-primary px-3 py-1 relative">
                    <input 
                      type="text"
                      placeholder="Paste Job URL here and press Enter to save..."
                      value={inlineJobLink}
                      onChange={e => setInlineJobLink(e.target.value)}
                      onKeyDown={handleInlineSubmit}
                      disabled={isInlineSubmitting}
                      className="w-full h-full bg-transparent border-none text-xs text-accent-blue font-mono placeholder:text-text-muted/40 focus:ring-0 focus:outline-none py-2"
                      autoFocus
                    />
                    {isInlineSubmitting && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="w-3 h-3 border-2 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
                      </div>
                    )}
                  </td>
                  <td className="border border-border-primary px-3 py-2 bg-bg-secondary"></td>
                </tr>
              )}

              {filteredApps.map((app, index) => {
                const candidate = candidates.find(c => c.id === app.candidate_id);
                const recruiterName = resolveRecruiterName(app.recruiter_id, candidate);
                const isCurrentRecruiter = Boolean(
                  candidate?.assigned_recruiter && String(app.recruiter_id) === String(candidate.assigned_recruiter)
                );
                const hasMultipleRecruiters = recruiterBreakdown.length > 1;
                return (
                  <tr key={app.id} className="hover:bg-bg-tertiary/30 transition-colors group">
                    <td className="border border-border-primary px-3 py-2 text-center text-[10px] font-mono text-text-muted">
                      {filteredApps.length - index}
                    </td>
                    <td className="border border-border-primary px-3 py-2">
                      <span className="text-xs text-text-secondary">{formatDisplayDate(app.applied_at)}</span>
                    </td>
                    <td className="border border-border-primary px-3 py-2 text-center">
                      <span className={cn(
                        "text-[10px] font-bold uppercase px-2 py-0.5 rounded-md",
                        app.status === 'Offer' ? "bg-accent-green/10 text-accent-green" :
                        app.status === 'Rejected' ? "bg-accent-red/10 text-accent-red" :
                        app.status === 'Interviewing' ? "bg-accent-amber/10 text-accent-amber" :
                        "bg-accent-blue/10 text-accent-blue"
                      )}>
                        {app.status || 'Applied'}
                      </span>
                    </td>
                    <td className="border border-border-primary px-3 py-2">
                      <span className="text-xs font-medium text-text-primary truncate block max-w-[180px]" title={app.job_title}>
                        {app.job_title || '---'}
                      </span>
                    </td>
                    <td className="border border-border-primary px-3 py-2">
                      <button 
                        onClick={() => {
                          setFilterCandidateId(candidate?.id || null);
                          if (candidate) setTrackingCandidate(candidate);
                        }}
                        className="text-xs font-bold text-text-primary hover:text-accent-blue transition-colors text-left"
                      >
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="truncate">{candidate?.full_name || 'Unknown'}</span>
                          {candidate?.is_free_trial && (
                            <FreeTrialBadge 
                              startDate={candidate.free_trial_start_date}
                              endDate={candidate.free_trial_end_date}
                              size="sm"
                            />
                          )}
                        </div>
                      </button>
                    </td>
                    <td className="border border-border-primary px-3 py-2">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-xs text-text-secondary truncate" title={recruiterName}>
                          {recruiterName}
                        </span>
                        {(hasMultipleRecruiters || !isCurrentRecruiter) && candidate?.assigned_recruiter && (
                          <span className={cn(
                            "text-[8px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0",
                            isCurrentRecruiter
                              ? "bg-accent-green/10 text-accent-green"
                              : "bg-accent-amber/10 text-accent-amber"
                          )}>
                            {isCurrentRecruiter ? 'Current' : 'Previous'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="border border-border-primary px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-accent-blue truncate max-w-[200px] font-mono">
                          {app.job_link}
                        </span>
                        <a 
                          href={app.job_link} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="p-1 text-text-muted hover:text-accent-blue transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </td>
                    <td className="border border-border-primary px-3 py-2 text-center">
                      {(user?.role === 'administrator' || user?.role === 'jpc_manager' || user?.role === 'jpc_recruiter' || user?.role === 'jpc_marketing') && (
                        <button 
                          onClick={() => handleDeleteApplication(app)}
                          className="p-1.5 text-text-muted hover:text-accent-red hover:bg-accent-red/10 rounded-lg transition-all"
                          title="Delete Application"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredApps.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center border border-border-primary">
                    <div className="flex flex-col items-center gap-3 text-text-muted">
                      <FileText className="w-12 h-12 opacity-20" />
                      <p className="text-sm">No applications found in sheet.</p>
                      {filterCandidateId && (
                        <button 
                          onClick={() => setIsTrackSheetOpen(true)}
                          className="mt-2 flex items-center gap-2 px-4 py-2 bg-accent-blue text-white rounded-xl font-bold hover:bg-accent-blue/90 transition-all shadow-lg shadow-accent-blue/20"
                        >
                          <Plus className="w-4 h-4" />
                          Add First Entry
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <BulkLinkImportModal 
        isOpen={isBulkModalOpen}
        onClose={() => {
          setIsBulkModalOpen(false);
          setTrackingCandidate(null);
        }}
        candidate={trackingCandidate}
        existingApplications={applications}
        onSuccess={() => {}}
      />
      <TrackJobSheet 
        candidate={trackingCandidate}
        isOpen={isTrackSheetOpen}
        onClose={() => {
          setIsTrackSheetOpen(false);
          setTrackingCandidate(null);
        }}
        applications={applications}
      />
      <CandidateSheet 
        candidate={selectedCandidate}
        isOpen={isSheetOpen}
        onClose={() => {
          setIsSheetOpen(false);
          setSelectedCandidate(null);
        }}
      />

      <AnimatePresence>
        {isExportModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsExportModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-bg-secondary border border-border-primary rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-accent-blue/10 rounded-2xl flex items-center justify-center text-accent-blue">
                      <Download className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-text-primary">Export Applications</h3>
                      <p className="text-sm text-text-muted">Generate complete XLSX report (Current + Previous Recruiters)</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsExportModalOpen(false)}
                    className="p-2 hover:bg-bg-tertiary rounded-xl transition-all"
                  >
                    <X className="w-6 h-6 text-text-secondary" />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-text-primary px-1">Select Candidate</label>
                    <Select
                      value={exportFilters.candidateId ? {
                        value: exportFilters.candidateId,
                        label: candidates.find(c => c.id === exportFilters.candidateId)?.full_name || 'Selected Candidate'
                      } : null}
                      options={candidates
                        .filter(c => !c.deleted_at)
                        .filter(c => {
                          if (user?.role === 'jpc_recruiter') {
                            const wasPrevious = Array.isArray(c.previous_recruiters) && c.previous_recruiters.some(p => String(p.recruiter_id) === String(user.id));
                            return String(c.assigned_recruiter) === String(user.id) || wasPrevious;
                          }
                          return true;
                        })
                        .sort((a, b) => a.full_name.localeCompare(b.full_name))
                        .map(c => ({
                          value: c.id,
                          label: c.full_name
                        }))
                      }
                      onChange={(option: any) => setExportFilters({ ...exportFilters, candidateId: option?.value || '' })}
                      styles={customSelectStyles}
                      placeholder="Search and Select Candidate..."
                      isClearable
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-text-primary px-1">Recruiter History Scope</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'all', label: 'All Recruiters (Complete)' },
                        { id: 'current', label: 'Current Recruiter Only' },
                        { id: 'previous', label: 'Previous Recruiter(s)' }
                      ].map(scope => (
                        <button
                          key={scope.id}
                          type="button"
                          onClick={() => setExportFilters({ ...exportFilters, recruiterScope: scope.id as 'all' | 'current' | 'previous' })}
                          className={cn(
                            "py-2.5 px-3 rounded-xl text-xs font-bold border transition-all text-center",
                            exportFilters.recruiterScope === scope.id
                              ? "bg-accent-blue text-white border-accent-blue shadow-sm"
                              : "bg-bg-tertiary text-text-secondary border-border-primary hover:border-accent-blue/40"
                          )}
                        >
                          {scope.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-text-primary px-1">Start Date</label>
                      <input 
                        type="date"
                        value={exportFilters.startDate}
                        onChange={(e) => setExportFilters({ ...exportFilters, startDate: e.target.value })}
                        className="w-full px-4 py-3 bg-bg-tertiary border border-border-primary rounded-2xl focus:outline-none focus:ring-2 focus:ring-accent-blue/20 transition-all font-medium"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-text-primary px-1">End Date</label>
                      <input 
                        type="date"
                        value={exportFilters.endDate}
                        onChange={(e) => setExportFilters({ ...exportFilters, endDate: e.target.value })}
                        className="w-full px-4 py-3 bg-bg-tertiary border border-border-primary rounded-2xl focus:outline-none focus:ring-2 focus:ring-accent-blue/20 transition-all font-medium"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-10 flex gap-4">
                  <button 
                    onClick={() => setIsExportModalOpen(false)}
                    className="flex-1 py-4 px-6 bg-bg-tertiary text-text-primary font-bold rounded-2xl hover:bg-bg-tertiary/80 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleExportXLSX}
                    disabled={isExportLoading}
                    className="flex-1 py-4 px-6 bg-accent-blue text-white font-bold rounded-2xl hover:bg-accent-blue/90 transition-all shadow-lg shadow-accent-blue/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isExportLoading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Download className="w-5 h-5" />
                    )}
                    {isExportLoading ? 'Processing...' : 'Download XLSX'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
