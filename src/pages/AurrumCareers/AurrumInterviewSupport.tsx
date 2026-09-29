import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  subscribeToCollection,
  subscribeToAllCandidatesUnfiltered,
  addInterviewSupportRequest,
  updateInterviewSupportRequest,
  addInterviewRound,
  updateInterviewRound,
  logInterviewActivity,
  addInterviewNotification,
  addBookingLink,
  deleteInterviewSupportRequest,
  updateProxyAvailability,
  deleteProxyAvailability,
} from '../../services/storage';
import {
  syncInterviewRoundToGoogleCalendar,
  clearPreviousCalendarEvents,
} from '../../services/calendarService';
import { handleViewFile, uploadFile } from '../../services/fileService';
import {
  InterviewSupportRequest,
  InterviewRound,
  InterviewFeedback,
  BookingLink,
  Candidate,
  User,
  ProxyAvailability,
} from '../../types';
import {
  Calendar,
  Search,
  Clock,
  CheckCircle2,
  X,
  Plus,
  Video,
  Share2,
  Copy,
  ExternalLink,
  User as UserIcon,
  Briefcase,
  Building,
  FileText,
  AlertCircle,
  Sparkles,
  FileEdit,
  RotateCcw,
  FileSearch,
  HelpCircle,
  Trophy,
  Trash2,
  BarChart2,
  MessageCircle,
  Upload,
  ChevronLeft,
  ChevronRight,
  RefreshCcw,
  Link2,
  ShieldCheck,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Select from 'react-select';
import { InterviewAnalytics } from '../InterviewSupport/InterviewAnalytics';
import {
  cn,
  parseLocalTimeToDate,
  getLocalYYYYMMDD,
  formatDisplayDateWithWeekday,
} from '../../lib/utils';
import { collection, doc, getDoc, addDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { ProxyAssignmentModal } from '../../components/ProxyAssignmentModal';
import { AddSlotModal } from '../../components/AddSlotModal';
import { SlotVisualizer } from '../../components/SlotVisualizer';
import {
  assignProxiesForRounds,
  isProxyUser,
  getLatestCandidateResume,
  getInterviewResumeInfo,
  generateDefaultProxySlots,
  getSlotStatusColor,
} from '../../services/interviewService';
import { sharedSelectStyles } from '../../lib/selectStyles';
import { useDebounce } from '../../lib/hooks';
import { AurrumFlowHeader } from './AurrumFlowHeader';

type TabType =
  | 'today'
  | 'upcoming'
  | 'bookings'
  | 'pending_bookings'
  | 'booked'
  | 'live'
  | 'proxy_schedule'
  | 'proxy_team'
  | 'self_attended'
  | 'completed'
  | 'cancelled'
  | 'rescheduled'
  | 'analytics';

const customSelectStyles = {
  ...sharedSelectStyles,
  control: (provided: any, state: any) => ({
    ...(typeof sharedSelectStyles.control === 'function'
      ? sharedSelectStyles.control(provided, state)
      : provided),
    borderRadius: '20px',
    minHeight: '56px',
    paddingLeft: '1rem',
  }),
  menu: (provided: any, state: any) => ({
    ...(typeof sharedSelectStyles.menu === 'function'
      ? sharedSelectStyles.menu(provided, state)
      : provided),
    borderRadius: '20px',
  }),
};

export const AurrumInterviewSupport: React.FC = () => {
  const { user, isAuthReady } = useAuth();
  const { showToast } = useToast();

  const canManageInterviews = useMemo(() => {
    if (!user) return false;
    return (
      user.role === 'administrator' ||
      user.role === 'jpc_sysadmin' ||
      user.role === 'jpc_manager' ||
      user.role === 'jpc_cs' ||
      user.role === 'jpc_recruiter' ||
      user.role === 'jpc_marketing' ||
      user.role === 'aurrum_admin' ||
      user.role === 'aurrum_sales' ||
      user.role === 'aurrum_team' ||
      isProxyUser(user)
    );
  }, [user]);

  const canEditSchedule = useMemo(() => {
    if (!user) return false;
    return (
      user.role === 'administrator' ||
      user.role === 'jpc_sysadmin' ||
      user.role === 'jpc_manager' ||
      user.role === 'jpc_cs' ||
      user.role === 'aurrum_admin' ||
      user.role === 'aurrum_team' ||
      isProxyUser(user)
    );
  }, [user]);

  const [activeTab, setActiveTab] = useState<TabType>('today');
  const [requests, setRequests] = useState<InterviewSupportRequest[]>([]);
  const [rounds, setRounds] = useState<InterviewRound[]>([]);
  const [feedbacks, setFeedbacks] = useState<InterviewFeedback[]>([]);
  const [bookingLinks, setBookingLinks] = useState<BookingLink[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [team, setTeam] = useState<User[]>([]);
  const [availabilities, setAvailabilities] = useState<ProxyAvailability[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 250);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [filterDate, setFilterDate] = useState<string>('');
  const [selectedProxyId, setSelectedProxyId] = useState<string>('all');

  // Modals
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [proxyAssignmentConfig, setProxyAssignmentConfig] = useState<{
    request: InterviewSupportRequest;
    round: InterviewRound;
  } | null>(null);
  const [directScheduleConfig, setDirectScheduleConfig] = useState<{
    request: InterviewSupportRequest;
    round: InterviewRound;
  } | null>(null);
  const [resultUpdateConfig, setResultUpdateConfig] = useState<{
    request: InterviewSupportRequest;
    round: InterviewRound;
  } | null>(null);
  const [selectedFeedbackRound, setSelectedFeedbackRound] = useState<{
    round: InterviewRound;
    feedback: InterviewFeedback;
  } | null>(null);
  const [selectedDetailRequest, setSelectedDetailRequest] =
    useState<InterviewSupportRequest | null>(null);

  // Proxy Schedule state
  const [scheduleProxyId, setScheduleProxyId] = useState<string>('');
  const [viewDate, setViewDate] = useState<Date>(new Date());
  const [addSlotConfig, setAddSlotConfig] = useState<{ date: Date } | null>(null);
  const [isGeneratingSlots, setIsGeneratingSlots] = useState(false);

  useEffect(() => {
    if (!isAuthReady) return;

    const unsubRequests = subscribeToCollection<InterviewSupportRequest>(
      'jpc_interview_requests',
      setRequests
    );
    const unsubRounds = subscribeToCollection<InterviewRound>(
      'jpc_interview_rounds',
      setRounds
    );
    const unsubFeedback = subscribeToCollection<InterviewFeedback>(
      'jpc_interview_feedback',
      setFeedbacks
    );
    const unsubLinks = subscribeToCollection<BookingLink>(
      'jpc_interview_booking_links',
      setBookingLinks
    );
    const unsubCandidates = subscribeToAllCandidatesUnfiltered(setCandidates);
    const unsubAvailabilities = subscribeToCollection<ProxyAvailability>(
      'jpc_proxy_availability',
      setAvailabilities
    );
    const unsubCalendarEvents = subscribeToCollection<any>(
      'jpc_calendar_events',
      setCalendarEvents
    );
    const unsubTeam = subscribeToCollection<User>('jpc_users', (data) => {
      setTeam(data);
      setIsLoading(false);
    });

    return () => {
      unsubRequests();
      unsubRounds();
      unsubFeedback();
      unsubLinks();
      unsubCandidates();
      unsubAvailabilities();
      unsubCalendarEvents();
      unsubTeam();
    };
  }, [isAuthReady]);

  const proxyUsers = useMemo(() => team.filter(isProxyUser), [team]);

  useEffect(() => {
    if (!scheduleProxyId && proxyUsers.length > 0) {
      if (user && isProxyUser(user)) {
        setScheduleProxyId(String(user.id));
      } else {
        setScheduleProxyId(String(proxyUsers[0].id));
      }
    }
  }, [proxyUsers, scheduleProxyId, user]);

  const filteredRequests = useMemo(() => {
    const searchLower = debouncedSearch.toLowerCase().trim();

    let base = requests.filter((req) => {
      if (!searchLower) return true;
      const candidate = candidates.find((c) => c.id === req.candidate_id);
      return (
        candidate?.full_name?.toLowerCase().includes(searchLower) ||
        req.interview_company_name?.toLowerCase().includes(searchLower) ||
        req.company_name?.toLowerCase().includes(searchLower) ||
        req.job_title?.toLowerCase().includes(searchLower)
      );
    });

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    let filtered = base.filter((req) => {
      const reqRounds = rounds.filter((r) => r.request_id === req.id);

      switch (activeTab) {
        case 'today':
          return reqRounds.some((r) =>
            (r.booked_slot_time || r.interview_date || '').startsWith(todayStr)
          );
        case 'upcoming':
          return reqRounds.some((r) => {
            const d = r.booked_slot_time || r.interview_date;
            return d && new Date(d) > now;
          });
        case 'pending_bookings':
          return (
            req.overall_status === 'pending_request' ||
            req.overall_status === 'booking_link_generated'
          );
        case 'booked':
          return req.overall_status === 'confirmed';
        case 'live':
          return req.overall_status === 'live';
        case 'completed':
          return (
            req.overall_status === 'completed' ||
            req.overall_status === 'feedback_added' ||
            req.overall_status === 'placed'
          );
        case 'cancelled':
          return req.overall_status === 'cancelled';
        case 'rescheduled':
          return req.overall_status === 'rescheduled';
        case 'self_attended':
          return req.proxy_required === false;
        default:
          return true;
      }
    });

    if (selectedProxyId !== 'all') {
      filtered = filtered.filter((req) => {
        const reqRounds = rounds.filter((r) => r.request_id === req.id);
        return reqRounds.some((r) => String(r.proxy_user_id) === selectedProxyId);
      });
    }

    if (filterDate) {
      filtered = filtered.filter((req) => {
        const reqRounds = rounds.filter((r) => r.request_id === req.id);
        return reqRounds.some((r) =>
          (r.booked_slot_time || r.interview_date || '')?.startsWith(filterDate)
        );
      });
    }

    return filtered.sort((a, b) => {
      const getRelevantRoundDate = (req: InterviewSupportRequest) => {
        const reqRounds = rounds.filter((r) => r.request_id === req.id);
        let targetRounds = reqRounds;
        if (activeTab === 'today') {
          targetRounds = reqRounds.filter((r) =>
            (r.booked_slot_time || r.interview_date || '').startsWith(todayStr)
          );
        } else if (activeTab === 'upcoming') {
          targetRounds = reqRounds.filter((r) => {
            const d = r.booked_slot_time || r.interview_date;
            return d && new Date(d) > now;
          });
        }
        if (targetRounds.length === 0) targetRounds = reqRounds;
        const dates = targetRounds
          .map((r) => r.booked_slot_time || r.interview_date || '')
          .filter(Boolean)
          .sort();
        return dates.length > 0 ? dates[0] : '9999-99-99';
      };

      const dateA = getRelevantRoundDate(a);
      const dateB = getRelevantRoundDate(b);
      const comparison = dateA.localeCompare(dateB);
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [
    requests,
    rounds,
    candidates,
    debouncedSearch,
    activeTab,
    sortDirection,
    filterDate,
    selectedProxyId,
  ]);

  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const activeProxies = proxyUsers.filter((p) => !p.is_on_leave).length;
    return {
      today: rounds.filter((r) =>
        (r.booked_slot_time || r.interview_date || '').startsWith(todayStr)
      ).length,
      pending: requests.filter(
        (req) =>
          req.overall_status === 'pending_request' ||
          req.overall_status === 'booking_link_generated'
      ).length,
      live: requests.filter((req) => req.overall_status === 'live').length,
      booked: requests.filter((req) => req.overall_status === 'confirmed').length,
      activeProxies: `${activeProxies}/${proxyUsers.length}`,
    };
  }, [requests, rounds, proxyUsers]);

  const handleGenerateLink = async (requestId: string, roundId: string) => {
    if (!user) return;
    try {
      const req = requests.find((r) => r.id === requestId);
      const rnd = rounds.find((r) => r.id === roundId);

      if (req?.proxy_required) {
        if (!rnd || !rnd.proxy_user_id) {
          showToast(
            'Please assign a Proxy Team member before generating a booking link.',
            'error'
          );
          return;
        }
      }

      const token = Math.random().toString(36).slice(2, 18);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await addBookingLink({
        interview_round_id: roundId,
        generated_by_recruiter_id: String(user.id),
        token,
        expires_at: expiresAt.toISOString(),
        is_active: true,
        opened_at: null,
        booked_at: null,
      });

      await updateInterviewRound(roundId, {
        booking_link_token: token,
        status: 'pending',
      });

      await updateInterviewSupportRequest(requestId, {
        overall_status: 'booking_link_generated',
      });

      showToast('Booking link generated successfully!', 'success');
    } catch (error) {
      showToast('Failed to generate link', 'error');
    }
  };

  const copyBookingLink = (token: string) => {
    const url = `${window.location.origin}/#book-interview/${token}`;
    navigator.clipboard.writeText(url);
    showToast('Booking link copied to clipboard!', 'success');
  };

  const handleReschedule = async (
    request: InterviewSupportRequest,
    round: InterviewRound
  ) => {
    if (
      !user ||
      !window.confirm(
        'Mark this interview for reschedule? This will reset the booking status and allow re-booking.'
      )
    )
      return;

    try {
      await updateInterviewRound(round.id, {
        status: 'pending',
        booked_slot_time: null,
        booked_slot_end: null,
        booking_link_token: null,
      });

      await updateInterviewSupportRequest(request.id, {
        overall_status: 'rescheduled',
      });

      await logInterviewActivity(
        round.id,
        'RESCHEDULE_ADMIN_TRIGGERED',
        { by: user.role },
        String(user.id)
      );

      showToast('Interview marked for reschedule', 'success');
    } catch (error) {
      console.error(error);
      showToast('Failed to trigger reschedule', 'error');
    }
  };

  const handleDeleteRequest = async (requestId: string) => {
    if (
      !window.confirm(
        'Are you sure you want to permanently delete this interview request and all associated rounds, links, and feedback?'
      )
    )
      return;

    try {
      await deleteInterviewSupportRequest(requestId);
      showToast('Interview request deleted successfully', 'success');
    } catch (error) {
      console.error(error);
      showToast('Failed to delete interview request', 'error');
    }
  };

  // Proxy schedule helpers
  const weekDays = useMemo(() => {
    const start = new Date(viewDate);
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1);
    start.setDate(diff);

    return Array.from({ length: 5 }).map((_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [viewDate]);

  const getProxySlotsForDate = (date: Date, proxyId: string) => {
    const dateStr = getLocalYYYYMMDD(date);
    const daySlots = availabilities
      .filter((a) => {
        if (String(a.proxy_user_id) !== String(proxyId)) return false;
        if (!a.slot_start.startsWith(dateStr)) return false;

        const timePart = a.slot_start.split('T')[1];
        if (!timePart) return false;
        const [hStr, mStr] = timePart.split(':');
        const minutesTotal = parseInt(hStr, 10) * 60 + parseInt(mStr, 10);
        return minutesTotal >= 9 * 60 + 30 && minutesTotal <= 18 * 60;
      })
      .sort((a, b) => a.slot_start.localeCompare(b.slot_start));

    const seen = new Set<string>();
    return daySlots.filter((s) => {
      if (seen.has(s.slot_start)) return false;
      seen.add(s.slot_start);
      return true;
    });
  };

  const handleGenerateDefaultSlots = async () => {
    if (!scheduleProxyId || !canEditSchedule) return;
    if (
      !window.confirm(
        'Generate weekday slots (9:30 AM - 6:30 PM EST) for the next 30 days for this proxy?'
      )
    )
      return;

    setIsGeneratingSlots(true);
    try {
      await generateDefaultProxySlots(String(scheduleProxyId));
      showToast('Default proxy availability generated!', 'success');
    } catch (err) {
      showToast('Failed to generate proxy slots', 'error');
    } finally {
      setIsGeneratingSlots(false);
    }
  };

  const handleSlotStatusChange = async (
    id: string,
    newStatus: ProxyAvailability['slot_status']
  ) => {
    if (!canEditSchedule) {
      showToast('You do not have permission to modify proxy slots.', 'error');
      return;
    }
    try {
      await updateProxyAvailability(id, { slot_status: newStatus });
      showToast(`Slot marked as ${newStatus}`, 'success');
    } catch (error) {
      showToast('Failed to update slot', 'error');
    }
  };

  const handleDeleteSlot = async (id: string) => {
    if (!canEditSchedule) return;
    if (!window.confirm('Delete this availability slot?')) return;
    try {
      await deleteProxyAvailability(id);
      showToast('Slot removed', 'success');
    } catch (error) {
      showToast('Failed to delete slot', 'error');
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center p-20">
        <div className="w-12 h-12 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <AurrumFlowHeader
        activeStep="interviews"
        title="Aurrum Interview Support"
        subtitle="Dedicated Interview Support bookings, live & upcoming interview coordination, and Proxy scheduling."
        actions={
          canManageInterviews ? (
            <button
              onClick={() => {
                setProxyAssignmentConfig(null);
                setIsRequestModalOpen(true);
              }}
              className="px-5 py-2.5 bg-amber-500 text-black font-black rounded-xl hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2 text-xs sm:text-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              New Interview Request
            </button>
          ) : undefined
        }
      />

      {/* KPI Summary Grid (Strictly Interview Support & Proxy Metrics) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
        {[
          {
            label: "Today's Interviews",
            value: stats.today,
            icon: Calendar,
            color: 'text-amber-500',
            bg: 'bg-amber-500/10',
          },
          {
            label: 'Pending Bookings',
            value: stats.pending,
            icon: Clock,
            color: 'text-accent-blue',
            bg: 'bg-accent-blue/10',
          },
          {
            label: 'Confirmed / Booked',
            value: stats.booked,
            icon: CheckCircle2,
            color: 'text-accent-green',
            bg: 'bg-accent-green/10',
          },
          {
            label: 'Live Interviews',
            value: stats.live,
            icon: Video,
            color: 'text-accent-red',
            bg: 'bg-accent-red/10',
          },
          {
            label: 'Active Proxies',
            value: stats.activeProxies,
            icon: ShieldCheck,
            color: 'text-accent-purple',
            bg: 'bg-accent-purple/10',
          },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-bg-secondary p-4 sm:p-5 rounded-2xl border border-border-primary/60"
          >
            <div
              className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center mb-3',
                stat.bg
              )}
            >
              <stat.icon className={cn('w-5 h-5', stat.color)} />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-text-primary tracking-tight">
              {stat.value}
            </p>
            <p className="text-[11px] font-bold text-text-muted uppercase tracking-wider mt-1">
              {stat.label}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Direct Self-Service Booking Link Banner */}
      <div className="bg-gradient-to-r from-amber-500/10 via-bg-secondary to-accent-blue/10 border border-amber-500/30 p-5 sm:p-6 rounded-2xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-lg bg-amber-500 flex items-center justify-center text-black">
              <Link2 className="w-3.5 h-3.5" />
            </span>
            <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">
              Direct Interview Support Booking Link
            </span>
          </div>
          <h2 className="text-base sm:text-lg font-black text-text-primary">
            Self-Service Interview Support Slot Booking
          </h2>
          <p className="text-xs text-text-secondary max-w-2xl">
            Share this link with candidates so they can submit their interview details, select an available EST time slot, and automatically reserve an available Proxy Team member.
          </p>
        </div>
        <div className="flex items-center gap-2.5 w-full lg:w-auto shrink-0">
          <input
            readOnly
            value={`${window.location.origin}/#book-interview/interview-support-only`}
            className="flex-1 lg:w-72 px-3.5 py-2.5 bg-bg-tertiary border border-border-primary rounded-xl text-xs font-mono font-bold text-text-primary"
          />
          <button
            onClick={() => {
              navigator.clipboard.writeText(
                `${window.location.origin}/#book-interview/interview-support-only`
              );
              showToast('Direct Interview Support booking link copied!', 'success');
            }}
            className="px-4 py-2.5 bg-amber-500 text-black text-xs font-black rounded-xl hover:bg-amber-400 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            Copy Link
          </button>
        </div>
      </div>

      {/* Navigation Tabs & Filters */}
      <div className="bg-bg-secondary p-3 rounded-2xl border border-border-primary space-y-3">
        <div className="flex overflow-x-auto touch-scroll scrollbar-hide gap-1.5 pb-1">
          {(
            [
              { id: 'today', label: 'Today' },
              { id: 'upcoming', label: 'Upcoming' },
              { id: 'bookings', label: 'Booking Links & Status' },
              { id: 'pending_bookings', label: 'Pending Bookings' },
              { id: 'booked', label: 'Confirmed' },
              { id: 'live', label: 'Live Now' },
              { id: 'proxy_schedule', label: 'Proxy Availability & Schedule' },
              { id: 'proxy_team', label: 'Proxy Team Status' },
              { id: 'self_attended', label: 'Self Attended' },
              { id: 'completed', label: 'Completed' },
              { id: 'rescheduled', label: 'Rescheduled' },
              { id: 'cancelled', label: 'Cancelled' },
              { id: 'analytics', label: 'Interview Analytics' },
            ] as { id: TabType; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer',
                activeTab === tab.id
                  ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                  : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
              )}
            >
              {tab.id === 'analytics' && <BarChart2 className="w-3.5 h-3.5" />}
              {tab.id === 'bookings' && <Link2 className="w-3.5 h-3.5" />}
              {tab.id === 'proxy_schedule' && <Calendar className="w-3.5 h-3.5" />}
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab !== 'analytics' &&
          activeTab !== 'proxy_team' &&
          activeTab !== 'proxy_schedule' && (
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 pt-2 border-t border-border-primary/60">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="text"
                  placeholder="Search by candidate, interview company, or job title..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-bg-tertiary border border-border-primary rounded-xl text-xs sm:text-sm text-text-primary focus:ring-2 focus:ring-amber-500/20 outline-none"
                />
              </div>

              <div className="flex items-center gap-2 bg-bg-tertiary px-3 py-1.5 rounded-xl border border-border-primary">
                <button
                  onClick={() =>
                    setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
                  }
                  className="text-[11px] font-bold text-text-secondary hover:text-amber-500 whitespace-nowrap cursor-pointer"
                >
                  {sortDirection === 'asc' ? 'Oldest First' : 'Newest First'}
                </button>
                <span className="text-border-primary">|</span>
                <input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="bg-transparent text-xs font-bold text-text-primary focus:outline-none"
                />
                {filterDate && (
                  <button
                    onClick={() => setFilterDate('')}
                    className="text-text-muted hover:text-text-primary"
                    title="Clear date filter"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="md:w-56">
                <select
                  value={selectedProxyId}
                  onChange={(e) => setSelectedProxyId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-bg-tertiary border border-border-primary rounded-xl text-xs font-bold text-text-primary focus:outline-none"
                >
                  <option value="all">All Proxies</option>
                  {proxyUsers.map((u) => (
                    <option key={u.id} value={String(u.id)}>
                      Proxy: {u.display_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
      </div>

      {/* TAB 1: ANALYTICS */}
      {activeTab === 'analytics' && (
        <InterviewAnalytics
          requests={requests}
          rounds={rounds}
          candidates={candidates}
          team={team}
        />
      )}

      {/* TAB 2: PROXY TEAM STATUS */}
      {activeTab === 'proxy_team' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {proxyUsers.map((proxy) => (
            <ProxyStatusCard
              key={proxy.id}
              proxy={proxy}
              activeCount={
                rounds.filter(
                  (r) =>
                    String(r.proxy_user_id) === String(proxy.id) &&
                    ['confirmed', 'booked', 'live'].includes(r.status)
                ).length
              }
              completedCount={
                rounds.filter(
                  (r) =>
                    String(r.proxy_user_id) === String(proxy.id) &&
                    r.status === 'completed'
                ).length
              }
              canEdit={canEditSchedule}
              onUpdate={async (userId, updates) => {
                try {
                  await updateDoc(doc(db, 'jpc_users', userId), updates);
                  showToast('Proxy availability updated.', 'success');
                } catch (err) {
                  showToast('Failed to update proxy status.', 'error');
                }
              }}
            />
          ))}
        </div>
      )}

      {/* TAB 3: PROXY AVAILABILITY & SCHEDULE */}
      {activeTab === 'proxy_schedule' && (
        <div className="space-y-6">
          <div className="bg-bg-secondary p-5 rounded-2xl border border-border-primary flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="text-[10px] font-black text-text-muted uppercase tracking-widest block mb-1">
                  Select Proxy Member
                </label>
                <select
                  value={scheduleProxyId}
                  onChange={(e) => setScheduleProxyId(e.target.value)}
                  className="px-4 py-2.5 bg-bg-tertiary border border-border-primary rounded-xl text-sm font-bold text-text-primary focus:outline-none"
                >
                  {proxyUsers.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.display_name} {p.is_on_leave ? '(On Leave)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 self-end">
                <button
                  onClick={() => {
                    const prev = new Date(viewDate);
                    prev.setDate(prev.getDate() - 7);
                    setViewDate(prev);
                  }}
                  className="p-2.5 bg-bg-tertiary border border-border-primary rounded-xl hover:bg-bg-primary text-text-primary cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewDate(new Date())}
                  className="px-3.5 py-2 bg-bg-tertiary border border-border-primary rounded-xl text-xs font-bold text-text-primary hover:bg-bg-primary cursor-pointer"
                >
                  This Week
                </button>
                <button
                  onClick={() => {
                    const next = new Date(viewDate);
                    next.setDate(next.getDate() + 7);
                    setViewDate(next);
                  }}
                  className="p-2.5 bg-bg-tertiary border border-border-primary rounded-xl hover:bg-bg-primary text-text-primary cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {canEditSchedule && scheduleProxyId && (
              <div className="flex items-center gap-2.5">
                <button
                  onClick={handleGenerateDefaultSlots}
                  disabled={isGeneratingSlots}
                  className="px-4 py-2.5 bg-amber-500 text-black text-xs font-black rounded-xl hover:bg-amber-400 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCcw
                    className={cn('w-3.5 h-3.5', isGeneratingSlots && 'animate-spin')}
                  />
                  {isGeneratingSlots ? 'Generating...' : 'Auto-Generate 30d EST Slots'}
                </button>
              </div>
            )}
          </div>

          {scheduleProxyId && (
            <SlotVisualizer
              rounds={rounds}
              availabilities={availabilities}
              date={viewDate}
              proxyId={scheduleProxyId}
            />
          )}

          {/* 5-Day Weekday Availability Grid */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {weekDays.map((date) => {
              const daySlots = getProxySlotsForDate(date, scheduleProxyId);
              const dateStr = getLocalYYYYMMDD(date);
              const dayRounds = rounds.filter(
                (r) =>
                  String(r.proxy_user_id) === String(scheduleProxyId) &&
                  (r.booked_slot_time || r.interview_date || '').startsWith(dateStr) &&
                  r.status !== 'cancelled'
              );

              return (
                <div
                  key={dateStr}
                  className="bg-bg-secondary border border-border-primary rounded-2xl p-4 flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between border-b border-border-primary pb-3">
                    <div>
                      <p className="text-xs font-black text-text-primary">
                        {formatDisplayDateWithWeekday(dateStr)}
                      </p>
                      <p className="text-[10px] text-text-muted font-bold">
                        {dayRounds.length} Assigned • {daySlots.length} Slots
                      </p>
                    </div>
                    {canEditSchedule && scheduleProxyId && (
                      <button
                        onClick={() => setAddSlotConfig({ date })}
                        className="p-1.5 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 rounded-lg transition-colors cursor-pointer"
                        title="Add custom slot"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Assigned Interviews on this day */}
                  {dayRounds.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[9px] font-black uppercase tracking-wider text-amber-500">
                        Assigned Interviews
                      </p>
                      {dayRounds.map((rnd) => {
                        const req = requests.find((r) => r.id === rnd.request_id);
                        const cand = candidates.find((c) => c.id === req?.candidate_id);
                        return (
                          <div
                            key={rnd.id}
                            className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-0.5"
                          >
                            <p className="font-black text-text-primary truncate">
                              {cand?.full_name || 'Candidate'}
                            </p>
                            <p className="text-[10px] text-text-secondary truncate">
                              {req?.interview_company_name || req?.company_name} •{' '}
                              {rnd.round_label}
                            </p>
                            <p className="text-[10px] font-bold text-amber-500">
                              {rnd.booked_slot_time
                                ? rnd.booked_slot_time.substring(11, 16) + ' EST'
                                : 'Time TBD'}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Availability Slots */}
                  <div className="space-y-1.5 max-h-80 overflow-y-auto custom-scrollbar pr-1">
                    {daySlots.length === 0 ? (
                      <p className="text-[11px] text-text-muted italic py-6 text-center">
                        No slots configured
                      </p>
                    ) : (
                      daySlots.map((slot) => {
                        const timeLabel = slot.slot_start.split('T')[1]?.substring(0, 5);
                        return (
                          <div
                            key={slot.id}
                            className={cn(
                              'px-2.5 py-2 rounded-xl border text-xs flex items-center justify-between gap-2',
                              getSlotStatusColor(slot.slot_status)
                            )}
                          >
                            <div>
                              <span className="font-black">{timeLabel} EST</span>
                              <span className="ml-2 text-[9px] uppercase font-bold opacity-80">
                                {slot.slot_status}
                              </span>
                            </div>
                            {canEditSchedule && (
                              <div className="flex items-center gap-1">
                                <select
                                  value={slot.slot_status}
                                  onChange={(e) =>
                                    handleSlotStatusChange(
                                      slot.id,
                                      e.target.value as ProxyAvailability['slot_status']
                                    )
                                  }
                                  className="bg-transparent text-[10px] font-bold focus:outline-none cursor-pointer"
                                >
                                  <option value="available">Available</option>
                                  <option value="booked">Booked</option>
                                  <option value="break">Break</option>
                                  <option value="leave">Leave</option>
                                  <option value="unavailable">Unavailable</option>
                                </select>
                                <button
                                  onClick={() => handleDeleteSlot(slot.id)}
                                  className="p-1 hover:text-rose-500 transition-colors"
                                  title="Delete slot"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: BOOKING LINKS & STATUS */}
      {activeTab === 'bookings' && (
        <div className="bg-bg-secondary border border-border-primary rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-border-primary flex items-center justify-between">
            <div>
              <h3 className="text-base font-black text-text-primary">
                Interview Support Booking Links
              </h3>
              <p className="text-xs text-text-secondary">
                Track active candidate booking links, link opens, and confirmed slot reservations.
              </p>
            </div>
            <span className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-500 text-xs font-black">
              {bookingLinks.length} Total Links
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border-primary text-[10px] font-black uppercase tracking-wider text-text-muted bg-bg-tertiary/50">
                  <th className="py-3.5 px-4">Candidate</th>
                  <th className="py-3.5 px-4">Company & Role</th>
                  <th className="py-3.5 px-4">Round & Proxy</th>
                  <th className="py-3.5 px-4">Booking Status</th>
                  <th className="py-3.5 px-4">Booked Slot (EST)</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-primary text-xs">
                {bookingLinks
                  .slice()
                  .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
                  .map((link) => {
                    const round = rounds.find((r) => r.id === link.interview_round_id);
                    const req = requests.find((r) => r.id === round?.request_id);
                    const cand = candidates.find((c) => c.id === req?.candidate_id);
                    const proxy = team.find(
                      (u) => String(u.id) === String(round?.proxy_user_id)
                    );

                    const isExpired =
                      new Date(link.expires_at) < new Date() && !link.booked_at;
                    const statusLabel = link.booked_at
                      ? 'Slot Booked'
                      : isExpired
                      ? 'Expired'
                      : link.opened_at
                      ? 'Link Opened'
                      : 'Active / Sent';

                    return (
                      <tr
                        key={link.id}
                        className="hover:bg-bg-tertiary/40 transition-colors"
                      >
                        <td className="py-3.5 px-4 font-bold text-text-primary">
                          {cand?.full_name || 'Candidate'}
                        </td>
                        <td className="py-3.5 px-4">
                          <p className="font-bold text-text-primary">
                            {req?.interview_company_name || req?.company_name || '—'}
                          </p>
                          <p className="text-[11px] text-text-secondary">
                            {req?.job_title || '—'}
                          </p>
                        </td>
                        <td className="py-3.5 px-4">
                          <p className="font-bold text-text-primary">
                            {round?.round_label || 'Interview Round'}
                          </p>
                          <p className="text-[11px] text-text-secondary">
                            Proxy: {proxy?.display_name || 'Unassigned'}
                          </p>
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={cn(
                              'px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider',
                              link.booked_at
                                ? 'bg-accent-green/15 text-accent-green'
                                : isExpired
                                ? 'bg-accent-red/15 text-accent-red'
                                : link.opened_at
                                ? 'bg-amber-500/15 text-amber-500'
                                : 'bg-accent-blue/15 text-accent-blue'
                            )}
                          >
                            {statusLabel}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-text-primary">
                          {round?.booked_slot_time
                            ? parseLocalTimeToDate(
                                round.booked_slot_time,
                                'America/New_York'
                              ).toLocaleString('en-US', {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                                timeZone: 'America/New_York',
                              }) + ' EST'
                            : 'Not yet booked'}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => copyBookingLink(link.token)}
                              className="px-3 py-1.5 bg-bg-tertiary hover:bg-bg-primary border border-border-primary rounded-lg text-[11px] font-bold text-text-primary flex items-center gap-1 cursor-pointer"
                            >
                              <Copy className="w-3 h-3 text-amber-500" />
                              Copy
                            </button>
                            <button
                              onClick={() => {
                                const url = `${window.location.origin}/#book-interview/${link.token}`;
                                const text = `Hi ${
                                  cand?.full_name || ''
                                }, please use this link to book your interview support slot for ${
                                  req?.interview_company_name || 'your upcoming interview'
                                }: ${url}`;
                                window.open(
                                  `https://wa.me/?text=${encodeURIComponent(text)}`,
                                  '_blank'
                                );
                              }}
                              className="px-3 py-1.5 bg-accent-green/15 hover:bg-accent-green/25 text-accent-green rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <MessageCircle className="w-3 h-3" />
                              WhatsApp
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                {bookingLinks.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-12 text-center text-text-muted font-medium"
                    >
                      No booking links generated yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: INTERVIEW REQUESTS & ROUNDS LIST */}
      {activeTab !== 'analytics' &&
        activeTab !== 'proxy_team' &&
        activeTab !== 'proxy_schedule' &&
        activeTab !== 'bookings' && (
          <div className="space-y-5">
            {selectedProxyId !== 'all' && (
              <SlotVisualizer
                rounds={rounds}
                availabilities={availabilities}
                date={
                  filterDate
                    ? parseLocalTimeToDate(`${filterDate}T00:00:00`, 'America/New_York')
                    : new Date()
                }
                proxyId={selectedProxyId}
              />
            )}

            <div className="grid grid-cols-1 gap-5">
              <AnimatePresence mode="popLayout">
                {filteredRequests.map((req) => {
                  const candidate = candidates.find((c) => c.id === req.candidate_id);
                  const reqRounds = rounds.filter((r) => r.request_id === req.id);

                  return (
                    <motion.div
                      key={req.id}
                      layout
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      className="bg-bg-secondary border border-border-primary rounded-3xl p-5 sm:p-7 hover:border-amber-500/30 transition-all"
                    >
                      <div className="flex flex-col lg:flex-row gap-6">
                        {/* Left: Candidate, Interview & Rounds */}
                        <div className="flex-1 space-y-5">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span
                              className={cn(
                                'px-3.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border',
                                req.overall_status === 'live'
                                  ? 'bg-accent-red/10 text-accent-red border-accent-red/20 animate-pulse'
                                  : req.overall_status === 'completed' ||
                                    req.overall_status === 'placed'
                                  ? 'bg-accent-green/10 text-accent-green border-accent-green/20'
                                  : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                              )}
                            >
                              {req.overall_status.replace(/_/g, ' ')}
                            </span>
                            {!req.proxy_required && (
                              <span className="px-3.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border bg-accent-purple/10 text-accent-purple border-accent-purple/20 flex items-center gap-1.5">
                                <UserIcon className="w-3 h-3" />
                                Self Attended
                              </span>
                            )}
                            <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Created {new Date(req.created_at).toLocaleDateString()}
                            </span>
                          </div>

                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                              <h3 className="text-xl sm:text-2xl font-black text-text-primary flex items-center gap-2">
                                <UserIcon className="w-5 h-5 text-amber-500 shrink-0" />
                                <span className="truncate">
                                  {candidate?.full_name || 'Candidate'}
                                </span>
                              </h3>
                              <div className="flex flex-wrap gap-4 mt-2">
                                <div className="flex items-center gap-1.5 text-xs sm:text-sm text-text-secondary">
                                  <Building className="w-4 h-4 text-text-muted" />
                                  <span className="font-bold text-text-primary">
                                    {req.interview_company_name || req.company_name}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 text-xs sm:text-sm text-text-secondary">
                                  <Briefcase className="w-4 h-4 text-text-muted" />
                                  <span className="font-bold text-text-primary">
                                    {req.job_title}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {req.whatsapp_number && (
                              <div className="text-xs font-bold text-text-secondary bg-bg-tertiary px-3.5 py-2 rounded-xl border border-border-primary self-start">
                                WhatsApp: {req.whatsapp_number}
                              </div>
                            )}
                          </div>

                          {/* Interview Resume & Job Links */}
                          <div className="flex flex-wrap gap-2.5">
                            {(() => {
                              const resumeInfo = getInterviewResumeInfo(req, candidate);
                              if (resumeInfo.hasOtherResume) {
                                return (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleViewFile(
                                        resumeInfo.otherResumeUrl!,
                                        resumeInfo.otherResumeFilename
                                      )
                                    }
                                    className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 rounded-xl text-[10px] font-black text-amber-400 uppercase tracking-wider cursor-pointer"
                                  >
                                    <Sparkles className="w-3.5 h-3.5" />
                                    <span>View Interview Resume</span>
                                  </button>
                                );
                              }
                              if (resumeInfo.masterResumeUrl) {
                                return (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleViewFile(
                                        resumeInfo.masterResumeUrl,
                                        resumeInfo.masterResumeFilename
                                      )
                                    }
                                    className="flex items-center gap-2 px-3 py-1.5 bg-bg-tertiary border border-border-primary rounded-xl text-[10px] font-black text-text-primary hover:bg-bg-primary uppercase tracking-wider cursor-pointer"
                                  >
                                    <FileText className="w-3.5 h-3.5 text-amber-500" />
                                    View Resume
                                  </button>
                                );
                              }
                              return null;
                            })()}
                            {req.job_link && (
                              <a
                                href={req.job_link}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 px-3 py-1.5 bg-bg-tertiary border border-border-primary rounded-xl text-[10px] font-black text-text-primary hover:bg-bg-primary uppercase tracking-wider"
                              >
                                <ExternalLink className="w-3.5 h-3.5 text-amber-500" />
                                Job Link
                              </a>
                            )}
                            {(candidate?.whatsapp || req.whatsapp_number) && (
                              <a
                                href={`https://wa.me/${(
                                  candidate?.whatsapp ||
                                  req.whatsapp_number ||
                                  ''
                                ).replace(/\D/g, '')}`}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 px-3 py-1.5 bg-bg-tertiary border border-border-primary rounded-xl text-[10px] font-black text-text-primary hover:bg-bg-primary uppercase tracking-wider"
                              >
                                <MessageCircle className="w-3.5 h-3.5 text-accent-green" />
                                WhatsApp Candidate
                              </a>
                            )}
                          </div>

                          {/* Interview Rounds & Proxy Assignments */}
                          <div className="space-y-2.5">
                            <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">
                              Interview Rounds & Proxy Assignments
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {reqRounds.map((round, rIdx) => {
                                const proxy = team.find(
                                  (u) => String(u.id) === String(round.proxy_user_id)
                                );
                                return (
                                  <div
                                    key={round.id}
                                    className={cn(
                                      'p-4 rounded-2xl border transition-all',
                                      round.status === 'confirmed'
                                        ? 'bg-accent-green/5 border-accent-green/20'
                                        : round.status === 'booked'
                                        ? 'bg-amber-500/5 border-amber-500/20'
                                        : 'bg-bg-tertiary border-border-primary'
                                    )}
                                  >
                                    <div className="flex justify-between items-start mb-2">
                                      <span className="text-[10px] font-black uppercase tracking-wider text-text-muted">
                                        Round {rIdx + 1}: {round.round_label}
                                      </span>
                                      <span
                                        className={cn(
                                          'px-2 py-0.5 rounded-md text-[9px] font-bold uppercase',
                                          round.status === 'confirmed'
                                            ? 'bg-accent-green/20 text-accent-green'
                                            : 'bg-bg-secondary text-text-muted'
                                        )}
                                      >
                                        {round.status}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-2 mb-3">
                                      <Calendar className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                      <span className="text-xs font-bold text-text-primary">
                                        {round.booked_slot_time || round.interview_date
                                          ? parseLocalTimeToDate(
                                              round.booked_slot_time ||
                                                round.interview_date!,
                                              'America/New_York'
                                            ).toLocaleString('en-US', {
                                              dateStyle: 'medium',
                                              timeStyle: 'short',
                                              timeZone: 'America/New_York',
                                            }) + ' EST'
                                          : 'Not Scheduled'}
                                      </span>
                                    </div>

                                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-border-primary/50">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <UserIcon className="w-3.5 h-3.5 text-text-muted shrink-0" />
                                        <span className="text-[11px] font-bold text-text-secondary truncate">
                                          {!req.proxy_required
                                            ? 'Self Attended'
                                            : proxy?.display_name || 'No Proxy Assigned'}
                                        </span>
                                        {req.proxy_required && canManageInterviews && (
                                          <button
                                            onClick={() =>
                                              setProxyAssignmentConfig({
                                                request: req,
                                                round,
                                              })
                                            }
                                            className="p-1 hover:bg-amber-500/10 rounded-lg text-amber-500 cursor-pointer"
                                            title="Assign / Reassign Proxy"
                                          >
                                            <FileEdit className="w-3 h-3" />
                                          </button>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-2 shrink-0">
                                        {round.booking_link_token ? (
                                          <button
                                            onClick={() =>
                                              copyBookingLink(round.booking_link_token!)
                                            }
                                            className="p-1.5 text-amber-500 hover:bg-amber-500/10 rounded-lg transition-all cursor-pointer"
                                            title="Copy Booking Link"
                                          >
                                            <Copy className="w-3.5 h-3.5" />
                                          </button>
                                        ) : (
                                          canManageInterviews && (
                                            <button
                                              onClick={() =>
                                                handleGenerateLink(req.id, round.id)
                                              }
                                              className="text-[10px] font-bold text-amber-500 hover:underline cursor-pointer"
                                            >
                                              Generate Link
                                            </button>
                                          )
                                        )}
                                        {canEditSchedule && (
                                          <button
                                            onClick={() =>
                                              setDirectScheduleConfig({
                                                request: req,
                                                round,
                                              })
                                            }
                                            className="text-[10px] font-bold text-accent-blue hover:underline cursor-pointer"
                                          >
                                            {round.interview_date
                                              ? 'Edit Time'
                                              : 'Set Time'}
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Right: Interview Support Actions Only */}
                        <div className="flex flex-col gap-2.5 w-full lg:w-[220px] lg:min-w-[220px] justify-center p-4 bg-bg-tertiary/50 rounded-2xl border border-border-primary/60">
                          <button
                            onClick={() => setSelectedDetailRequest(req)}
                            className="w-full py-3 bg-bg-tertiary text-text-primary text-xs font-bold rounded-xl border border-border-primary hover:bg-bg-primary transition-all cursor-pointer"
                          >
                            View Interview Details
                          </button>

                          {canManageInterviews &&
                            (req.overall_status === 'pending_request' ||
                              req.overall_status === 'booking_link_generated') && (
                              <button
                                onClick={() => {
                                  const roundWithLink = reqRounds.find(
                                    (r) => r.booking_link_token
                                  );
                                  if (roundWithLink) {
                                    copyBookingLink(roundWithLink.booking_link_token!);
                                  } else {
                                    const roundToGen = reqRounds.find(
                                      (r) => !r.booking_link_token
                                    );
                                    if (roundToGen)
                                      handleGenerateLink(req.id, roundToGen.id);
                                  }
                                }}
                                className="w-full py-3 bg-amber-500 text-black text-xs font-black rounded-xl hover:bg-amber-400 transition-all flex items-center justify-center gap-2 cursor-pointer"
                              >
                                <Share2 className="w-3.5 h-3.5" />
                                {req.proxy_required
                                  ? 'Share Booking Link'
                                  : 'Share Interview Link'}
                              </button>
                            )}

                          {canManageInterviews &&
                            req.proxy_required &&
                            [
                              'candidate_slot_selected',
                              'proxy_assigned',
                              'confirmed',
                              'live',
                              'pending_request',
                            ].includes(req.overall_status) && (
                              <button
                                onClick={() => {
                                  const round =
                                    reqRounds.find(
                                      (r) => r.booked_slot_time && !r.proxy_user_id
                                    ) ||
                                    reqRounds.find(
                                      (r) =>
                                        r.status !== 'completed' &&
                                        r.status !== 'cancelled'
                                    ) ||
                                    reqRounds[0];
                                  if (round) {
                                    setProxyAssignmentConfig({ request: req, round });
                                  } else {
                                    showToast('No round available for proxy assignment', 'error');
                                  }
                                }}
                                className="w-full py-3 bg-accent-blue text-white text-xs font-bold rounded-xl hover:bg-accent-blue/90 transition-all flex items-center justify-center gap-2 cursor-pointer"
                              >
                                <UserIcon className="w-3.5 h-3.5" />
                                {reqRounds.some((r) => r.proxy_user_id)
                                  ? 'Reassign Proxy'
                                  : 'Assign Proxy'}
                              </button>
                            )}

                          {(req.overall_status === 'feedback_added' ||
                            req.overall_status === 'completed') &&
                            reqRounds.some((r) =>
                              feedbacks.some((f) => f.interview_round_id === r.id)
                            ) && (
                              <button
                                onClick={() => {
                                  const round = reqRounds.find((r) =>
                                    feedbacks.some((f) => f.interview_round_id === r.id)
                                  );
                                  if (round) {
                                    const fb = feedbacks.find(
                                      (f) => f.interview_round_id === round.id
                                    );
                                    if (fb)
                                      setSelectedFeedbackRound({ round, feedback: fb });
                                  }
                                }}
                                className="w-full py-3 bg-bg-tertiary text-text-primary text-xs font-bold rounded-xl border border-border-primary hover:bg-bg-primary transition-all flex items-center justify-center gap-2 cursor-pointer"
                              >
                                <FileSearch className="w-3.5 h-3.5 text-amber-500" />
                                View Proxy Feedback
                              </button>
                            )}

                          {canManageInterviews &&
                            (req.overall_status === 'feedback_added' ||
                              req.overall_status === 'completed') && (
                              <button
                                onClick={() => {
                                  const round =
                                    reqRounds.find(
                                      (r) =>
                                        r.status === 'completed' &&
                                        r.result === 'pending'
                                    ) || reqRounds[reqRounds.length - 1];
                                  if (round) {
                                    setResultUpdateConfig({ request: req, round });
                                  }
                                }}
                                className="w-full py-3 bg-accent-green text-white text-xs font-bold rounded-xl hover:bg-accent-green/90 transition-all flex items-center justify-center gap-2 cursor-pointer"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Update Interview Result
                              </button>
                            )}

                          {canManageInterviews &&
                            [
                              'confirmed',
                              'live',
                              'proxy_assigned',
                              'candidate_slot_selected',
                            ].includes(req.overall_status) && (
                              <button
                                onClick={() => {
                                  const round = reqRounds.find(
                                    (r) =>
                                      r.status !== 'completed' &&
                                      r.status !== 'cancelled'
                                  );
                                  if (round) handleReschedule(req, round);
                                }}
                                className="w-full py-3 bg-amber-500/10 text-amber-500 text-xs font-bold rounded-xl border border-amber-500/20 hover:bg-amber-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                Reschedule
                              </button>
                            )}

                          {canEditSchedule && (
                            <button
                              onClick={() => handleDeleteRequest(req.id)}
                              className="w-full py-2.5 bg-rose-500/10 text-rose-500 text-[10px] font-black uppercase tracking-widest rounded-xl border border-rose-500/20 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center gap-1.5 mt-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete Request
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {filteredRequests.length === 0 && (
                <div className="text-center py-24 bg-bg-secondary border border-border-primary border-dashed rounded-3xl">
                  <Calendar className="w-14 h-14 text-text-muted mx-auto mb-4 opacity-25" />
                  <h3 className="text-xl font-black text-text-primary">
                    No interviews found in this view
                  </h3>
                  <p className="text-xs text-text-secondary mt-1 max-w-md mx-auto">
                    Switch tabs above or adjust your proxy/date filters to view other Interview Support records.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

      {/* Create Interview Support Request Modal */}
      {isRequestModalOpen && (
        <AurrumInterviewRequestModal
          onClose={() => setIsRequestModalOpen(false)}
          candidates={candidates}
          team={team}
          allRounds={rounds}
          allAvailabilities={availabilities}
          allCalendarEvents={calendarEvents}
          onSuccess={() => {
            setIsRequestModalOpen(false);
            showToast('Interview support request created!', 'success');
          }}
        />
      )}

      {/* Proxy Assignment Modal (Uses findBestProxyForWindow with 15m buffer validation) */}
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
        <AurrumDirectScheduleModal
          onClose={() => setDirectScheduleConfig(null)}
          round={directScheduleConfig.round}
          request={directScheduleConfig.request}
          onSuccess={() => {
            setDirectScheduleConfig(null);
            showToast('Interview schedule updated!', 'success');
          }}
        />
      )}

      {/* Pure Interview Support Result Modal */}
      {resultUpdateConfig && (
        <AurrumResultModal
          onClose={() => setResultUpdateConfig(null)}
          round={resultUpdateConfig.round}
          request={resultUpdateConfig.request}
          onSuccess={() => {
            setResultUpdateConfig(null);
            showToast('Interview result updated!', 'success');
          }}
        />
      )}

      {/* Proxy Technical Feedback Modal */}
      {selectedFeedbackRound && (
        <AurrumFeedbackModal
          onClose={() => setSelectedFeedbackRound(null)}
          round={selectedFeedbackRound.round}
          feedback={selectedFeedbackRound.feedback}
        />
      )}

      {/* Pure Interview Details Modal (No Recruiter/CS/CRM clutter) */}
      {selectedDetailRequest && (
        <AurrumInterviewDetailModal
          request={selectedDetailRequest}
          rounds={rounds.filter((r) => r.request_id === selectedDetailRequest.id)}
          candidate={candidates.find(
            (c) => c.id === selectedDetailRequest.candidate_id
          )}
          team={team}
          feedbacks={feedbacks}
          onClose={() => setSelectedDetailRequest(null)}
        />
      )}

      {/* Add Proxy Availability Slot Modal */}
      {addSlotConfig && scheduleProxyId && (
        <AddSlotModal
          date={addSlotConfig.date}
          proxyUserId={scheduleProxyId}
          onClose={() => setAddSlotConfig(null)}
          onSuccess={() => {
            setAddSlotConfig(null);
            showToast('Proxy availability slot added!', 'success');
          }}
        />
      )}
    </div>
  );
};

const ProxyStatusCard: React.FC<{
  proxy: User;
  activeCount: number;
  completedCount: number;
  canEdit: boolean;
  onUpdate: (userId: string, updates: Partial<User>) => Promise<void>;
}> = ({ proxy, activeCount, completedCount, canEdit, onUpdate }) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [leaveReturn, setLeaveReturn] = useState(proxy.leave_return_date || '');

  const isOnLeave = useMemo(() => {
    if (proxy.is_on_leave) return true;
    if (proxy.leave_return_date) {
      const returnDate = parseLocalTimeToDate(proxy.leave_return_date);
      const nowEST = new Date(
        new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
      );
      return !isNaN(returnDate.getTime()) && returnDate > nowEST;
    }
    return false;
  }, [proxy.is_on_leave, proxy.leave_return_date]);

  return (
    <div className="bg-bg-secondary p-6 rounded-3xl border border-border-primary space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <div
            className={cn(
              'w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-black border',
              isOnLeave
                ? 'bg-accent-red/10 border-accent-red/20 text-accent-red'
                : 'bg-accent-green/10 border-accent-green/20 text-accent-green'
            )}
          >
            {proxy.display_name.charAt(0)}
          </div>
          <div>
            <h4 className="text-base font-black text-text-primary">
              {proxy.display_name}
            </h4>
            <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
              Proxy Specialist
            </p>
          </div>
        </div>
        <span
          className={cn(
            'px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider',
            isOnLeave
              ? 'bg-accent-red/15 text-accent-red'
              : 'bg-accent-green/15 text-accent-green'
          )}
        >
          {isOnLeave ? 'On Leave' : 'Available'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 bg-bg-tertiary rounded-2xl border border-border-primary text-center">
          <p className="text-xl font-black text-amber-500">{activeCount}</p>
          <p className="text-[10px] font-bold text-text-muted uppercase">
            Active Rounds
          </p>
        </div>
        <div className="p-3 bg-bg-tertiary rounded-2xl border border-border-primary text-center">
          <p className="text-xl font-black text-accent-green">{completedCount}</p>
          <p className="text-[10px] font-bold text-text-muted uppercase">
            Completed
          </p>
        </div>
      </div>

      {canEdit && (
        <div className="space-y-3 pt-2 border-t border-border-primary/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-text-secondary">
              Manual Leave Override
            </span>
            <button
              disabled={isUpdating}
              type="button"
              onClick={async () => {
                setIsUpdating(true);
                await onUpdate(String(proxy.id), {
                  is_on_leave: !proxy.is_on_leave,
                });
                setIsUpdating(false);
              }}
              className={cn(
                'w-12 h-6 rounded-full relative transition-all border cursor-pointer',
                proxy.is_on_leave
                  ? 'bg-accent-red border-accent-red'
                  : 'bg-bg-tertiary border-border-primary'
              )}
            >
              <div
                className={cn(
                  'w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all',
                  proxy.is_on_leave ? 'right-1' : 'left-1'
                )}
              />
            </button>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-text-muted uppercase tracking-wider">
              Leave Until (EST)
            </label>
            <div className="flex gap-2">
              <input
                type="datetime-local"
                value={leaveReturn}
                onChange={(e) => setLeaveReturn(e.target.value)}
                className="flex-1 px-3 py-2 bg-bg-tertiary border border-border-primary rounded-xl text-xs font-bold text-text-primary"
              />
              <button
                type="button"
                disabled={isUpdating}
                onClick={async () => {
                  setIsUpdating(true);
                  await onUpdate(String(proxy.id), {
                    leave_return_date: leaveReturn || null,
                  });
                  setIsUpdating(false);
                }}
                className="px-3 py-2 bg-amber-500 text-black font-black rounded-xl text-xs hover:bg-amber-400 cursor-pointer"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const AurrumFeedbackModal: React.FC<{
  onClose: () => void;
  round: InterviewRound;
  feedback: InterviewFeedback;
}> = ({ onClose, round, feedback }) => (
  <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[60] flex items-center justify-center p-4">
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-bg-secondary w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-border-primary p-6 sm:p-8 space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">
            Proxy Technical Evaluation
          </span>
          <h2 className="text-2xl font-black text-text-primary mt-1">
            {round.round_label}
          </h2>
          <p className="text-xs font-bold text-text-muted mt-1">
            Submitted{' '}
            {new Date(feedback.created_at).toLocaleString('en-US', {
              timeZone: 'America/New_York',
            })}{' '}
            EST
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-bg-tertiary rounded-xl text-text-muted"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 bg-bg-tertiary rounded-2xl border border-border-primary space-y-2">
          <div className="flex items-center gap-2 text-[10px] font-black text-text-muted uppercase">
            <FileText className="w-3.5 h-3.5 text-amber-500" />
            Interview Notes
          </div>
          <p className="text-xs text-text-primary whitespace-pre-wrap">
            {feedback.interview_notes || 'No notes recorded.'}
          </p>
        </div>

        <div className="p-4 bg-bg-tertiary rounded-2xl border border-border-primary space-y-2">
          <div className="flex items-center gap-2 text-[10px] font-black text-text-muted uppercase">
            <Trophy className="w-3.5 h-3.5 text-amber-500" />
            Candidate Performance
          </div>
          <p className="text-xs text-text-primary whitespace-pre-wrap">
            {feedback.candidate_performance || 'Not specified.'}
          </p>
        </div>

        <div className="p-4 bg-bg-tertiary rounded-2xl border border-border-primary space-y-2 md:col-span-2">
          <div className="flex items-center gap-2 text-[10px] font-black text-text-muted uppercase">
            <HelpCircle className="w-3.5 h-3.5 text-accent-purple" />
            Questions Asked
          </div>
          <p className="text-xs text-text-secondary whitespace-pre-wrap">
            {feedback.questions_asked || 'No questions logged.'}
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={onClose}
          className="px-6 py-2.5 bg-bg-tertiary border border-border-primary rounded-xl text-xs font-bold text-text-primary hover:bg-bg-primary cursor-pointer"
        >
          Close
        </button>
      </div>
    </motion.div>
  </div>
);

const AurrumResultModal: React.FC<{
  onClose: () => void;
  round: InterviewRound;
  request: InterviewSupportRequest;
  onSuccess: () => void;
}> = ({ onClose, round, request, onSuccess }) => {
  const { user } = useAuth();
  const [result, setResult] = useState<InterviewRound['result']>(
    round.result || 'pending'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSave = async () => {
    if (!result || result === 'pending' || !user) return;
    setIsSubmitting(true);
    try {
      await updateInterviewRound(round.id, { result });
      await logInterviewActivity(
        round.id,
        'RESULT_FINALIZED',
        { result },
        String(user.id)
      );

      let newStatus = request.overall_status;
      if (result === 'rejected') newStatus = 'rejected';
      else if (result === 'next_round') newStatus = 'next_round';
      else if (result === 'offer') newStatus = 'completed';

      await updateInterviewSupportRequest(request.id, {
        overall_status: newStatus,
      });

      if (round.proxy_user_id) {
        await addInterviewNotification({
          recipient_user_id: round.proxy_user_id,
          interview_round_id: round.id,
          notification_type: 'result_updated',
          message: `The result for ${request.interview_company_name} (${round.round_label}) has been updated to: ${result.replace('_', ' ')}.`,
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
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-bg-secondary w-full max-w-md rounded-3xl shadow-2xl border border-border-primary p-6 sm:p-8 space-y-6"
      >
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">
              Interview Outcome
            </span>
            <h2 className="text-2xl font-black text-text-primary mt-1">
              Update Round Result
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-bg-tertiary rounded-xl text-text-muted"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2.5">
          {[
            { id: 'next_round', label: 'Advanced to Next Round' },
            { id: 'offer', label: 'Selected / Offer Extended' },
            { id: 'rejected', label: 'Not Selected' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setResult(item.id as InterviewRound['result'])}
              className={cn(
                'w-full py-3.5 px-4 rounded-2xl border text-xs font-black uppercase tracking-wider transition-all cursor-pointer',
                result === item.id
                  ? 'bg-amber-500/15 border-amber-500 text-amber-500'
                  : 'bg-bg-tertiary border-border-primary text-text-secondary hover:text-text-primary'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 bg-bg-tertiary text-text-primary font-bold rounded-xl text-xs cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!result || result === 'pending' || isSubmitting}
            className="flex-1 py-3 bg-amber-500 text-black font-black rounded-xl text-xs hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? 'Saving...' : 'Save Result'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const AurrumDirectScheduleModal: React.FC<{
  onClose: () => void;
  round: InterviewRound;
  request: InterviewSupportRequest;
  onSuccess: () => void;
}> = ({ onClose, round, request, onSuccess }) => {
  const [date, setDate] = useState(
    round.booked_slot_time ? round.booked_slot_time.substring(0, 16) : ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clearPrevious, setClearPrevious] = useState(true);

  const handleUpdate = async () => {
    if (!date) return;
    setIsSubmitting(true);
    try {
      const parts = date.split('T');
      const bookedStart = date.length === 16 ? `${date}:00` : date;

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
        await clearPreviousCalendarEvents(round.id);
      }

      await updateInterviewRound(round.id, {
        interview_date: parts[0],
        booked_slot_time: bookedStart,
        booked_slot_end: bookedEnd,
        status: 'confirmed',
      });
      await updateInterviewSupportRequest(request.id, {
        overall_status: 'confirmed',
      });

      const assignedProxyId = round.proxy_user_id || request.proxy_user_id;
      if (assignedProxyId) {
        try {
          await syncInterviewRoundToGoogleCalendar(
            round.id,
            request.id,
            String(assignedProxyId)
          );
        } catch (calErr) {
          console.error('[AurrumDirectScheduleModal] Sync error:', calErr);
        }
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
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-bg-secondary w-full max-w-md rounded-3xl shadow-2xl border border-border-primary p-6 sm:p-8 space-y-5"
      >
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">
              Schedule Round (EST)
            </span>
            <h2 className="text-2xl font-black text-text-primary mt-1">
              Set Interview Time
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-bg-tertiary rounded-xl text-text-muted"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-black text-text-muted uppercase tracking-widest block mb-1.5">
              Interview Date & Time (EST)
            </label>
            <input
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-3 bg-bg-tertiary border border-border-primary rounded-xl text-sm font-bold text-text-primary focus:outline-none"
            />
          </div>

          <label className="flex items-start gap-3 p-3.5 bg-bg-tertiary border border-border-primary rounded-xl cursor-pointer">
            <input
              type="checkbox"
              checked={clearPrevious}
              onChange={(e) => setClearPrevious(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-xs text-text-secondary">
              <strong className="text-text-primary block">
                Clear Previous Calendar Events
              </strong>
              Remove prior scheduled calendar entries for this round before syncing the updated time.
            </span>
          </label>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-bg-tertiary text-text-primary font-bold rounded-xl text-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleUpdate}
              disabled={!date || isSubmitting}
              className="flex-1 py-3 bg-amber-500 text-black font-black rounded-xl text-xs hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Saving...' : 'Save Schedule'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const AurrumInterviewDetailModal: React.FC<{
  request: InterviewSupportRequest;
  rounds: InterviewRound[];
  candidate?: Candidate;
  team: User[];
  feedbacks: InterviewFeedback[];
  onClose: () => void;
}> = ({ request, rounds, candidate, team, feedbacks, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[60] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-bg-secondary w-full max-w-3xl rounded-3xl shadow-2xl border border-border-primary max-h-[88vh] flex flex-col overflow-hidden"
      >
        <div className="px-6 py-5 border-b border-border-primary flex items-center justify-between bg-bg-tertiary">
          <div>
            <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">
              Interview Support Record
            </span>
            <h2 className="text-xl font-black text-text-primary mt-0.5">
              {candidate?.full_name || 'Candidate'} —{' '}
              {request.interview_company_name || request.company_name}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-bg-secondary rounded-xl text-text-muted"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 bg-bg-tertiary rounded-2xl border border-border-primary">
              <p className="text-[10px] font-black text-text-muted uppercase">
                Job Title
              </p>
              <p className="text-sm font-bold text-text-primary mt-1">
                {request.job_title}
              </p>
            </div>
            <div className="p-3.5 bg-bg-tertiary rounded-2xl border border-border-primary">
              <p className="text-[10px] font-black text-text-muted uppercase">
                Support Mode
              </p>
              <p className="text-sm font-bold text-amber-500 mt-1">
                {request.proxy_required ? 'Proxy Support Assigned' : 'Self Attended'}
              </p>
            </div>
            <div className="p-3.5 bg-bg-tertiary rounded-2xl border border-border-primary">
              <p className="text-[10px] font-black text-text-muted uppercase">
                Booking Status
              </p>
              <p className="text-sm font-bold text-text-primary uppercase mt-1">
                {request.overall_status.replace(/_/g, ' ')}
              </p>
            </div>
          </div>

          {request.job_description && (
            <div className="p-4 bg-bg-tertiary rounded-2xl border border-border-primary space-y-1.5">
              <p className="text-[10px] font-black text-text-muted uppercase">
                Job Description
              </p>
              <p className="text-xs text-text-secondary whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto custom-scrollbar">
                {request.job_description}
              </p>
            </div>
          )}

          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-text-muted">
              Scheduled Rounds ({rounds.length})
            </h4>
            {rounds.map((r, i) => {
              const proxy = team.find(
                (u) => String(u.id) === String(r.proxy_user_id)
              );
              const fb = feedbacks.find((f) => f.interview_round_id === r.id);
              return (
                <div
                  key={r.id}
                  className="p-4 bg-bg-tertiary rounded-2xl border border-border-primary space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black text-text-primary">
                      Round {i + 1}: {r.round_label} ({r.round_type})
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500/15 text-amber-500">
                      {r.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs text-text-secondary">
                    <span>
                      <strong>Time:</strong>{' '}
                      {r.booked_slot_time || r.interview_date
                        ? parseLocalTimeToDate(
                            r.booked_slot_time || r.interview_date!,
                            'America/New_York'
                          ).toLocaleString('en-US', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                            timeZone: 'America/New_York',
                          }) + ' EST'
                        : 'Not scheduled'}
                    </span>
                    <span>
                      <strong>Proxy:</strong>{' '}
                      {request.proxy_required
                        ? proxy?.display_name || 'Unassigned'
                        : 'Self Attended'}
                    </span>
                    {r.result && (
                      <span>
                        <strong>Result:</strong> {r.result.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                  {fb && (
                    <div className="mt-2 pt-2 border-t border-border-primary/60 text-xs text-text-secondary">
                      <strong className="text-text-primary">Proxy Notes:</strong>{' '}
                      {fb.interview_notes}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const AurrumInterviewRequestModal: React.FC<{
  onClose: () => void;
  candidates: Candidate[];
  team: User[];
  allRounds: InterviewRound[];
  allAvailabilities: ProxyAvailability[];
  allCalendarEvents: any[];
  onSuccess: () => void;
}> = ({
  onClose,
  candidates,
  team,
  allRounds,
  allAvailabilities,
  allCalendarEvents,
  onSuccess,
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [resumeOption, setResumeOption] = useState<'existing' | 'upload'>('existing');
  const [newResumeFile, setNewResumeFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    candidate_id: '',
    interview_company_name: '',
    job_title: '',
    interview_type: 'technical' as any,
    timezone: 'America/New_York',
    notes: '',
    whatsapp_number: '',
    job_link: '',
    job_description: '',
    proxy_required: true,
    rounds: [
      {
        label: 'Screening',
        type: 'screening' as any,
        duration: 30,
        interview_date: '',
        start_time: '',
        end_time: '',
      },
    ],
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const multiRoundAssignment = useMemo(() => {
    return assignProxiesForRounds(
      formData.rounds,
      team,
      allRounds,
      allAvailabilities,
      allCalendarEvents
    );
  }, [formData.rounds, team, allRounds, allAvailabilities, allCalendarEvents]);

  const assignmentResult = useMemo(() => {
    const firstAssigned = multiRoundAssignment.roundAssignments.find(
      (ra) => ra.bestProxy || (ra.errors && ra.errors.length > 0)
    );
    if (!firstAssigned) {
      return { bestProxy: null, availableProxies: [], errors: [] };
    }
    return {
      bestProxy: firstAssigned.bestProxy,
      availableProxies: firstAssigned.availableProxies,
      errors:
        multiRoundAssignment.errors.length > 0
          ? multiRoundAssignment.errors
          : firstAssigned.errors,
    };
  }, [multiRoundAssignment]);

  // Prioritize Aurrum candidates at the top of the selector
  const candidateOptions = useMemo(() => {
    const sorted = [...candidates].sort((a, b) => {
      if (a.crm_brand === 'aurrum' && b.crm_brand !== 'aurrum') return -1;
      if (a.crm_brand !== 'aurrum' && b.crm_brand === 'aurrum') return 1;
      return (a.full_name || '').localeCompare(b.full_name || '');
    });
    return sorted.map((c) => ({
      value: c.id,
      label:
        c.crm_brand === 'aurrum'
          ? `${c.full_name} (Aurrum Careers)`
          : c.full_name,
    }));
  }, [candidates]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSubmitting(true);
    try {
      const candidate = candidates.find((c) => c.id === formData.candidate_id);
      const latestResume = getLatestCandidateResume(candidate);

      let resumeId =
        latestResume.filename || candidate?.resume_filename || 'original';
      let otherResumeUrl: string | null = null;
      let otherResumeFilename: string | null = null;
      let useOtherResume = false;

      if (resumeOption === 'upload' && newResumeFile) {
        otherResumeUrl = await uploadFile(newResumeFile);
        otherResumeFilename = newResumeFile.name;
        resumeId = otherResumeUrl;
        useOtherResume = true;
      }

      const assignedProxiesByRoundIdx: { [roundIdx: number]: any } = {};

      if (formData.proxy_required) {
        const missingTimes = formData.rounds.some(
          (r) => !r.interview_date || !r.start_time || !r.end_time
        );
        if (missingTimes) {
          showToast(
            'Please specify Date, Start Time, and End Time (EST) for all rounds when Proxy Support is required.',
            'error'
          );
          setIsSubmitting(false);
          return;
        }

        const multiResult = assignProxiesForRounds(
          formData.rounds,
          team,
          allRounds,
          allAvailabilities,
          allCalendarEvents
        );

        for (let i = 0; i < formData.rounds.length; i++) {
          const r = formData.rounds[i];
          const roundEval = multiResult.roundAssignments[i];

          if (
            !roundEval ||
            (roundEval.errors && roundEval.errors.length > 0) ||
            !roundEval.bestProxy
          ) {
            showToast(
              `No proxy available for ${r.interview_date} (${r.start_time} - ${r.end_time} EST). Please choose another slot.`,
              'error'
            );
            setIsSubmitting(false);
            return;
          }

          assignedProxiesByRoundIdx[i] = roundEval.bestProxy;
        }
      }

      const requestId = await addInterviewSupportRequest({
        candidate_id: formData.candidate_id,
        recruiter_id: String(user.id),
        cs_id: null,
        company_name: formData.interview_company_name,
        interview_company_name: formData.interview_company_name,
        job_title: formData.job_title,
        interview_type: formData.interview_type,
        timezone: formData.timezone,
        notes: formData.notes,
        whatsapp_number: formData.whatsapp_number,
        job_link: formData.job_link,
        application_link: '',
        job_description: formData.job_description,
        latest_resume_id: resumeId,
        use_other_resume: useOtherResume,
        other_resume_url: otherResumeUrl,
        other_resume_filename: otherResumeFilename,
        proxy_required: formData.proxy_required,
        proxy_user_id: formData.proxy_required
          ? assignedProxiesByRoundIdx[0]?.id || null
          : null,
        overall_status: formData.proxy_required ? 'confirmed' : 'pending_request',
        created_by: String(user.id),
      });

      if (requestId) {
        for (let roundIdx = 0; roundIdx < formData.rounds.length; roundIdx++) {
          const round = formData.rounds[roundIdx];
          let assignedProxyId: string | null = null;
          let statusStr: 'confirmed' | 'pending' = 'pending';
          let bookedStart: string | null = null;
          let bookedEnd: string | null = null;
          let durationMin = round.duration;

          if (
            round.interview_date &&
            round.start_time &&
            round.end_time
          ) {
            if (formData.proxy_required) {
              const proxyForRound = assignedProxiesByRoundIdx[roundIdx];
              assignedProxyId = proxyForRound ? proxyForRound.id : null;
            }
            statusStr = 'confirmed';
            bookedStart = `${round.interview_date}T${round.start_time}:00`;
            bookedEnd = `${round.interview_date}T${round.end_time}:00`;
            const startD = new Date(bookedStart);
            const endD = new Date(bookedEnd);
            durationMin = Math.max(
              15,
              Math.round((endD.getTime() - startD.getTime()) / 60000)
            );
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
            created_by: String(user.id),
          });

          if (statusStr === 'confirmed' && bookedStart && bookedEnd) {
            const bufferStart = new Date(
              new Date(bookedStart).getTime() - 15 * 60 * 1000
            ).toISOString();
            const bufferEnd = new Date(
              new Date(bookedEnd).getTime() + 15 * 60 * 1000
            ).toISOString();

            await addDoc(collection(db, 'jpc_calendar_events'), {
              interview_round_id: roundId,
              interview_request_id: requestId,
              summary: `Interview Support: ${
                candidate?.full_name || 'Candidate'
              } at ${formData.interview_company_name} [${round.label}]`,
              start_time: bookedStart,
              end_time: bookedEnd,
              reserved_start: bufferStart,
              reserved_end: bufferEnd,
              proxy_user_id: assignedProxyId,
              candidate_name: candidate?.full_name || 'Candidate',
              company_name: formData.interview_company_name,
              status: 'synced',
              notifications_sent: true,
              created_at: new Date().toISOString(),
            });

            if (assignedProxyId) {
              try {
                await syncInterviewRoundToGoogleCalendar(
                  roundId,
                  requestId,
                  assignedProxyId
                );
              } catch (calErr) {
                console.error('Calendar sync error:', calErr);
              }
            }
          }
        }
      }

      onSuccess();
    } catch (error) {
      console.error(error);
      showToast('Failed to create interview request.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-bg-secondary w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden border border-border-primary max-h-[90vh] flex flex-col"
      >
        <div className="px-6 py-5 border-b border-border-primary flex items-center justify-between bg-bg-tertiary">
          <div>
            <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">
              Aurrum Interview Support
            </span>
            <h2 className="text-xl font-black text-text-primary mt-0.5">
              Schedule Interview Support Request
            </h2>
            <p className="text-[10px] font-bold text-amber-500 mt-0.5">
              All interview times are coordinated in EST (with 15m pre/post proxy buffers)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-bg-primary rounded-xl text-text-secondary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">
                Candidate
              </label>
              <Select
                required
                options={candidateOptions}
                value={
                  candidateOptions.find(
                    (opt) => opt.value === formData.candidate_id
                  ) || null
                }
                onChange={(opt: any) => {
                  const selected = candidates.find((c) => c.id === opt?.value);
                  setFormData({
                    ...formData,
                    candidate_id: opt?.value || '',
                    whatsapp_number:
                      selected?.whatsapp ||
                      selected?.phone ||
                      formData.whatsapp_number,
                  });
                }}
                placeholder="Select candidate..."
                styles={customSelectStyles}
                className="w-full text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">
                Interview Resume
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setResumeOption('existing')}
                  className={cn(
                    'flex-1 py-2.5 px-3 rounded-xl text-xs font-bold border cursor-pointer',
                    resumeOption === 'existing'
                      ? 'bg-amber-500 text-black border-amber-500'
                      : 'bg-bg-tertiary text-text-secondary border-border-primary'
                  )}
                >
                  Profile Resume
                </button>
                <button
                  type="button"
                  onClick={() => setResumeOption('upload')}
                  className={cn(
                    'flex-1 py-2.5 px-3 rounded-xl text-xs font-bold border cursor-pointer',
                    resumeOption === 'upload'
                      ? 'bg-amber-500 text-black border-amber-500'
                      : 'bg-bg-tertiary text-text-secondary border-border-primary'
                  )}
                >
                  Upload Custom Resume
                </button>
              </div>
              {resumeOption === 'upload' && (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border border-dashed border-border-primary hover:border-amber-500/50 rounded-xl p-3 text-center cursor-pointer mt-2"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => {
                      if (e.target.files?.[0]) setNewResumeFile(e.target.files[0]);
                    }}
                    className="hidden"
                    accept=".pdf,.doc,.docx"
                  />
                  <span className="text-xs font-bold text-text-secondary flex items-center justify-center gap-1.5">
                    <Upload className="w-3.5 h-3.5 text-amber-500" />
                    {newResumeFile ? newResumeFile.name : 'Select PDF/DOCX file'}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">
                Interview Company
              </label>
              <input
                required
                type="text"
                value={formData.interview_company_name}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    interview_company_name: e.target.value,
                  })
                }
                placeholder="Company name"
                className="w-full px-4 py-3 bg-bg-tertiary border border-border-primary rounded-2xl text-sm font-bold text-text-primary focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">
                Job Title
              </label>
              <input
                required
                type="text"
                value={formData.job_title}
                onChange={(e) =>
                  setFormData({ ...formData, job_title: e.target.value })
                }
                placeholder="Target role"
                className="w-full px-4 py-3 bg-bg-tertiary border border-border-primary rounded-2xl text-sm font-bold text-text-primary focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">
                WhatsApp Number
              </label>
              <input
                required
                type="tel"
                value={formData.whatsapp_number}
                onChange={(e) =>
                  setFormData({ ...formData, whatsapp_number: e.target.value })
                }
                placeholder="+1 ..."
                className="w-full px-4 py-3 bg-bg-tertiary border border-border-primary rounded-2xl text-sm font-bold text-text-primary focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">
                Job Link (Optional)
              </label>
              <input
                type="url"
                value={formData.job_link}
                onChange={(e) =>
                  setFormData({ ...formData, job_link: e.target.value })
                }
                placeholder="https://..."
                className="w-full px-4 py-3 bg-bg-tertiary border border-border-primary rounded-2xl text-sm font-bold text-text-primary focus:outline-none"
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">
                Job Description
              </label>
              <textarea
                required
                rows={3}
                value={formData.job_description}
                onChange={(e) =>
                  setFormData({ ...formData, job_description: e.target.value })
                }
                placeholder="Paste job description or interview requirements..."
                className="w-full px-4 py-3 bg-bg-tertiary border border-border-primary rounded-2xl text-sm font-bold text-text-primary focus:outline-none resize-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="flex items-center gap-3 p-4 bg-bg-tertiary rounded-2xl border border-border-primary cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.proxy_required}
                  onChange={(e) =>
                    setFormData({ ...formData, proxy_required: e.target.checked })
                  }
                  className="w-5 h-5"
                />
                <div>
                  <span className="text-sm font-black text-text-primary block">
                    Proxy Support Required
                  </span>
                  <span className="text-[11px] text-text-muted font-bold">
                    Automatically validates 15-minute buffers and assigns the optimal available Proxy Team member.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Rounds Configuration */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">
                Interview Rounds (EST)
              </label>
              <button
                type="button"
                onClick={() =>
                  setFormData({
                    ...formData,
                    rounds: [
                      ...formData.rounds,
                      {
                        label: `Round ${formData.rounds.length + 1}`,
                        type: 'technical' as any,
                        duration: 60,
                        interview_date: '',
                        start_time: '',
                        end_time: '',
                      },
                    ],
                  })
                }
                className="text-xs font-black text-amber-500 hover:underline cursor-pointer"
              >
                + Add Round
              </button>
            </div>

            {formData.rounds.map((round, idx) => (
              <div
                key={idx}
                className="p-4 bg-bg-tertiary rounded-2xl border border-border-primary space-y-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <input
                    type="text"
                    value={round.label}
                    onChange={(e) => {
                      const next = [...formData.rounds];
                      next[idx].label = e.target.value;
                      setFormData({ ...formData, rounds: next });
                    }}
                    className="bg-transparent text-sm font-black text-text-primary focus:outline-none"
                    placeholder="Round Name"
                  />
                  <div className="flex items-center gap-2">
                    <select
                      value={round.type}
                      onChange={(e) => {
                        const next = [...formData.rounds];
                        next[idx].type = e.target.value as any;
                        setFormData({ ...formData, rounds: next });
                      }}
                      className="bg-bg-secondary border border-border-primary rounded-lg px-2.5 py-1 text-xs font-bold text-text-primary"
                    >
                      <option value="screening">Screening</option>
                      <option value="technical">Technical</option>
                      <option value="assessment">Assessment</option>
                      <option value="hr">HR</option>
                      <option value="final">Final</option>
                    </select>
                    {formData.rounds.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            rounds: formData.rounds.filter((_, i) => i !== idx),
                          })
                        }
                        className="p-1 text-rose-500 hover:bg-rose-500/10 rounded-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <span className="text-[9px] font-black uppercase text-text-muted block mb-1">
                      Date
                    </span>
                    <input
                      type="date"
                      required={formData.proxy_required}
                      value={round.interview_date}
                      onChange={(e) => {
                        const next = [...formData.rounds];
                        next[idx].interview_date = e.target.value;
                        setFormData({ ...formData, rounds: next });
                      }}
                      className="w-full px-3 py-2 bg-bg-secondary border border-border-primary rounded-xl text-xs font-bold text-text-primary"
                    />
                  </div>
                  <div>
                    <span className="text-[9px] font-black uppercase text-text-muted block mb-1">
                      Start Time (EST)
                    </span>
                    <input
                      type="time"
                      required={formData.proxy_required}
                      value={round.start_time}
                      onChange={(e) => {
                        const next = [...formData.rounds];
                        next[idx].start_time = e.target.value;
                        setFormData({ ...formData, rounds: next });
                      }}
                      className="w-full px-3 py-2 bg-bg-secondary border border-border-primary rounded-xl text-xs font-bold text-text-primary"
                    />
                  </div>
                  <div>
                    <span className="text-[9px] font-black uppercase text-text-muted block mb-1">
                      End Time (EST)
                    </span>
                    <input
                      type="time"
                      required={formData.proxy_required}
                      value={round.end_time}
                      onChange={(e) => {
                        const next = [...formData.rounds];
                        next[idx].end_time = e.target.value;
                        setFormData({ ...formData, rounds: next });
                      }}
                      className="w-full px-3 py-2 bg-bg-secondary border border-border-primary rounded-xl text-xs font-bold text-text-primary"
                    />
                  </div>
                </div>
              </div>
            ))}

            {formData.proxy_required &&
              assignmentResult.bestProxy &&
              !assignmentResult.errors?.length && (
                <div className="p-4 bg-accent-green/10 border border-accent-green/30 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="w-5 h-5 text-accent-green" />
                    <div>
                      <p className="text-xs font-black text-text-primary">
                        Auto-Selected Proxy:{' '}
                        {assignmentResult.bestProxy.display_name}
                      </p>
                      <p className="text-[10px] text-text-secondary">
                        Verified clear of 15-minute pre/post buffers and calendar conflicts.
                      </p>
                    </div>
                  </div>
                </div>
              )}

            {formData.proxy_required &&
              assignmentResult.errors &&
              assignmentResult.errors.length > 0 && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <p className="text-xs font-bold text-rose-500">
                    {assignmentResult.errors[0]}
                  </p>
                </div>
              )}
          </div>

          <div className="flex gap-3 pt-4 border-t border-border-primary">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-bg-tertiary text-text-primary font-bold rounded-xl text-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-3 bg-amber-500 text-black font-black rounded-xl text-xs hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Scheduling...' : 'Create Interview Request'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
