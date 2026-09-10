import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  subscribeToCollection, 
  saveCandidate, 
  updateTargetReductionRequest, 
  addNotification, 
  logActivity 
} from '../services/storage';
import { Candidate, Application, TargetReductionRequest, User, InterviewSupportRequest } from '../types';
import { FreeTrialBadge } from '../components/FreeTrialBadge';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertCircle, 
  CheckCircle2, 
  XCircle, 
  Search, 
  Clock, 
  UserCheck, 
  Users, 
  Filter, 
  FileEdit, 
  Check, 
  X, 
  ChevronRight, 
  Calendar,
  AlertTriangle,
  ArrowRight,
  Download,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, getEasternDate, isEasternDayOngoing, getCalendarDateInfo, formatDisplayDateWithWeekday } from '../lib/utils';
import { useToast } from '../contexts/ToastContext';
import * as XLSX from 'xlsx';

const getLastNDays = (todayStr: string, n: number): string[] => {
  const dates: string[] = [];
  try {
    const parts = todayStr.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    
    for (let i = 0; i < n; i++) {
      const prevDate = new Date(Date.UTC(year, month, day, 12, 0, 0));
      prevDate.setUTCDate(prevDate.getUTCDate() - i);
      const y = prevDate.getUTCFullYear();
      const m = String(prevDate.getUTCMonth() + 1).padStart(2, '0');
      const d = String(prevDate.getUTCDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${d}`);
    }
  } catch (e) {
    console.error('Error in getLastNDays:', e);
  }
  return dates;
};

const parseBoldText = (text: string) => {
  const parts = text.split(/\*\*([\s\S]*?)\*\*/g);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return <strong key={i} className="font-bold text-text-primary">{part}</strong>;
    }
    return part;
  });
};

const renderMarkdown = (text: string) => {
  if (!text) return null;
  
  const lines = text.split('\n');
  return (
    <div className="space-y-4 text-sm text-text-primary leading-relaxed pb-4">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        
        // Headers
        if (trimmed.startsWith('####')) {
          return <h5 key={idx} className="text-sm font-black text-text-primary tracking-tight mt-6 flex items-center gap-1.5">{trimmed.replace(/^####\s*/, '')}</h5>;
        }
        if (trimmed.startsWith('###')) {
          return <h4 key={idx} className="text-base font-black text-accent-blue tracking-tight mt-6 border-l-2 border-accent-blue pl-3">{trimmed.replace(/^###\s*/, '')}</h4>;
        }
        if (trimmed.startsWith('##')) {
          return <h3 key={idx} className="text-lg font-black text-text-primary tracking-tight mt-8 pb-1 border-b border-border-primary/50">{trimmed.replace(/^##\s*/, '')}</h3>;
        }
        if (trimmed.startsWith('#')) {
          return <h2 key={idx} className="text-xl font-bold text-text-primary tracking-tight mt-10 pb-2 border-b border-border-primary">{trimmed.replace(/^#\s*/, '')}</h2>;
        }
        
        // Bullet list items
        if (trimmed.startsWith('*') || trimmed.startsWith('-')) {
          const listContent = trimmed.replace(/^(\*|-)\s*/, '');
          return (
            <li key={idx} className="ml-5 list-disc text-text-secondary marker:text-accent-blue py-0.5">
              {parseBoldText(listContent)}
            </li>
          );
        }
        
        // Ordered list item
        const orderedMatch = trimmed.match(/^(\d+)\.\s(.*)/);
        if (orderedMatch) {
          return (
            <div key={idx} className="ml-2 pl-4 border-l border-border-primary/50 py-1.5 my-3">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent-blue/10 text-accent-blue text-xs font-bold mr-2">{orderedMatch[1]}</span>
              <span className="text-text-primary font-bold">{parseBoldText(orderedMatch[2])}</span>
            </div>
          );
        }

        if (trimmed === '') {
          return <div key={idx} className="h-2" />;
        }
        
        // Regular paragraph
        return <p key={idx} className="text-text-secondary leading-relaxed font-normal">{parseBoldText(trimmed)}</p>;
      })}
    </div>
  );
};

export const TargetDashboard: React.FC = () => {
  const { user, isAuthReady } = useAuth();
  const { showToast } = useToast();

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [targetRequests, setTargetRequests] = useState<TargetReductionRequest[]>([]);
  const [team, setTeam] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [searchTerm, setSearchTerm] = useState('');
  const [recruiterFilter, setRecruiterFilter] = useState<string>('all');
  const [complianceFilter, setComplianceFilter] = useState<'all' | 'missed' | 'met' | 'ongoing' | 'pending_reduction'>('all');

  const [activeTab, setActiveTab] = useState<'candidates' | 'recruiters'>('candidates');

  // Trigger Report States
  const [triggerMonth, setTriggerMonth] = useState<number>(new Date().getMonth());
  const [triggerYear, setTriggerYear] = useState<number>(new Date().getFullYear());

  // Recruiter KPI state
  const [selectedRecruiterId, setSelectedRecruiterId] = useState<string>('all');
  const [selectedRange, setSelectedRange] = useState<number>(14);
  const [aiAnalysisText, setAiAnalysisText] = useState<string>('');
  const [isLoadingAI, setIsLoadingAI] = useState<boolean>(false);
  const [interviews, setInterviews] = useState<InterviewSupportRequest[]>([]);
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isAuthReady) return;

    const unsubCandidates = subscribeToCollection<Candidate>('jpc_candidates', setCandidates);
    const unsubApps = subscribeToCollection<Application>('jpc_applications', setApplications);
    const unsubTargets = subscribeToCollection<TargetReductionRequest>('jpc_target_reductions', (data) => {
      setTargetRequests(data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    });
    const unsubTeam = subscribeToCollection<User>('jpc_users', (data) => {
      setTeam(data);
      setLoading(false);
    });
    const unsubInterviews = subscribeToCollection<InterviewSupportRequest>('jpc_interview_requests', setInterviews);

    return () => {
      unsubCandidates();
      unsubApps();
      unsubTargets();
      unsubTeam();
      unsubInterviews();
    };
  }, [isAuthReady]);

  // Date boundary calculations (Eastern USA Timezone matching standard app trackers)
  const todayStr = useMemo(() => getEasternDate(), []);

  const mondayStr = useMemo(() => {
    const today = new Date(todayStr);
    const day = today.getDay(); // 0 is Sun, 1 is Mon
    const diff = today.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is Sunday
    const monday = new Date(today.setDate(diff));
    const y = monday.getFullYear();
    const m = String(monday.getMonth() + 1).padStart(2, '0');
    const d = String(monday.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [todayStr]);

  const firstOfMonthStr = useMemo(() => {
    const parts = todayStr.split('-');
    return `${parts[0]}-${parts[1]}-01`;
  }, [todayStr]);

  // Filter & calculate target metrics per candidate
  const candidatesStats = useMemo(() => {
    // Only check candidates in active marketing stages:
    // 'marketing_active', 'interviewing'
    const monitoredStages = ['marketing_active', 'interviewing'];
    const filteredCandidates = candidates.filter(c => {
      if (!monitoredStages.includes(c.current_stage)) return false;

      // EXCLUSION: If SIVIUM is selected but NOT Recruiter, skip from target tracking
      const entities = c.marketing_entity || [];
      if (entities.includes('sivium') && !entities.includes('recruiter')) {
        return false;
      }
      return true;
    });

    return filteredCandidates.map(c => {
      // Find candidate's applications in selected period
      const candidateApps = applications.filter(app => {
        if (app.candidate_id !== c.id) return false;
        
        if (period === 'daily') {
          return app.applied_at === todayStr;
        } else if (period === 'weekly') {
          return app.applied_at >= mondayStr && app.applied_at <= todayStr;
        } else {
          return app.applied_at >= firstOfMonthStr && app.applied_at <= todayStr;
        }
      });

      // Targets: Daily (per profile), Weekly (Daily * 5), Monthly (Daily * 22)
      const profilesCount = c.profiles_count || 1;
      const dailyTargetPerProfile = c.custom_daily_target || 40;
      const baseDailyTarget = profilesCount * dailyTargetPerProfile;

      let expectedTarget = baseDailyTarget;
      if (period === 'weekly') {
        expectedTarget = baseDailyTarget * 5; // Standard 5 working days
      } else if (period === 'monthly') {
        expectedTarget = baseDailyTarget * 22; // Standard 22 working days
      }

      const actualSum = candidateApps.length;
      const isMet = actualSum >= expectedTarget;
      const missCount = isMet ? 0 : expectedTarget - actualSum;

      // Detect if today's shift timezone is Active/Ongoing (ends 6:30 PM, but alerts after 6:15 PM)
      // If we are looking at the 'daily' period, and today is ongoing (before 6:15 PM Eastern Time), 
      // a candidate who is below the target is NOT marked as "missed" yet, but rather "ongoing".
      const isShiftOngoingForToday = period === 'daily' && isEasternDayOngoing(todayStr);
      const effectiveStatus: 'met' | 'missed' | 'ongoing' = isMet 
        ? 'met' 
        : (isShiftOngoingForToday ? 'ongoing' : 'missed');

      const isComplianceMet = isMet || isShiftOngoingForToday;

      // Find target change requests
      const candidateRequests = targetRequests.filter(req => req.candidate_id === c.id);
      const activeRequest = candidateRequests[0]; // Most recent first (due to sorting)

      // Recruiter, CS, and Marketing Leader (TL) names
      const recruiter = team.find(t => String(t.id) === String(c.assigned_recruiter));
      const csUser = team.find(t => String(t.id) === String(c.assigned_cs));
      const marketingLeader = team.find(t => String(t.id) === String(c.assigned_marketing_leader));

      return {
        candidate: c,
        recruiter,
        csUser,
        marketingLeader,
        actualCount: actualSum,
        targetCount: expectedTarget,
        isComplianceMet,
        effectiveStatus,
        missMargin: missCount,
        activeRequest,
        baseDailyTarget
      };
    });
  }, [candidates, applications, targetRequests, team, period, todayStr, mondayStr, firstOfMonthStr]);

  // Apply UI level search, recruiter filter, and compliance filter
  const processedStats = useMemo(() => {
    return candidatesStats.filter(stat => {
      // Role constraints
      if (user?.role === 'jpc_recruiter') {
        if (String(stat.candidate.assigned_recruiter) !== String(user.id)) return false;
      } else if (user?.role === 'jpc_cs') {
        if (String(stat.candidate.assigned_cs) !== String(user.id)) return false;
      }

      const nameMatch = stat.candidate.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        (stat.recruiter?.display_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                        (stat.marketingLeader?.display_name || '').toLowerCase().includes(searchTerm.toLowerCase());

      const recruiterMatch = recruiterFilter === 'all' || String(stat.candidate.assigned_recruiter) === recruiterFilter;

      let complianceMatch = true;
      if (complianceFilter === 'missed') {
        complianceMatch = stat.effectiveStatus === 'missed';
      } else if (complianceFilter === 'met') {
        complianceMatch = stat.effectiveStatus === 'met';
      } else if (complianceFilter === 'ongoing') {
        complianceMatch = stat.effectiveStatus === 'ongoing';
      } else if (complianceFilter === 'pending_reduction') {
        complianceMatch = !!stat.activeRequest && stat.activeRequest.status === 'pending';
      }

      return nameMatch && recruiterMatch && complianceMatch;
    });
  }, [candidatesStats, searchTerm, recruiterFilter, complianceFilter, user]);

  // Aggregate executive metrics
  const summaryMetrics = useMemo(() => {
    const totalCount = processedStats.length;
    const metCount = processedStats.filter(s => s.effectiveStatus === 'met').length;
    const ongoingCount = processedStats.filter(s => s.effectiveStatus === 'ongoing').length;
    const missCount = processedStats.filter(s => s.effectiveStatus === 'missed').length;
    
    // Calculate the compliance rate based on completed shifts (excluding ongoing tasks)
    const completedShiftsCount = metCount + missCount;
    const metRate = completedShiftsCount > 0 ? Math.round((metCount / completedShiftsCount) * 100) : 100;
    
    const totalApps = processedStats.reduce((sum, s) => sum + s.actualCount, 0);
    const pendingChanges = processedStats.filter(s => s.activeRequest?.status === 'pending').length;

    return {
      totalMonitored: totalCount,
      metCount,
      ongoingCount,
      missCount,
      metRate,
      totalApps,
      pendingChanges
    };
  }, [processedStats]);

  // Recruiter breakdown of who missed targets standard weekly/monthly
  const recruiterLeaderboard = useMemo(() => {
    const recruitersMap: { [key: string]: { name: string, totalCandidates: number, missedCount: number, actualApps: number } } = {};
    
    processedStats.forEach(stat => {
      const recruiterId = stat.candidate.assigned_recruiter || 'unassigned';
      const recruiterName = stat.recruiter?.display_name || 'Unassigned';

      if (!recruitersMap[recruiterId]) {
        recruitersMap[recruiterId] = {
          name: recruiterName,
          totalCandidates: 0,
          missedCount: 0,
          actualApps: 0
        };
      }

      recruitersMap[recruiterId].totalCandidates += 1;
      recruitersMap[recruiterId].actualApps += stat.actualCount;
      if (stat.effectiveStatus === 'missed') {
        recruitersMap[recruiterId].missedCount += 1;
      }
    });

    return Object.values(recruitersMap).sort((a, b) => b.missedCount - a.missedCount);
  }, [processedStats]);

  // Actions for Approve/Reject target reduction
  const handleApproveReduction = async (req: TargetReductionRequest, candidate: Candidate) => {
    const hasPermission = user?.role === 'jpc_cs' || user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager';
    if (!hasPermission) {
      showToast('You do not have administrative permission to approve requested target reductions.', 'error');
      return;
    }

    try {
      await updateTargetReductionRequest(req.id, { 
        status: 'approved', 
        cs_id: String(user?.id),
        updated_at: new Date().toISOString()
      });

      await saveCandidate({
        ...candidate,
        custom_daily_target: Number(req.requested_target)
      }, user?.id ? String(user.id) : null);

      await addNotification({
        recipient_id: req.recruiter_id,
        sender_id: user?.id || null,
        type: 'system_alert',
        message: `Target reduction approved for ${candidate.full_name}. Daily target updated to ${req.requested_target} per profile.`
      });

      await logActivity(candidate.id, 'Target reduction approved', `New target: ${req.requested_target} / profile`, user?.id || null);
      showToast(`Target reduction approved for ${candidate.full_name}`, 'success');
    } catch (e) {
      console.error(e);
      showToast('Failed to approve request', 'error');
    }
  };

  const handleRejectReduction = async (req: TargetReductionRequest, candidate: Candidate) => {
    const hasPermission = user?.role === 'jpc_cs' || user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager';
    if (!hasPermission) {
      showToast('You do not have administrative permission to reject requested target reductions.', 'error');
      return;
    }

    const notes = window.prompt('Reason for rejection?');
    if (notes === null) return; // User cancelled prompt

    try {
      await updateTargetReductionRequest(req.id, { 
        status: 'rejected', 
        cs_id: String(user?.id),
        cs_notes: notes || 'No reason provided',
        updated_at: new Date().toISOString()
      });

      await addNotification({
        recipient_id: req.recruiter_id,
        sender_id: user?.id || null,
        type: 'system_alert',
        message: `Target reduction request rejected for ${candidate.full_name}. Reason: ${notes || 'No reason specified'}`
      });

      await logActivity(candidate.id, 'Target reduction rejected', `Reason: ${notes || 'No reason specified'}`, user?.id || null);
      showToast(`Target reduction rejected for ${candidate.full_name}`, 'success');
    } catch (e) {
      console.error(e);
      showToast('Failed to reject request', 'error');
    }
  };

  const [isLoadingTrigger, setIsLoadingTrigger] = useState(false);

  const handleTriggerMonthlyReport = async () => {
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    
    if (!window.confirm(`Are you sure you want to trigger the monthly performance report email for ${monthNames[triggerMonth]} ${triggerYear}? This will analyze metrics for the full month.`)) return;
    
    setIsLoadingTrigger(true);
    try {
      const response = await fetch('/api/reports/trigger-monthly', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: triggerMonth, year: triggerYear })
      });
      if (!response.ok) throw new Error('Failed to trigger report');
      showToast(`Monthly performance report for ${monthNames[triggerMonth]} triggered successfully.`, 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsLoadingTrigger(false);
    }
  };

  const exportReport = () => {
    if (processedStats.length === 0) {
      showToast('No record available to export', 'info');
      return;
    }

    const rows = processedStats.map(({ candidate, recruiter, csUser, marketingLeader, actualCount, targetCount, effectiveStatus, missMargin, activeRequest }) => {
      let statusLabel = 'Met';
      if (effectiveStatus === 'ongoing') {
        statusLabel = 'In Progress (Shift Active)';
      } else if (effectiveStatus === 'missed') {
        statusLabel = `Missed (by ${missMargin} apps)`;
      }

      return {
        'Candidate Name': candidate.full_name,
        'Active Stage': candidate.current_stage.replace('_', ' ').toUpperCase(),
        'Profiles Count': candidate.profiles_count || 1,
        'Daily Target per Profile': candidate.custom_daily_target || 40,
        'Assigned Team Lead (TL)': marketingLeader?.display_name || 'Unassigned',
        'Assigned Recruiter': recruiter?.display_name || (marketingLeader ? `${marketingLeader.display_name} (TL)` : 'Unassigned'),
        'Assigned CS': csUser?.display_name || 'N/A',
        'Applications Submitted': actualCount,
        'Required Target': targetCount,
        'Compliance Period': period.toUpperCase(),
        'Shift Timeframe': '10:00 AM EDT - 6:30 PM EST',
        'Performance Status': statusLabel,
        'Target Request status': activeRequest 
          ? `Requested change to ${activeRequest.requested_target} (${activeRequest.status})` 
          : 'None'
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Target Compliance - ${period}`);

    XLSX.writeFile(wb, `JPC_Target_Compliance_${period}_${todayStr}.xlsx`);
    showToast('Compliance report exported successfully', 'success');
  };

  // List of all recruiters in the team (including Marketing Leaders who also manage candidate profiles)
  const recruitersList = useMemo(() => {
    return team.filter(u => u.role === 'jpc_recruiter' || u.role === 'jpc_marketing');
  }, [team]);

  // Set default recruiter when lists load
  useEffect(() => {
    if (activeTab === 'recruiters' && selectedRecruiterId === 'all' && recruitersList.length > 0) {
      setSelectedRecruiterId(String(recruitersList[0].id));
    }
  }, [activeTab, recruitersList, selectedRecruiterId]);

  // Generate detailed daily stats for selected recruiter
  const recruiterKPIData = useMemo(() => {
    if (selectedRecruiterId === 'all') return null;
    
    const recUser = team.find(u => String(u.id) === String(selectedRecruiterId));
    if (!recUser) return null;

    // Get list of dates of correct range
    const datesList = getLastNDays(todayStr, selectedRange);
    const monitoredStages = ['marketing_active', 'interviewing'];

    let totalAppsFiled = 0;
    let totalExpectedApps = 0;
    let metTargetDays = 0;
    let workingDaysCount = 0;

    const dailyStats = datesList.map(date => {
      const dateObj = new Date(date + 'T12:00:00');
      const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

      // Active candidates managed by this recruiter on or around this date
      const activeCandidatesForDate = candidates.filter(c => {
        if (String(c.assigned_recruiter) !== String(selectedRecruiterId)) return false;
        if (!monitoredStages.includes(c.current_stage)) return false;

        // EXCLUSION: If SIVIUM is selected but NOT Recruiter, skip from target tracking
        const entities = c.marketing_entity || [];
        if (entities.includes('sivium') && !entities.includes('recruiter')) {
          return false;
        }

        return c.created_at.slice(0, 10) <= date;
      });

      // Sum expected
      let expected = 0;
      if (!isWeekend) {
        activeCandidatesForDate.forEach(c => {
          const profiles = c.profiles_count || 1;
          const targetPerProf = c.custom_daily_target || 40;
          expected += (profiles * targetPerProf);
        });
      }

      // Applications filed on this date
      const appsOnDate = applications.filter(app => {
        return app.applied_at === date && String(app.recruiter_id) === String(selectedRecruiterId);
      });

      const actual = appsOnDate.length;
      const isMet = actual >= expected;
      const missed = isWeekend ? 0 : (isMet ? 0 : expected - actual);

      const isToday = date === todayStr;
      const isProgress = isToday && isEasternDayOngoing(todayStr) && !isMet;

      let statusLabel: 'met' | 'missed' | 'ongoing' | 'weekend' = 'met';
      if (isWeekend) {
        statusLabel = 'weekend';
      } else if (isProgress) {
        statusLabel = 'ongoing';
      } else if (!isMet) {
        statusLabel = 'missed';
      }

      totalAppsFiled += actual;
      totalExpectedApps += expected;

      if (!isWeekend) {
        workingDaysCount++;
        if (isMet) {
          metTargetDays++;
        }
      }

      // Individual candidate level breakdown for this date
      const candidatesBreakdown = activeCandidatesForDate.map(c => {
        const profiles = c.profiles_count || 1;
        const targetPerProf = c.custom_daily_target || 40;
        const candExpected = isWeekend ? 0 : (profiles * targetPerProf);

        const candApps = appsOnDate.filter(app => String(app.candidate_id) === String(c.id));
        const candActual = candApps.length;
        const candMissed = isWeekend ? 0 : (candActual >= candExpected ? 0 : candExpected - candActual);

        return {
          id: c.id,
          name: c.full_name,
          profilesCount: profiles,
          customTargetPerProfile: targetPerProf,
          expected: candExpected,
          actual: candActual,
          missed: candMissed
        };
      });

      const calendarInfo = getCalendarDateInfo(date);

      return {
        dateStr: date,
        formattedDate: formatDisplayDateWithWeekday(date),
        weekday: calendarInfo.weekdayLong,
        candidateCount: activeCandidatesForDate.length,
        expected,
        actual,
        missed,
        isWeekend,
        isProgress,
        statusLabel,
        candidatesBreakdown
      };
    });

    const complianceScore = workingDaysCount > 0 
      ? Math.round((metTargetDays / workingDaysCount) * 100) 
      : 100;

    // Filter interview support requests created for this recruiter's assigned candidates during range
    const recruiterCandidatesIds = candidates
      .filter(c => String(c.assigned_recruiter) === String(selectedRecruiterId))
      .map(c => c.id);

    const earliestDate = datesList[datesList.length - 1] || todayStr;

    const rangeInterviews = interviews.filter(req => {
      const recMatch = String(req.recruiter_id) === String(selectedRecruiterId) || recruiterCandidatesIds.includes(req.candidate_id);
      const parts = req.created_at.slice(0, 10);
      return recMatch && parts >= earliestDate && parts <= todayStr;
    });

    const totalMissedApps = dailyStats.reduce((sum, s) => sum + s.missed, 0);
    const interviewCount = rangeInterviews.length;
    const interviewConversionRate = totalAppsFiled > 0 
      ? parseFloat(((interviewCount / totalAppsFiled) * 100).toFixed(2)) 
      : 0;

    // Build period-wide cumulative stats per candidate
    const candidatesSummary = candidates
      .filter(c => {
        if (String(c.assigned_recruiter) !== String(selectedRecruiterId)) return false;
        if (!monitoredStages.includes(c.current_stage)) return false;

        // EXCLUSION: If SIVIUM is selected but NOT Recruiter, skip from target tracking
        const entities = c.marketing_entity || [];
        if (entities.includes('sivium') && !entities.includes('recruiter')) {
          return false;
        }
        return true;
      })
      .map(c => {
        const profiles = c.profiles_count || 1;
        const targetPerProf = c.custom_daily_target || 40;
        
        let candExpectedTotal = 0;
        let candActualTotal = 0;
        let candWorkingDays = 0;
        let candMetDays = 0;

        datesList.forEach(date => {
          const dateObj = new Date(date + 'T12:00:00');
          const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
          
          if (c.created_at.slice(0, 10) <= date) {
            const dayExpected = isWeekend ? 0 : (profiles * targetPerProf);
            const dayActual = applications.filter(app => {
              return app.applied_at === date && String(app.candidate_id) === String(c.id);
            }).length;

            candExpectedTotal += dayExpected;
            candActualTotal += dayActual;

            if (!isWeekend) {
              candWorkingDays++;
              if (dayActual >= dayExpected) {
                candMetDays++;
              }
            }
          }
        });

        const complianceRate = candWorkingDays > 0 ? Math.round((candMetDays / candWorkingDays) * 100) : 100;
        const missedTotal = candExpectedTotal > candActualTotal ? (candExpectedTotal - candActualTotal) : 0;

        return {
          id: c.id,
          name: c.full_name,
          domain: c.domain_interested || c.job_interest || 'N/A',
          profilesCount: profiles,
          customTargetPerProfile: targetPerProf,
          expectedTotal: candExpectedTotal,
          actualTotal: candActualTotal,
          missedTotal,
          complianceRate
        };
      });

    return {
      recruiter: recUser,
      complianceScore,
      totalAppsFiled,
      totalExpectedApps,
      totalMissedApps,
      metTargetDays,
      workingDaysCount,
      interviewCount,
      interviewConversionRate,
      dailyStats,
      candidatesSummary
    };
  }, [selectedRecruiterId, selectedRange, todayStr, team, candidates, applications, interviews]);

  const exportRecruiterReport = (recName: string, rangeDays: number, totalApps: number, totalExp: number, compScore: number, finalDailyStats: any[]) => {
    const rows = finalDailyStats.map(stat => {
      let statusLabel = 'Goal Met';
      if (stat.isWeekend) {
        statusLabel = 'Weekend Off';
      } else if (stat.isProgress) {
        statusLabel = 'In Progress (Shift Active)';
      } else if (stat.missed > 0) {
        statusLabel = `Missed (by ${stat.missed} apps)`;
      }

      return {
        'Date': stat.formattedDate,
        'Day': stat.weekday,
        'Candidates Managed': stat.candidateCount,
        'Expected Quota': stat.expected,
        'Submitted Output': stat.actual,
        'Missed Applications': stat.missed,
        'Status': statusLabel
      };
    });

    const summaryRow = {
      'Date': 'CUMULATIVE KPIS',
      'Day': '',
      'Candidates Managed': '',
      'Expected Quota': totalExp,
      'Submitted Output': totalApps,
      'Missed Applications': totalExp - totalApps > 0 ? totalExp - totalApps : 0,
      'Status': `Compliance Score: ${compScore}%`
    };

    const ws = XLSX.utils.json_to_sheet([...rows, {}, summaryRow]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Recruiter Report`);

    XLSX.writeFile(wb, `${recName.replace(/\s+/g, '_')}_KPI_Report_Last_${rangeDays}_Days.xlsx`);
    showToast('Recruiter KPI ledger exported successfully', 'success');
  };

  const handleCallAIAnalysis = async (recName: string, rangeLabel: string, compScore: number, totalApps: number, totalExp: number, missedTot: number, intersCount: number, intersYield: number, finalDailyStats: any[]) => {
    setIsLoadingAI(true);
    setAiAnalysisText('');
    try {
      const response = await fetch('/api/gemini/analyze-compliance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          recruiterName: recName,
          selectedRange: rangeLabel,
          complianceRate: compScore,
          totalAppsFiled: totalApps,
          totalExpectedApps: totalExp,
          totalMissedApps: missedTot,
          interviewCount: intersCount,
          interviewConversionRate: intersYield,
          dailyStats: finalDailyStats.map(s => ({
            date: s.dateStr,
            weekday: s.weekday,
            candidatesCount: s.candidateCount,
            quota: s.expected,
            submitted: s.actual,
            missed: s.missed,
            status: s.statusLabel
          }))
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Server error');
      }

      const data = await response.json();
      setAiAnalysisText(data.analysis);
      showToast('AI deep audit report compiled successfully!', 'success');
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Failed to call compliance AI', 'error');
    } finally {
      setIsLoadingAI(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-text-primary tracking-tight">Recruiter Compliance Central</h1>
          <p className="text-text-secondary text-sm sm:text-base mt-1">
            Analyze, monitor, and audit target application metrics against active candidate counts dynamically.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 self-start md:self-auto">
          {activeTab === 'candidates' && (
            <>
              <div className="flex bg-bg-secondary p-1 rounded-2xl border border-border-primary shadow-sm">
                {(['daily', 'weekly', 'monthly'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={cn(
                      "px-3 sm:px-5 py-1.5 sm:py-2 rounded-xl text-xs font-bold transition-all capitalize cursor-pointer",
                      period === p 
                        ? "bg-accent-blue text-white shadow-md shadow-accent-blue/10" 
                        : "text-text-secondary hover:text-text-primary"
                    )}
                  >
                    {p} Report
                  </button>
                ))}
              </div>

              <button
                onClick={exportReport}
                className="flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3.5 bg-accent-blue hover:bg-accent-blue/90 text-white rounded-2xl text-xs font-black shadow-md shadow-accent-blue/10 hover:shadow-lg transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Export Report
              </button>

              {(user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager' || user?.role === 'jpc_cs') && (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center bg-bg-secondary p-1 rounded-2xl border border-border-primary shadow-sm gap-1">
                    <select
                      value={triggerMonth}
                      onChange={(e) => setTriggerMonth(parseInt(e.target.value))}
                      className="bg-transparent text-[10px] font-black text-text-primary px-2 py-1.5 focus:outline-none cursor-pointer hover:bg-bg-tertiary rounded-xl transition-colors appearance-none"
                    >
                      {[
                        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
                      ].map((name, idx) => (
                        <option key={idx} value={idx}>{name}</option>
                      ))}
                    </select>
                    <select
                      value={triggerYear}
                      onChange={(e) => setTriggerYear(parseInt(e.target.value))}
                      className="bg-transparent text-[10px] font-black text-text-primary px-2 py-1.5 focus:outline-none cursor-pointer hover:bg-bg-tertiary rounded-xl transition-colors appearance-none border-l border-border-primary"
                    >
                      {[2024, 2025, 2026, 2027].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                  
                  <button
                    onClick={handleTriggerMonthlyReport}
                    disabled={isLoadingTrigger}
                    className="flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3.5 bg-bg-secondary border border-border-primary hover:bg-bg-tertiary text-text-primary rounded-2xl text-xs font-black shadow-sm transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className={cn("w-3.5 h-3.5 text-accent-blue", isLoadingTrigger && "animate-spin")} />
                    {isLoadingTrigger ? 'Generating...' : 'Trigger Monthly Report'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-border-primary gap-4 sm:gap-6 overflow-x-auto touch-scroll scrollbar-hide">
        <button
          onClick={() => setActiveTab('candidates')}
          className={cn(
            "pb-4 text-xs sm:text-sm font-black border-b-2 px-1 transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap",
            activeTab === 'candidates'
              ? "border-accent-blue text-accent-blue"
              : "border-transparent text-text-secondary hover:text-text-primary"
          )}
        >
          <Users className="w-4 h-4" />
          <span>Candidate Targets Audit</span>
        </button>
        <button
          onClick={() => setActiveTab('recruiters')}
          className={cn(
            "pb-4 text-xs sm:text-sm font-black border-b-2 px-1 transition-all cursor-pointer flex items-center gap-2",
            activeTab === 'recruiters'
              ? "border-accent-blue text-accent-blue"
              : "border-transparent text-text-secondary hover:text-text-primary"
          )}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Recruiter KPI Reports & AI Auditor</span>
        </button>
      </div>

      {activeTab === 'candidates' ? (
        <>
          {/* Stats Summary Panel */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-bg-secondary border border-border-primary rounded-3xl p-6 relative overflow-hidden shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">Target Met Rate</span>
            <TrendingUp className={cn("w-5 h-5", summaryMetrics.metRate >= 70 ? "text-accent-green" : "text-accent-amber")} />
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-black text-text-primary">{summaryMetrics.metRate}%</span>
          </div>
          <div className="mt-2 text-xs text-text-secondary flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-accent-green" />
            <span>{summaryMetrics.metCount} of {summaryMetrics.totalMonitored} candidates on target</span>
          </div>
          <div className="absolute top-0 right-0 w-24 h-24 bg-accent-blue/5 rounded-full blur-2xl pointer-events-none" />
        </div>

        <div className="bg-bg-secondary border border-border-primary rounded-3xl p-6 relative overflow-hidden shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">Target Misses</span>
            <TrendingDown className={cn("w-5 h-5", summaryMetrics.missCount > 0 ? "text-accent-red" : "text-text-muted")} />
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-black text-text-primary">{summaryMetrics.missCount}</span>
          </div>
          <div className="mt-2 text-xs text-text-secondary flex items-center gap-1.5">
            <AlertCircle className={cn("w-3.5 h-3.5", summaryMetrics.missCount > 0 ? "text-accent-red" : "text-text-muted")} />
            <span>Short of goals (excluding {summaryMetrics.ongoingCount} active shifts)</span>
          </div>
          <div className="absolute top-0 right-0 w-24 h-24 bg-accent-red/5 rounded-full blur-2xl pointer-events-none" />
        </div>

        <div className="bg-bg-secondary border border-border-primary rounded-3xl p-6 relative overflow-hidden shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">Total Filed</span>
            <CheckCircle2 className="w-5 h-5 text-accent-green" />
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-black text-text-primary">{summaryMetrics.totalApps}</span>
          </div>
          <div className="mt-2 text-xs text-text-secondary flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-accent-blue" />
            <span>Applications verified this {period}</span>
          </div>
        </div>

        <div className="bg-bg-secondary border border-border-primary rounded-3xl p-6 relative overflow-hidden shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">Pending Target Changes</span>
            <Clock className="w-5 h-5 text-accent-amber" />
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-black text-text-primary">{summaryMetrics.pendingChanges}</span>
          </div>
          <div className="mt-2 text-xs text-text-secondary flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-accent-amber animate-pulse" />
            <span>Target reductions awaiting approval</span>
          </div>
        </div>
      </div>

      {/* Advanced Filters Bar */}
      <div className="flex flex-col lg:flex-row gap-4 bg-bg-secondary p-4 rounded-3xl border border-border-primary shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
          <input 
            type="text"
            placeholder="Search by Candidate Name or Recruiter..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-bg-tertiary border border-border-primary rounded-2xl focus:outline-none focus:ring-2 focus:ring-accent-blue/20 transition-all font-medium text-sm text-text-primary placeholder-text-muted"
          />
        </div>

        {user?.role !== 'jpc_recruiter' && (
          <div className="flex items-center gap-2 bg-bg-tertiary border border-border-primary rounded-2xl px-4 py-3 min-w-[200px]">
            <Users className="w-4 h-4 text-text-muted" />
            <select 
              value={recruiterFilter}
              onChange={(e) => setRecruiterFilter(e.target.value)}
              className="bg-transparent border-none focus:ring-0 text-sm font-bold text-text-primary cursor-pointer w-full"
            >
              <option value="all">All Recruiters</option>
              {team.filter(u => u.role === 'jpc_recruiter' || u.role === 'jpc_marketing').map(u => (
                <option key={u.id} value={u.id}>{u.display_name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center gap-2 bg-bg-tertiary border border-border-primary rounded-2xl px-4 py-3 min-w-[200px]">
          <Filter className="w-4 h-4 text-text-muted" />
          <select 
            value={complianceFilter}
            onChange={(e) => setComplianceFilter(e.target.value as any)}
            className="bg-transparent border-none focus:ring-0 text-sm font-bold text-text-primary cursor-pointer w-full"
          >
            <option value="all">All Compliance Statuses</option>
            <option value="missed">⚠️ Below Targets (Missed)</option>
            <option value="met">✓ Met/Exceeded Targets</option>
            <option value="ongoing">🕒 Shift Active (In Progress)</option>
            <option value="pending_reduction">⏳ Pending Reductions</option>
          </select>
        </div>
      </div>

      {/* Main compliance tracking table */}
      <div className="bg-bg-secondary rounded-[32px] border border-border-primary overflow-hidden shadow-sm">
        <div className="p-6 border-b border-border-primary flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-text-primary">Recruiter Target Audit Logs</h2>
            <p className="text-xs text-text-secondary mt-1">
              Currently auditing metrics within: <strong className="text-text-primary italic capitalize">{period} window</strong> (commencing {period === 'daily' ? todayStr : period === 'weekly' ? mondayStr : firstOfMonthStr} to {todayStr})
            </p>
          </div>
          <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-bg-tertiary text-text-secondary border border-border-primary">
            Found {processedStats.length} candidates match
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-bg-tertiary/50 border-b border-border-primary text-[10px] font-black text-text-muted uppercase tracking-widest">
                <th className="py-4 px-6">Candidate Details</th>
                <th className="py-4 px-3">Assigned Team</th>
                <th className="py-4 px-3 text-center">Profiles & Target</th>
                <th className="py-4 px-3 text-center">Submitted / Target ({period})</th>
                <th className="py-4 px-3">Target Performance Status</th>
                <th className="py-4 px-6 text-center">Target Change Request Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-primary">
              {processedStats.map(({ candidate, recruiter, csUser, marketingLeader, actualCount, targetCount, isComplianceMet, effectiveStatus, missMargin, activeRequest, baseDailyTarget }) => (
                <tr key={candidate.id} className="hover:bg-bg-tertiary/20 transition-all group">
                  {/* Candidate details */}
                  <td className="py-5 px-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-bg-tertiary flex items-center justify-center font-black text-xs text-text-primary border border-border-primary/50">
                        {candidate.full_name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <a 
                          href={`#candidate?id=${candidate.id}`} 
                          className="font-bold text-text-primary hover:text-accent-blue transition-colors flex items-center gap-1.5 text-sm"
                        >
                          {candidate.full_name}
                          <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </a>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-bg-tertiary text-text-secondary border border-border-primary">
                            {candidate.current_stage.replace('_', ' ')}
                          </span>
                          {candidate.is_free_trial && (
                            <FreeTrialBadge 
                              startDate={candidate.free_trial_start_date}
                              endDate={candidate.free_trial_end_date}
                              size="sm"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Assigned team */}
                  <td className="py-5 px-3">
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-text-primary flex items-center gap-1">
                        <span className="text-text-muted w-8 inline-block text-[10px]">TL:</span> 
                        <span className="text-accent-blue font-bold">{marketingLeader?.display_name || '—'}</span>
                      </p>
                      <p className="text-xs font-bold text-text-primary flex items-center gap-1">
                        <span className="text-text-muted w-8 inline-block text-[10px]">REC:</span> 
                        <span>{recruiter?.display_name || (marketingLeader ? `${marketingLeader.display_name} (TL)` : 'Unassigned')}</span>
                      </p>
                      <p className="text-[10px] font-medium text-text-secondary flex items-center gap-1">
                        <span className="text-text-muted w-8 inline-block text-[10px]">CS:</span> 
                        <span>{csUser?.display_name || 'N/A'}</span>
                      </p>
                    </div>
                  </td>

                  {/* Profile & Target details */}
                  <td className="py-5 px-3 text-center">
                    <div className="space-y-1">
                      <span className="text-xs font-bold text-text-primary">
                        {candidate.profiles_count || 1} Profile(s)
                      </span>
                      <p className="text-[10px] text-text-secondary">
                        @ {candidate.custom_daily_target || 40} / profile daily
                      </p>
                    </div>
                  </td>

                  {/* Submitted / Target count */}
                  <td className="py-5 px-3">
                    <div className="flex flex-col items-center justify-center space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-sm font-black",
                          effectiveStatus === 'met' ? "text-accent-green" : effectiveStatus === 'ongoing' ? "text-accent-amber" : "text-accent-red"
                        )}>
                          {actualCount}
                        </span>
                        <span className="text-text-muted text-xs">/</span>
                        <span className="text-text-primary text-xs font-bold">{targetCount}</span>
                      </div>
                      {/* Visual progress bar */}
                      <div className="w-24 h-1.5 bg-bg-tertiary rounded-full overflow-hidden border border-border-primary/55">
                        <div 
                          className={cn(
                            "h-full rounded-full transition-all duration-300",
                            effectiveStatus === 'met' ? "bg-accent-green" : effectiveStatus === 'ongoing' ? "bg-accent-amber" : "bg-accent-red"
                          )}
                          style={{ width: `${Math.min((actualCount / targetCount) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>

                  {/* Performance indicator */}
                  <td className="py-5 px-3">
                    {effectiveStatus === 'met' ? (
                      <div className="flex items-center gap-1.5 text-accent-green">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span className="text-xs font-black">Target Met</span>
                      </div>
                    ) : effectiveStatus === 'ongoing' ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-accent-amber animate-pulse">
                          <Clock className="w-4 h-4 shrink-0" />
                          <span className="text-xs font-black">Shift Active</span>
                        </div>
                        <p className="text-[10px] text-text-secondary leading-normal">
                          Ends 6:30 PM EST<br />
                          Checking at 6:15 PM
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-accent-red">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span className="text-xs font-black">Missed Target</span>
                        </div>
                        <p className="text-[10px] text-text-secondary">
                          Short of target by <strong className="text-text-primary font-bold">{missMargin} apps</strong>
                        </p>
                      </div>
                    )}
                  </td>

                  {/* Target change request status column */}
                  <td className="py-5 px-6">
                    {activeRequest ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-4">
                          <span className={cn(
                            "px-2.5 py-1 rounded-xl text-[10px] font-black border uppercase tracking-wider flex items-center gap-1 balance-badge",
                            activeRequest.status === 'pending' ? "bg-accent-amber/10 text-accent-amber border-accent-amber/20" :
                            activeRequest.status === 'approved' ? "bg-accent-green/10 text-accent-green border-accent-green/20" :
                            "bg-accent-red/10 text-accent-red border-accent-red/20"
                          )}>
                            {activeRequest.status === 'pending' ? '⏳ Proposed' : 
                             activeRequest.status === 'approved' ? '✓ Approved' : '✗ Rejected'}
                            {activeRequest.status === 'pending' && ` to ${activeRequest.requested_target}`}
                          </span>

                          {/* Quick inline Admin/CS tools to approve/reject right from this unified view */}
                          {activeRequest.status === 'pending' && (user?.role === 'jpc_cs' || user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager') && (
                            <div className="flex items-center gap-1 bg-bg-tertiary p-1 rounded-xl border border-border-primary-strong md:hover:shadow shadow-sm transition-all animate-bounce">
                              <button
                                onClick={() => handleApproveReduction(activeRequest, candidate)}
                                title="Approve proposed target"
                                className="p-1 hover:bg-accent-green hover:text-white text-accent-green rounded-lg transition-all"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleRejectReduction(activeRequest, candidate)}
                                title="Reject propsed target"
                                className="p-1 hover:bg-accent-red hover:text-white text-accent-red rounded-lg transition-all"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Request reason or notes details */}
                        <div className="p-3 bg-bg-tertiary rounded-xl border border-border-primary/50 text-[11px] leading-relaxed text-text-secondary whitespace-pre-line max-w-[280px]">
                          {activeRequest.status === 'pending' ? (
                            <>
                              <strong className="text-text-primary">Reason:</strong> {activeRequest.reason}
                              <p className="text-[9px] text-text-muted mt-1">Requested target reduction from {baseDailyTarget / (candidate.profiles_count || 1)} per profile.</p>
                            </>
                          ) : activeRequest.status === 'approved' ? (
                            <span className="text-text-muted">Approved. System successfully applied updated targets to profiles.</span>
                          ) : (
                            <>
                              <strong className="text-text-primary">Rejection Reason:</strong> {activeRequest.cs_notes || 'No reason provided'}
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-text-muted italic flex items-center justify-center">
                        No requested change
                      </span>
                    )}
                  </td>
                </tr>
              ))}

              {processedStats.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-text-secondary">
                    <div className="w-16 h-16 bg-bg-tertiary rounded-full flex items-center justify-center mx-auto mb-4 border border-border-primary">
                      <CheckCircle2 className="w-8 h-8 text-text-muted" />
                    </div>
                    <p className="font-bold text-text-primary text-base">Perfect Compliance Achieved!</p>
                    <p className="text-xs text-text-secondary mt-1">
                      No candidates currently match the filtered criteria under the current settings.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recruiter Leaderboard / Audit Breakdown Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recruiter stats card */}
        <div className="bg-bg-secondary rounded-[32px] border border-border-primary p-6 shadow-sm flex flex-col justify-between col-span-2">
          <div>
            <h3 className="text-lg font-bold text-text-primary">Recruiter Leaderboard & Compliance Rates</h3>
            <p className="text-xs text-text-secondary mt-1">
              Analyzing team members who exhibit high ratios of missed daily/weekly targets across assigned candidates.
            </p>
          </div>

          <div className="mt-6 space-y-4 max-h-[300px] overflow-y-auto pr-2 divide-y divide-border-primary">
            {recruiterLeaderboard.map((rec, i) => {
              const complianceRatio = rec.totalCandidates > 0 ? Math.round(((rec.totalCandidates - rec.missedCount) / rec.totalCandidates) * 100) : 100;
              return (
                <div key={rec.name + i} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-accent-blue/10 text-accent-blue font-bold text-xs flex items-center justify-center">
                      {i + 1}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-text-primary">{rec.name}</p>
                      <p className="text-[10px] text-text-secondary">
                        Managing {rec.totalCandidates} candidates • Filed {rec.actualApps} applications
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className={cn(
                      "text-xs font-black px-2.5 py-1 rounded-full border",
                      complianceRatio >= 80 ? "bg-accent-green/10 text-accent-green border-accent-green/25" :
                      complianceRatio >= 50 ? "bg-accent-amber/10 text-accent-amber border-accent-amber/25" :
                      "bg-accent-red/10 text-accent-red border-accent-red/25"
                    )}>
                      {complianceRatio}% Met
                    </span>
                    <p className="text-[9px] text-text-secondary mt-1">
                      {rec.missedCount} candidate(s) below target
                    </p>
                  </div>
                </div>
              );
            })}
            
            {recruiterLeaderboard.length === 0 && (
              <p className="text-sm text-text-muted text-center py-6">No recruiter tracking history available yet.</p>
            )}
          </div>
        </div>

        {/* Informative Help Guide Card */}
        <div className="bg-bg-secondary rounded-[32px] border border-border-primary p-6 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-text-primary">System Compliance Guidelines</h3>
            <p className="text-xs text-text-secondary leading-relaxed">
              Recruiters are allocated mandatory daily application targets based on the number of profiles configured on behalf of candidates.
            </p>

            <ul className="space-y-3 pt-2 text-xs">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-accent-green shrink-0 mt-0.5" />
                <span className="text-text-secondary">
                  <strong>Standard Target</strong> of 40 applications per profile per candidate is applied every working weekday.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <Clock className="w-4 h-4 text-accent-amber shrink-0 mt-0.5" />
                <span className="text-text-secondary">
                  <strong>Target Changes</strong> submitted through candidate pages are listed inline and require manual administrative approval.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-accent-red shrink-0 mt-0.5" />
                <span className="text-text-secondary">
                  <strong>Approval Actions</strong> dynamically overwrite active targets immediately on approval. Rejections require explanation records.
                </span>
              </li>
            </ul>
          </div>

          <div className="mt-6 pt-6 border-t border-border-primary text-[10px] text-text-muted flex items-center justify-between">
            <span>Powered by JPC Compliance Tracker</span>
            <span>Est. timezone: EST/EDT</span>
          </div>
        </div>
      </div>
    </>
  ) : (
    <div className="space-y-8 animate-fadeIn">
      {/* Controls Panel */}
      <div className="bg-bg-secondary p-6 rounded-[32px] border border-border-primary shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex flex-wrap items-center gap-6">
          <div className="space-y-1.5 flex flex-col justify-end">
            <label className="text-[10px] font-black text-text-muted uppercase tracking-wider block">Audited Recruiter</label>
            <select
              value={selectedRecruiterId}
              onChange={(e) => {
                setSelectedRecruiterId(e.target.value);
                setAiAnalysisText('');
              }}
              className="px-4 py-2.5 bg-bg-tertiary border border-border-primary rounded-xl text-xs font-bold text-text-primary focus:outline-none focus:border-accent-blue/50"
            >
              <option value="all" disabled>Select Recruiter...</option>
              {recruitersList.map(rec => (
                <option key={rec.id} value={rec.id}>{rec.display_name}</option>
              ))}
              {recruitersList.length === 0 && (
                <option value="none" disabled>No recruiters loaded</option>
              )}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-text-muted uppercase tracking-wider block">Audit Period</label>
            <div className="flex bg-bg-tertiary p-1 rounded-xl border border-border-primary">
              {([7, 14, 21, 30] as const).map((days) => (
                <button
                  key={days}
                  onClick={() => {
                    setSelectedRange(days);
                    setAiAnalysisText('');
                  }}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border-none",
                    selectedRange === days 
                      ? "bg-accent-blue text-white shadow-sm" 
                      : "text-text-secondary hover:text-text-primary"
                  )}
                >
                  {days} Days
                </button>
              ))}
            </div>
          </div>
        </div>

        {recruiterKPIData && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => exportRecruiterReport(
                recruiterKPIData.recruiter.display_name,
                selectedRange,
                recruiterKPIData.totalAppsFiled,
                recruiterKPIData.totalExpectedApps,
                recruiterKPIData.complianceScore,
                recruiterKPIData.dailyStats
              )}
              className="flex items-center gap-2 px-5 py-3 border border-border-primary hover:border-text-secondary/35 text-text-primary rounded-2xl text-xs font-bold bg-bg-secondary hover:shadow transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-accent-blue" />
              <span>Export Report Sheet</span>
            </button>

            <button
              onClick={() => handleCallAIAnalysis(
                recruiterKPIData.recruiter.display_name,
                `Last ${selectedRange} Days`,
                recruiterKPIData.complianceScore,
                recruiterKPIData.totalAppsFiled,
                recruiterKPIData.totalExpectedApps,
                recruiterKPIData.totalMissedApps,
                recruiterKPIData.interviewCount,
                recruiterKPIData.interviewConversionRate,
                recruiterKPIData.dailyStats
              )}
              disabled={isLoadingAI}
              className={cn(
                "flex items-center gap-2 px-5 py-3 text-white rounded-2xl text-xs font-bold shadow-md transition-all cursor-pointer border-none",
                isLoadingAI 
                  ? "bg-bg-tertiary text-text-muted border border-border-primary cursor-not-allowed" 
                  : "bg-accent-blue hover:bg-accent-blue/90 shadow-accent-blue/10 hover:shadow-lg"
              )}
            >
              <Sparkles className={cn("w-3.5 h-3.5", isLoadingAI ? "animate-spin" : "")} />
              <span>{isLoadingAI ? "AI Analyzing..." : "Generate AI Compliance Review"}</span>
            </button>
          </div>
        )}
      </div>

      {recruiterKPIData ? (
        <div className="space-y-8 animate-fadeIn">
          {/* Recruiter Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Score */}
            <div className="bg-bg-secondary border border-border-primary rounded-3xl p-6 relative overflow-hidden shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">Compliance Rate</span>
                <TrendingUp className={cn("w-5 h-5", recruiterKPIData.complianceScore >= 80 ? "text-accent-green" : recruiterKPIData.complianceScore >= 50 ? "text-accent-amber" : "text-accent-red")} />
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-4xl font-black text-text-primary">{recruiterKPIData.complianceScore}%</span>
              </div>
              <p className="mt-2 text-[10px] text-text-secondary leading-normal">
                Met standard target quotas on <strong className="text-text-primary font-bold">{recruiterKPIData.metTargetDays}</strong> of <strong className="text-text-primary font-bold">{recruiterKPIData.workingDaysCount}</strong> scheduled calendar weekdays.
              </p>
            </div>

            {/* Submissions vs Target */}
            <div className="bg-bg-secondary border border-border-primary rounded-3xl p-6 relative overflow-hidden shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">Applications Filed</span>
                <CheckCircle2 className="w-5 h-5 text-accent-blue" />
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-4xl font-black text-text-primary">{recruiterKPIData.totalAppsFiled}</span>
                <span className="text-xs text-text-muted">/ {recruiterKPIData.totalExpectedApps} required</span>
              </div>
              <p className="mt-2 text-[10px] text-text-secondary leading-normal">
                Total cumulative applications submitted across all portfolios under recruiter monitoring during selected range.
              </p>
            </div>

            {/* Interview support requests */}
            <div className="bg-bg-secondary border border-border-primary rounded-3xl p-6 relative overflow-hidden shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">Interview Pipeline</span>
                <Clock className="w-5 h-5 text-accent-amber" />
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-4xl font-black text-text-primary">{recruiterKPIData.interviewCount}</span>
                <span className="text-xs text-text-muted">Interviews Booked</span>
              </div>
              <p className="mt-2 text-[10px] text-text-secondary leading-normal">
                Conversion yield of <strong className="text-text-primary font-bold">{recruiterKPIData.interviewConversionRate}%</strong> from filed output to scheduled interviews.
              </p>
            </div>

            {/* Missed Application quota */}
            <div className="bg-bg-secondary border border-border-primary rounded-3xl p-6 relative overflow-hidden shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">Cumulative Gaps</span>
                <AlertCircle className="w-5 h-5 text-accent-red" />
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className={cn("text-4xl font-black", recruiterKPIData.totalMissedApps > 0 ? "text-accent-red" : "text-text-primary")}>{recruiterKPIData.totalMissedApps}</span>
                <span className="text-xs text-text-muted">missed applications</span>
              </div>
              <p className="mt-2 text-[10px] text-text-secondary leading-normal">
                Sum total number of applications missed below mandatory daily target requirements across all active days in the range.
              </p>
            </div>
          </div>

          {/* Monitored Candidates Summary */}
          {recruiterKPIData.candidatesSummary && recruiterKPIData.candidatesSummary.length > 0 && (
            <div className="bg-bg-secondary rounded-[32px] border border-border-primary shadow-sm p-6 space-y-4 animate-fadeIn">
              <div>
                <h3 className="text-lg font-bold text-text-primary">Monitored Candidates Compliance Summary</h3>
                <p className="text-xs text-text-secondary mt-1 font-medium">
                  Cumulative aggregate tracking of targets versus submitted applications for each candidate assigned to this recruiter over the selected range.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {recruiterKPIData.candidatesSummary.map((cand) => (
                  <div key={cand.id} className="bg-bg-tertiary/40 border border-border-primary rounded-2xl p-4 flex flex-col justify-between hover:shadow-sm transition-all">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-text-primary truncate max-w-[180px]">{cand.name}</span>
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[9px] font-black border uppercase tracking-wider",
                          cand.complianceRate >= 95 ? "bg-accent-green/10 text-accent-green border-accent-green/20" :
                          cand.complianceRate >= 80 ? "bg-accent-amber/10 text-accent-amber border-accent-amber/20" :
                          "bg-accent-red/10 text-accent-red border-accent-red/20"
                        )}>
                          {cand.complianceRate}% Rate
                        </span>
                      </div>
                      <p className="text-[10px] text-text-muted truncate font-bold uppercase tracking-wider">{cand.domain}</p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-border-primary/55 grid grid-cols-3 gap-2 text-center">
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-black text-text-muted uppercase tracking-wider block">Profiles & Target</span>
                        <span className="text-[11px] font-black text-text-primary">{cand.profilesCount}p × {cand.customTargetPerProfile}</span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-black text-text-muted uppercase tracking-wider block">Expected</span>
                        <span className="text-[11px] font-black text-text-primary">{cand.expectedTotal}</span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-black text-text-muted uppercase tracking-wider block">Submitted</span>
                        <span className="text-[11px] font-black text-accent-blue">{cand.actualTotal}</span>
                      </div>
                    </div>
                    {cand.missedTotal > 0 && (
                      <div className="mt-2.5 px-2.5 py-1.5 bg-accent-red/5 rounded-xl border border-accent-red/10 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-accent-red shrink-0" />
                        <span className="text-[10px] text-accent-red font-bold">Deficit total: {cand.missedTotal} missed applications</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Daily ledger table */}
          <div className="bg-bg-secondary rounded-[32px] border border-border-primary shadow-sm overflow-hidden p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-primary/40 pb-4">
              <div>
                <h3 className="text-lg font-bold text-text-primary">Daily Performance Audit Ledger</h3>
                <p className="text-xs text-text-secondary mt-1 font-medium">
                  Granular raw chronological breakdown showing individual target applications requirement versus submitted applications daily. Click any row to inspect candidate-specific details.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const allExp: Record<string, boolean> = {};
                    recruiterKPIData.dailyStats.forEach(s => {
                      allExp[s.dateStr] = true;
                    });
                    setExpandedDates(allExp);
                  }}
                  className="px-3 py-2 bg-bg-tertiary border border-border-primary hover:border-text-secondary/35 text-text-primary text-[10px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                >
                  Expand All Days
                </button>
                <button
                  type="button"
                  onClick={() => setExpandedDates({})}
                  className="px-3 py-2 bg-bg-tertiary border border-border-primary hover:border-text-secondary/35 text-text-primary text-[10px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                >
                  Collapse All
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-border-primary">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-bg-tertiary text-[10px] font-black text-text-muted uppercase tracking-wider border-b border-border-primary whitespace-nowrap">
                    <th className="py-4 px-6">Date</th>
                    <th className="py-4 px-3 text-center">Active Candidates</th>
                    <th className="py-4 px-3 text-center">Expected Quota</th>
                    <th className="py-4 px-3 text-center">Submitted Output</th>
                    <th className="py-4 px-3 text-center">Deficit Count</th>
                    <th className="py-4 px-6 text-right">Day Compliance Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-primary/50">
                  {recruiterKPIData.dailyStats.map((stat) => (
                    <React.Fragment key={stat.dateStr}>
                      <tr 
                        onClick={() => {
                          setExpandedDates(prev => ({
                            ...prev,
                            [stat.dateStr]: !prev[stat.dateStr]
                          }));
                        }}
                        className="hover:bg-bg-tertiary/10 transition-colors cursor-pointer select-none"
                      >
                        <td className="py-4 px-6 text-xs text-text-primary whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <ChevronRight className={cn("w-4 h-4 text-text-muted shrink-0 transition-transform", expandedDates[stat.dateStr] ? "rotate-90 text-accent-blue" : "")} />
                            <div>
                              <div className="font-bold text-text-primary">{stat.formattedDate}</div>
                              <span className="text-[10px] text-text-muted lowercase font-bold">{stat.weekday}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-3 text-center text-xs text-text-secondary font-semibold">
                          {stat.candidateCount} Candidates
                        </td>
                        <td className="py-4 px-3 text-center text-xs text-text-primary font-black">
                          {stat.expected}
                        </td>
                        <td className="py-4 px-3 text-center text-xs text-text-primary font-black">
                          {stat.actual}
                        </td>
                        <td className="py-4 px-3 text-center text-xs text-text-primary">
                          {stat.missed > 0 ? (
                            <span className="font-black text-accent-red">{stat.missed} missed</span>
                          ) : (
                            <span className="text-text-muted font-normal italic">-</span>
                          )}
                        </td>
                        <td className="py-4 px-6 text-right whitespace-nowrap">
                          <span className={cn(
                            "px-2.5 py-1 rounded-full text-[10px] font-black border uppercase tracking-wider inline-flex items-center gap-1 balance-badge",
                            stat.statusLabel === 'met' ? "bg-accent-green/10 text-accent-green border-accent-green/20" :
                            stat.statusLabel === 'weekend' ? "bg-text-secondary/10 text-text-secondary border-border-primary" :
                            stat.statusLabel === 'ongoing' ? "bg-accent-amber/10 text-accent-amber border-accent-amber/20 animate-pulse" :
                            "bg-accent-red/10 text-accent-red border-accent-red/20"
                          )}>
                            {stat.statusLabel === 'met' && '✓ Perfect' }
                            {stat.statusLabel === 'weekend' && '💤 Weekend off' }
                            {stat.statusLabel === 'ongoing' && '🕒 Shift Active' }
                            {stat.statusLabel === 'missed' && `⚠️ Missed by ${stat.missed}` }
                          </span>
                        </td>
                      </tr>
                      {expandedDates[stat.dateStr] && (
                        <tr className="bg-bg-tertiary/10">
                          <td colSpan={6} className="py-4 px-8 border-b border-border-primary/30">
                            <div className="space-y-3.5 pb-2 animate-fadeIn text-xs">
                              <div className="flex items-center justify-between border-b border-border-primary/50 pb-2">
                                <span className="text-[10px] font-black text-text-muted uppercase tracking-wider">Candidate Allocation & Performance details ({stat.formattedDate})</span>
                                <span className="text-[10px] font-bold text-text-secondary">{stat.candidatesBreakdown?.length || 0} Candidate profiles on this day</span>
                              </div>

                              {stat.candidatesBreakdown && stat.candidatesBreakdown.length > 0 ? (
                                <div className="divide-y divide-border-primary/40 border border-border-primary rounded-xl overflow-hidden bg-bg-secondary shadow-inner">
                                  {stat.candidatesBreakdown.map((cand: any) => (
                                    <div key={cand.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs font-semibold hover:bg-bg-tertiary/10 transition-colors">
                                      <div className="space-y-0.5">
                                        <div className="font-bold text-text-primary text-xs flex items-center gap-2">
                                          <span className="w-1.5 h-1.5 rounded-full bg-accent-blue shrink-0" />
                                          {cand.name}
                                        </div>
                                        <span className="text-[10px] text-text-muted/80 ml-3.5 font-medium uppercase tracking-wider leading-none">
                                          Target configuration: {cand.profilesCount} {cand.profilesCount === 1 ? 'profile' : 'profiles'} @ {cand.customTargetPerProfile} target daily
                                        </span>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-4 sm:gap-6 ml-3.5 sm:ml-0">
                                        <div className="text-left sm:text-center min-w-[70px]">
                                          <span className="text-[9px] text-text-muted block uppercase tracking-wider">Expected</span>
                                          <span className="font-black text-text-primary">{cand.expected}</span>
                                        </div>
                                        <div className="text-left sm:text-center min-w-[70px]">
                                          <span className="text-[9px] text-text-muted block uppercase tracking-wider">Submitted</span>
                                          <span className="font-black text-accent-blue">{cand.actual}</span>
                                        </div>
                                        <div className="text-left sm:text-right min-w-[90px]">
                                          <span className="text-[9px] text-text-muted block uppercase tracking-wider">Delta status</span>
                                          {cand.missed > 0 ? (
                                            <span className="font-black text-accent-red block whitespace-nowrap">⚠️ Missed by {cand.missed}</span>
                                          ) : cand.expected > 0 ? (
                                            <span className="font-black text-accent-green block whitespace-nowrap">✓ Met Target</span>
                                          ) : (
                                            <span className="text-text-muted block whitespace-nowrap">💤 Day Off</span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-[11px] text-text-muted font-bold italic py-2">No monitored candidate profiles were active on this date.</p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* AI compliance audit panel */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-bg-secondary border border-border-primary rounded-[32px] p-6 shadow-sm flex flex-col justify-between">
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-border-primary/50 pb-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-accent-blue animate-pulse" />
                    <div>
                      <h3 className="text-base font-bold text-text-primary font-black">AI Executive Analysis Suite</h3>
                      <p className="text-[10px] text-text-secondary font-medium">
                        Run deep-learning assessments on application accuracy, weekday margins, and pipeline outcomes.
                      </p>
                    </div>
                  </div>
                  
                  {aiAnalysisText && (
                    <span className="px-2.5 py-1 rounded-full text-[9px] font-black bg-accent-blue/10 text-accent-blue border border-accent-blue/20 uppercase tracking-widest leading-none">
                      Audit Completed
                    </span>
                  )}
                </div>

                {isLoadingAI ? (
                  <div className="py-12 flex flex-col items-center justify-center space-y-4">
                    <div className="w-10 h-10 border-4 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
                    <div className="text-center">
                      <p className="text-xs font-bold text-text-primary animate-pulse font-black">Consulting AI Compliance Assistant...</p>
                      <p className="text-[10px] text-text-muted mt-1 leading-normal max-w-xs mx-auto">Aggregating historical submissions, daily targets, and conversion yields...</p>
                    </div>
                  </div>
                ) : aiAnalysisText ? (
                  <div className="p-6 bg-bg-tertiary rounded-2xl border border-border-primary/50 overflow-y-auto max-h-[500px]">
                    {renderMarkdown(aiAnalysisText)}
                  </div>
                ) : (
                  <div className="py-12 border-2 border-dashed border-border-primary rounded-2xl flex flex-col items-center justify-center text-center p-6 bg-bg-tertiary">
                    <div className="w-12 h-12 bg-accent-blue/10 text-accent-blue rounded-full flex items-center justify-center mb-4">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <h4 className="text-xs font-bold text-text-primary">No Active AI Compliance Analysis Generated</h4>
                    <p className="text-[10px] text-text-secondary mt-1 max-w-sm leading-normal font-medium">
                      Click the "Generate AI Compliance Review" button above to execute a fully automated AI auditing analysis of this recruiter's output, consistency ratios, and interview bookings yield.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Guide notes card */}
            <div className="bg-bg-secondary rounded-[32px] border border-border-primary p-6 shadow-sm flex flex-col justify-between">
              <div className="space-y-4">
                <h3 className="text-base font-bold text-text-primary font-black">Compliance Assessment Criteria</h3>
                <p className="text-xs text-text-secondary leading-normal">
                  All recruiters are evaluated strictly against the target-matching metric:
                </p>

                <div className="space-y-3.5 pt-2 text-xs">
                  <div className="p-3.5 bg-bg-tertiary rounded-2xl border border-border-primary/50">
                    <div className="font-bold text-text-primary text-xs flex items-center gap-1.5 pb-1">
                      <span className="w-2 h-2 rounded-full bg-accent-green" />
                      Gold Standard (95% - 100%)
                    </div>
                    <p className="text-[10px] text-text-secondary leading-normal font-semibold">
                      Virtually zero gaps. Steady day-by-day filings with a balanced conversion queue. High-quality client interactions.
                    </p>
                  </div>

                  <div className="p-3.5 bg-bg-tertiary rounded-2xl border border-border-primary/50">
                    <div className="font-bold text-text-primary text-xs flex items-center gap-1.5 pb-1">
                      <span className="w-2 h-2 rounded-full bg-accent-amber" />
                      Stable Compliant (80% - 94%)
                    </div>
                    <p className="text-[10px] text-text-secondary leading-normal font-semibold">
                      Occasional slight margins of deficit. Safe performance, but requires regular weekly checks on end-of-shift coverage.
                    </p>
                  </div>

                  <div className="p-3.5 bg-bg-tertiary rounded-2xl border border-border-primary/50">
                    <div className="font-bold text-text-primary text-xs flex items-center gap-1.5 pb-1">
                      <span className="w-2 h-2 rounded-full bg-accent-red" />
                      Review Warning (Below 80%)
                    </div>
                    <p className="text-[10px] text-text-secondary leading-normal font-semibold">
                      Significant missing slots. Consistent late daily records or erratic filing spikes. Retraining or replacement recommended.
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-[9px] text-text-muted mt-6 text-center leading-normal pt-4 border-t border-border-primary">
                Evaluation models compile actual performance against individual candidate customized constraints automatically.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="py-24 text-center border border-dashed border-border-primary rounded-[32px] bg-bg-secondary">
          <p className="text-sm font-bold text-text-secondary">Please select an active recruiter to start the compliance and KPI audit review process.</p>
        </div>
      )}
    </div>
  )}
</div>
  );
};
