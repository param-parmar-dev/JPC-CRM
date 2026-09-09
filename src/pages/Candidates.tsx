import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { subscribeToCollection, handleFirestoreError, OperationType } from '../services/storage';
import { STAGES } from '../constants';
import { Search, Filter, X, Package, Phone, Mail, MapPin, Calendar, Users, ChevronRight, MoreVertical, ShieldCheck, Plus, Send, Table, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { Candidate, Stage, User, Application, FollowUp } from '../types';
import { CandidateSheet } from '../components/CandidateSheet';
import { TrackJobSheet } from '../components/TrackJobSheet';
import { BulkImportModal } from '../components/BulkImportModal';
import { AddCandidateModal } from '../components/AddCandidateModal';
import { useDebounce } from '../lib/hooks';
import { canUserAccessCandidate } from '../lib/permissions';
import { List } from 'react-window';
import * as XLSX from 'xlsx';
import { db } from '../firebase';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { FreeTrialBadge } from '../components/FreeTrialBadge';

type CandidateRowExtraProps = {
  items: Candidate[];
  allUsers: User[];
  user: any;
  onSelect: (c: Candidate) => void;
  onTrack: (c: Candidate) => void;
};

// Memoized Row Component for Virtualized List
const CandidateRow = React.memo(({ 
  index, 
  style,
  items,
  allUsers,
  user,
  onSelect,
  onTrack
}: { 
  index: number, 
  style: React.CSSProperties
} & CandidateRowExtraProps) => {
  const candidate = items[index];

  if (!candidate) return null;

  return (
    <div 
      style={style}
      className="hover:bg-bg-tertiary/30 transition-colors group cursor-pointer border-b border-border-primary flex items-center"
      onClick={() => onSelect(candidate)}
    >
      <div className="flex-1 px-6 py-4 flex items-center gap-4 min-w-[250px]">
        <div className="w-10 h-10 rounded-full bg-bg-tertiary flex items-center justify-center text-text-secondary font-bold text-xs ring-2 ring-border-primary group-hover:ring-accent-blue transition-all">
          {(candidate.full_name || 'Candidate').split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase()}
        </div>
        <div className="truncate">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-text-primary group-hover:text-accent-blue transition-colors truncate">{candidate.full_name || 'Unnamed Candidate'}</p>
            {candidate.is_free_trial && (
              <FreeTrialBadge 
                startDate={candidate.free_trial_start_date}
                endDate={candidate.free_trial_end_date}
                size="sm"
              />
            )}
          </div>
          <p className="text-xs text-text-muted flex items-center gap-1 mt-0.5 truncate">
            <MapPin className="w-3 h-3 flex-shrink-0" /> {candidate.location || 'No location'}
          </p>
        </div>
      </div>
      <div className="w-32 px-6 py-4">
        <span className="text-xs font-mono font-medium text-text-secondary bg-bg-tertiary px-2 py-1 rounded border border-border-primary">
          {candidate.id}
        </span>
      </div>
      <div className="w-56 px-6 py-4 hidden lg:block">
        <div className="space-y-1">
          <p className="text-xs text-text-primary flex items-center gap-2 truncate">
            <Phone className="w-3.5 h-3.5 text-text-muted flex-shrink-0" /> {candidate.phone || '—'}
          </p>
          <p className="text-xs text-text-muted flex items-center gap-2 truncate">
            <Mail className="w-3.5 h-3.5 text-text-muted flex-shrink-0" /> {candidate.email || '—'}
          </p>
        </div>
      </div>
      <div className="w-32 px-6 py-4 hidden md:block text-center">
        {allUsers.some(u => u.candidate_id === candidate.id) ? (
          <div className="flex items-center justify-center gap-1.5 text-accent-green">
            <ShieldCheck className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase">Active</span>
          </div>
        ) : (
          <div className="text-[10px] font-bold text-text-muted uppercase">No Access</div>
        )}
      </div>
      <div className="w-48 px-6 py-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-bg-tertiary border border-border-primary rounded-full">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STAGES[candidate.current_stage]?.color || '#94a3b8' }} />
          <span className="text-[10px] font-bold text-text-primary uppercase tracking-wider">
            {STAGES[candidate.current_stage]?.label || candidate.current_stage}
          </span>
        </div>
      </div>
      <div className="w-40 px-6 py-4 hidden sm:block">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-text-muted" />
          <div className="truncate">
            <p className="text-xs font-bold text-text-primary truncate">{candidate.package_name || '—'}</p>
            <p className="text-[10px] text-text-muted">${(candidate.package_amount || 0).toLocaleString()}</p>
          </div>
        </div>
      </div>
      <div className="w-32 px-6 py-4 hidden xl:block">
        <p className="text-xs text-text-muted flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5" />
          {candidate.updated_at ? new Date(candidate.updated_at).toLocaleDateString() : '—'}
        </p>
      </div>
      <div className="w-32 px-6 py-4 text-right">
        <div className="flex items-center justify-end gap-2">
          {user?.role !== 'candidate' && user?.role !== 'jpc_candidate' && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onTrack(candidate);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-blue/5 text-accent-blue hover:bg-accent-blue text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all hover:text-white whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Track
            </button>
          )}
          <ChevronRight className="w-5 h-5 text-text-muted" />
        </div>
      </div>
    </div>
  );
});

