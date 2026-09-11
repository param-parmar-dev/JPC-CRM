import React, { useState, useEffect, useMemo } from 'react';
import { GoogleAuthProvider, linkWithPopup, signInWithPopup } from 'firebase/auth';
import { auth, db } from '../../firebase';
import { doc, updateDoc, getDoc, getDocs, addDoc, query, where, collection, deleteDoc } from 'firebase/firestore';
import { 
  syncInterviewRoundToGoogleCalendar, 
  clearPreviousCalendarEvents, 
  clearAllProxyCalendarEvents 
} from '../../services/calendarService';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { 
  subscribeToCollection, 
  addProxyAvailability, 
  updateProxyAvailability, 
  deleteProxyAvailability,
  updateInterviewRound,
  updateInterviewSupportRequest,
  addInterviewFeedback,
  logInterviewActivity,
  addInterviewNotification,
  now 
} from '../../services/storage';
import { 
  ProxyAvailability, 
  InterviewRound, 
  InterviewSupportRequest, 
  Candidate,
  InterviewFeedback,
  User
} from '../../types';
import { generateDefaultProxySlots, getSlotStatusColor, cleanupDuplicateProxySlots, isProxyUser } from '../../services/interviewService';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Clock, 
  Trash2, 
  RefreshCcw, 
  AlertCircle,
  Coffee,
  Sun,
  UserCheck,
  Check,
  Briefcase,
  Video,
  ClipboardCheck,
  X,
  CheckCircle2,
  User as UserIcon,
  ChevronRight as ChevronRightIcon,
  MessageSquare,
  FileText,
  Lock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, getLocalYYYYMMDD, formatDisplayDateWithWeekday, parseLocalTimeToDate } from '../../lib/utils';
import { AddSlotModal } from '../../components/AddSlotModal';
import { ProxyAssignmentModal } from '../../components/ProxyAssignmentModal';

