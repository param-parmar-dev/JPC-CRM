import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  Filter,
  Plus,
  Download,
  Phone,
  Mail,
  MapPin,
  Package,
  Calendar,
  Users,
  TrendingUp,
  Video,
  Edit2,
  FileText,
} from 'lucide-react';
import { List } from 'react-window';
import * as XLSX from 'xlsx';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  subscribeToAurrumCandidates,
  subscribeToCollection,
  updateAurrumCandidate,
} from '../../services/storage';
import { handleViewFile } from '../../services/fileService';
import { Candidate, User } from '../../types';
import { useDebounce } from '../../lib/hooks';
import { AurrumFlowHeader } from './AurrumFlowHeader';
import {
  AurrumCandidateModal,
  AURRUM_STAGES,
  resolveAurrumStage,
} from './AurrumCandidateModal';

type AurrumRowExtraProps = {
  items: Candidate[];
  allUsers: User[];
  onEdit: (c: Candidate) => void;
  onMoveToSales: (c: Candidate) => void;
  onSendToInterviews: (c: Candidate) => void;
};

const AurrumCandidateRow = React.memo(
  ({
    index,
    style,
    items,
    allUsers,
    onEdit,
    onMoveToSales,
    onSendToInterviews,
  }: {
    index: number;
    style: React.CSSProperties;
  } & AurrumRowExtraProps) => {
    const candidate = items[index];
    if (!candidate) return null;

    const stageVal = resolveAurrumStage(candidate);
    const stageObj = AURRUM_STAGES.find(s => s.value === stageVal) || AURRUM_STAGES[0];
    const salesRep = allUsers.find(u => String(u.id) === String(candidate.assigned_sales));

    return (
      <div
        style={style}
        className="hover:bg-bg-tertiary/30 transition-colors group border-b border-border-primary flex items-center"
      >
        <div
          onClick={() => onEdit(candidate)}
          className="flex-1 px-6 py-3 flex items-center gap-3.5 min-w-[240px] cursor-pointer"
        >
          <div className="w-9 h-9 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold text-xs ring-1 ring-amber-500/30 shrink-0">
            {(candidate.full_name || 'A')
              .split(' ')
              .filter(Boolean)
              .map(n => n[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-text-primary group-hover:text-accent-blue transition-colors truncate">
              {candidate.full_name || 'Unnamed Candidate'}
            </p>
            <p className="text-[11px] text-text-muted flex items-center gap-1 truncate">
              <MapPin className="w-3 h-3 shrink-0" />
              {candidate.location || candidate.job_interest || 'Aurrum Candidate'}
            </p>
          </div>
        </div>

        <div className="w-52 px-4 py-3 hidden lg:block">
          <p className="text-xs text-text-primary flex items-center gap-1.5 truncate">
            <Phone className="w-3.5 h-3.5 text-text-muted shrink-0" />
            {candidate.phone || '—'}
          </p>
          <p className="text-[11px] text-text-muted flex items-center gap-1.5 truncate mt-0.5">
            <Mail className="w-3.5 h-3.5 text-text-muted shrink-0" />
            {candidate.email || '—'}
          </p>
        </div>

        <div className="w-44 px-4 py-3">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-bg-tertiary border border-border-primary rounded-full">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: stageObj.color }}
            />
            <span className="text-[10px] font-bold text-text-primary uppercase tracking-wider truncate">
              {stageObj.label.replace(/^\d+\.\s*/, '')}
            </span>
          </div>
        </div>

        <div className="w-40 px-4 py-3 hidden md:block">
          <p className="text-xs font-semibold text-text-primary truncate">
            {salesRep?.display_name || 'Unassigned'}
          </p>
          <p className="text-[10px] text-text-muted truncate">
            {candidate.aurrum_sales_status || 'New Lead'}
          </p>
        </div>

        <div className="w-36 px-4 py-3 hidden sm:block">
          <div className="flex items-center gap-1.5 min-w-0">
            <Package className="w-3.5 h-3.5 text-text-muted shrink-0" />
            <div className="truncate">
              <p className="text-xs font-bold text-text-primary truncate">
                {candidate.package_name || '—'}
              </p>
              <p className="text-[10px] text-text-muted">
                ${(Number(candidate.package_amount) || 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div className="w-56 px-4 py-3 flex items-center justify-end gap-1.5 shrink-0">
          {candidate.resume_url && (
            <button
              type="button"
              onClick={() =>
                handleViewFile(candidate.resume_url!, candidate.resume_filename || 'Resume')
              }
              className="p-2 rounded-xl bg-bg-tertiary hover:bg-accent-blue/10 text-text-secondary hover:text-accent-blue transition-colors"
              title="View Resume"
            >
              <FileText className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onMoveToSales(candidate)}
            className="px-2.5 py-1.5 rounded-xl bg-amber-500/10 text-amber-500 hover:bg-amber-500 hover:text-white text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
            title="Move to Aurrum Sales"
          >
            Sales
          </button>
          <button
            type="button"
            onClick={() => onSendToInterviews(candidate)}
            className="px-2.5 py-1.5 rounded-xl bg-purple-500/10 text-purple-400 hover:bg-purple-500 hover:text-white text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
            title="Send to Interview Support"
          >
            Support
          </button>
          <button
            type="button"
            onClick={() => onEdit(candidate)}
            className="p-2 rounded-xl bg-bg-tertiary hover:bg-bg-primary text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
            title="Edit Candidate"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }
);

export const AurrumCandidates: React.FC = () => {
  const { isAuthReady } = useAuth();
  const { showToast } = useToast();

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [stageFilter, setStageFilter] = useState<string>('');
  const [visibleLimit, setVisibleLimit] = useState<number>(100);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);

  useEffect(() => {
    if (!isAuthReady) return;

    const unsubCandidates = subscribeToAurrumCandidates(data => {
      setCandidates(data);
      setIsLoading(false);
    });
    const unsubUsers = subscribeToCollection<User>('jpc_users', setAllUsers);

    return () => {
      unsubCandidates();
      unsubUsers();
    };
  }, [isAuthReady]);

  const salesUsers = useMemo(() => {
    return allUsers.filter(
      u =>
        !u.deleted_at &&
        (u.role === 'jpc_sales' ||
          u.role === 'jpc_lead_gen' ||
          u.role === 'jpc_manager' ||
          u.role === 'administrator' ||
          u.role === 'jpc_sysadmin')
    );
  }, [allUsers]);

  const filteredCandidates = useMemo(() => {
    const q = debouncedSearch.toLowerCase().trim();
    return candidates
      .filter(c => {
        if (c.crm_brand !== 'aurrum') return false;
        const st = resolveAurrumStage(c);
        if (stageFilter && st !== stageFilter) return false;
        if (!q) return true;
        return (
          (c.full_name || '').toLowerCase().includes(q) ||
          (c.email || '').toLowerCase().includes(q) ||
          (c.phone || '').includes(q) ||
          (c.job_interest || '').toLowerCase().includes(q) ||
          (c.location || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }, [candidates, debouncedSearch, stageFilter]);

  const displayedCandidates = useMemo(() => {
    return filteredCandidates.slice(0, visibleLimit);
  }, [filteredCandidates, visibleLimit]);

  const handleEdit = useCallback((c: Candidate) => {
    setEditingCandidate(c);
    setIsModalOpen(true);
  }, []);

  const handleMoveToSales = useCallback(
    async (c: Candidate) => {
      try {
        await updateAurrumCandidate(c.id, {
          aurrum_stage: 'sales',
          aurrum_sales_status:
            c.aurrum_sales_status === 'New Lead' ? 'Contacted' : c.aurrum_sales_status || 'Contacted',
          current_stage: 'sales',
        });
        showToast(`${c.full_name} moved to Aurrum Sales!`, 'success');
        window.location.hash = '#aurrum-sales';
      } catch (err) {
        showToast('Failed to move candidate to Sales', 'error');
      }
    },
    [showToast]
  );

  const handleSendToInterviews = useCallback(
    async (c: Candidate) => {
      try {
        await updateAurrumCandidate(c.id, {
          aurrum_stage: 'interview_support',
          aurrum_sales_status: 'Converted',
          current_stage: 'interviewing',
        });
        showToast(`${c.full_name} moved to Aurrum Interview Support!`, 'success');
        window.location.hash = '#aurrum-interviews';
      } catch (err) {
        showToast('Failed to move candidate to Interview Support', 'error');
      }
    },
    [showToast]
  );

  const itemData = useMemo<AurrumRowExtraProps>(
    () => ({
      items: displayedCandidates,
      allUsers,
      onEdit: handleEdit,
      onMoveToSales: handleMoveToSales,
      onSendToInterviews: handleSendToInterviews,
    }),
    [displayedCandidates, allUsers, handleEdit, handleMoveToSales, handleSendToInterviews]
  );

  const handleExport = () => {
    if (filteredCandidates.length === 0) {
      showToast('No Aurrum candidates to export', 'info');
      return;
    }
    const rows = filteredCandidates.map(c => {
      const salesRep = allUsers.find(u => String(u.id) === String(c.assigned_sales));
      return {
        ID: c.id,
        'Full Name': c.full_name,
        Email: c.email,
        Phone: c.phone,
        WhatsApp: c.whatsapp,
        'Target Role': c.job_interest,
        Location: c.location,
        'Aurrum Stage': resolveAurrumStage(c),
        'Sales Status': c.aurrum_sales_status || 'New Lead',
        'Assigned Sales': salesRep?.display_name || 'Unassigned',
        Package: c.package_name || '—',
        'Package Amount ($)': Number(c.package_amount) || 0,
        'Lead Source': c.lead_source || '—',
        Notes: c.notes || '—',
        'Created At': c.created_at ? new Date(c.created_at).toLocaleDateString() : '—',
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Aurrum Candidates');
    XLSX.writeFile(
      wb,
      `Aurrum_Careers_Candidates_${new Date().toISOString().split('T')[0]}.xlsx`
    );
    showToast('Aurrum candidates exported!', 'success');
  };

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
        activeStep="candidates"
        title="Aurrum Careers Candidates"
        subtitle="Isolated candidate directory for Aurrum Careers. Does not affect main Auriic CRM counts."
        actions={
          <>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2.5 bg-bg-secondary border border-border-primary rounded-xl text-xs sm:text-sm font-bold text-text-primary hover:bg-bg-tertiary transition-all cursor-pointer"
            >
              <Download className="w-4 h-4 text-emerald-500" />
              <span>Export</span>
            </button>
            <button
              onClick={() => {
                setEditingCandidate(null);
                setIsModalOpen(true);
              }}
              className="flex items-center gap-2 px-5 py-2.5 bg-accent-blue text-white font-bold rounded-xl hover:bg-accent-blue/90 transition-all shadow-lg shadow-accent-blue/20 text-xs sm:text-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Aurrum Candidate</span>
            </button>
          </>
        }
      />

      {/* Search & Stage Filter Bar */}
      <div className="bg-bg-secondary border border-border-primary rounded-2xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search Aurrum candidates by name, phone, email, or role..."
            className="w-full pl-10 pr-4 py-2.5 bg-bg-tertiary border border-border-primary rounded-xl text-xs sm:text-sm text-text-primary focus:border-accent-blue outline-none"
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-52">
            <Filter className="w-4 h-4 text-text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
            <select
              value={stageFilter}
              onChange={e => setStageFilter(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-bg-tertiary border border-border-primary rounded-xl text-xs sm:text-sm font-bold text-text-primary focus:border-accent-blue outline-none cursor-pointer"
            >
              <option value="">All Aurrum Stages</option>
              {AURRUM_STAGES.map(st => (
                <option key={st.value} value={st.value}>
                  {st.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="block md:hidden space-y-3">
        {displayedCandidates.map(candidate => {
          const st = AURRUM_STAGES.find(s => s.value === resolveAurrumStage(candidate));
          return (
            <div
              key={candidate.id}
              className="bg-bg-secondary border border-border-primary rounded-2xl p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0" onClick={() => handleEdit(candidate)}>
                  <p className="text-sm font-bold text-text-primary truncate">
                    {candidate.full_name}
                  </p>
                  <p className="text-xs text-text-muted truncate">{candidate.phone}</p>
                </div>
                <span
                  className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border shrink-0"
                  style={{
                    color: st?.color,
                    borderColor: `${st?.color}40`,
                    backgroundColor: `${st?.color}15`,
                  }}
                >
                  {st?.label.replace(/^\d+\.\s*/, '')}
                </span>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-primary">
                <button
                  onClick={() => handleMoveToSales(candidate)}
                  className="px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-500 text-xs font-bold"
                >
                  Move to Sales
                </button>
                <button
                  onClick={() => handleSendToInterviews(candidate)}
                  className="px-3 py-1.5 rounded-xl bg-purple-500/10 text-purple-400 text-xs font-bold"
                >
                  Interview Support
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop Virtualized Table */}
      <div className="hidden md:flex bg-bg-secondary rounded-3xl border border-border-primary overflow-hidden shadow-sm flex-col">
        <div className="overflow-x-auto touch-scroll">
          <div className="min-w-[850px]">
            <div className="bg-bg-tertiary/50 border-b border-border-primary flex items-center">
              <div className="flex-1 px-6 py-4 text-[10px] font-bold text-text-muted uppercase tracking-widest min-w-[240px]">
                Aurrum Candidate
              </div>
              <div className="w-52 px-4 py-4 text-[10px] font-bold text-text-muted uppercase tracking-widest hidden lg:block">
                Contact
              </div>
              <div className="w-44 px-4 py-4 text-[10px] font-bold text-text-muted uppercase tracking-widest">
                Flow Stage
              </div>
              <div className="w-40 px-4 py-4 text-[10px] font-bold text-text-muted uppercase tracking-widest hidden md:block">
                Sales Rep & Status
              </div>
              <div className="w-36 px-4 py-4 text-[10px] font-bold text-text-muted uppercase tracking-widest hidden sm:block">
                Package
              </div>
              <div className="w-56 px-4 py-4 text-[10px] font-bold text-text-muted uppercase tracking-widest text-right">
                Flow Actions
              </div>
            </div>

            {displayedCandidates.length > 0 ? (
              <List<AurrumRowExtraProps>
                rowCount={displayedCandidates.length}
                rowHeight={72}
                style={{ height: 560, width: '100%' }}
                rowProps={itemData}
                className="scrollbar-hide"
                rowComponent={AurrumCandidateRow as any}
              />
            ) : (
              <div className="p-20 text-center">
                <Users className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-30" />
                <h3 className="text-base font-bold text-text-primary">
                  No Aurrum Careers candidates found
                </h3>
                <p className="text-xs text-text-secondary mt-1">
                  Add a candidate to start the Aurrum Careers flow.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-border-primary flex items-center justify-between bg-bg-secondary">
          <p className="text-xs text-text-muted font-medium">
            Showing {displayedCandidates.length} of {filteredCandidates.length} Aurrum Careers
            candidate{filteredCandidates.length === 1 ? '' : 's'}
          </p>
          {filteredCandidates.length > visibleLimit && (
            <button
              onClick={() => setVisibleLimit(prev => prev + 100)}
              className="px-4 py-2 bg-bg-tertiary border border-border-primary hover:border-accent-blue text-xs font-bold text-text-primary rounded-xl transition-all cursor-pointer"
            >
              Load More (+100)
            </button>
          )}
        </div>
      </div>

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