CandidateRow.displayName = 'CandidateRow';

export const Candidates: React.FC = () => {
  const { user, isAuthReady } = useAuth();
  const { showToast } = useToast();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [stageFilter, setStageFilter] = useState('');
  
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [trackingCandidate, setTrackingCandidate] = useState<Candidate | null>(null);
  const [isTrackSheetOpen, setIsTrackSheetOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  useEffect(() => {
    if (!isAuthReady || !user) return;
    
    // 1. Fetch only relevant candidates based on role to make load small
    let cQuery = query(collection(db, 'jpc_candidates'));
    
    // For recruiters/marketing, strictly only fetch assigned candidates
    if (user.role === 'jpc_recruiter') {
      cQuery = query(cQuery, where('assigned_recruiter', '==', String(user.id)));
    } else if (user.role === 'jpc_marketing') {
      cQuery = query(cQuery, where('assigned_marketing_leader', '==', String(user.id)));
    } else if (user.role === 'jpc_sales') {
      cQuery = query(cQuery, where('assigned_sales', '==', String(user.id)));
    } else if (user.role === 'jpc_cs') {
      cQuery = query(cQuery, where('assigned_cs', '==', String(user.id)));
    } else if (user.role === 'jpc_lead_gen') {
      cQuery = query(cQuery, where('lead_generated_by', '==', String(user.id)));
    }

    const unsub = onSnapshot(cQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Candidate));
      setCandidates(data.filter(c => !c.deleted_at));
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'jpc_candidates');
    });

    const unsubUsers = subscribeToCollection<User>('jpc_users', (data) => {
      setAllUsers(data);
    }, 500);

    return () => {
      unsub();
      unsubUsers();
    };
  }, [isAuthReady, user?.id, user?.role]);

  // Get stage from URL if present
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    const stage = params.get('stage');
    if (stage) setStageFilter(stage);
  }, []);

  const filteredCandidates = useMemo(() => {
    return candidates
      .filter(c => {
        // Role-based visibility check using permissions engine
        if (!canUserAccessCandidate(c, user, allUsers)) return false;

        const searchLower = debouncedSearch.toLowerCase();
        const matchesSearch = 
          (c.full_name || '').toLowerCase().includes(searchLower) ||
          (c.phone || '').includes(debouncedSearch) ||
          (c.email || '').toLowerCase().includes(searchLower);
        
        const matchesStage = stageFilter ? c.current_stage === stageFilter : true;
        
        return matchesSearch && matchesStage;
      })
      .sort((a, b) => {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : (a.updated_at ? new Date(a.updated_at).getTime() : 0);
        const timeB = b.created_at ? new Date(b.created_at).getTime() : (b.updated_at ? new Date(b.updated_at).getTime() : 0);
        return timeB - timeA;
      });
  }, [candidates, debouncedSearch, stageFilter, user, allUsers]);

  const handleSelect = useCallback((candidate: Candidate) => {
    setSelectedCandidate(candidate);
    setIsSheetOpen(true);
  }, []);

  const handleTrack = useCallback((candidate: Candidate) => {
    setTrackingCandidate(candidate);
    setIsTrackSheetOpen(true);
  }, []);

  const itemData = useMemo<CandidateRowExtraProps>(() => ({
    items: filteredCandidates,
    allUsers,
    user,
    onSelect: handleSelect,
    onTrack: handleTrack
  }), [filteredCandidates, allUsers, user, handleSelect, handleTrack]);

  const handleExportLeadsAndSales = async () => {
    setIsExporting(true);
    try {
      if (candidates.length === 0) {
        showToast('No leads or sales data found to export', 'error');
        setIsExporting(false);
        return;
      }

      // Fetch Applications and Follow-ups ON DEMAND for export to keep load small
      const appsSnap = await getDocs(collection(db, 'jpc_applications'));
      const apps = appsSnap.docs.map(d => d.data() as Application);

      const followUpsSnap = await getDocs(collection(db, 'jpc_followups'));
      const followUps = followUpsSnap.docs.map(d => d.data() as FollowUp);

      const cleanExcelValue = (val: any): string | number => {
        if (val === undefined || val === null) return '—';
        if (typeof val === 'number') return val;
        const str = String(val);
        if (str.startsWith('data:') && str.length > 500) {
          return '[Base64 File Payload - Too large for Excel]';
        }
        if (str.length > 30000) {
          return str.slice(0, 30000) + '... (Truncated due to Excel limit)';
        }
        return str;
      };

      const dataRows = candidates.map(c => {
        const candidateFollowUps = followUps.filter(f => f.candidate_id === c.id);
        const hasActiveFollowUp = candidateFollowUps.some(f => !f.done);
        
        let leadStatus = 'Pending';
        if (c.current_stage === 'not_interested') leadStatus = 'Not Interested';
        else if (c.current_stage === 'not_eligible') leadStatus = 'Not Eligible';
        else if (c.current_stage === 'completed' || c.current_stage === 'offer' || c.current_stage === 'sales') leadStatus = 'Converted/Sales';
        else if (hasActiveFollowUp) leadStatus = 'Follow-up';
        else if (c.current_stage === 'lead_generation') leadStatus = c.flags?.agreement_signed ? 'Interested' : 'Pending';
        else leadStatus = 'Converted/Sales';

        const leadGenUser = allUsers.find(u => String(u.id) === String(c.lead_generated_by));
        const salesUser = allUsers.find(u => String(u.id) === String(c.assigned_sales));
        const csUser = allUsers.find(u => String(u.id) === String(c.assigned_cs));
        const recruiterUser = allUsers.find(u => String(u.id) === String(c.assigned_recruiter));
        const marketingUser = allUsers.find(u => String(u.id) === String(c.assigned_marketing_leader));
        
        const totalApps = apps.filter(a => a.candidate_id === c.id).length;

        return {
          'Lead ID': c.id,
          'Full Name': cleanExcelValue(c.full_name),
          'Email': cleanExcelValue(c.email),
          'Phone': cleanExcelValue(c.phone),
          'WhatsApp': cleanExcelValue(c.whatsapp),
          'Mapped Lead Status': leadStatus,
          'Current System Stage': STAGES[c.current_stage]?.label || c.current_stage,
          'Lead Source': cleanExcelValue(c.lead_source),
          'Lead Generated By': leadGenUser?.display_name || 'System / self',
          'Assigned Sales Rep': salesUser?.display_name || 'Unassigned',
          'Assigned Compliance': csUser?.display_name || 'Unassigned',
          'Assigned Recruiter': recruiterUser?.display_name || 'Unassigned',
          'Marketing Team Leader': marketingUser?.display_name || 'Unassigned',
          'Selected Plan / Package': cleanExcelValue(c.package_name),
          'Total Fee / Amount ($)': c.package_amount || 0,
          'Agreement Sent': c.flags?.agreement_sent ? 'Yes' : 'No',
          'Agreement Signed': c.flags?.agreement_signed ? 'Yes' : 'No',
          'QC Validation Passed': c.flags?.qc_checklist_done ? 'Yes' : 'No',
          'Resume Ready': c.flags?.resume_approved ? 'Yes' : 'No',
          'Marketing Mail Created': c.flags?.marketing_email_created ? 'Yes' : 'No',
          'Portal Login Set': c.temp_portal_password ? 'Yes' : 'No',
          'Job Application Count': totalApps,
          'Follow-ups Done/Scheduled': candidateFollowUps.length,
          'Degree': cleanExcelValue(c.degree),
          'University': cleanExcelValue(c.university),
          'Graduation Year': cleanExcelValue(c.graduation_year),
          'Experience (Years)': cleanExcelValue(c.experience_years),
          'Current Company': cleanExcelValue(c.current_company),
          'Current Designation': cleanExcelValue(c.current_designation),
          'Tech Skills': cleanExcelValue(c.skills),
          'Domain Suggested': cleanExcelValue(c.domain_suggested),
          'LinkedIn URL': cleanExcelValue(c.linkedin_url),
          'Portal Link': cleanExcelValue(c.portal_link),
          'Resume URL': cleanExcelValue(c.resume_url),
          'Remarks': cleanExcelValue(c.remarks),
          'Remarks / Notes': cleanExcelValue(c.notes),
          'Preferred Designation': cleanExcelValue(c.job_interest),
          'Location': cleanExcelValue(c.location),
          'Created Date': c.created_at ? new Date(c.created_at).toLocaleDateString() : '—',
          'Last Update Date': c.updated_at ? new Date(c.updated_at).toLocaleDateString() : '—',
        };
      });

      const wsData = XLSX.utils.json_to_sheet(dataRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsData, 'All Lead & Sales Data');
      XLSX.writeFile(wb, `Leads_Sales_Performance_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
      showToast('Leads & Sales performance report generated and downloaded successfully!', 'success');
    } catch (error) {
      console.error('Error generating report:', error);
      showToast('An error occurred during report generation', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center p-20">
        <div className="w-12 h-12 border-4 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-text-primary tracking-tight">Candidates</h1>
          <p className="text-text-secondary mt-1">Manage and search through your candidate database.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <button 
              onClick={handleExportLeadsAndSales}
              disabled={isExporting}
              className="flex items-center gap-2 px-4 py-3 bg-bg-secondary border border-border-primary rounded-2xl text-sm font-bold text-text-primary hover:bg-bg-tertiary transition-all cursor-pointer disabled:opacity-50"
            >
              <Download className="w-5 h-5 text-accent-green" />
              <span className="hidden sm:inline">{isExporting ? 'Exporting...' : 'Export Report'}</span>
            </button>
            <button 
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center gap-2 px-4 py-3 bg-bg-secondary border border-border-primary rounded-2xl text-sm font-bold text-text-primary hover:bg-bg-tertiary transition-all"
            >
              <Table className="w-5 h-5 text-accent-blue" />
              <span className="hidden sm:inline">Import</span>
            </button>
            <button 
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-2 px-6 py-3 bg-accent-blue text-white font-bold rounded-2xl hover:bg-accent-blue/90 transition-all shadow-lg shadow-accent-blue/20"
            >
              <Plus className="w-5 h-5" />
              <span className="hidden sm:inline">Add Candidate</span>
            </button>
          </div>
          <div className="flex items-center gap-4 flex-1 sm:flex-none">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
              <input 
                type="text" 
                placeholder="Search candidates..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-bg-secondary border border-border-primary rounded-2xl pl-12 pr-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors shadow-sm"
              />
            </div>
            <div className="relative w-40 sm:w-48">
              <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
              <select 
                value={stageFilter}
                onChange={e => setStageFilter(e.target.value)}
                className="w-full bg-bg-secondary border border-border-primary rounded-2xl pl-12 pr-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors shadow-sm appearance-none"
              >
                <option value="">All Stages</option>
                {Object.entries(STAGES).filter(([key]) => key !== 'not_interested').map(([key, stage]) => (
                  <option key={key} value={key}>{stage.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="bg-bg-secondary rounded-3xl border border-border-primary overflow-hidden shadow-sm flex flex-col">
        {/* Table Header (Static) */}
        <div className="bg-bg-tertiary/50 border-b border-border-primary flex items-center min-w-[800px]">
          <div className="flex-1 px-6 py-4 text-[10px] font-bold text-text-muted uppercase tracking-widest min-w-[250px]">Candidate</div>
          <div className="w-32 px-6 py-4 text-[10px] font-bold text-text-muted uppercase tracking-widest">ID</div>
          <div className="w-56 px-6 py-4 text-[10px] font-bold text-text-muted uppercase tracking-widest hidden lg:block">Contact</div>
          <div className="w-32 px-6 py-4 text-[10px] font-bold text-text-muted uppercase tracking-widest hidden md:block text-center">Portal</div>
          <div className="w-48 px-6 py-4 text-[10px] font-bold text-text-muted uppercase tracking-widest">Stage</div>
          <div className="w-40 px-6 py-4 text-[10px] font-bold text-text-muted uppercase tracking-widest hidden sm:block">Package</div>
          <div className="w-32 px-6 py-4 text-[10px] font-bold text-text-muted uppercase tracking-widest hidden xl:block">Last Update</div>
          <div className="w-32 px-6 py-4 text-[10px] font-bold text-text-muted uppercase tracking-widest"></div>
        </div>

        {/* Virtualized List Body */}
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            {filteredCandidates.length > 0 ? (
              <List<CandidateRowExtraProps>
                rowCount={filteredCandidates.length}
                rowHeight={80}
                style={{ height: 600, width: '100%' }}
                rowProps={itemData}
                className="scrollbar-hide"
                rowComponent={CandidateRow as any}
              />
            ) : (
              <div className="p-20 text-center">
                <Users className="w-12 h-12 text-text-muted mx-auto mb-4" />
                <h3 className="text-lg font-bold text-text-primary">No candidates found</h3>
                <p className="text-text-secondary mt-1">Try adjusting your search or filters.</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer Info */}
        <div className="p-4 border-t border-border-primary flex items-center justify-between bg-bg-secondary">
          <p className="text-xs text-text-muted font-medium">
            Showing {filteredCandidates.length} candidate{filteredCandidates.length === 1 ? '' : 's'} assigned to your role ({user?.role || 'user'})
          </p>
        </div>
      </div>

      <CandidateSheet 
        candidate={selectedCandidate}
        isOpen={isSheetOpen}
        onClose={() => {
          setIsSheetOpen(false);
          setSelectedCandidate(null);
        }}
      />
      <TrackJobSheet 
        candidate={trackingCandidate}
        isOpen={isTrackSheetOpen}
        onClose={() => {
          setIsTrackSheetOpen(false);
          setTrackingCandidate(null);
        }}
        applications={[]} // Now handled inside TrackJobSheet
      />

      <BulkImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={() => {}}
      />
      <AddCandidateModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={() => {}}
      />
    </div>
  );
};
