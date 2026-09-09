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
  const [filterCandidateId, setFilterCandidateId] = useState<string | null>(null);
  const [inlineJobLink, setInlineJobLink] = useState('');
  const [isInlineSubmitting, setIsInlineSubmitting] = useState(false);
  
  const debouncedSearch = useDebounce(searchTerm, 300);
  
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isExportLoading, setIsExportLoading] = useState(false);
  const [exportFilters, setExportFilters] = useState({
    candidateId: '',
    startDate: '',
    endDate: ''
  });

  const customSelectStyles = sharedSelectStyles;

  const handleExportXLSX = async () => {
    if (!exportFilters.candidateId) {
      showToast('Please select a candidate for export', 'error');
      return;
    }

    const candidate = candidates.find(c => c.id === exportFilters.candidateId);
    if (!candidate) return;

    setIsExportLoading(true);
    try {
      // For export, we need to ensure we have ALL applications for this candidate
      // especially if they aren't the currently selected one or weren't applied today
      let exportApps: Application[] = [];
      
      const q = query(
        collection(db, 'jpc_applications'),
        where('candidate_id', '==', exportFilters.candidateId)
      );
      const snap = await getDocs(q);
      exportApps = snap.docs.map(d => ({ ...d.data(), id: d.id } as Application));

      // Filter applications
      let exportData = exportApps;
      
      if (exportFilters.startDate) {
        exportData = exportData.filter(app => app.applied_at >= exportFilters.startDate);
      }
      if (exportFilters.endDate) {
        exportData = exportData.filter(app => app.applied_at <= exportFilters.endDate);
      }

      if (exportData.length === 0) {
        showToast('No data found for the selected filters', 'info');
        return;
      }

      // Map to XLSX rows
      const rows = exportData.map(app => {
        const recruiter = team.find(u => u.id === app.recruiter_id);
        
        return {
          'Candidate Name': candidate.full_name,
          'Recruiter Name': recruiter?.display_name || 'System',
          'Job Link': app.job_link,
          'Application Date': app.applied_at,
          'Application Status': app.status || 'Applied'
        };
      });

      // Generate workbook
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Applications');

      // Download
      XLSX.writeFile(wb, `${candidate.full_name}_Applications_${new Date().toISOString().split('T')[0]}.xlsx`);
      showToast('XLSX report generated successfully', 'success');
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

    console.log('[AppTracker] INITIAL LOAD - candidates only');

    // 1. Fetch only active/interviewing candidates assigned to the user (or all if manager/admin)
    let cQuery = query(
      collection(db, 'jpc_candidates'),
      where('current_stage', 'in', ['marketing_active', 'interviewing'])
    );

    if (user.role === 'jpc_recruiter') {
      cQuery = query(cQuery, where('assigned_recruiter', '==', String(user.id)));
    } else if (user.role === 'jpc_marketing') {
      cQuery = query(cQuery, where('assigned_marketing_leader', '==', String(user.id)));
    }

    const unsubCandidates = onSnapshot(cQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Candidate));
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

  // 2. Fetch applications ONLY for the selected candidate specifically
  useEffect(() => {
    if (!filterCandidateId) {
      setApplications([]);
      return;
    }

    console.log('[AppTracker] SELECTED CANDIDATE:', filterCandidateId);
    console.log('[AppTracker] Loading application data for:', filterCandidateId);
    console.log('[AppTracker] FIRESTORE APPLICATION QUERY');

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
      console.log('[AppTracker] Cleaning up application listener for candidate:', filterCandidateId);
      unsub();
    };
  }, [filterCandidateId]);

  const filteredApps = useMemo(() => {
    if (!filterCandidateId) return [];

    return applications.filter(app => {
      const candidate = candidates.find(c => c.id === app.candidate_id);
      
      // In Application Tracker show only Marketing Active and Interviewing profiles
      // This is now enforced at the query level for candidates, but apps might refer to others if they were completed today
      if (candidate?.current_stage !== 'marketing_active' && candidate?.current_stage !== 'interviewing') return false;
      
      // Filter by assigned recruiter if user is a recruiter
      if (user?.role === 'jpc_recruiter') {
        if (String(candidate?.assigned_recruiter) !== String(user.id)) return false;
      }

      const recruiter = team.find(u => u.id === app.recruiter_id);
      const searchStr = `${candidate?.full_name} ${recruiter?.display_name} ${app.job_link}`.toLowerCase();
      return searchStr.includes(debouncedSearch.toLowerCase());
    });
  }, [applications, candidates, team, debouncedSearch, user, filterCandidateId]);

  const stats = useMemo(() => {
    const today = getEasternDate();
    
    // Total today is only calculated if we have data for a selected candidate
    const todayApps = applications.filter(a => a.applied_at === today);
    
    // Calculate candidate-wise progress ONLY for the selected candidate if one exists
    const candidateProgress = candidates
      .filter(c => {
        // Only show progress for selected candidate if filter is active
        if (filterCandidateId && c.id !== filterCandidateId) return false;
        
        if (user?.role === 'jpc_recruiter') {
          return String(c.assigned_recruiter) === String(user.id);
        } else if (user?.role === 'jpc_marketing') {
          return String(c.assigned_marketing_leader) === String(user.id);
        }
        return true;
      })
      .filter(c => c.current_stage === 'marketing_active' || c.current_stage === 'interviewing')
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
      candidateProgress
    };
  }, [applications, team, candidates, user, filterCandidateId]);

  // My candidates filter
  const myCandidates = useMemo(() => {
    return candidates.filter(c => {
      if (user?.role === 'jpc_recruiter') {
        return String(c.assigned_recruiter) === String(user.id);
      } else if (user?.role === 'jpc_marketing') {
        return String(c.assigned_marketing_leader) === String(user.id);
      }
      return true;
    }).filter(c => c.current_stage === 'marketing_active' || c.current_stage === 'interviewing');
  }, [candidates, user]);

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
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-text-primary tracking-tight">Application Tracker</h1>
            <p className="text-text-secondary mt-1">Select a candidate to track their daily job applications.</p>
          </div>
          <button 
            onClick={() => setIsExportModalOpen(true)}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-bg-tertiary border border-border-primary rounded-2xl text-sm font-bold text-text-primary hover:bg-bg-tertiary/80 transition-all shadow-sm"
          >
            <Download className="w-4 h-4 text-accent-blue" />
            Export XLSX
          </button>
        </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
            <UserIcon className="w-4 h-4" />
            My Assigned Candidates
          </h2>
          <div className="w-64">
            <Select
              options={myCandidates.map(c => ({ value: c.id, label: c.full_name }))}
              onChange={(opt: any) => setFilterCandidateId(opt?.value || null)}
              styles={customSelectStyles}
              placeholder="Search Candidate..."
              isClearable
            />
          </div>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
          {myCandidates.map(candidate => (
            <motion.button
              key={candidate.id}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                setFilterCandidateId(candidate.id === filterCandidateId ? null : candidate.id);
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
                  "text-sm font-bold transition-colors",
                  filterCandidateId === candidate.id ? "text-white" : "text-text-primary"
                )}>
                  {candidate.full_name}
                </h3>
                <p className={cn(
                  "text-[10px] uppercase tracking-wider font-bold mt-0.5 transition-colors",
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
        <div className="bg-bg-secondary border border-border-primary rounded-3xl p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-accent-blue/10 rounded-2xl flex items-center justify-center text-accent-blue">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-text-muted uppercase tracking-widest">Total Today</p>
              <p className="text-2xl font-bold text-text-primary">{stats.totalToday}</p>
            </div>
          </div>
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

      {/* Search & Table */}
      <div className="bg-bg-secondary border border-border-primary rounded-3xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-border-primary flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
            <input 
              type="text" 
              placeholder="Search sheet..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-bg-tertiary border border-border-primary rounded-2xl pl-12 pr-4 py-3 text-text-primary focus:outline-none focus:border-accent-blue transition-colors"
            />
          </div>
          <div className="flex items-center gap-3">
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
                  onClick={() => setFilterCandidateId(null)}
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

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse table-fixed min-w-[800px]">
            <thead>
              <tr className="bg-bg-tertiary/80">
                <th className="w-12 border border-border-primary px-3 py-2 text-[10px] font-bold text-text-muted uppercase text-center">#</th>
                <th className="w-28 border border-border-primary px-3 py-2 text-[10px] font-bold text-text-muted uppercase tracking-widest">Date</th>
                <th className="w-32 border border-border-primary px-3 py-2 text-[10px] font-bold text-text-muted uppercase tracking-widest text-center">Status</th>
                <th className="w-48 border border-border-primary px-3 py-2 text-[10px] font-bold text-text-muted uppercase tracking-widest">Job Title</th>
                <th className="w-48 border border-border-primary px-3 py-2 text-[10px] font-bold text-text-muted uppercase tracking-widest">Candidate</th>
                <th className="w-40 border border-border-primary px-3 py-2 text-[10px] font-bold text-text-muted uppercase tracking-widest">Recruiter</th>
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
                const recruiter = team.find(u => u.id === app.recruiter_id);
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
                          <span>{candidate?.full_name || 'Unknown'}</span>
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
                      <span className="text-xs text-text-secondary">{recruiter?.display_name || 'System'}</span>
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
                  <td colSpan={7} className="px-6 py-12 text-center border border-border-primary">
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
                      <p className="text-sm text-text-muted">Generate XLSX report with filters</p>
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
                      options={candidates
                        .filter(c => c.current_stage === 'marketing_active' || c.current_stage === 'interviewing')
                        .filter(c => {
                          if (user?.role === 'jpc_recruiter') {
                            return String(c.assigned_recruiter) === String(user.id);
                          }
                          return !c.deleted_at;
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