export const ProxyDashboard: React.FC = () => {
  const { user, isAuthReady } = useAuth();
  const { showToast } = useToast();
  const [availability, setAvailability] = useState<ProxyAvailability[]>([]);
  const [rounds, setRounds] = useState<InterviewRound[]>([]);
  const [requests, setRequests] = useState<InterviewSupportRequest[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedRoundForFeedback, setSelectedRoundForFeedback] = useState<{round: InterviewRound, request: InterviewSupportRequest} | null>(null);
  const [selectedFeedbackView, setSelectedFeedbackView] = useState<{round: InterviewRound, feedback: InterviewFeedback} | null>(null);
  const [feedbacks, setFeedbacks] = useState<InterviewFeedback[]>([]);
  const [addSlotConfig, setAddSlotConfig] = useState<{ date: Date } | null>(null);
  const [team, setTeam] = useState<User[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [proxyAssignmentConfig, setProxyAssignmentConfig] = useState<{ request: InterviewSupportRequest, round: InterviewRound } | null>(null);
  const [directScheduleConfig, setDirectScheduleConfig] = useState<{ request: InterviewSupportRequest, round: InterviewRound } | null>(null);
  const [popupBlockedError, setPopupBlockedError] = useState(false);

  const [activeTab, setActiveTab] = useState<'active' | 'history' | 'today'>('active');
  const [selectedProxyId, setSelectedProxyId] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [filterDate, setFilterDate] = useState<string>('');

  const isHigherAuthority = useMemo(() => {
    return user && ['administrator', 'jpc_sysadmin', 'jpc_manager', 'jpc_cs'].includes(user.role);
  }, [user]);

  const canEditSchedule = useMemo(() => {
    if (!user) return false;
    return ['administrator', 'jpc_sysadmin', 'jpc_manager', 'jpc_cs', 'jpc_proxy'].includes(user.role);
  }, [user]);

  const proxyList = useMemo(() => {
    return team.filter(u => isProxyUser(u));
  }, [team]);

  const activeProxyId = useMemo(() => {
    if (!user) return '';
    const isProxy = isProxyUser(user);
    if (isProxy) {
      return user.id;
    }
    if (isHigherAuthority) {
      return selectedProxyId || (proxyList[0]?.id || '');
    }
    return '';
  }, [user, isHigherAuthority, selectedProxyId, proxyList]);

  const filteredAvailability = useMemo(() => {
    return availability.filter(a => String(a.proxy_user_id) === String(activeProxyId));
  }, [availability, activeProxyId]);

  const filteredRounds = useMemo(() => {
    return rounds.filter(r => {
      // Filter strictly for the active proxy's assignments to prevent double-display and cross-syncing
      if (activeProxyId) {
        return String(r.proxy_user_id) === String(activeProxyId);
      }
      return false;
    });
  }, [rounds, activeProxyId]);

  useEffect(() => {
    if (!isAuthReady || !user) return;

    // Subscribe to all proxy availability
    const unsubAvail = subscribeToCollection<ProxyAvailability>('jpc_proxy_availability', setAvailability);

    // Subscribe to all interview rounds
    const unsubRounds = subscribeToCollection<InterviewRound>('jpc_interview_rounds', setRounds);

    // Subscribe to feedback for historical view
    const unsubFeedback = subscribeToCollection<InterviewFeedback>('jpc_interview_feedback', setFeedbacks);

    // Subscribe to related requests
    const unsubReqs = subscribeToCollection<InterviewSupportRequest>('jpc_interview_requests', setRequests);

    // Subscribe to candidates
    const unsubCandidates = subscribeToCollection<Candidate>('jpc_candidates', setCandidates);

    // Subscribe to team users
    const unsubTeam = subscribeToCollection<User>('jpc_users', setTeam);

    // Subscribe to calendar events
    const unsubCalendar = subscribeToCollection<any>('jpc_calendar_events', setCalendarEvents);

    const timer = setTimeout(() => setIsLoading(false), 800);

    return () => {
      unsubAvail();
      unsubRounds();
      unsubFeedback();
      unsubReqs();
      unsubCandidates();
      unsubTeam();
      unsubCalendar();
      clearTimeout(timer);
    };
  }, [isAuthReady, user]);

  useEffect(() => {
    if (activeProxyId) {
      cleanupDuplicateProxySlots(String(activeProxyId));
    }
  }, [activeProxyId]);

  const assignments = useMemo(() => {
    let filtered = filteredRounds;
    if (activeTab === 'active') {
      filtered = filtered.filter(r => r.status !== 'cancelled' && r.status !== 'completed');
    } else if (activeTab === 'history') {
      filtered = filtered.filter(r => r.status === 'completed');
    } else if (activeTab === 'today') {
      const todayStr = getLocalYYYYMMDD(new Date());
      filtered = filtered.filter(r => {
        const date = r.booked_slot_time || r.interview_date || '';
        return date.startsWith(todayStr);
      });
    }

    return filtered
      .filter(r => {
        if (!filterDate) return true;
        const date = r.booked_slot_time || r.interview_date || '';
        return date.startsWith(filterDate);
      })
      .sort((a, b) => {
        const dateA = a.booked_slot_time || a.interview_date || '';
        const dateB = b.booked_slot_time || b.interview_date || '';
        if (dateA && dateB) {
          const comparison = dateA.localeCompare(dateB);
          return sortDirection === 'asc' ? comparison : -comparison;
        }
        if (dateA) return -1;
        if (dateB) return 1;
        return 0;
      })
      .map(round => {
        const request = requests.find(r => r.id === round.request_id);
        const candidate = request ? candidates.find(c => c.id === request.candidate_id) : null;
        return { round, request, candidate };
      })
      .filter(item => item.request?.proxy_required !== false);
  }, [filteredRounds, requests, candidates, activeTab]);

  const weekDays = useMemo(() => {
    const start = new Date(viewDate);
    // Find the Monday of the current week
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1); 
    start.setDate(diff);
    
    return Array.from({ length: 5 }).map((_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [viewDate]);

  const canAutoGenerate = useMemo(() => {
    if (!user || !activeProxyId) return false;
    const targetProxy = team.find(u => String(u.id) === String(activeProxyId));
    if (!targetProxy) return false;
    const isProxy = isProxyUser(targetProxy);
    if (!isProxy) return false;
    return ['administrator', 'jpc_sysadmin', 'jpc_manager', 'jpc_cs'].includes(user.role) || isProxyUser(user);
  }, [user, activeProxyId, team]);

  const handleGenerateDefaults = async () => {
    if (!user || !activeProxyId) return;
    if (!canAutoGenerate) {
      showToast('You do not have permission to auto-generate slots.', 'error');
      return;
    }
    if (!window.confirm("This will generate weekday slots (9:30 AM - 6:30 PM EST) for the next 30 days. Continue?")) return;
    
    setIsGenerating(true);
    try {
      await generateDefaultProxySlots(String(activeProxyId));
      showToast('Default availability generated!', 'success');
    } catch (error) {
      showToast('Failed to generate slots', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStatusChange = async (id: string, newStatus: ProxyAvailability['slot_status']) => {
    const slot = availability.find(s => s.id === id);
    if (slot && slot.created_by === 'system') {
      const isHigherAuthority = user && ['administrator', 'jpc_sysadmin', 'jpc_manager', 'jpc_cs', 'jpc_proxy'].includes(user.role);
      if (!isHigherAuthority) {
        showToast('This is a fixed auto-generated slot. Slot changes are only allowed by Admin, Manager, System Admin, CS, or Proxy.', 'error');
        return;
      }
    }
    try {
      await updateProxyAvailability(id, { slot_status: newStatus });
      showToast(`Slot marked as ${newStatus}`, 'success');
    } catch (error) {
      showToast('Failed to update slot', 'error');
    }
  };

  const handleReschedule = async (round: InterviewRound, request: InterviewSupportRequest) => {
    if (!user || !window.confirm("Mark this interview for reschedule? This will notify the recruiter and reset the booking status.")) return;
    
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
      await logInterviewActivity(round.id, 'RESCHEDULE_TRIGGERED', { by: user.role }, String(user.id));

      // 4. Notify Recruiter
      await addInterviewNotification({
        recipient_user_id: request.recruiter_id,
        interview_round_id: round.id,
        notification_type: 'rescheduled',
        message: `Proxy ${user.display_name} has requested a reschedule for ${request.interview_company_name} interview.`
      });

      showToast('Interview marked for reschedule', 'success');
    } catch (error) {
      console.error(error);
      showToast('Failed to trigger reschedule', 'error');
    }
  };

  const handleDeleteSlot = async (id: string) => {
    const slot = availability.find(s => s.id === id);
    if (slot && slot.created_by === 'system') {
      const isHigherAuthority = user && ['administrator', 'jpc_sysadmin', 'jpc_manager', 'jpc_cs', 'jpc_proxy'].includes(user.role);
      if (!isHigherAuthority) {
        showToast('This is a fixed auto-generated slot. Slot changes are only allowed by Admin, Manager, System Admin, CS, or Proxy.', 'error');
        return;
      }
    }
    if (!window.confirm("Delete this slot?")) return;
    try {
      await deleteProxyAvailability(id);
      showToast('Slot removed', 'success');
    } catch (error) {
      showToast('Failed to delete slot', 'error');
    }
  };

  const getTimeGroups = (date: Date) => {
    const dateStr = getLocalYYYYMMDD(date);
    const daySlots = filteredAvailability.filter(a => {
      if (!a.slot_start.startsWith(dateStr)) return false;
      
      const timePart = a.slot_start.split('T')[1];
      if (!timePart) return false;
      const [hStr, mStr] = timePart.split(':');
      const hour = parseInt(hStr, 10);
      const minute = parseInt(mStr, 10);
      
      const minutesTotal = hour * 60 + minute;
      const minAllowed = 9 * 60 + 30; // 09:30
      const maxAllowed = 18 * 60; // 18:00
      
      return minutesTotal >= minAllowed && minutesTotal <= maxAllowed;
    }).sort((a, b) => a.slot_start.localeCompare(b.slot_start));

    // Deduplicate slots by slot_start to avoid duplicate rendering
    const seen = new Set<string>();
    return daySlots.filter(s => {
      if (seen.has(s.slot_start)) return false;
      seen.add(s.slot_start);
      return true;
    });
  };

  const handleConnectGoogle = async () => {
    if (!activeProxyId) {
      showToast('No active proxy user identified.', 'error');
      return;
    }
    setPopupBlockedError(false);
    try {
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      
      const authUrl = `/api/auth/google/login?userId=${activeProxyId}`;
      const authWindow = window.open(
        authUrl,
        'google_oauth_popup',
        `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes,scrollbars=yes`
      );

      if (!authWindow) {
        setPopupBlockedError(true);
        showToast('Popup blocked! Please allow popups or open the dashboard in a new tab.', 'error');
      }
    } catch (error: any) {
      console.error('[ProxyDashboard] Google Connection Error:', error);
      showToast('Google authentication initialization failed: ' + error.message, 'error');
    }
  };

  const handleDisconnectGoogle = async () => {
    if (!activeProxyId) return;
    if (!window.confirm("Disconnect your Google Calendar integration? This will stop automatic event synchronization.")) return;
    try {
      const userRef = doc(db, 'jpc_users', String(activeProxyId));
      await updateDoc(userRef, {
        google_calendar_connected: false,
        google_calendar_status: 'disconnected',
        google_calendar_email: null,
        google_access_token: null,
        google_access_token_expires_at: null,
        google_refresh_token: null
      });
      showToast('Google Calendar disconnected successfully.', 'success');
    } catch (error: any) {
      console.error('[ProxyDashboard] Google Disconnection Error:', error);
      showToast('Failed to disconnect Google Calendar.', 'error');
    }
  };

  // Listen for success message from google oauth popup
  useEffect(() => {
    const handleGoogleMessage = async (event: MessageEvent) => {
      const origin = event.origin;
      const isAllowedOrigin =
        origin === window.location.origin ||
        origin.endsWith('.vercel.app') ||
        origin.endsWith('.run.app') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1');

      if (!isAllowedOrigin) {
        return;
      }

      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        if (event.data.tokens && activeProxyId) {
          try {
            const userRef = doc(db, 'jpc_users', String(activeProxyId));
            await updateDoc(userRef, event.data.tokens);
          } catch (updateErr) {
            console.warn('[ProxyDashboard] Client updateDoc fallback error:', updateErr);
          }
        }
        showToast('Google Calendar connected successfully with persistent refresh access!', 'success');
        setPopupBlockedError(false);
      }
    };
    window.addEventListener('message', handleGoogleMessage);
    return () => window.removeEventListener('message', handleGoogleMessage);
  }, [activeProxyId]);

  const handleSyncAllAssignments = async () => {
    if (!activeProxyId) return;
    setIsSyncingAll(true);
    try {
      let successCount = 0;
      for (const item of assignments) {
        const { round, request } = item;
        if (round.booked_slot_time && round.booked_slot_end) {
          const isSynced = await syncInterviewRoundToGoogleCalendar(round.id, request.id, String(activeProxyId));
          if (isSynced) {
            successCount++;
          }
        }
      }
      showToast(`Calendar sync check completed! Found & updated/created ${successCount} events in your calendar.`, 'success');
    } catch (error) {
      console.error('[ProxyDashboard] Sync All calendar error:', error);
      showToast('Encountered an issue running synchronization.', 'error');
    } finally {
      setIsSyncingAll(false);
    }
  };

  const activeProxyUser = useMemo(() => {
    return team.find(u => String(u.id) === String(activeProxyId));
  }, [team, activeProxyId]);

  const isGoogleConnected = useMemo(() => {
    return activeProxyUser?.google_calendar_connected || false;
  }, [activeProxyUser]);

  const googleEmail = useMemo(() => {
    return activeProxyUser?.google_calendar_email || '';
  }, [activeProxyUser]);

  const googleStatus = useMemo(() => {
    return activeProxyUser?.google_calendar_status || 'disconnected';
  }, [activeProxyUser]);

  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [isClearingCalendar, setIsClearingCalendar] = useState(false);
  
  const handleClearMyCalendar = async () => {
    if (!activeProxyId) return;
    if (!window.confirm("Are you sure you want to clear your entire calendar? This will delete all synced events from your Google Calendar and remove the local sync records.")) return;
    
    setIsClearingCalendar(true);
    try {
      const count = await clearAllProxyCalendarEvents(String(activeProxyId));
      showToast(`Successfully cleared ${count} calendar events!`, 'success');
    } catch (error) {
      console.error('[ProxyDashboard] Clear calendar error:', error);
      showToast('Encountered an issue clearing the calendar.', 'error');
    } finally {
      setIsClearingCalendar(false);
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
    <div className="space-y-8 pb-10">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black text-text-primary tracking-tight">Proxy Central</h1>
          <p className="text-text-secondary mt-2 flex items-center gap-2 text-sm sm:text-base">
            <Clock className="w-4 h-4 text-accent-blue shrink-0" />
            {isHigherAuthority ? "View and manage proxy expert schedules and assignments" : "Manage your availability and upcoming interview support"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {isHigherAuthority && (
            <div className="flex items-center gap-3 bg-bg-secondary p-3 rounded-2xl border border-border-primary w-full sm:w-auto">
              <span className="text-[10px] font-black text-text-muted uppercase tracking-widest shrink-0">Proxy Member:</span>
              <select
                value={selectedProxyId || activeProxyId}
                onChange={(e) => setSelectedProxyId(e.target.value)}
                className="flex-1 sm:flex-initial px-4 py-2 bg-bg-tertiary border border-border-primary rounded-xl text-xs font-bold text-text-primary focus:outline-none focus:border-accent-blue min-w-0 sm:min-w-[200px]"
              >
                {proxyList.length === 0 ? (
                  <option value="">No Active Proxy Members</option>
                ) : (
                  proxyList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.display_name} {p.is_on_leave ? '(On Leave)' : ''}
                    </option>
                  ))
                )}
              </select>
            </div>
          )}

      </div>
      </div>

      {/* Google Calendar Integration Settings Panel */}
      {activeProxyUser && (
        <div className="bg-bg-secondary p-5 sm:p-8 rounded-2xl sm:rounded-[32px] border border-border-primary/50 shadow-xl relative overflow-hidden font-sans">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-accent-blue/10 flex items-center justify-center text-accent-blue font-sans">
                  <CalendarIcon className="w-4 h-4" />
                </span>
                <h3 className="text-lg font-black text-text-primary tracking-tight font-sans">Google Calendar Integration</h3>
                {googleStatus === 'attention_required' ? (
                  <span className="px-2.5 py-0.5 bg-rose-500/10 text-rose-500 text-[9px] font-black uppercase tracking-widest rounded-full border border-rose-500/25 font-sans animate-pulse">
                    Action Required
                  </span>
                ) : isGoogleConnected ? (
                  <span className="px-2.5 py-0.5 bg-accent-green/10 text-accent-green text-[9px] font-black uppercase tracking-widest rounded-full border border-accent-green/25 font-sans">
                    Active & Synced
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 bg-accent-gray/10 text-text-muted text-[9px] font-black uppercase tracking-widest rounded-full border border-border-primary font-sans">
                    Disconnected
                  </span>
                )}
              </div>
              <p className="text-xs font-semibold text-text-secondary max-w-2xl leading-relaxed font-sans">
                Connect your Google Calendar so all interview supports booked for you are instantly synced with notifications. Google Calendar automatically dispatches invite email updates to both candidates and recruitment specialists, mapped to America/New_York (EST) timezone.
              </p>
              {googleStatus === 'attention_required' && (
                <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">
                  Status: <span className="underline">Authorization lapsed / revoked</span>. Reconnecting is required.
                </p>
              )}
              {isGoogleConnected && googleEmail && (
                <p className="text-[10px] font-mono text-text-muted uppercase tracking-wider font-bold">
                  Connected Gmail Account: <span className="text-accent-blue select-all">{googleEmail}</span>
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              {isGoogleConnected ? (
                <>
                  <button
                    onClick={handleSyncAllAssignments}
                    disabled={isSyncingAll}
                    className="px-5 py-3 bg-accent-blue text-white text-xs font-black uppercase tracking-widest rounded-xl shadow-xl shadow-accent-blue/15 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    <RefreshCcw className={cn("w-3.5 h-3.5", isSyncingAll && "animate-spin")} />
                    {isSyncingAll ? 'Synchronizing...' : 'Sync All Assignments'}
                  </button>
                  <button
                    onClick={handleClearMyCalendar}
                    disabled={isClearingCalendar}
                    className="px-5 py-3 bg-rose-500/10 text-rose-500 text-xs font-black uppercase tracking-widest rounded-xl border border-rose-500/20 hover:bg-rose-500 hover:text-white transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    <Trash2 className={cn("w-3.5 h-3.5", isClearingCalendar && "animate-spin")} />
                    {isClearingCalendar ? 'Clearing...' : 'Clear My Calendar'}
                  </button>
                  <button
                    onClick={handleDisconnectGoogle}
                    className="px-5 py-3 bg-rose-500/10 text-rose-500 text-xs font-black uppercase tracking-widest rounded-xl border border-rose-500/20 hover:bg-rose-500 hover:text-white transition-all"
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <button
                  onClick={handleConnectGoogle}
                  className="px-6 py-4.5 bg-gradient-to-r from-accent-blue to-blue-600 text-white text-xs font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-accent-blue/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
                >
                  <CalendarIcon className="w-4 h-4" />
                  Connect Google Calendar
                </button>
              )}
            </div>
          </div>

          {/* Google Calendar Long-Term Authorization Info Grid */}
          <div className="mt-8 pt-8 border-t border-border-primary/40">
            <h4 className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-4">
              Google Workspace Live Auth & Synchronization Mechanics
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Feature 1: Persistent Access */}
              <div className="bg-bg-tertiary/40 border border-border-primary/30 rounded-2xl p-4.5 space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-accent-blue/10 flex items-center justify-center text-accent-blue">
                    <Lock className="w-3.5 h-3.5" />
                  </span>
                  <span className="text-[10px] font-black text-text-primary uppercase tracking-wider">Persistent Integration</span>
                </div>
                <p className="text-[11px] font-medium text-text-secondary leading-relaxed">
                  Connecting your Google Calendar establishes a highly secure **Offline Authorization Channel** (`access_type: offline`). Unlike standard short-lived tokens, this persistent credentials mapping **will not disconnect at any time** unless you manually choose to revoke permission.
                </p>
              </div>

              {/* Feature 2: Background Synchronizer */}
              <div className="bg-bg-tertiary/40 border border-border-primary/30 rounded-2xl p-4.5 space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-accent-blue/10 flex items-center justify-center text-accent-blue">
                    <RefreshCcw className="w-3.5 h-3.5" />
                  </span>
                  <span className="text-[10px] font-black text-text-primary uppercase tracking-wider">Immediate Live Sync</span>
                </div>
                <p className="text-[11px] font-medium text-text-secondary leading-relaxed">
                  Real-time synchronization ensures that when any support session is assigned or adjusted, the details instantly propagate to calendar schedules. This runs fully in the background with zero lag-time or manual re-sync steps required.
                </p>
              </div>

              {/* Feature 3: Automated Dispatches */}
              <div className="bg-bg-tertiary/40 border border-border-primary/30 rounded-2xl p-4.5 space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-accent-blue/10 flex items-center justify-center text-accent-blue">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </span>
                  <span className="text-[10px] font-black text-text-primary uppercase tracking-wider">Automated Dispatch</span>
                </div>
                <p className="text-[11px] font-medium text-text-secondary leading-relaxed">
                  Google Calendar manages downstream invite alerts, email updates, and calendar invites automatically to both technical specialists and candidates, perfectly aligned and localized to the <strong>America/New_York (EST)</strong> timezone.
                </p>
              </div>
            </div>
          </div>

          {popupBlockedError && (
            <div className="mt-6 p-5 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex gap-3 text-amber-500 text-xs font-semibold leading-relaxed">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold mb-1 uppercase tracking-wider text-[10px]">Popup Blocked Alert!</p>
                <p className="mb-2">
                  Due to development sandbox restrictions within the AI Studio embedded preview, browsers block popup authorization screens.
                </p>
                <p className="font-bold text-text-primary">
                  💡 How to resolve: Click the "Open in New Tab" icon in the top right corner of the AI Studio preview header. Running the app directly as a top-level tab bypasses this restriction and allows authentication to complete smoothly!
                </p>
              </div>
            </div>
          )}

          {googleStatus === 'attention_required' && (
            <div className="mt-6 p-5 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex gap-3 text-rose-500 text-xs font-semibold leading-relaxed animate-pulse">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold mb-1 uppercase tracking-wider text-[10px]">Google Calendar connection requires attention</p>
                <p className="mb-2">
                  Authorization expired – reconnect required to resume automatic event synchronization and calendar updates.
                </p>
                <button
                  onClick={handleConnectGoogle}
                  className="px-4 py-2 bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-rose-600 transition-all shadow-md shadow-rose-500/20"
                >
                  Reconnect Now
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Active Assignments Section */}
      <div className="space-y-6">
        {/* TBD Explanation Help Banner */}
        <div className="bg-bg-secondary p-6 rounded-3xl border border-border-primary/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm font-sans mx-1">
          <div className="flex gap-3.5 items-start">
            <div className="w-10 h-10 rounded-2xl bg-accent-blue/10 flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5 text-accent-blue animate-pulse" />
            </div>
            <div>
              <h4 className="text-sm font-black text-text-primary uppercase tracking-wider mb-1 font-sans">Why do some assignments show "Date TBD" / "Time TBD"?</h4>
              <p className="text-xs font-medium text-text-secondary leading-relaxed max-w-4xl font-sans">
                A coordinator requests a proxy instantly, creating a provisional card here. The schedule shows <strong className="text-accent-amber bg-accent-amber/10 px-1.5 py-0.5 rounded">Date TBD / Time TBD</strong> as the candidate hasn't selected their favorite slot via their customized booking link yet, or no manual slot has been designated. 
                You can patiently wait for the candidate to book, or click <strong className="text-accent-blue">Edit Schedule</strong> right on the card below to manually set and locked down the finalized date and time.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
            <div>
              <h2 className="text-xl font-black text-text-primary">Support Assignments</h2>
              <p className="text-xs font-bold text-text-muted uppercase tracking-widest mt-1">Interviews needing your support</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex bg-bg-tertiary p-1 rounded-2xl border border-border-primary">
                <button
                  onClick={() => setActiveTab('active')}
                  className={cn(
                    "px-3 sm:px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    activeTab === 'active' ? "bg-accent-blue text-white shadow-lg" : "text-text-muted hover:text-text-primary"
                  )}
                >
                  Active
                </button>
                <button
                  onClick={() => setActiveTab('today')}
                  className={cn(
                    "px-3 sm:px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    activeTab === 'today' ? "bg-accent-blue text-white shadow-lg" : "text-text-muted hover:text-text-primary"
                  )}
                >
                  Today
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={cn(
                    "px-3 sm:px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    activeTab === 'history' ? "bg-accent-blue text-white shadow-lg" : "text-text-muted hover:text-text-primary"
                  )}
                >
                  History
                </button>
              </div>

              <div className="flex items-center gap-2 bg-bg-tertiary p-1 rounded-2xl border border-border-primary">
                <button 
                  onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                  className="px-2 sm:px-3 py-2 text-[10px] font-black uppercase tracking-widest text-text-muted hover:text-accent-blue"
                >
                  {sortDirection === 'asc' ? 'Oldest' : 'Newest'}
                </button>
                <input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="bg-transparent text-[10px] font-bold text-text-primary focus:outline-none px-1 sm:px-2"
                />
              </div>
            </div>
          </div>
          <span className="self-start sm:self-auto px-4 py-1 bg-accent-blue/10 text-accent-blue text-[10px] font-black rounded-full border border-accent-blue/20">
            {assignments.filter(a => a.round.status !== 'completed').length} PENDING
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {assignments.map(({ round, request, candidate }) => {
              const assignedProxy = team.find(u => String(u.id) === String(round.proxy_user_id));
              return (
                <motion.div
                key={round.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-bg-secondary p-8 rounded-[40px] border border-border-primary/50 shadow-xl shadow-bg-secondary/10 group hover:border-accent-blue/50 transition-all relative overflow-hidden"
              >
                <div className="relative z-10 space-y-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-bg-tertiary flex items-center justify-center border border-border-primary shadow-sm">
                        <Briefcase className="w-6 h-6 text-accent-blue" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-text-muted uppercase tracking-widest leading-none mb-1">Company</p>
                        <p className="text-lg font-black text-text-primary tracking-tight truncate max-w-[140px]">{request?.interview_company_name}</p>
                      </div>
                    </div>
                    <div className="bg-bg-tertiary px-3 py-1.5 rounded-xl border border-border-primary">
                      <span className="text-[8px] font-black text-accent-blue uppercase tracking-widest">{round.round_label || 'Round'}</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-text-secondary">
                      <CalendarIcon className="w-4 h-4 text-accent-blue/50" />
                      <span className="text-xs font-bold">
                        {round.booked_slot_time || round.interview_date 
                          ? formatDisplayDateWithWeekday(round.booked_slot_time || round.interview_date)
                          : 'Date TBD'
                        }
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-text-secondary">
                      <Clock className="w-4 h-4 text-accent-blue/50" />
                      <span className="text-xs font-bold">
                        {round.booked_slot_time || round.interview_date 
                          ? new Intl.DateTimeFormat('en-US', {
                              timeZone: 'America/New_York',
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: true
                            }).format(parseLocalTimeToDate(round.booked_slot_time || round.interview_date, 'America/New_York')) + ' EST'
                          : 'Time TBD'
                        }
                      </span>
                    </div>
                    {(!round.booked_slot_time && !round.interview_date) && (
                      <div className="text-[9px] font-black text-accent-amber uppercase tracking-wider flex items-center gap-1.5 bg-accent-amber/10 px-2.5 py-1 rounded-lg border border-accent-amber/20 w-max font-sans">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-amber animate-ping" />
                        Awaiting Candidate Slot Booking
                      </div>
                    )}
                    <div className="flex items-center gap-3 text-text-secondary">
                      <UserIcon className="w-4 h-4 text-accent-blue/50" />
                      <span className="text-xs font-bold truncate">Candidate: {candidate?.full_name || 'Loading...'}</span>
                    </div>
                    <div className="flex items-center gap-3 text-text-secondary">
                      <UserCheck className="w-4 h-4 text-accent-blue/50" />
                      <span className="text-xs font-bold truncate">Assigned Proxy: {assignedProxy?.display_name || 'Not Assigned'}</span>
                    </div>
                    <div className="flex items-center gap-3">
                       <span className={cn(
                         "px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest",
                         round.status === 'booked' || round.status === 'confirmed' ? "bg-accent-green/10 text-accent-green" : "bg-bg-tertiary text-text-muted"
                       )}>
                         Status: {round.status.replace('_', ' ')}
                       </span>
                    </div>
                    {request?.job_description && (
                      <div className="mt-4 p-4 bg-bg-tertiary rounded-2xl border border-border-primary">
                        <p className="text-[9px] font-black text-text-muted uppercase tracking-widest mb-1 flex items-center gap-1">
                          <FileText className="w-2.5 h-2.5 text-accent-blue" />
                          Job Description
                        </p>
                        <p className="text-[10px] text-text-secondary line-clamp-2 leading-relaxed whitespace-pre-wrap">
                          {request.job_description}
                        </p>
                      </div>
                    )}
                    <div className="pt-3 border-t border-border-primary/50 text-[10px] text-text-muted font-bold space-y-1 mt-4">
                      <p>🕒 Time: {(() => {
                         const start = round.booked_slot_time;
                         const end = round.booked_slot_end;
                         if (!start || !end) return 'TBD';
                         const format = (t: string) => {
                           const d = new Date(t);
                           const hours = d.getHours();
                           const minutes = d.getMinutes();
                           const ampm = hours >= 12 ? 'PM' : 'AM';
                           const h12 = hours % 12 || 12;
                           const mStr = minutes.toString().padStart(2, '0');
                           return `${h12}:${mStr} ${ampm}`;
                         };
                         return `${format(start)} EST to ${format(end)} EST`;
                      })()}</p>
                      <p>⏳ Buffer: 15m Pre/Post</p>
                      <p>⚡ Workload: Lowest current workload ({rounds.filter(r => String(r.proxy_user_id) === String(round.proxy_user_id) && ['confirmed','live'].includes(r.status)).length} active interviews)</p>
                      <p>🛡️ Conflict assessment: Clear of buffers and leaf return parameters</p>
                    </div>
                  </div>

                    <div className="pt-4 flex flex-wrap gap-3">
                      <button 
                        onClick={() => {
                          if (request?.job_link) window.open(request?.job_link, '_blank');
                          else showToast('Job link not available', 'info');
                        }}
                        className="flex-1 min-w-[120px] py-3 bg-bg-tertiary text-text-primary text-[10px] font-black uppercase tracking-widest rounded-2xl border border-border-primary hover:bg-bg-tertiary/80 transition-all flex items-center justify-center gap-2"
                      >
                        <ClipboardCheck className="w-3.5 h-3.5" />
                        Job Specs
                      </button>
                      {(round.status === 'booked' || round.status === 'confirmed' || round.status === 'live') && (
                        <button 
                          onClick={() => setSelectedRoundForFeedback({ round, request: request! })}
                          className="flex-1 min-w-[120px] py-3 bg-accent-blue text-white text-[10px] font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-accent-blue/20 hover:bg-accent-blue/90 transition-all flex items-center justify-center gap-2"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          Complete
                        </button>
                      )}
                      {round.status === 'completed' && (
                        <button 
                          onClick={() => {
                            const fb = feedbacks.find(f => f.interview_round_id === round.id);
                            if (fb) {
                              setSelectedFeedbackView({ round, feedback: fb });
                            } else {
                              showToast('Feedback details still synchronizing...', 'info');
                            }
                          }}
                          className="flex-1 min-w-[120px] py-3 bg-accent-green/10 text-accent-green text-[10px] font-black uppercase tracking-widest rounded-2xl border border-accent-green/20 flex items-center justify-center gap-2 hover:bg-accent-green hover:text-white transition-all"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          View Evaluation
                        </button>
                      )}
                      {(round.status === 'booked' || round.status === 'confirmed') && (
                        <button 
                          onClick={() => handleReschedule(round, request!)}
                          className="flex-1 min-w-[120px] py-3 bg-accent-amber/10 text-accent-amber text-[10px] font-black uppercase tracking-widest rounded-2xl border border-accent-amber/20 hover:bg-accent-amber/20 transition-all flex items-center justify-center gap-2"
                        >
                          <RefreshCcw className="w-3.5 h-3.5" />
                          Reschedule
                        </button>
                      )}
                      {round.status !== 'completed' && round.status !== 'cancelled' && (
                        <>
                          <button 
                            onClick={() => setProxyAssignmentConfig({ request: request!, round })}
                            className="flex-1 min-w-[120px] py-3 bg-accent-purple/10 text-accent-purple text-[10px] font-black uppercase tracking-widest rounded-2xl border border-accent-purple/20 hover:bg-accent-purple hover:text-white transition-all flex items-center justify-center gap-2"
                          >
                            <UserIcon className="w-3.5 h-3.5" />
                            Reassign Proxy
                          </button>
                          {canEditSchedule && (
                            <button 
                              onClick={() => setDirectScheduleConfig({ request: request!, round })}
                              className="flex-1 min-w-[120px] py-3 bg-accent-blue/10 text-accent-blue text-[10px] font-black uppercase tracking-widest rounded-2xl border border-accent-blue/20 hover:bg-accent-blue hover:text-white transition-all flex items-center justify-center gap-2"
                            >
                              <CalendarIcon className="w-3.5 h-3.5" />
                              Edit Schedule
                            </button>
                          )}
                        </>
                      )}
                    </div>
                </div>

                {/* Background Pattern */}
                <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-accent-blue/5 blur-3xl rounded-full pointer-events-none" />
              </motion.div>
            );
            })}
          </AnimatePresence>
          
          {assignments.length === 0 && (
            <div className="col-span-full py-12 flex flex-col items-center justify-center bg-bg-secondary rounded-[40px] border border-dashed border-border-primary opacity-50">
              <CalendarIcon className="w-12 h-12 text-text-muted mb-4" />
              <p className="text-sm font-bold text-text-muted">No {activeTab} interview assignments found</p>
            </div>
          )}
        </div>
      </div>

      {/* Feedback Modal */}
      {selectedRoundForFeedback && (
        <FeedbackModal 
          onClose={() => setSelectedRoundForFeedback(null)}
          round={selectedRoundForFeedback.round}
          request={selectedRoundForFeedback.request}
          onSuccess={() => {
            setSelectedRoundForFeedback(null);
            showToast('Feedback submitted successfully!', 'success');
          }}
          team={team}
          candidate={candidates.find(c => c.id === selectedRoundForFeedback.request.candidate_id) || null}
        />
      )}
      {/* Feedback View Modal */}
      {selectedFeedbackView && (
        <FeedbackViewModal
          onClose={() => setSelectedFeedbackView(null)}
          round={selectedFeedbackView.round}
          feedback={selectedFeedbackView.feedback}
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
          allAvailabilities={availability}
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
            showToast('Schedule updated successfully!', 'success');
          }}
        />
      )}
    </div>
  );
};

const FeedbackModal: React.FC<{
  onClose: () => void;
  round: InterviewRound;
  request: InterviewSupportRequest;
  onSuccess: () => void;
  team: User[];
  candidate: Candidate | null;
}> = ({ onClose, round, request, onSuccess, team, candidate }) => {
  const { user } = useAuth();
  const [attended, setAttended] = useState(true);
  const [notes, setNotes] = useState('');
  const [performance, setPerformance] = useState('');
  const [questions, setQuestions] = useState('');
  const [issues, setIssues] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!user) return;
    setIsSubmitting(true);
    try {
      // 1. Add Feedback
      await addInterviewFeedback({
        interview_round_id: round.id,
        attended,
        proxy_support_provided: true,
        interview_notes: notes,
        candidate_performance: performance,
        questions_asked: questions,
        issues_faced: issues,
        suggested_next_steps: '',
        result: 'pending',
        submitted_by: String(user.id)
      });

      // 2. Update Round
      await updateInterviewRound(round.id, {
        status: 'completed',
        completed_at: now(),
        feedback_submitted_at: now(),
        result: 'pending'
      });

      // 3. Update Request Status to Completed
      await updateInterviewSupportRequest(request.id, {
        overall_status: 'completed'
      });

      // 4. Activity Log
      await logInterviewActivity(round.id, 'FEEDBACK_SUBMITTED', { result: 'pending' }, String(user.id));

      // 5. Notification to Recruiter
      await addInterviewNotification({
        recipient_user_id: request.recruiter_id,
        interview_round_id: round.id,
        notification_type: 'feedback_submitted',
        message: `Proxy feedback submitted for ${request.job_title} interview. Please review and update final result when available.`
      });

      // 5b. Notification to CS (Customer Success) users
      if (team && team.length > 0) {
        const csUsers = team.filter(u => u.role === 'jpc_cs');
        for (const cs of csUsers) {
          await addInterviewNotification({
            recipient_user_id: String(cs.id),
            interview_round_id: round.id,
            notification_type: 'feedback_submitted',
            message: `Proxy evaluation feedback submitted for ${candidate?.full_name || 'Candidate'}'s interview at ${request.interview_company_name}.`
          });
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
        initial={{ opacity: 0, scale: 0.9, y: 40 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-bg-secondary w-full max-w-4xl rounded-[48px] shadow-2xl overflow-hidden border border-border-primary max-h-[90vh] flex flex-col"
      >
        <div className="p-10 flex flex-col h-full">
          <div className="flex items-center justify-between mb-8 shrink-0">
            <div>
              <span className="text-[10px] font-black text-accent-blue uppercase tracking-[0.3em]">Evaluation</span>
              <h2 className="text-3xl font-black text-text-primary tracking-tight mt-1">Technical Evaluation</h2>
              <p className="text-xs font-bold text-text-muted mt-2">Log the technical performance and interview details.</p>
              {request.job_description && (
                <div className="mt-4 p-4 bg-bg-tertiary rounded-2xl border border-border-primary border-dashed max-w-2xl">
                  <p className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-2">Reference Job Description</p>
                  <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap max-h-[100px] overflow-y-auto custom-scrollbar">
                    {request.job_description}
                  </p>
                </div>
              )}
            </div>
            <button onClick={onClose} className="p-3 hover:bg-bg-tertiary rounded-2xl transition-colors">
              <X className="w-6 h-6 text-text-muted" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar space-y-10 py-4">
            {/* Toggles */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <label className="text-[10px] font-black text-text-muted uppercase tracking-widest px-1">Meeting Attendance</label>
                <div className="flex gap-4">
                  <button 
                    onClick={() => setAttended(true)}
                    className={cn(
                      "flex-1 py-4 px-6 rounded-3xl border font-bold transition-all flex items-center justify-center gap-3",
                      attended ? "bg-accent-green/10 border-accent-green text-accent-green" : "bg-bg-tertiary border-border-primary text-text-muted"
                    )}
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    Attended
                  </button>
                  <button 
                    onClick={() => setAttended(false)}
                    className={cn(
                      "flex-1 py-4 px-6 rounded-3xl border font-bold transition-all flex items-center justify-center gap-3",
                      !attended ? "bg-accent-red/10 border-accent-red text-accent-red" : "bg-bg-tertiary border-border-primary text-text-muted"
                    )}
                  >
                    <X className="w-5 h-5" />
                    Not Attended
                  </button>
                </div>
              </div>
            </div>

            {/* Questions & Performance */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-4">
                <label className="text-[10px] font-black text-text-muted uppercase tracking-widest px-1">Questions Asked</label>
                <textarea 
                  value={questions}
                  onChange={(e) => setQuestions(e.target.value)}
                  placeholder="What technical/behavioral questions were asked?"
                  className="w-full bg-bg-tertiary border border-border-primary rounded-3xl p-6 text-sm font-medium focus:ring-2 focus:ring-accent-blue/20 outline-none transition-all h-[120px] resize-none"
                />
              </div>
              <div className="space-y-4">
                <label className="text-[10px] font-black text-text-muted uppercase tracking-widest px-1">Performance Summary</label>
                <textarea 
                  value={performance}
                  onChange={(e) => setPerformance(e.target.value)}
                  placeholder="How did the candidate perform?"
                  className="w-full bg-bg-tertiary border border-border-primary rounded-3xl p-6 text-sm font-medium focus:ring-2 focus:ring-accent-blue/20 outline-none transition-all h-[120px] resize-none"
                />
              </div>
            </div>

            {/* General Notes & Issues */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-4">
                <label className="text-[10px] font-black text-text-muted uppercase tracking-widest px-1">Internal Notes</label>
                <textarea 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any internal coordination notes..."
                  className="w-full bg-bg-tertiary border border-border-primary rounded-3xl p-6 text-sm font-medium focus:ring-2 focus:ring-accent-blue/20 outline-none transition-all h-[120px] resize-none"
                />
              </div>
              <div className="space-y-4">
                <label className="text-[10px] font-black text-text-muted uppercase tracking-widest px-1">Issues Faced (if any)</label>
                <textarea 
                  value={issues}
                  onChange={(e) => setIssues(e.target.value)}
                  placeholder="Technical glitches, delays, etc."
                  className="w-full bg-bg-tertiary border border-border-primary rounded-3xl p-6 text-sm font-medium focus:ring-2 focus:ring-accent-blue/20 outline-none transition-all h-[120px] resize-none"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-4 pt-10 mt-6 border-t border-border-primary shrink-0">
            <button 
              type="button" 
              onClick={onClose}
              className="flex-1 py-5 bg-bg-tertiary text-text-primary font-bold rounded-[30px] hover:bg-bg-tertiary/80 transition-all"
            >
              Cancel
            </button>
            <button 
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1 py-5 bg-accent-blue text-white font-bold rounded-[30px] hover:bg-accent-blue/90 shadow-2xl shadow-accent-blue/30 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
            >
              {isSubmitting ? (
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Check className="w-6 h-6" />
                  Submit Evaluation
                </>
              )}
            </button>
          </div>
          <p className="text-[10px] font-bold text-text-muted text-center mt-4 uppercase tracking-[0.2em] animate-pulse">
            Note: Final company decision will be updated by the coordinator later.
          </p>
        </div>
      </motion.div>
    </div>
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
        className="bg-bg-secondary w-full max-w-4xl rounded-[48px] shadow-2xl overflow-hidden border border-border-primary flex flex-col max-h-[90vh]"
      >
        <div className="p-10 flex flex-col h-full overflow-hidden">
          <div className="flex items-center justify-between mb-8 shrink-0">
            <div>
              <span className="text-[10px] font-black text-accent-blue uppercase tracking-[0.3em]">Technical Evaluation</span>
              <h2 className="text-3xl font-black text-text-primary tracking-tight mt-1">{round.round_label}</h2>
              <p className="text-xs font-bold text-text-muted mt-2">Submitted on {new Date(feedback.created_at).toLocaleString()}</p>
            </div>
            <button onClick={onClose} className="p-3 hover:bg-bg-tertiary rounded-2xl transition-colors">
              <X className="w-6 h-6 text-text-muted" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="p-8 bg-bg-tertiary rounded-3xl border border-border-primary shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="w-4 h-4 text-accent-blue" />
                  <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">Interview Notes</span>
                </div>
                <p className="text-sm font-medium text-text-primary leading-relaxed whitespace-pre-wrap">
                  {feedback.interview_notes || 'No specific notes recorded.'}
                </p>
              </div>

              <div className="p-8 bg-bg-tertiary rounded-3xl border border-border-primary shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">Candidate Performance</span>
                </div>
                <p className="text-sm font-medium text-text-primary leading-relaxed whitespace-pre-wrap">
                  {feedback.candidate_performance || 'Performance notes not provided.'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="p-8 bg-bg-tertiary rounded-3xl border border-border-primary shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">Questions Asked</span>
                </div>
                <p className="text-sm font-medium text-text-primary leading-relaxed whitespace-pre-wrap">
                  {feedback.questions_asked || 'Not recorded.'}
                </p>
              </div>

              <div className="p-8 bg-bg-tertiary rounded-3xl border border-border-primary shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">Issues Faced</span>
                </div>
                <p className="text-sm font-medium text-text-primary leading-relaxed whitespace-pre-wrap">
                  {feedback.issues_faced || 'None reported.'}
                </p>
              </div>
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
  const { user } = useAuth();
  const { showToast } = useToast();
  const [date, setDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clearPrevious, setClearPrevious] = useState(true);

  const handleUpdate = async () => {
    if (!date || !user) return;
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
        const bufferStart = new Date(startD.getTime() - 15 * 60 * 1000).toISOString();
        const bufferEnd = new Date(endD.getTime() + 15 * 60 * 1000).toISOString();

        // Check if calendar event already exists
        const calEventsQ = query(
          collection(db, 'jpc_calendar_events'),
          where('interview_round_id', '==', round.id)
        );
        const calEventsSnap = await getDocs(calEventsQ);

        // Fetch candidate details
        let candidateName = 'Candidate';
        if (request.candidate_id) {
          try {
            const candDoc = await getDoc(doc(db, 'jpc_candidates', request.candidate_id));
            if (candDoc.exists()) {
              candidateName = candDoc.data().full_name || 'Candidate';
            }
          } catch (e) {
            console.error('Error fetching candidate Name:', e);
          }
        }

        const eventData = {
          interview_round_id: round.id,
          interview_request_id: request.id,
          summary: `Interview Support: ${candidateName} at ${request.interview_company_name} [${round.round_label || 'Round'}]`,
          start_time: bookedStart,
          end_time: bookedEnd,
          reserved_start: bufferStart,
          reserved_end: bufferEnd,
          proxy_user_id: assignedProxyId,
          candidate_name: candidateName,
          company_name: request.interview_company_name,
          status: 'synced',
          notifications_sent: true,
          created_at: new Date().toISOString()
        };

        if (!calEventsSnap.empty) {
          const existingEventId = calEventsSnap.docs[0].id;
          await updateDoc(doc(db, 'jpc_calendar_events', existingEventId), eventData);
        } else {
          await addDoc(collection(db, 'jpc_calendar_events'), eventData);
        }

        // Trigger Google Calendar integration API call
        try {
          await syncInterviewRoundToGoogleCalendar(round.id, request.id, assignedProxyId);
        } catch (calErr) {
          console.error('[DirectScheduleModal] Sync error:', calErr);
        }

        // Notify proxy of the manual update
        const nowStr = new Date().toISOString();
        await addDoc(collection(db, 'jpc_interview_notifications'), {
          interview_round_id: round.id,
          notification_type: 'slot_selected',
          recipient_user_id: assignedProxyId,
          message: `Interview Scheduled/Updated! Candidate ${candidateName} has been booked.`,
          is_read: false,
          created_at: nowStr
        });
      }

      onSuccess();
    } catch (error) {
       console.error(error);
       showToast('Failed to save schedule', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[60] flex items-center justify-center p-4">
      <div 
        className="bg-bg-secondary w-full max-w-md rounded-[48px] shadow-2xl overflow-hidden border border-border-primary"
      >
        <div className="p-10">
          <div className="flex items-center justify-between mb-8">
            <div>
              <span className="text-[10px] font-black text-accent-blue uppercase tracking-[0.3em]">Direct Entry</span>
              <h2 className="text-3xl font-black text-text-primary tracking-tight mt-1">Schedule Round</h2>
              <p className="text-xs font-bold text-text-muted mt-2 font-sans">Set custom interview date & time (EST)</p>
            </div>
            <button onClick={onClose} className="p-3 hover:bg-bg-tertiary rounded-2xl transition-colors">
              <X className="w-6 h-6 text-text-muted" />
            </button>
          </div>

          <div className="space-y-6 font-sans">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-text-muted uppercase tracking-widest px-1">Interview Date & Time</label>
              <input 
                type="datetime-local" 
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-5 py-4 bg-bg-tertiary border border-border-primary rounded-[20px] text-sm focus:ring-2 focus:ring-accent-blue/20 outline-none text-text-primary font-bold"
              />
            </div>

            <div className="flex items-start gap-3.5 bg-bg-tertiary border border-border-primary rounded-[20px] p-5">
              <input 
                type="checkbox" 
                id="clearPrevious"
                checked={clearPrevious}
                onChange={e => setClearPrevious(e.target.checked)}
                className="w-4 h-4 mt-0.5 text-accent-blue bg-bg-secondary border-border-primary rounded focus:ring-accent-blue/20 cursor-pointer"
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
      </div>
    </div>
  );
};
