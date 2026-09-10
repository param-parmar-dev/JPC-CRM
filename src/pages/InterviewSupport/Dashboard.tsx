import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { 
  subscribeToCollection, 
  subscribeToQuery, 
  addInterviewSupportRequest, 
  updateInterviewSupportRequest,
  updateCandidate,
  addInterviewRound,
  updateInterviewRound,
  logInterviewActivity,
  addInterviewNotification,
  addBookingLink,
  deleteInterviewSupportRequest,
  generateId
} from '../../services/storage';
import { syncInterviewRoundToGoogleCalendar, clearPreviousCalendarEvents } from '../../services/calendarService';
import { handleViewFile, uploadFile } from '../../services/fileService';
import { 
  InterviewSupportRequest, 
  InterviewRound, 
  InterviewFeedback,
  Candidate, 
  User, 
  ProxyAvailability 
} from '../../types';
import { 
  Calendar, 
  Search, 
  Clock, 
  CheckCircle2, 
  X, 
  Plus, 
  MoreVertical, 
  Video, 
  MessageSquare, 
  Share2, 
  Copy, 
  ExternalLink,
  ChevronRight,
  Filter,
  User as UserIcon,
  Briefcase,
  Building,
  Phone,
  FileText,
  AlertCircle,
  FileEdit,
  RotateCcw,
  FileSearch,
  HelpCircle,
  Trophy,
  Trash2,
  BarChart2,
  MessageCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Select from 'react-select';
import { InterviewAnalytics } from './InterviewAnalytics';
import { cn, parseLocalTimeToDate, getCalendarDateInfo, getCurrentEasternISOString } from '../../lib/utils';
import { collection, query, where, orderBy, doc, getDoc, addDoc, getDocs, updateDoc, runTransaction } from 'firebase/firestore';
import { db } from '../../firebase';
import { InterviewDetailsModal } from '../../components/InterviewDetailsModal';
import { ProxyAssignmentModal } from '../../components/ProxyAssignmentModal';
import { ResumeSubstitutionModal } from '../../components/ResumeSubstitutionModal';
import { SlotVisualizer } from '../../components/SlotVisualizer';
import { findBestProxyForWindow, isProxyUser } from '../../services/interviewService';
import { sharedSelectStyles } from '../../lib/selectStyles';
import { FreeTrialBadge } from '../../components/FreeTrialBadge';

type TabType = 'today' | 'upcoming' | 'pending_bookings' | 'booked' | 'live' | 'completed' | 'cancelled' | 'rescheduled' | 'self_attended' | 'analytics' | 'team_status';

const customSelectStyles = {
  ...sharedSelectStyles,
  control: (provided: any, state: any) => ({
    ...(typeof sharedSelectStyles.control === 'function' ? sharedSelectStyles.control(provided, state) : provided),
    borderRadius: '20px',
    minHeight: '56px',
    paddingLeft: '1rem',
  }),
  menu: (provided: any, state: any) => ({
    ...(typeof sharedSelectStyles.menu === 'function' ? sharedSelectStyles.menu(provided, state) : provided),
    borderRadius: '20px',
  }),
};

export const InterviewSupportDashboard: React.FC = () => {
  const { user, isAuthReady } = useAuth();
  const { showToast } = useToast();

  const canEditProtectedAll = useMemo(() => {
    return user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_cs' || user?.role === 'jpc_manager' || user?.role === 'jpc_marketing' || user?.role === 'jpc_proxy';
  }, [user]);

  const canAssignProxy = useMemo(() => {
    return user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_cs' || user?.role === 'jpc_manager' || user?.role === 'jpc_marketing' || user?.role === 'jpc_proxy' || user?.role === 'jpc_recruiter';
  }, [user]);

  const canCreateRequest = useMemo(() => {
    return user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_cs' || user?.role === 'jpc_manager' || user?.role === 'jpc_recruiter' || user?.role === 'jpc_marketing' || user?.role === 'jpc_proxy';
  }, [user]);
  
  const [activeTab, setActiveTab] = useState<TabType>('today');
  const [requests, setRequests] = useState<InterviewSupportRequest[]>([]);
  const [rounds, setRounds] = useState<InterviewRound[]>([]);
  const [feedbacks, setFeedbacks] = useState<InterviewFeedback[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [team, setTeam] = useState<User[]>([]);
  const [availabilities, setAvailabilities] = useState<ProxyAvailability[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [filterDate, setFilterDate] = useState<string>('');
  
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [proxyAssignmentConfig, setProxyAssignmentConfig] = useState<{ request: InterviewSupportRequest, round: InterviewRound } | null>(null);
  const [directScheduleConfig, setDirectScheduleConfig] = useState<{ request: InterviewSupportRequest, round: InterviewRound } | null>(null);
  const [resultUpdateConfig, setResultUpdateConfig] = useState<{ request: InterviewSupportRequest, round: InterviewRound } | null>(null);
  const [selectedFeedbackRound, setSelectedFeedbackRound] = useState<{ round: InterviewRound, feedback: InterviewFeedback } | null>(null);
  const [selectedDetailRequest, setSelectedDetailRequest] = useState<InterviewSupportRequest | null>(null);
  const [substitutionRequest, setSubstitutionRequest] = useState<InterviewSupportRequest | null>(null);
  const [selectedProxyId, setSelectedProxyId] = useState<string>('all');

  useEffect(() => {
    if (!isAuthReady) return;

    const unsubRequests = subscribeToCollection<InterviewSupportRequest>('jpc_interview_requests', setRequests);
    const unsubRounds = subscribeToCollection<InterviewRound>('jpc_interview_rounds', setRounds);
    const unsubFeedback = subscribeToCollection<InterviewFeedback>('jpc_interview_feedback', setFeedbacks);
    const unsubCandidates = subscribeToCollection<Candidate>('jpc_candidates', setCandidates);
    const unsubAvailabilities = subscribeToCollection<ProxyAvailability>('jpc_proxy_availability', setAvailabilities);
    const unsubCalendarEvents = subscribeToCollection<any>('jpc_calendar_events', setCalendarEvents);
    const unsubTeam = subscribeToCollection<User>('jpc_users', (data) => {
      setTeam(data);
      setIsLoading(false);
    });

    return () => {
      unsubRequests();
      unsubRounds();
      unsubFeedback();
      unsubCandidates();
      unsubAvailabilities();
      unsubCalendarEvents();
      unsubTeam();
    };
  }, [isAuthReady]);
  
  const visibleRequests = useMemo(() => {
    if (!user) return [];
    if (user.role === 'administrator' || user.role === 'jpc_sysadmin' || user.role === 'jpc_cs' || user.role === 'jpc_manager' || user.role === 'jpc_marketing' || user.role === 'jpc_proxy') {
      return requests;
    }
    if (user.role === 'jpc_recruiter') {
      return requests.filter(req => String(req.recruiter_id) === String(user.id) || String(req.created_by) === String(user.id));
    }
    return [];
  }, [requests, rounds, user]);

  const visibleRounds = useMemo(() => {
    const visibleRequestIds = new Set(visibleRequests.map(r => r.id));
    return rounds.filter(r => visibleRequestIds.has(r.request_id) || (r.proxy_user_id && String(r.proxy_user_id) === String(user?.id)));
  }, [rounds, visibleRequests, user]);

  const filteredData = useMemo(() => {
    const searchLower = searchTerm.toLowerCase();
    
    let base = visibleRequests.filter(req => {
      const candidate = candidates.find(c => c.id === req.candidate_id);
      return (
        candidate?.full_name.toLowerCase().includes(searchLower) ||
        req.company_name.toLowerCase().includes(searchLower) ||
        req.job_title.toLowerCase().includes(searchLower)
      );
    });

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    let filtered = base.filter(req => {
      const reqRounds = visibleRounds.filter(r => r.request_id === req.id);
      
      let matches = false;
      switch (activeTab) {
        case 'today':
            matches = reqRounds.some(r => (r.booked_slot_time || r.interview_date || '').startsWith(todayStr));
            break;
        case 'upcoming':
            matches = reqRounds.some(r => {
              const d = r.booked_slot_time || r.interview_date;
              return d && new Date(d) > now;
            });
            break;
        case 'pending_bookings':
            matches = req.overall_status === 'pending_request' || req.overall_status === 'booking_link_generated';
            break;
        case 'booked':
            matches = req.overall_status === 'confirmed';
            break;
        case 'live':
            matches = req.overall_status === 'live';
            break;
        case 'completed':
            matches = req.overall_status === 'completed' || req.overall_status === 'feedback_added' || req.overall_status === 'placed';
            break;
        case 'cancelled':
            matches = req.overall_status === 'cancelled';
            break;
        case 'rescheduled':
            matches = req.overall_status === 'rescheduled';
            break;
        case 'self_attended':
            matches = req.proxy_required === false;
            break;
        default:
            matches = true;
      }
      return matches;
    });

    // Apply Proxy Filter
    if (selectedProxyId !== 'all') {
      filtered = filtered.filter(req => {
        const reqRounds = visibleRounds.filter(r => r.request_id === req.id);
        return reqRounds.some(r => String(r.proxy_user_id) === selectedProxyId);
      });
    }
    
    // Apply date filter
    if (filterDate) {
      filtered = filtered.filter(req => {
        const reqRounds = visibleRounds.filter(r => r.request_id === req.id);
        return reqRounds.some(r => (r.booked_slot_time || r.interview_date || '')?.startsWith(filterDate));
      });
    }

    // Apply sort
    return filtered.sort((a, b) => {
      const getRelevantRoundDate = (req: InterviewSupportRequest) => {
        const reqRounds = visibleRounds.filter(r => r.request_id === req.id);
        
        let targetRounds = reqRounds;
        if (activeTab === 'today') {
          targetRounds = reqRounds.filter(r => (r.booked_slot_time || r.interview_date || '').startsWith(todayStr));
        } else if (activeTab === 'upcoming') {
          targetRounds = reqRounds.filter(r => {
             const d = r.booked_slot_time || r.interview_date;
             return d && new Date(d) > now;
          });
        }

        if (targetRounds.length === 0) targetRounds = reqRounds;

        const dates = targetRounds.map(r => r.booked_slot_time || r.interview_date || '').filter(Boolean).sort();
        return dates.length > 0 ? dates[0] : '9999-99-99';
      };
      
      const dateA = getRelevantRoundDate(a);
      const dateB = getRelevantRoundDate(b);
      
      const comparison = dateA.localeCompare(dateB);

      // Default Today and Upcoming to ASC unless flipped
      if (activeTab === 'today' || activeTab === 'upcoming') {
         // If sortDirection is desc, we flip it. But usually we want asc for these.
         // Let's just use sortDirection.
         return sortDirection === 'asc' ? comparison : -comparison;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });

  }, [visibleRequests, visibleRounds, candidates, searchTerm, activeTab, sortDirection, filterDate, selectedProxyId]);

  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return {
      today: visibleRounds.filter(r => r.interview_date?.startsWith(todayStr)).length,
      pending: visibleRequests.filter(req => req.overall_status === 'pending_request').length,
      live: visibleRequests.filter(req => req.overall_status === 'live').length,
      booked: visibleRequests.filter(req => req.overall_status === 'confirmed').length,
      self_attended: visibleRequests.filter(req => req.proxy_required === false).length,
    };
  }, [visibleRequests, visibleRounds]);

  const handleGenerateLink = async (requestId: string, roundId: string) => {
    if (!user) return;
    try {
      const req = requests.find(r => r.id === requestId);
      const rnd = rounds.find(r => r.id === roundId);
      
      if (req?.proxy_required) {
        if (!rnd || !rnd.proxy_user_id) {
          showToast("Please assign a Proxy Team member before generating a booking link.", "error");
          return;
        }
      }

      const token = Math.random().toString(36).slice(2, 18);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

      await addBookingLink({
        interview_round_id: roundId,
        generated_by_recruiter_id: user.id as string,
        token,
        expires_at: expiresAt.toISOString(),
        is_active: true,
        opened_at: null,
        booked_at: null
      });

      await updateInterviewRound(roundId, {
        booking_link_token: token,
        status: 'pending'
      });

      await updateInterviewSupportRequest(requestId, {
        overall_status: 'booking_link_generated'
      });

      showToast('Booking link generated successfully!', 'success');
    } catch (error) {
      showToast('Failed to generate link', 'error');
    }
  };

  const copyBookingLink = (token: string) => {
    const url = `${window.location.origin}/#book-interview/${token}`;
    navigator.clipboard.writeText(url);
    showToast('Link copied to clipboard!', 'success');
  };

  const handleReschedule = async (request: InterviewSupportRequest, round: InterviewRound) => {
    if (!user || !window.confirm("Mark this interview for reschedule? This will reset the booking status and allow candidates to re-book.")) return;
    
    try {
      // 1. Update Round
      await updateInterviewRound(round.id, {
        status: 'pending',
        booked_slot_time: null,
        booked_slot_end: null,
        booking_link_token: null
      });

      // 2. Update Request
      await updateInterviewSupportRequest(request.id, {
        overall_status: 'rescheduled'
      });

      // 3. Log Activity
      await logInterviewActivity(round.id, 'RESCHEDULE_ADMIN_TRIGGERED', { by: user.role }, String(user.id));

      showToast('Interview marked for reschedule', 'success');
    } catch (error) {
      console.error(error);
      showToast('Failed to trigger reschedule', 'error');
    }
  };

  const handleDeleteRequest = async (requestId: string) => {
    if (!window.confirm("ARE YOU SURE? This will permanently delete this interview request and all associated rounds, links, and feedback. This action CANNOT be undone.")) return;
    
    try {
      await deleteInterviewSupportRequest(requestId);
      showToast('Interview request deleted successfully', 'success');
    } catch (error) {
      console.error(error);
      showToast('Failed to delete interview request', 'error');
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
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black text-text-primary tracking-tight">Interview Support System</h1>
          <p className="text-text-secondary mt-2 flex items-center gap-2 text-sm sm:text-base">
            <Calendar className="w-4 h-4 text-accent-blue shrink-0" />
            Coordinating multi-round interviews and proxy scheduling
          </p>
        </div>
        <div className="flex items-center gap-3">
          {canCreateRequest && (
            <button 
              onClick={() => { setProxyAssignmentConfig(null); setIsRequestModalOpen(true); }}
              className="w-full sm:w-auto justify-center px-6 sm:px-8 py-3.5 sm:py-4 bg-accent-blue text-white font-bold rounded-2xl sm:rounded-[20px] hover:bg-accent-blue/90 transition-all shadow-xl shadow-accent-blue/20 flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Create Request
            </button>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
        {[
          { label: 'Today', value: stats.today, icon: Calendar, color: 'text-accent-blue', bg: 'bg-accent-blue/10' },
          { label: 'Pending', value: stats.pending, icon: Clock, color: 'text-accent-amber', bg: 'bg-accent-amber/10' },
          { label: 'Live Now', value: stats.live, icon: Video, color: 'text-accent-red', bg: 'bg-accent-red/10' },
          { label: 'Booked', value: stats.booked, icon: CheckCircle2, color: 'text-accent-green', bg: 'bg-accent-green/10' },
          { label: 'Self Attended', value: stats.self_attended, icon: UserIcon, color: 'text-accent-purple', bg: 'bg-accent-purple/10' },
        ].map((stat, i) => (
          <motion.div 
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-bg-secondary p-4 sm:p-6 rounded-2xl sm:rounded-[32px] border border-border-primary/50"
          >
            <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center mb-4", stat.bg)}>
              <stat.icon className={cn("w-5 h-5", stat.color)} />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-text-primary tracking-tight">{stat.value}</p>
            <p className="text-xs font-bold text-text-muted uppercase tracking-widest mt-1">{stat.label}</p>
          </motion.div>
        ))}
      </div>


      {/* Copyable General Onboarding Link Card */}
      {(user?.role === 'jpc_cs' || user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager') && (
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-accent-blue/10 to-accent-blue/5 border border-accent-blue/30 p-5 sm:p-8 rounded-3xl sm:rounded-[40px] flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative overflow-hidden shadow-sm"
        >
          <div className="space-y-2 relative z-10 select-none">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-lg bg-accent-blue flex items-center justify-center text-white">
                <Calendar className="w-3 h-3" />
              </span>
              <span className="text-[10px] font-black text-accent-blue uppercase tracking-widest">Self-Service Onboarding</span>
            </div>
            <h2 className="text-lg sm:text-xl font-black text-text-primary tracking-tight">Direct "Interview Support Only" Form Link</h2>
            <p className="text-sm font-medium text-text-secondary max-w-2xl leading-relaxed">
              If only **Interview Support** is selected as the plan, copy this link to send to the candidate. They can fill in all candidate and job details themselves, pick a slot, lock it instantly to prevent double-booking conflicts, and the system automatically assigns the request to the Proxy Team of experts.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0 relative z-10 w-full lg:w-auto">
            <input
              readOnly
              value={`${window.location.origin}/#book-interview/interview-support-only`}
              className="flex-1 lg:w-80 px-4 py-3 bg-bg-secondary border border-border-primary rounded-xl text-xs font-mono font-bold text-text-primary h-12"
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/#book-interview/interview-support-only`);
                showToast('Direct Interview Support link copied!', 'success');
              }}
              className="px-6 py-3 bg-accent-blue text-white text-sm font-bold rounded-xl hover:bg-accent-blue/90 transition-all flex items-center gap-1.5 h-12 shrink-0 active:scale-95 shadow-lg shadow-accent-blue/10"
            >
              Copy Link
            </button>
          </div>
          <div className="absolute top-0 right-0 w-32 h-32 bg-accent-blue/5 rounded-full blur-3xl pointer-events-none" />
        </motion.div>
      )}

      {/* Tabs & Search */}
      <div className="bg-bg-secondary p-2 rounded-2xl sm:rounded-[32px] border border-border-primary/50">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 flex overflow-x-auto touch-scroll scrollbar-hide p-1 gap-1">
            {(['analytics', 'team_status', 'today', 'upcoming', 'pending_bookings', 'booked', 'live', 'self_attended', 'completed', 'cancelled', 'rescheduled'] as TabType[]).map((tab) => {
              if (tab === 'analytics' && !canCreateRequest) return null;
              
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap flex items-center gap-2",
                    activeTab === tab 
                      ? "bg-accent-blue text-white shadow-lg shadow-accent-blue/20" 
                      : "text-text-secondary hover:bg-bg-tertiary"
                  )}
                >
                  {tab === 'analytics' && <BarChart2 className="w-4 h-4" />}
                  {tab.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 bg-bg-tertiary p-1 rounded-2xl border border-border-primary h-12">
            <button 
              onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
              className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-text-muted hover:text-accent-blue whitespace-nowrap"
            >
              {sortDirection === 'asc' ? 'Chronological' : 'Reverse Chronological'}
            </button>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="bg-transparent text-[10px] font-bold text-text-primary focus:outline-none px-2 h-full"
            />
          </div>

          <div className="md:w-64">
             <Select
                options={[
                  { value: 'all', label: 'All Proxies' },
                  ...team.filter(isProxyUser).map(u => ({ value: String(u.id), label: u.display_name }))
                ]}
                value={{ 
                  value: selectedProxyId, 
                  label: selectedProxyId === 'all' ? 'Filter by Proxy...' : team.find(u => String(u.id) === selectedProxyId)?.display_name || 'Filter by Proxy...' 
                }}
                onChange={(opt: any) => setSelectedProxyId(opt.value)}
                styles={{
                  ...customSelectStyles,
                  control: (provided: any, state: any) => ({
                    ...provided,
                    ...customSelectStyles.control(provided, state),
                    minHeight: '48px',
                    borderRadius: '16px',
                  })
                }}
                placeholder="Proxy Filter"
              />
          </div>

          {activeTab !== 'analytics' && (
            <div className="relative md:w-64">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                placeholder="Quick search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-bg-tertiary border border-border-primary rounded-2xl text-sm focus:ring-2 focus:ring-accent-blue/20 transition-all outline-none"
              />
            </div>
          )}
        </div>
      </div>

      {/* Main Content List */}
      {activeTab === 'analytics' ? (
        <InterviewAnalytics 
          requests={visibleRequests}
          rounds={visibleRounds}
          candidates={candidates}
          team={team}
        />
      ) : activeTab === 'team_status' ? (
        <ProxyTeamStatus 
          team={team}
          onUpdateUser={async (userId, updates) => {
            try {
               await updateDoc(doc(db, 'jpc_users', userId), updates);
               showToast('Proxy status updated successfully.', 'success');
            } catch (err) {
               showToast('Failed to update status.', 'error');
            }
          }}
        />
      ) : (
        <div className="space-y-6">
          {selectedProxyId !== 'all' && (
            <ProxyScheduleTimeline 
              proxyId={selectedProxyId}
              date={filterDate}
              rounds={rounds}
              availabilities={availabilities}
              team={team}
              candidates={candidates}
              requests={visibleRequests}
            />
          )}

          <div className="grid grid-cols-1 gap-6">
          <AnimatePresence mode="popLayout">
          {filteredData.map((req, idx) => {
            const candidate = candidates.find(c => c.id === req.candidate_id);
            const reqRounds = visibleRounds.filter(r => r.request_id === req.id);
            const recruiter = team.find(u => String(u.id) === String(req.recruiter_id));
            const cs = team.find(u => String(u.id) === String(req.cs_id));

            return (
              <motion.div
                key={req.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-bg-secondary border border-border-primary rounded-3xl sm:rounded-[40px] p-5 sm:p-8 hover:shadow-2xl hover:shadow-accent-blue/5 transition-all group relative overflow-hidden"
              >
                <div className="flex flex-col lg:flex-row gap-8">
                  {/* Left: Info */}
                  <div className="flex-1 space-y-6">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border",
                        req.overall_status === 'live' ? "bg-accent-red/10 text-accent-red border-accent-red/20 animate-pulse" :
                        req.overall_status === 'completed' ? "bg-accent-green/10 text-accent-green border-accent-green/20" :
                        "bg-accent-blue/10 text-accent-blue border-accent-blue/20"
                      )}>
                        {req.overall_status.replace('_', ' ')}
                      </div>
                      {!req.proxy_required && (
                        <div className="px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border bg-accent-purple/10 text-accent-purple border-accent-purple/20 flex items-center gap-1.5">
                          <UserIcon className="w-3 h-3" />
                          Self Attended
                        </div>
                      )}
                      <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Created {new Date(req.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex-1">
                        <h3 className="text-2xl font-black text-text-primary flex items-center gap-2 flex-wrap">
                          <UserIcon className="w-6 h-6 text-accent-blue" />
                          {candidate?.full_name || 'Candidate Name'}
                          {candidate?.is_free_trial && (
                            <FreeTrialBadge 
                              startDate={candidate.free_trial_start_date}
                              endDate={candidate.free_trial_end_date}
                              size="md"
                              showDaysRemaining={true}
                            />
                          )}
                        </h3>
                        <div className="flex flex-wrap gap-4 mt-2">
                          <div className="flex items-center gap-2 text-sm text-text-secondary">
                            <Building className="w-4 h-4" />
                            <span className="font-bold text-text-primary">{req.interview_company_name}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-text-secondary">
                            <Briefcase className="w-4 h-4" />
                            <span className="font-bold text-text-primary">{req.job_title}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-3 mt-4">
                          {(candidate?.resume_url || candidate?.resume_base64) && (
                            <button
                              onClick={() => handleViewFile(
                                candidate.resume_url || candidate.resume_base64 || '', 
                                candidate.resume_filename || 'resume.pdf'
                              )}
                              className="flex items-center gap-2 px-3 py-1.5 bg-bg-tertiary border border-border-primary rounded-xl text-[10px] font-black text-text-primary hover:bg-bg-tertiary/80 transition-all uppercase tracking-widest cursor-pointer animate-none"
                            >
                              <FileText className="w-3.5 h-3.5 text-accent-blue" />
                              View Resume
                            </button>
                          )}
                          {req.job_link && (
                            <a 
                              href={req.job_link} 
                              target="_blank" 
                              rel="noreferrer"
                              className="flex items-center gap-2 px-3 py-1.5 bg-bg-tertiary border border-border-primary rounded-xl text-[10px] font-black text-text-primary hover:bg-bg-tertiary/80 transition-all uppercase tracking-widest"
                            >
                              <ExternalLink className="w-3.5 h-3.5 text-accent-blue" />
                              Open Job Link
                            </a>
                          )}
                          {candidate?.whatsapp && (
                             <a 
                               href={`https://wa.me/${candidate.whatsapp.replace(/\D/g, '')}`}
                               target="_blank" 
                               rel="noreferrer"
                               className="flex items-center gap-2 px-3 py-1.5 bg-bg-tertiary border border-border-primary rounded-xl text-[10px] font-black text-text-primary hover:bg-bg-tertiary/80 transition-all uppercase tracking-widest"
                             >
                               <MessageCircle className="w-3.5 h-3.5 text-accent-green" />
                               WhatsApp Candidate
                             </a>
                          )}
                        </div>

                        {req.job_description && (
                          <div className="mt-4 p-4 bg-bg-tertiary rounded-2xl border border-border-primary max-w-2xl">
                            <div className="flex items-center gap-2 mb-2 text-[10px] font-black text-text-muted uppercase tracking-widest">
                              <FileText className="w-3 h-3 text-accent-blue" />
                              Job Description
                            </div>
                            <p className="text-xs text-text-secondary line-clamp-3 leading-relaxed whitespace-pre-wrap">
                              {req.job_description}
                            </p>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex flex-col items-start md:items-end gap-1 shrink-0">
                        <div className="flex flex-wrap gap-2">
                          {recruiter && (
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-bg-tertiary rounded-xl border border-border-primary">
                              <div className="w-2 h-2 bg-accent-blue rounded-full" />
                              <span className="text-[10px] font-bold text-text-primary">Recruiter: {recruiter.display_name}</span>
                            </div>
                          )}
                          {cs && (
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-bg-tertiary rounded-xl border border-border-primary">
                              <div className="w-2 h-2 bg-accent-purple rounded-full" />
                              <span className="text-[10px] font-bold text-text-primary">CS: {cs.display_name}</span>
                            </div>
                          )}
                        </div>
                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mt-2">
                          WhatsApp: {req.whatsapp_number}
                        </p>
                      </div>
                    </div>

                    {/* Rounds Visualization */}
                    <div className="space-y-3">
                      <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">Interview Rounds Lifecycle</p>
                      <div className="flex flex-wrap gap-3">
                        {reqRounds.map((round, rIdx) => {
                          const proxy = team.find(u => String(u.id) === String(round.proxy_user_id));
                          return (
                            <div 
                              key={round.id}
                              className={cn(
                                "flex-1 min-w-[200px] p-4 rounded-3xl border transition-all",
                                round.status === 'confirmed' ? "bg-accent-green/5 border-accent-green/20" :
                                round.status === 'booked' ? "bg-accent-blue/5 border-accent-blue/20" :
                                "bg-bg-tertiary border-border-primary"
                              )}
                            >
                              <div className="flex justify-between items-start mb-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Round {rIdx + 1}: {round.round_label}</span>
                                <div className={cn(
                                  "px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase",
                                  round.status === 'confirmed' ? "bg-accent-green/20 text-accent-green" : "bg-bg-secondary text-text-muted"
                                )}>
                                  {round.status}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 mb-3">
                                <Calendar className="w-3.5 h-3.5 text-text-muted" />
                                <span className="text-xs font-bold text-text-primary">
                                  {round.booked_slot_time || round.interview_date 
                                    ? parseLocalTimeToDate(round.booked_slot_time || round.interview_date, 'America/New_York').toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' }) + ' EST' 
                                    : 'Not Scheduled'}
                                </span>
                              </div>
                              
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 overflow-hidden">
                                  <div className={cn(
                                    "w-5 h-5 rounded-lg flex items-center justify-center border shrink-0",
                                    !req.proxy_required ? "bg-accent-purple/10 border-accent-purple/20" : "bg-bg-secondary border-border-primary"
                                  )}>
                                    <UserIcon className={cn("w-3 h-3", !req.proxy_required ? "text-accent-purple" : "text-text-muted")} />
                                  </div>
                                  <span className={cn(
                                    "text-[10px] font-bold truncate",
                                    !req.proxy_required ? "text-accent-purple" : "text-text-secondary"
                                  )}>
                                    {!req.proxy_required ? 'Self Attended' : (proxy?.display_name || 'No Proxy Assigned')}
                                  </span>
                                  {req.proxy_required && canAssignProxy && (
                                    <button
                                      onClick={() => { setIsRequestModalOpen(false); setProxyAssignmentConfig({ request: req, round }); }}
                                      className="ml-1 p-1 hover:bg-accent-blue/10 rounded-lg transition-colors group/btn"
                                      title="Assign Proxy"
                                    >
                                      <FileEdit className="w-3 h-3 text-accent-blue opacity-50 group-hover/btn:opacity-100" />
                                    </button>
                                  )}
                                </div>
                                {round.booking_link_token ? (
                                  <button 
                                    onClick={() => copyBookingLink(round.booking_link_token!)}
                                    className="p-1.5 text-accent-blue hover:bg-accent-blue/10 rounded-lg transition-all"
                                    title="Copy Booking Link"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                  </button>
                                ) : (
                                  canCreateRequest && (
                                    <button 
                                      onClick={() => handleGenerateLink(req.id, round.id)}
                                      className="text-[9px] font-bold text-accent-blue hover:underline"
                                    >
                                      Generate Link
                                    </button>
                                  )
                                )}
                                {canEditProtectedAll && (
                                  <button 
                                    onClick={() => setDirectScheduleConfig({ request: req, round })}
                                    className="ml-2 text-[9px] font-bold text-accent-purple hover:underline"
                                  >
                                    {round.interview_date ? 'Edit Schedule' : 'Set Schedule'}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex flex-col gap-3 w-full lg:w-[220px] lg:min-w-[220px] justify-center p-4 sm:p-6 bg-bg-tertiary/50 rounded-2xl sm:rounded-[32px] border border-border-primary/50">
                    <button 
                      onClick={() => setSelectedDetailRequest(req)}
                      className="w-full py-4 bg-bg-tertiary text-text-primary text-xs font-bold rounded-2xl border border-border-primary hover:bg-bg-tertiary/80 transition-all flex items-center justify-center gap-2"
                    >
                       View Full Details
                    </button>
                    
                    {(user?.role === 'jpc_recruiter' || user?.role === 'jpc_marketing' || user?.role === 'administrator' || user?.role === 'jpc_manager' || user?.role === 'jpc_proxy') && (req.overall_status === 'pending_request' || req.overall_status === 'booking_link_generated') && (
                      <button 
                        onClick={() => {
                          const roundWithLink = reqRounds.find(r => r.booking_link_token);
                          if (roundWithLink) {
                            copyBookingLink(roundWithLink.booking_link_token!);
                          } else {
                            const roundToGen = reqRounds.find(r => !r.booking_link_token);
                            if (roundToGen) handleGenerateLink(req.id, roundToGen.id);
                          }
                        }}
                        className="w-full py-4 bg-accent-blue text-white text-xs font-bold rounded-2xl hover:bg-accent-blue/90 shadow-xl shadow-accent-blue/20 flex items-center justify-center gap-2"
                      >
                        <Share2 className="w-4 h-4" />
                        {req.proxy_required ? 'Share Booking Link' : 'Share Interview Info'}
                      </button>
                    )}

                    {reqRounds.find(r => r.booking_link_token) && (
                      <button 
                        onClick={() => {
                          const roundWithLink = reqRounds.find(r => r.booking_link_token);
                          if (!roundWithLink) return;
                          const url = `${window.location.origin}/#book-interview/${roundWithLink.booking_link_token}`;
                          const text = `Hi ${candidate?.full_name}, please find the interview details for ${req.interview_company_name} here: ${url}`;
                          window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                        }}
                        className="w-full py-4 bg-accent-green text-white text-xs font-bold rounded-2xl hover:bg-accent-green/90 shadow-xl shadow-accent-green/20 flex items-center justify-center gap-2 transition-all mt-3"
                      >
                        <MessageCircle className="w-4 h-4" />
                        Share via WhatsApp
                      </button>
                    )}

                    {canAssignProxy && ['candidate_slot_selected', 'proxy_assigned', 'confirmed', 'live'].includes(req.overall_status) && (
                      <button 
                        onClick={() => {
                          const round = reqRounds.find(r => r.booked_slot_time && !r.proxy_user_id) || 
                                      reqRounds.find(r => r.status === 'booked' && !r.proxy_user_id) ||
                                      reqRounds.find(r => r.status !== 'completed' && r.status !== 'cancelled') ||
                                      reqRounds[0];
                          
                          if (round) {
                            setIsRequestModalOpen(false); setProxyAssignmentConfig({ request: req, round });
                          } else {
                            showToast('Could not identify a round for assignment', 'error');
                          }
                        }}
                        className="w-full py-4 bg-accent-amber text-white text-xs font-bold rounded-2xl hover:bg-accent-amber/90 shadow-xl shadow-accent-amber/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
                      >
                        <UserIcon className="w-4 h-4" />
                        {reqRounds.some(r => r.proxy_user_id) ? 'Reassign Proxy' : 'Assign Proxy to Slot'}
                      </button>
                    )}

                    {(user?.role === 'jpc_recruiter' || user?.role === 'jpc_marketing' || user?.role === 'administrator' || user?.role === 'jpc_manager' || user?.role === 'jpc_proxy') && req.overall_status === 'booking_link_generated' && (
                      <button 
                        onClick={() => {
                          const roundWithLink = reqRounds.find(r => r.booking_link_token);
                          if (roundWithLink) copyBookingLink(roundWithLink.booking_link_token!);
                        }}
                        className="w-full py-4 bg-bg-tertiary text-accent-blue text-xs font-bold rounded-2xl border border-accent-blue/20 hover:bg-accent-blue/5 flex items-center justify-center gap-2 transition-all"
                      >
                        <Copy className="w-4 h-4" />
                        Copy Booking Link
                      </button>
                    )}

                    {(() => {
                      const canViewFeedback = (
                        user?.role === 'administrator' || 
                        user?.role === 'jpc_sysadmin' || 
                        user?.role === 'jpc_manager' || 
                        user?.role === 'jpc_recruiter' || 
                        user?.role === 'jpc_marketing' || 
                        user?.role === 'jpc_cs' || 
                        user?.role === 'jpc_proxy'
                      );
                      
                      return canViewFeedback && (req.overall_status === 'feedback_added' || req.overall_status === 'completed') && (
                        <button 
                          onClick={() => {
                             const round = reqRounds.find(r => r.status === 'completed' && feedbacks.some(f => f.interview_round_id === r.id));
                             if (round) {
                               const fb = feedbacks.find(f => f.interview_round_id === round.id);
                               if (fb) setSelectedFeedbackRound({ round, feedback: fb });
                             }
                          }}
                          className="w-full py-4 bg-bg-tertiary text-text-primary text-xs font-bold rounded-2xl border border-border-primary hover:bg-bg-tertiary/80 transition-all flex items-center justify-center gap-2"
                        >
                           <FileSearch className="w-4 h-4 text-accent-blue" />
                           View Technical Feedback
                        </button>
                      );
                    })()}

                    {(user?.role === 'jpc_recruiter' || user?.role === 'jpc_marketing' || user?.role === 'administrator' || user?.role === 'jpc_manager' || user?.role === 'jpc_proxy') && (req.overall_status === 'feedback_added' || req.overall_status === 'completed') && reqRounds.some(r => r.status === 'completed' && r.result === 'pending') && (
                      <button 
                        onClick={() => {
                           const round = reqRounds.find(r => r.status === 'completed' && r.result === 'pending');
                           if (round) {
                             setResultUpdateConfig({ request: req, round });
                           } else if (reqRounds.length > 0) {
                             setResultUpdateConfig({ request: req, round: reqRounds[reqRounds.length - 1] });
                           }
                        }}
                        className="w-full py-4 bg-accent-green text-white text-xs font-bold rounded-2xl hover:bg-accent-green/90 shadow-xl shadow-accent-green/20 flex items-center justify-center gap-2"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Update Final Result
                      </button>
                    )}

                    {(user?.role === 'jpc_recruiter' || user?.role === 'jpc_marketing' || user?.role === 'administrator' || user?.role === 'jpc_manager' || user?.role === 'jpc_proxy') && (req.overall_status === 'confirmed' || req.overall_status === 'live' || req.overall_status === 'proxy_assigned' || req.overall_status === 'candidate_slot_selected') && (
                      <button 
                        onClick={() => {
                           const round = reqRounds.find(r => r.status !== 'completed' && r.status !== 'cancelled');
                           if (round) handleReschedule(req, round);
                        }}
                        className="w-full py-4 bg-accent-amber/10 text-accent-amber text-xs font-bold rounded-2xl border border-accent-amber/20 hover:bg-accent-amber/20 flex items-center justify-center gap-2 transition-all"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Trigger Reschedule
                      </button>
                    )}

                    {user?.role === 'jpc_proxy' && (req.overall_status === 'confirmed' || req.overall_status === 'proxy_assigned') && (
                      <button 
                        onClick={() => {
                          const round = reqRounds.find(r => r.proxy_user_id === user.id && r.status !== 'completed');
                          if (round) {
                            setIsRequestModalOpen(false); setProxyAssignmentConfig({ request: req, round }); // This is for assignment, wait, if assigned they should see feedback
                            window.location.hash = '#interviews-proxy';
                          } else {
                            showToast('Please check your Proxy Support dashboard', 'info');
                          }
                        }}
                        className="w-full py-4 bg-accent-blue text-white text-xs font-bold rounded-2xl hover:bg-accent-blue/90 shadow-xl shadow-accent-blue/20 flex items-center justify-center gap-2"
                      >
                         <Video className="w-4 h-4" />
                         Check Assignment
                      </button>
                    )}

                    {user?.role === 'jpc_proxy' && req.overall_status === 'live' && (
                      <button 
                        onClick={() => {
                           window.location.hash = '#interviews-proxy';
                        }}
                        className="w-full py-4 bg-accent-purple text-white text-xs font-bold rounded-2xl hover:bg-accent-purple/90 shadow-xl shadow-accent-purple/20 flex items-center justify-center gap-2"
                      >
                        <MessageSquare className="w-4 h-4" />
                        Go to Evaluation
                      </button>
                    )}

                    <div className="pt-4 border-t border-border-primary space-y-3">
                      {(
                        user?.role === 'administrator' || 
                        user?.role === 'jpc_manager' || 
                        user?.role === 'jpc_cs' || 
                        user?.role === 'jpc_proxy' || 
                        ((user?.role === 'jpc_recruiter' || user?.role === 'jpc_marketing') && (String(req.created_by) === String(user.id) || String(req.recruiter_id) === String(user.id)))
                      ) && (
                        <button 
                          onClick={() => handleDeleteRequest(req.id)}
                          className="w-full py-3 bg-rose-500/10 text-rose-500 text-[10px] font-black uppercase tracking-widest rounded-xl border border-rose-500/20 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center gap-2 mb-2"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete Interview
                        </button>
                      )}
                      <div className="flex items-center justify-between text-[10px] text-text-muted font-bold px-2">
                        <span>RESUME:</span>
                        <button 
                          onClick={() => {
                            if (candidate?.resume_url || candidate?.resume_base64) {
                              handleViewFile(
                                candidate.resume_url || candidate.resume_base64 || '', 
                                candidate.resume_filename || `${candidate.full_name.replace(/\s+/g, '_')}_Resume`
                              );
                            } else {
                              showToast('No resume currently attached to this candidate.', 'info');
                            }
                          }}
                          className="text-accent-blue hover:underline flex items-center gap-1"
                        >
                          View <ExternalLink className="w-2.5 h-2.5" />
                        </button>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-text-muted font-bold px-2 mt-2">
                        <span>JOB LINK:</span>
                        <a 
                          href={req.job_link} 
                          target="_blank" 
                          className="text-accent-blue hover:underline flex items-center gap-1"
                        >
                          Open <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Decorative Elements */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-accent-blue/5 blur-3xl rounded-full translate-x-1/2 -translate-y-1/2 pointer-events-none" />
              </motion.div>
            );
          })}
        </AnimatePresence>

        {filteredData.length === 0 && (
          <div className="text-center py-32 bg-bg-secondary border border-border-primary border-dashed rounded-[60px]">
            <Calendar className="w-20 h-20 text-text-muted mx-auto mb-6 opacity-20" />
            <h3 className="text-2xl font-black text-text-primary tracking-tight">No interviews in this section</h3>
            <p className="text-text-secondary mt-2 max-w-md mx-auto">Try switching tabs or adjusting your search to find what you're looking for.</p>
          </div>
        )}
      </div>
    </div>
  )}

      {/* Creation Modal */}
      {isRequestModalOpen && (
        <RequestModal 
          onClose={() => setIsRequestModalOpen(false)}
          candidates={candidates}
          team={team}
          allRounds={rounds}
          allAvailabilities={availabilities}
          allCalendarEvents={calendarEvents}
          onSuccess={() => {
            setIsRequestModalOpen(false);
            showToast('Interview request created!', 'success');
          }}
        />
      )}

      {/* Proxy Assignment Modal */}
      {proxyAssignmentConfig && (
        <ProxyAssignmentModal
          isOpen={!!proxyAssignmentConfig}
          onClose={() => setProxyAssignmentConfig(null)}
          round={proxyAssignmentConfig.round}
          request={proxyAssignmentConfig.request}
          team={team}
          allRounds={rounds}
          allAvailabilities={availabilities}
          allCalendarEvents={calendarEvents}
          onSuccess={() => {
            setProxyAssignmentConfig(null);
            showToast('Proxy assigned successfully!', 'success');
          }}
        />
      )}

      {/* Direct Schedule Modal */}
      {directScheduleConfig && (
        <DirectScheduleModal
          onClose={() => setDirectScheduleConfig(null)}
          round={directScheduleConfig.round}
          request={directScheduleConfig.request}
          onSuccess={() => {
            setDirectScheduleConfig(null);
            showToast('Schedule set successfully!', 'success');
          }}
        />
      )}

      {/* Result Update Modal */}
      {resultUpdateConfig && (
        <ResultUpdateModal
          onClose={() => setResultUpdateConfig(null)}
          round={resultUpdateConfig.round}
          request={resultUpdateConfig.request}
          onSuccess={() => {
            setResultUpdateConfig(null);
            showToast('Result updated successfully!', 'success');
          }}
        />
      )}

      {/* Feedback View Modal */}
      {selectedFeedbackRound && (
        <FeedbackViewModal
          onClose={() => setSelectedFeedbackRound(null)}
          round={selectedFeedbackRound.round}
          feedback={selectedFeedbackRound.feedback}
        />
      )}

      {/* Full Details Modal */}
      {selectedDetailRequest && (
        <InterviewDetailsModal
          request={selectedDetailRequest}
          onClose={() => setSelectedDetailRequest(null)}
          rounds={rounds}
          candidates={candidates}
          team={team}
          feedbacks={feedbacks}
          availabilities={availabilities}
          calendarEvents={calendarEvents}
          canEdit={canEditProtectedAll}
        />
      )}

      {substitutionRequest && (
        <ResumeSubstitutionModal
          isOpen={!!substitutionRequest}
          onClose={() => setSubstitutionRequest(null)}
          request={substitutionRequest}
        />
      )}
    </div>
  );
};

const ProxyScheduleTimeline: React.FC<{
  proxyId: string;
  date: string;
  rounds: InterviewRound[];
  availabilities: ProxyAvailability[];
  team: User[];
  candidates: Candidate[];
  requests: InterviewSupportRequest[];
}> = ({ proxyId, date, rounds, availabilities, team, candidates, requests }) => {
  const proxy = team.find(u => String(u.id) === proxyId);
  if (!proxy) return null;

  const targetDate = date ? parseLocalTimeToDate(`${date}T00:00:00`, 'America/New_York') : new Date();


  return (
    <div className="mb-8">
      <SlotVisualizer 
        rounds={rounds} 
        availabilities={availabilities} 
        date={targetDate}
        proxyId={proxyId}
      />
    </div>
  );
};

const ProxyTeamStatus: React.FC<{
  team: User[];
  onUpdateUser: (userId: string, updates: Partial<User>) => Promise<void>;
}> = ({ team, onUpdateUser }) => {
  const proxies = team.filter(isProxyUser);
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {proxies.map(p => (
        <ProxyMemberCard key={p.id} proxy={p} onUpdate={onUpdateUser} />
      ))}
    </div>
  );
};

const ProxyMemberCard: React.FC<{
  proxy: User;
  onUpdate: (userId: string, updates: Partial<User>) => Promise<void>;
}> = ({ proxy, onUpdate }) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [leaveReturn, setLeaveReturn] = useState(proxy.leave_return_date || '');

  const toggleLeave = async () => {
    setIsUpdating(true);
    await onUpdate(String(proxy.id), { is_on_leave: !proxy.is_on_leave });
    setIsUpdating(false);
  };

  const updateReturnDate = async () => {
    setIsUpdating(true);
    await onUpdate(String(proxy.id), { leave_return_date: leaveReturn || null });
    setIsUpdating(false);
  };

  const isOnLeave = useMemo(() => {
    if (proxy.is_on_leave) return true;
    if (proxy.leave_return_date) {
      const returnDate = parseLocalTimeToDate(proxy.leave_return_date);
      // For a visual hint, check against current EST time
      const nowEST = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
      return !isNaN(returnDate.getTime()) && returnDate > nowEST;
    }
    return false;
  }, [proxy.is_on_leave, proxy.leave_return_date]);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-bg-secondary p-8 rounded-[40px] border border-border-primary shadow-sm hover:border-accent-blue/30 transition-all group"
    >
      <div className="flex items-center gap-4 mb-6">
        <div className={cn(
          "w-16 h-16 rounded-[24px] flex items-center justify-center text-2xl font-black border transition-all",
          isOnLeave ? "bg-accent-red/10 border-accent-red/20 text-accent-red" : "bg-accent-green/10 border-accent-green/20 text-accent-green"
        )}>
          {proxy.display_name.charAt(0)}
        </div>
        <div>
          <h4 className="text-xl font-black text-text-primary tracking-tight">{proxy.display_name}</h4>
          <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">{proxy.username}</p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between p-4 bg-bg-tertiary rounded-2xl border border-border-primary">
          <div>
            <p className="text-xs font-black text-text-primary">Indefinite Leave</p>
            <p className="text-[10px] text-text-muted font-bold">Manual override status</p>
          </div>
          <button 
            disabled={isUpdating}
            type="button"
            onClick={toggleLeave}
            className={cn(
              "w-14 h-8 rounded-full relative transition-all duration-300 border",
              proxy.is_on_leave ? "bg-accent-red border-accent-red" : "bg-bg-secondary border-border-primary"
            )}
          >
            <div className={cn(
              "w-6 h-6 rounded-full bg-white absolute top-0.5 transition-all",
              proxy.is_on_leave ? "right-0.5 shadow-sm" : "left-0.5 border border-border-primary"
            )} />
          </button>
        </div>

        <div className="space-y-3">
          <label className="text-[10px] font-black text-text-muted uppercase tracking-widest px-1">On Leave Until (EST)</label>
          <div className="flex gap-2">
            <input 
              type="datetime-local"
              value={leaveReturn}
              onChange={e => setLeaveReturn(e.target.value)}
              className="flex-1 px-4 py-3 bg-bg-tertiary border border-border-primary rounded-xl text-xs font-bold text-text-primary focus:ring-2 focus:ring-accent-blue/20 outline-none"
            />
            <button 
              type="button"
              onClick={updateReturnDate}
              disabled={isUpdating}
              className="p-3 bg-accent-blue text-white rounded-xl hover:bg-accent-blue/90 transition-all disabled:opacity-50"
            >
              <CheckCircle2 className="w-5 h-5" />
            </button>
          </div>
          <p className="text-[9px] text-text-muted font-bold leading-relaxed px-1 italic">
            * Assignments and availability checks will automatically resume once this time passes.
          </p>
        </div>

        {isOnLeave && (
          <div className="flex items-center gap-2 p-3 bg-accent-red/5 border border-accent-red/10 rounded-xl">
            <AlertCircle className="w-4 h-4 text-accent-red" />
            <span className="text-[10px] font-black text-accent-red uppercase tracking-wider">Currently Unavailable</span>
          </div>
        )}
      </div>
    </motion.div>
  );
};

const FeedbackViewModal: React.FC<{
  onClose: () => void;
  round: InterviewRound;
  feedback: InterviewFeedback;
}> = ({ onClose, round, feedback }) => {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[60] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 40 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-bg-secondary w-full max-w-2xl rounded-[48px] shadow-2xl overflow-hidden border border-border-primary"
      >
        <div className="p-10">
          <div className="flex items-center justify-between mb-8">
            <div>
              <span className="text-[10px] font-black text-accent-blue uppercase tracking-[0.3em]">Technical Evaluation</span>
              <h2 className="text-3xl font-black text-text-primary tracking-tight mt-1">{round.round_label}</h2>
              <p className="text-xs font-bold text-text-muted mt-2">Submitted on {new Date(feedback.created_at).toLocaleString('en-US', { timeZone: 'America/New_York' })} EST</p>
            </div>
            <button onClick={onClose} className="p-3 hover:bg-bg-tertiary rounded-2xl transition-colors">
              <X className="w-6 h-6 text-text-muted" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-6">
              <div className="p-6 bg-bg-tertiary rounded-3xl border border-border-primary">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4 text-accent-blue" />
                  <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">Interview Notes</span>
                </div>
                <p className="text-sm font-medium text-text-primary leading-relaxed whitespace-pre-wrap">
                  {feedback.interview_notes || 'No specific notes recorded.'}
                </p>
              </div>

              <div className="p-6 bg-bg-tertiary rounded-3xl border border-border-primary">
                <div className="flex items-center gap-2 mb-3">
                  <Trophy className="w-4 h-4 text-accent-amber" />
                  <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">Candidate Performance</span>
                </div>
                <p className="text-sm font-medium text-text-primary leading-relaxed whitespace-pre-wrap">
                  {feedback.candidate_performance || 'Performance notes not provided.'}
                </p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="p-6 bg-bg-tertiary rounded-3xl border border-border-primary">
                <div className="flex items-center gap-2 mb-3">
                  <HelpCircle className="w-4 h-4 text-accent-purple" />
                  <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">Questions Asked</span>
                </div>
                <div className="space-y-2">
                  {feedback.questions_asked.split('\n').filter(q => q.trim()).map((q, i) => (
                    <div key={i} className="flex gap-3 text-sm text-text-secondary">
                      <span className="font-black text-accent-blue/40">{i + 1}.</span>
                      <p>{q}</p>
                    </div>
                  )) || 'No questions logged.'}
                </div>
              </div>

              <div className="p-6 bg-bg-tertiary rounded-3xl border border-border-primary">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-black text-text-muted uppercase tracking-widest px-1">Evaluation Verdict</span>
                  <div className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                    feedback.result === 'next_round' ? "bg-accent-blue/10 text-accent-blue" :
                    feedback.result === 'offer' ? "bg-accent-green/10 text-accent-green" :
                    feedback.result === 'rejected' ? "bg-accent-red/10 text-accent-red" :
                    "bg-bg-secondary text-text-muted"
                  )}>
                    {feedback.result.replace('_', ' ')}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex-1 p-4 bg-bg-secondary rounded-2xl border border-border-primary text-center">
                    <p className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Attended</p>
                    <p className="text-xs font-black text-text-primary">{feedback.attended ? 'YES' : 'NO'}</p>
                  </div>
                  <div className="flex-1 p-4 bg-bg-secondary rounded-2xl border border-border-primary text-center">
                    <p className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Support Provided</p>
                    <p className="text-xs font-black text-text-primary">{feedback.proxy_support_provided ? 'YES' : 'NO'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 flex justify-end">
            <button 
              onClick={onClose}
              className="px-10 py-4 bg-bg-tertiary text-text-primary font-bold rounded-2xl hover:bg-bg-tertiary/80 transition-all border border-border-primary"
            >
              Close Evaluation
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const ResultUpdateModal: React.FC<{
  onClose: () => void;
  round: InterviewRound;
  request: InterviewSupportRequest;
  onSuccess: () => void;
}> = ({ onClose, round, request, onSuccess }) => {
  const { user } = useAuth();
  const [result, setResult] = useState<InterviewRound['result']>('pending');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleUpdate = async () => {
    if (result === 'pending' || !user) return;
    setIsSubmitting(true);
    try {
      // 1. Update Round Result
      await updateInterviewRound(round.id, {
        result
      });

      // 2. Log Activity
      await logInterviewActivity(round.id, 'RESULT_FINALIZED', { result }, user.id as string);

      // 3. Update Request status based on result
      let newStatus = request.overall_status;
      if (result === 'offer') newStatus = 'placed';
      else if (result === 'rejected') newStatus = 'rejected';
      
      await updateInterviewSupportRequest(request.id, {
        overall_status: newStatus
      });

      // 4. Update Candidate Pipeline Stage
      if (result === 'offer') {
        await updateCandidate(request.candidate_id, { current_stage: 'offer' });
      } else if (result === 'rejected' && request.overall_status !== 'placed') {
        // Only move back if they haven't already been placed elsewhere (though unlikely in current flow)
        await updateCandidate(request.candidate_id, { current_stage: 'application_tracking' });
      }

      // 5. Notify Proxy
      if (round.proxy_user_id) {
        await addInterviewNotification({
          recipient_user_id: round.proxy_user_id,
          interview_round_id: round.id,
          notification_type: 'result_updated',
          message: `The final result for ${request.interview_company_name} interview you supported has been updated to: ${result.replace('_', ' ')}.`
        });
      }

      onSuccess();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[60] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 40 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-bg-secondary w-full max-w-md rounded-[48px] shadow-2xl overflow-hidden border border-border-primary"
      >
        <div className="p-10">
          <div className="flex items-center justify-between mb-8">
            <div>
              <span className="text-[10px] font-black text-accent-green uppercase tracking-[0.3em]">Decision Console</span>
              <h2 className="text-3xl font-black text-text-primary tracking-tight mt-1">Company Result</h2>
              <p className="text-xs font-bold text-text-muted mt-2">Log the final result received from the client company.</p>
            </div>
            <button onClick={onClose} className="p-3 hover:bg-bg-tertiary rounded-2xl transition-colors">
              <X className="w-6 h-6 text-text-muted" />
            </button>
          </div>

          <div className="space-y-6">
            <div className="space-y-4">
              <label className="text-[10px] font-black text-text-muted uppercase tracking-widest px-1 text-center block">Select Company Verdict</label>
              <div className="grid grid-cols-1 gap-3">
                {[
                  { id: 'pending', label: 'Pending Result', color: 'text-text-muted', bg: 'bg-bg-tertiary', border: 'border-border-primary' },
                  { id: 'next_round', label: 'Next Round', color: 'text-accent-blue', bg: 'bg-accent-blue/10', border: 'border-accent-blue/30' },
                  { id: 'offer', label: 'Offer Received', color: 'text-accent-green', bg: 'bg-accent-green/10', border: 'border-accent-green/30' },
                  { id: 'rejected', label: 'Candidate Rejected', color: 'text-accent-red', bg: 'bg-accent-red/10', border: 'border-accent-red/30' }
                ].map(item => (
                  <button
                    key={item.id}
                    onClick={() => setResult(item.id as any)}
                    className={cn(
                      "w-full py-5 rounded-3xl border font-black uppercase tracking-widest transition-all text-center",
                      result === item.id 
                        ? cn(item.bg, item.border, item.color, "ring-2 ring-offset-2 ring-offset-bg-secondary")
                        : "bg-bg-tertiary border-border-primary text-text-muted hover:border-text-muted"
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-4 pt-6">
              <button 
                type="button" 
                onClick={onClose}
                className="flex-1 py-4 bg-bg-tertiary text-text-primary font-bold rounded-[20px] hover:bg-bg-tertiary/80 transition-all text-sm"
              >
                Cancel
              </button>
              <button 
                onClick={handleUpdate}
                disabled={result === 'pending' || isSubmitting}
                className="flex-1 py-4 bg-accent-green text-white font-bold rounded-[20px] hover:bg-accent-green/90 shadow-xl shadow-accent-green/20 transition-all text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                Save Result
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const DirectScheduleModal: React.FC<{
  onClose: () => void;
  round: InterviewRound;
  request: InterviewSupportRequest;
  onSuccess: () => void;
}> = ({ onClose, round, request, onSuccess }) => {
  const [date, setDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clearPrevious, setClearPrevious] = useState(true);

  const handleUpdate = async () => {
    if (!date) return;
    setIsSubmitting(true);
    try {
      const parts = date.split('T');
      const bookedStart = date.length === 16 ? `${date}:00` : date;
      
      // Calculate booked_slot_end based on round duration
      const startD = new Date(bookedStart);
      const duration = round.duration_minutes || 30;
      const endD = new Date(startD.getTime() + duration * 60 * 1000);
      const y = endD.getFullYear();
      const m = String(endD.getMonth() + 1).padStart(2, '0');
      const dVal = String(endD.getDate()).padStart(2, '0');
      const hh = String(endD.getHours()).padStart(2, '0');
      const mm = String(endD.getMinutes()).padStart(2, '0');
      const bookedEnd = `${y}-${m}-${dVal}T${hh}:${mm}:00`;

      if (clearPrevious) {
        console.log(`[DirectScheduleModal] Clearing previous calendar events for round ${round.id}`);
        await clearPreviousCalendarEvents(round.id);
      }

      await updateInterviewRound(round.id, {
        interview_date: parts[0],
        booked_slot_time: bookedStart,
        booked_slot_end: bookedEnd,
        status: 'confirmed'
      });
      await updateInterviewSupportRequest(request.id, {
        overall_status: 'confirmed'
      });

      // Calendar events sync if proxy is assigned
      const assignedProxyId = round.proxy_user_id || request.proxy_user_id;
      if (assignedProxyId) {
        // Trigger Google Calendar integration API call
        try {
          await syncInterviewRoundToGoogleCalendar(round.id, request.id, String(assignedProxyId));
        } catch (calErr) {
          console.error('[DirectScheduleModal] Sync error:', calErr);
        }

        // Fetch candidate name for notification message
        let candidateName = 'Candidate';
        if (request.candidate_id) {
          try {
            const candDoc = await getDoc(doc(db, 'jpc_candidates', request.candidate_id));
            if (candDoc.exists()) {
              candidateName = candDoc.data().full_name || 'Candidate';
            }
          } catch (e) {
            console.error('Error fetching candidate name:', e);
          }
        }

        // Notify proxy of the manual update
        const now = new Date().toISOString();
        await addDoc(collection(db, 'jpc_interview_notifications'), {
          interview_round_id: round.id,
          notification_type: 'slot_selected',
          recipient_user_id: assignedProxyId,
          message: `Interview Scheduled/Updated! Candidate ${candidateName} has been booked for ${parseLocalTimeToDate(bookedStart, 'America/New_York').toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' })} EST.`,
          is_read: false,
          created_at: now
        });
      }

      onSuccess();
    } catch (error) {
       console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[60] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 40 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-bg-secondary w-full max-w-md rounded-[48px] shadow-2xl overflow-hidden border border-border-primary"
      >
        <div className="p-10">
          <div className="flex items-center justify-between mb-8">
            <div>
              <span className="text-[10px] font-black text-accent-blue uppercase tracking-[0.3em]">Direct Entry</span>
              <h2 className="text-3xl font-black text-text-primary tracking-tight mt-1">Schedule Round</h2>
              <p className="text-xs font-bold text-text-muted mt-2">Self-attended by candidate (No Proxy)</p>
            </div>
            <button onClick={onClose} className="p-3 hover:bg-bg-tertiary rounded-2xl transition-colors">
              <X className="w-6 h-6 text-text-muted" />
            </button>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-text-muted uppercase tracking-widest px-1">Interview Date & Time</label>
              <input 
                type="datetime-local" 
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-5 py-4 bg-bg-tertiary border border-border-primary rounded-[20px] text-sm focus:ring-2 focus:ring-accent-blue/20 outline-none"
              />
            </div>

            <div className="flex items-start gap-3.5 bg-bg-tertiary border border-border-primary rounded-[20px] p-5">
              <input 
                type="checkbox" 
                id="clearPrevious"
                checked={clearPrevious}
                onChange={e => setClearPrevious(e.target.checked)}
                className="w-4 h-4 mt-0.5 text-accent-blue bg-bg-secondary border-border-primary rounded focus:ring-accent-blue/20"
              />
              <label htmlFor="clearPrevious" className="text-xs font-semibold text-text-secondary cursor-pointer select-none leading-relaxed">
                <span className="block font-black text-text-primary text-[11px] uppercase tracking-wider mb-0.5">Clear Calendar First</span>
                Delete all previous scheduled Google Calendar events and slot entries for this round to eliminate duplicates before syncing this new time.
              </label>
            </div>

            <div className="flex gap-4 pt-6">
              <button 
                type="button" 
                onClick={onClose}
                className="flex-1 py-4 bg-bg-tertiary text-text-primary font-bold rounded-[20px] hover:bg-bg-tertiary/80 transition-all text-sm"
              >
                Cancel
              </button>
              <button 
                onClick={handleUpdate}
                disabled={!date || isSubmitting}
                className="flex-1 py-4 bg-accent-blue text-white font-bold rounded-[20px] hover:bg-accent-blue/90 shadow-xl shadow-accent-blue/20 transition-all text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                Save Schedule
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const RequestModal: React.FC<{
  onClose: () => void;
  candidates: Candidate[];
  team: User[];
  allRounds: InterviewRound[];
  allAvailabilities: ProxyAvailability[];
  allCalendarEvents: any[];
  onSuccess: () => void;
}> = ({ onClose, candidates, team, allRounds, allAvailabilities, allCalendarEvents, onSuccess }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [resumeOption, setResumeOption] = useState<'existing' | 'upload'>('existing');
  const [newResumeFile, setNewResumeFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    candidate_id: '',
    company_name: '',
    interview_company_name: '',
    job_title: '',
    interview_type: 'technical' as any,
    timezone: 'America/New_York',
    notes: '',
    whatsapp_number: '',
    job_link: '',
    application_link: '',
    job_description: '',
    proxy_required: true,
    proxy_user_id: '',
    rounds: [
      { label: 'Screening', type: 'screening' as any, duration: 30, interview_date: '', start_time: '', end_time: '', slot_id: undefined as string | undefined },
      { label: 'Technical', type: 'technical' as any, duration: 60, interview_date: '', start_time: '', end_time: '', slot_id: undefined as string | undefined }
    ]
  });

  const [calSelectedDate, setCalSelectedDate] = useState<string | null>(null);
  const [filterAvailableOnly, setFilterAvailableOnly] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ASSESSMENT: Simplified conflict check for the first round (as in screenshot)
  const assignmentResult = useMemo(() => {
    const mainRound = formData.rounds[0];
    if (!mainRound?.interview_date || !mainRound?.start_time || !mainRound?.end_time) {
      return { bestProxy: null, availableProxies: [], errors: [] };
    }
    return findBestProxyForWindow(
      mainRound.interview_date,
      mainRound.start_time,
      mainRound.end_time,
      team,
      allRounds,
      allAvailabilities,
      allCalendarEvents
    );
  }, [formData.rounds, team, allRounds, allAvailabilities, allCalendarEvents]);

  const availabilityByDate = useMemo(() => {
    const map: { [date: string]: ProxyAvailability[] } = {};
    allAvailabilities.forEach(a => {
      const proxyObj = team.find(u => String(u.id) === String(a.proxy_user_id));
      if (!proxyObj || proxyObj.deleted_at || proxyObj.is_on_leave || !isProxyUser(proxyObj)) return;

      const dateStr = a.slot_start.split('T')[0];
      if (!map[dateStr]) {
        map[dateStr] = [];
      }
      map[dateStr].push(a);
    });
    // Sort slots chronologically
    Object.keys(map).forEach(dateStr => {
      map[dateStr].sort((a, b) => a.slot_start.localeCompare(b.slot_start));
    });
    return map;
  }, [allAvailabilities, team]);

  const availableDatesList = useMemo(() => {
    return Object.keys(availabilityByDate).sort();
  }, [availabilityByDate]);

  useEffect(() => {
    if (availableDatesList.length > 0 && !calSelectedDate) {
      setCalSelectedDate(availableDatesList[0]);
    }
  }, [availableDatesList, calSelectedDate]);

  const calDisplaySlots = useMemo(() => {
    if (!calSelectedDate) return [];
    const allForDay = availabilityByDate[calSelectedDate] || [];
    if (filterAvailableOnly) {
      return allForDay.filter(s => s.slot_status === 'available');
    }
    return allForDay;
  }, [calSelectedDate, availabilityByDate, filterAvailableOnly]);

  const formatTime12h = (dateTimeStr: string) => {
    try {
      const timePart = dateTimeStr.split('T')[1];
      if (!timePart) return dateTimeStr;
      const [hoursStr, minutesStr] = timePart.split(':');
      const hours = parseInt(hoursStr, 10);
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const hour12 = hours % 12 || 12;
      return `${hour12}:${minutesStr} ${ampm}`;
    } catch (e) {
      return dateTimeStr;
    }
  };

  const applySlotToRound = (roundIdx: number, slot: ProxyAvailability) => {
    const dateStr = slot.slot_start.split('T')[0];
    const startTime = slot.slot_start.split('T')[1].substring(0, 5);
    const endTime = slot.slot_end.split('T')[1].substring(0, 5);

    const newRounds = [...formData.rounds];
    if (!newRounds[roundIdx]) return;
    newRounds[roundIdx].interview_date = dateStr;
    newRounds[roundIdx].start_time = startTime;
    newRounds[roundIdx].end_time = endTime;
    newRounds[roundIdx].slot_id = slot.id;
    setFormData({ ...formData, rounds: newRounds });
    showToast(`Filled slot ${formatTime12h(slot.slot_start)} - ${formatTime12h(slot.slot_end)} onto local '${newRounds[roundIdx].label}' Interview Round!`, 'success');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const candidate = candidates.find(c => c.id === formData.candidate_id);
      
      let resumeId = candidate?.resume_filename || 'original';
      if (resumeOption === 'upload' && newResumeFile) {
        resumeId = await uploadFile(newResumeFile);
      }

      // 1. AUTO-ASSIGNMENT & BUFFER-AWARE CONFLICT ASSESSMENT FOR PROXIES
      const assignedProxiesByDay: { [date: string]: any } = {};

      if (formData.proxy_required) {
        // Enforce scheduling details
        const missingTimes = formData.rounds.some(r => !r.interview_date || !r.start_time || !r.end_time);
        if (missingTimes) {
          showToast("Please specify the Date, Start Time, and End Time for all interview rounds when proxy support is required.", "error");
          return;
        }

        // Group rounds by unique date (Same-Day Multi-rounds rules)
        const dayGroups: { [date: string]: typeof formData.rounds } = {};
        formData.rounds.forEach(r => {
          if (!dayGroups[r.interview_date]) {
            dayGroups[r.interview_date] = [];
          }
          dayGroups[r.interview_date].push(r);
        });

        // Resolve best proxy for each day (independent multi-day rule)
        for (const day of Object.keys(dayGroups)) {
          const roundsForDay = dayGroups[day];
          
          // Compute Joint boundaries (earliest start, latest end)
          let minStartHour = roundsForDay[0].start_time;
          let maxEndHour = roundsForDay[0].end_time;
          roundsForDay.forEach(r => {
            if (r.start_time < minStartHour) minStartHour = r.start_time;
            if (r.end_time > maxEndHour) maxEndHour = r.end_time;
          });

          // Perform conflict detection and workload checking
          const result = findBestProxyForWindow(
            day,
            minStartHour,
            maxEndHour,
            team,
            allRounds,
            allAvailabilities,
            allCalendarEvents
          );

          if (result.errors && result.errors.length > 0) {
            showToast(`Currently no proxy is available for the selected interview time on ${day} (${minStartHour} - ${maxEndHour}). Please choose another time.`, "error");
            return;
          }

          if (!result.bestProxy) {
            showToast(`Currently no proxy is available for the selected interview time. Please choose another time.`, "error");
            return;
          }

          assignedProxiesByDay[day] = result.bestProxy;
        }
      }

      // 2. CREATE CLIENT-SIDE MAIN RECORD
      const requestId = await addInterviewSupportRequest({
        candidate_id: formData.candidate_id,
        recruiter_id: user.id as string,
        cs_id: candidate?.assigned_cs ? String(candidate.assigned_cs) : null,
        company_name: formData.interview_company_name,
        interview_company_name: formData.interview_company_name,
        job_title: formData.job_title,
        interview_type: formData.interview_type,
        timezone: formData.timezone,
        notes: formData.notes,
        whatsapp_number: formData.whatsapp_number,
        job_link: formData.job_link,
        application_link: formData.application_link,
        job_description: formData.job_description,
        latest_resume_id: resumeId,
        proxy_required: formData.proxy_required,
        proxy_user_id: formData.proxy_required ? (Object.values(assignedProxiesByDay)[0]?.id || null) : null,
        overall_status: formData.proxy_required ? 'confirmed' : 'pending_request',
        created_by: user.id as string
      });

      if (requestId) {
        // Automatically move candidate to interviewing stage in pipeline
        await updateCandidate(formData.candidate_id, { current_stage: 'interviewing' });

        // Retrieve SMTP settings safely on client side
        let smtpSettings: any = null;
        try {
          const cached = localStorage.getItem('smtp_settings');
          if (cached) smtpSettings = JSON.parse(cached);
        } catch (e) {}

        if (!smtpSettings) {
          try {
            const snap = await getDoc(doc(db, 'jpc_settings', 'smtp_settings'));
            if (snap.exists()) {
              smtpSettings = snap.data();
              localStorage.setItem('smtp_settings', JSON.stringify(smtpSettings));
            }
          } catch (e) {
            console.error('Error fetching dynamic SMTP settings:', e);
          }
        }

        // Email recipients
        const emailRecipients = [];
        if (candidate?.assigned_recruiter) emailRecipients.push(candidate.assigned_recruiter);
        if (candidate?.assigned_cs && !emailRecipients.includes(candidate.assigned_cs)) emailRecipients.push(candidate.assigned_cs);

        // 3. PERSIST ROUNDS AND EMIT CALENDAR INVITES
        for (const round of formData.rounds) {
          let assignedProxyId: string | null = null;
          let statusStr: 'confirmed' | 'pending' = 'pending';
          let bookedStart: string | null = null;
          let bookedEnd: string | null = null;
          let durationMin = round.duration;

          if (formData.proxy_required && round.interview_date && round.start_time && round.end_time) {
            const proxyForDay = assignedProxiesByDay[round.interview_date];
            assignedProxyId = proxyForDay ? proxyForDay.id : null;
            statusStr = 'confirmed';
            bookedStart = `${round.interview_date}T${round.start_time}:00`;
            bookedEnd = `${round.interview_date}T${round.end_time}:00`;
            
            const startD = new Date(bookedStart);
            const endD = new Date(bookedEnd);
            durationMin = Math.max(15, Math.round((endD.getTime() - startD.getTime()) / 60000));
          } else if (!formData.proxy_required && round.interview_date && round.start_time && round.end_time) {
            // Recruiter can schedule the self-attended round directly too!
            statusStr = 'confirmed';
            bookedStart = `${round.interview_date}T${round.start_time}:00`;
            bookedEnd = `${round.interview_date}T${round.end_time}:00`;
            const startD = new Date(bookedStart);
            const endD = new Date(bookedEnd);
            durationMin = Math.max(15, Math.round((endD.getTime() - startD.getTime()) / 60000));
          }

          const roundId = await addInterviewRound({
            request_id: requestId,
            round_label: round.label,
            round_type: round.type,
            interview_date: round.interview_date || null,
            duration_minutes: durationMin,
            status: statusStr,
            proxy_user_id: assignedProxyId,
            booking_link_token: null,
            booked_slot_time: bookedStart,
            booked_slot_end: bookedEnd,
            live_started_at: null,
            completed_at: null,
            feedback_submitted_at: null,
            result: null,
            created_by: user.id as string
          });

          // Generate calendar sync document
          if (statusStr === 'confirmed' && bookedStart && bookedEnd) {
            const bufferStart = new Date(new Date(bookedStart).getTime() - 15 * 60 * 1000).toISOString();
            const bufferEnd = new Date(new Date(bookedEnd).getTime() + 15 * 60 * 1000).toISOString();

            await addDoc(collection(db, 'jpc_calendar_events'), {
              interview_round_id: roundId,
              interview_request_id: requestId,
              summary: `Interview Support: ${candidate?.full_name || 'Candidate'} at ${formData.interview_company_name} [${round.label}]`,
              start_time: bookedStart,
              end_time: bookedEnd,
              reserved_start: bufferStart,
              reserved_end: bufferEnd,
              proxy_user_id: assignedProxyId,
              candidate_name: candidate?.full_name || 'Candidate',
              company_name: formData.interview_company_name,
              status: 'synced',
              notifications_sent: true,
              created_at: new Date().toISOString()
            });

            // Synchronize directly with proxy's real Google Calendar
            if (assignedProxyId) {
              try {
                await syncInterviewRoundToGoogleCalendar(roundId, requestId, assignedProxyId);
              } catch (calErr) {
                console.error('[DashboardCalendar] Request modal calendar sync error:', calErr);
              }
            }

            // Send notification to proxy specifically
            if (assignedProxyId) {
              const proxyObj = team.find(u => String(u.id) === String(assignedProxyId));
              if (proxyObj?.email) {
                await fetch('/api/send-email', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    to: proxyObj.email,
                    subject: 'New Interview Auto-Assigned & Scheduled',
                    text: `Hello ${proxyObj.display_name}. You have been automatically assigned to support candidate ${candidate?.full_name || 'Candidate'}'s interview round (${round.label}) at ${formData.interview_company_name}.\nScheduled date: ${round.interview_date} at ${round.start_time} - ${round.end_time} EST (including 15m pre/post buffers).`,
                    html: `<p>Hello <strong>${proxyObj.display_name}</strong>,</p>
                           <p>You have been automatically assigned to support candidate <strong>${candidate?.full_name || 'Candidate'}</strong>'s upcoming interview round (<strong>${round.label}</strong>) at <strong>${formData.interview_company_name}</strong>.</p>
                           <ul>
                             <li><strong>Date:</strong> ${round.interview_date}</li>
                             <li><strong>Time Slot:</strong> ${round.start_time} - ${round.end_time} EST</li>
                             <li><strong>Buffered Time:</strong> ${new Date(bufferStart).toLocaleTimeString()} - ${new Date(bufferEnd).toLocaleTimeString()} EST</li>
                           </ul>
                           <p>A Google Calendar invitation has been synchronized with your account.</p>`,
                    smtpSettings: smtpSettings || undefined
                  })
                }).catch(console.error);
              }
            }
          }
        }

        // Send parent notification email to recruiters & CS
        for (const recipientId of emailRecipients) {
          const recipient = team.find(u => String(u.id) === String(recipientId));
          if (recipient?.email) {
            await fetch('/api/send-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: recipient.email,
                subject: 'New Interview Support Request Scheduled',
                text: `A new interview request has been scheduled for candidate ${candidate?.full_name || 'Candidate'} with automated proxy assignments.`,
                html: `<p>A new interview request has been scheduled for candidate <strong>${candidate?.full_name || 'Candidate'}</strong>.</p>
                       <p>The system has automatically assigned suitable proxies, reserved buffered windows and synced calendar details successfully.</p>`,
                smtpSettings: smtpSettings || undefined
              })
            }).catch(console.error);
          }
        }
      }

      onSuccess();
    } catch (error) {
      console.error(error);
      showToast('An error occurred while creating booking request.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const candidateOptions = useMemo(() => {
    return candidates.map(c => ({
      value: c.id,
      label: c.full_name
    }));
  }, [candidates]);

  const proxyOptions = useMemo(() => {
    return team
      .filter(u => isProxyUser(u) && !u.is_on_leave)
      .map(p => ({
        value: String(p.id),
        label: p.display_name
      }));
  }, [team]);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-bg-secondary w-full max-w-6xl rounded-[32px] shadow-2xl overflow-hidden border border-border-primary max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="px-8 py-6 border-b border-border-primary flex items-center justify-between bg-bg-tertiary shrink-0">
          <div>
            <span className="text-[10px] font-black text-accent-blue uppercase tracking-[0.3em]">Module Entry</span>
            <h2 className="text-2xl font-black text-text-primary tracking-tight mt-1">Create Support Request</h2>
            <p className="text-[10px] font-bold text-amber-500 animate-pulse mt-1">⚠️ ALL TIMINGS MUST BE IN EST TIMEZONE</p>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="p-2.5 hover:bg-bg-primary rounded-full border border-border-primary text-text-secondary transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Dynamic Split Layout */}
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
          {/* Left Panel: Request Form */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar flex flex-col justify-between min-w-0">
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-text-muted uppercase tracking-widest px-1">Candidate</label>
                <Select
                  required
                  options={candidateOptions}
                  value={candidateOptions.find(opt => opt.value === formData.candidate_id) || null}
                  onChange={(opt: any) => setFormData({...formData, candidate_id: opt?.value || ''})}
                  placeholder="Search Candidate..."
                  styles={customSelectStyles}
                  className="w-full text-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-text-muted uppercase tracking-widest px-1">Resume</label>
                <div className="flex gap-2">
                  <button 
                    type="button"
                    onClick={() => setResumeOption('existing')}
                    className={cn("flex-1 py-3 px-4 rounded-xl text-xs font-bold border", resumeOption === 'existing' ? "bg-accent-blue text-white border-accent-blue" : "bg-bg-tertiary text-text-secondary border-border-primary")}
                  >Use Existing</button>
                  <button 
                    type="button"
                    onClick={() => setResumeOption('upload')}
                    className={cn("flex-1 py-3 px-4 rounded-xl text-xs font-bold border", resumeOption === 'upload' ? "bg-accent-blue text-white border-accent-blue" : "bg-bg-tertiary text-text-secondary border-border-primary")}
                  >Upload New</button>
                </div>
                {resumeOption === 'upload' && (
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-border-primary rounded-2xl p-4 flex flex-col items-center justify-center hover:border-accent-blue hover:bg-accent-blue/5 transition-all cursor-pointer"
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) setNewResumeFile(e.target.files[0]);
                      }} 
                      className="hidden" accept=".pdf,.doc,.docx"
                    />
                    <p className="text-xs font-bold text-text-secondary text-center">
                      {newResumeFile ? newResumeFile.name : 'Click to select resume'}
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-text-muted uppercase tracking-widest px-1 font-bold text-text-muted">Interview Company</label>
                <input 
                  required
                  type="text"
                  value={formData.interview_company_name}
                  onChange={e => setFormData({...formData, interview_company_name: e.target.value})}
                  placeholder="Target organization"
                  className="w-full px-5 py-4 bg-bg-tertiary border border-border-primary rounded-[20px] text-sm focus:ring-2 focus:ring-accent-blue/20 outline-none font-bold text-text-primary h-[56px]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-text-muted uppercase tracking-widest px-1 font-bold text-text-muted">Job Title</label>
                <input 
                  required
                  type="text"
                  value={formData.job_title}
                  onChange={e => setFormData({...formData, job_title: e.target.value})}
                  placeholder="Software Engineer, etc."
                  className="w-full px-5 py-4 bg-bg-tertiary border border-border-primary rounded-[20px] text-sm focus:ring-2 focus:ring-accent-blue/20 outline-none font-bold text-text-primary h-[56px]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-text-muted uppercase tracking-widest px-1 font-bold text-text-muted">WhatsApp Number</label>
                <input 
                  required
                  type="tel"
                  value={formData.whatsapp_number}
                  onChange={e => setFormData({...formData, whatsapp_number: e.target.value})}
                  placeholder="For coordination"
                  className="w-full px-5 py-4 bg-bg-tertiary border border-border-primary rounded-[20px] text-sm focus:ring-2 focus:ring-accent-blue/20 outline-none font-bold text-text-primary h-[56px]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-text-muted uppercase tracking-widest px-1 font-bold text-text-muted">Job Link (Optional)</label>
                <input 
                  type="url"
                  value={formData.job_link}
                  onChange={e => setFormData({...formData, job_link: e.target.value})}
                  placeholder="Link to job description"
                  className="w-full px-5 py-4 bg-bg-tertiary border border-border-primary rounded-[20px] text-sm focus:ring-2 focus:ring-accent-blue/20 outline-none font-bold text-text-primary h-[56px]"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-[10px] font-black text-text-muted uppercase tracking-widest px-1">Job Description</label>
                <textarea 
                  required
                  value={formData.job_description}
                  onChange={e => setFormData({...formData, job_description: e.target.value})}
                  placeholder="Paste JD or relevant requirements here..."
                  rows={3}
                  className="w-full px-5 py-4 bg-bg-tertiary border border-border-primary rounded-[20px] text-sm focus:ring-2 focus:ring-accent-blue/20 outline-none resize-none font-bold text-text-primary"
                />
              </div>

              <div className="md:col-span-2">
                <div className="flex items-center gap-3 p-5 bg-bg-tertiary rounded-[20px] border border-border-primary">
                  <input 
                    type="checkbox"
                    id="proxy_required"
                    checked={formData.proxy_required}
                    onChange={e => setFormData({...formData, proxy_required: e.target.checked})}
                    className="w-6 h-6 rounded-lg bg-bg-secondary border-border-primary text-accent-blue focus:ring-accent-blue cursor-pointer"
                  />
                  <div>
                    <label htmlFor="proxy_required" className="text-sm font-black text-text-primary cursor-pointer block">Proxy Support Required</label>
                    <p className="text-[10px] text-text-muted font-bold">The system automatically searches, assigns and buffers proxies for scheduled times.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-end px-1">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">Interview Rounds & Time Scheduling</label>
                  <p className="text-[10px] font-bold text-amber-500 animate-pulse">⚠️ IMPORTANT: PLEASE PUT ALL TIMINGS IN EST TIMEZONE</p>
                </div>
                <button 
                  type="button"
                  onClick={() => setFormData({...formData, rounds: [...formData.rounds, { label: 'New Round', type: 'technical' as any, duration: 60, interview_date: '', start_time: '', end_time: '', slot_id: undefined }]})}
                  className="text-[10px] font-bold text-accent-blue hover:underline pb-1"
                >
                  + Add Round
                </button>
              </div>
              <div className="max-h-[350px] overflow-y-auto pr-2 custom-scrollbar space-y-4">
                {formData.rounds.map((round, idx) => (
                  <div key={idx} className="bg-bg-tertiary p-5 rounded-3xl border border-border-primary space-y-3 relative group/item">
                    {/* First row: Label & Type Select & Remove button */}
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <input 
                          type="text" 
                          value={round.label} 
                          onChange={e => {
                            const newRounds = [...formData.rounds];
                            newRounds[idx].label = e.target.value;
                            setFormData({...formData, rounds: newRounds});
                          }}
                          className="w-full bg-transparent border-none p-0 text-sm font-black text-text-primary focus:ring-0 outline-none placeholder-text-muted"
                          placeholder="Round Label"
                        />
                        <select 
                          value={round.type} 
                          onChange={e => {
                            const newRounds = [...formData.rounds];
                            newRounds[idx].type = e.target.value as any;
                            setFormData({...formData, rounds: newRounds});
                          }}
                          className="bg-transparent border-none p-0 text-[10px] text-text-muted uppercase font-black focus:ring-0 outline-none cursor-pointer mt-1"
                        >
                          <option value="screening">Screening</option>
                          <option value="technical">Technical</option>
                          <option value="assessment">Assessment</option>
                          <option value="hr">HR</option>
                          <option value="final">Final</option>
                        </select>
                      </div>
                      <button 
                        type="button"
                        onClick={() => setFormData({...formData, rounds: formData.rounds.filter((_, i) => i !== idx)})}
                        className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors border border-transparent"
                        title="Remove Round"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Second row: Interview date, start time, end time */}
                    <div className="grid grid-cols-3 gap-3 pt-2 border-t border-border-primary/40">
                      <div className="space-y-1">
                        <span className="text-[8px] text-text-muted font-black uppercase tracking-wider block">Interview Date</span>
                        <input 
                          type="date"
                          required={formData.proxy_required}
                          value={round.interview_date || ''}
                          onChange={e => {
                            const newRounds = [...formData.rounds];
                            newRounds[idx].interview_date = e.target.value;
                            setFormData({...formData, rounds: newRounds});
                          }}
                          className="w-full bg-bg-secondary border border-border-primary rounded-xl text-xs p-2 font-bold text-text-primary focus:ring-1 focus:ring-accent-blue"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[8px] text-text-muted font-black uppercase tracking-wider block">Start Time (EST)</span>
                        <input 
                          type="time"
                          required={formData.proxy_required}
                          value={round.start_time || ''}
                          onChange={e => {
                            const newRounds = [...formData.rounds];
                            newRounds[idx].start_time = e.target.value;
                            setFormData({...formData, rounds: newRounds});
                          }}
                          className="w-full bg-bg-secondary border border-border-primary rounded-xl text-xs p-2 font-bold text-text-primary focus:ring-1 focus:ring-accent-blue"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[8px] text-text-muted font-black uppercase tracking-wider block">End Time</span>
                        <input 
                          type="time"
                          required={formData.proxy_required}
                          value={round.end_time || ''}
                          onChange={e => {
                            const newRounds = [...formData.rounds];
                            newRounds[idx].end_time = e.target.value;
                            setFormData({...formData, rounds: newRounds});
                          }}
                          className="w-full bg-bg-secondary border border-border-primary rounded-xl text-xs p-2 font-bold text-text-primary focus:ring-1 focus:ring-accent-blue"
                        />
                      </div>
                    </div>
                  </div>
                ))}
                {formData.proxy_required && assignmentResult.bestProxy && !assignmentResult.errors?.length && (
                  <div className="space-y-2 mt-4">
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-widest px-1">Selected Allocation</label>
                    <div className="p-5 bg-accent-green/5 border border-accent-green/10 rounded-3xl space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-bg-secondary flex items-center justify-center border border-border-primary text-accent-green">
                          <UserIcon className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="text-base font-black text-text-primary">{assignmentResult.bestProxy.display_name}</p>
                          <p className="text-[10px] text-accent-green font-black uppercase tracking-wider mt-0.5">Recommended Profile</p>
                        </div>
                      </div>
                      
                      <div className="pt-3 border-t border-border-primary/50 text-[10px] text-text-muted font-bold space-y-1">
                        <p>🕒 Time: {(() => {
                           const start = formData.rounds[0].start_time;
                           const end = formData.rounds[0].end_time;
                           if (!start || !end) return '';
                           const format = (t: string) => {
                             const [h, m] = t.split(':');
                             const hours = parseInt(h);
                             return `${hours % 12 || 12}:${m} ${hours >= 12 ? 'PM' : 'AM'}`;
                           };
                           return `${format(start)} EST to ${format(end)} EST`;
                        })()}</p>
                        <p>⏳ Buffer: 15m Pre/Post</p>
                        <p>⚡ Workload: Lowest current workload ({allRounds.filter(r => String(r.proxy_user_id) === String(assignmentResult.bestProxy?.id) && ['confirmed','live'].includes(r.status)).length} active interviews)</p>
                        <p>🛡️ Conflict assessment: Clear of buffers and leaf return parameters</p>
                      </div>
                    </div>
                  </div>
                )}

                {formData.proxy_required && assignmentResult.errors && assignmentResult.errors.length > 0 && (
                  <div className="p-5 bg-rose-500/10 border border-rose-500/20 rounded-3xl flex gap-3 items-start mt-4">
                    <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-black text-rose-500">Allocation Conflict</p>
                      <p className="text-[10px] text-text-secondary mt-1 leading-relaxed">
                        {assignmentResult.errors[0]}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-4 pt-6 border-t border-border-primary bg-bg-tertiary -mx-8 -mb-8 px-8 py-5 shrink-0">
            <button 
              type="button" 
              onClick={onClose}
              className="flex-1 py-3.5 bg-bg-secondary border border-border-primary text-text-primary font-bold rounded-[16px] hover:bg-bg-primary transition-all text-sm"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={isSubmitting}
              className="flex-1 py-3.5 bg-accent-blue text-white font-bold rounded-[16px] hover:bg-accent-blue/90 shadow-xl shadow-accent-blue/20 transition-all text-sm disabled:opacity-50"
            >
              {isSubmitting ? 'Scheduling...' : 'Schedule Request'}
            </button>
          </div>
        </form>
      </div>


    </motion.div>
  </div>
);
};
