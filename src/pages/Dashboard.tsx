import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { subscribeToCollection, subscribeToQuery, markNotificationAsRead } from '../services/storage';
import { STAGES } from '../constants';
import { TimeZoneClocks } from '../components/TimeZoneClocks';
import { 
  Users, CheckCircle2, Clock, UserX, ArrowRight, LayoutGrid, Phone, Calendar, 
  ArrowUpRight, AlertCircle, ChevronRight, FileEdit, Video, TrendingUp, Check, 
  ShieldCheck, X, Zap, Image as ImageIcon, FileText, Download, Filter, BarChart as BarChartIcon, DollarSign, Activity, FileCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, getEasternDate, isEasternDayOngoing } from '../lib/utils';
import { Candidate, FollowUp, Notification, ResumeChangeRequest, InterviewSupportRequest, Application, TargetReductionRequest, FeatureAnnouncement, User } from '../types';
import { CandidateSheet } from '../components/CandidateSheet';
import { FreeTrialBadge } from '../components/FreeTrialBadge';
import { ThoughtsConfigModal, DEFAULT_QUOTES } from '../components/ThoughtsConfigModal';
import { CelebrationBanner } from '../components/CelebrationBanner';
import { db, firebaseConfig } from '../firebase';
import { query, collection, where, limit, doc, getDoc } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { 
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell 
} from 'recharts';
import { isProxyUser } from '../services/interviewService';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-bg-secondary p-4 border border-border-primary rounded-2xl shadow-xl backdrop-blur-md">
        <p className="text-xs font-bold text-text-muted mb-1.5 uppercase tracking-wider">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-xs font-bold flex items-center gap-2 mt-1" style={{ color: entry.stroke || entry.fill || entry.color }}>
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.stroke || entry.fill || entry.color }} />
            {entry.name}: {typeof entry.value === 'number' ? `$${entry.value.toLocaleString()}` : entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export const Dashboard: React.FC = () => {
  const { user, isAuthReady } = useAuth();
  const { showToast } = useToast();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [resumeRequests, setResumeRequests] = useState<ResumeChangeRequest[]>([]);
  const [interviews, setInterviews] = useState<InterviewSupportRequest[]>([]);
  const [targetRequests, setTargetRequests] = useState<TargetReductionRequest[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [featureAnnouncements, setFeatureAnnouncements] = useState<FeatureAnnouncement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const [motivationalQuote, setMotivationalQuote] = useState('');
  const [dismissedAnnouncements, setDismissedAnnouncements] = useState<string[]>(JSON.parse(localStorage.getItem('dismissed_announcements') || '[]'));
  const [quotesList, setQuotesList] = useState<string[]>(DEFAULT_QUOTES);
  const [isThoughtsModalOpen, setIsThoughtsModalOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  // CRM Leads & Sales Graph Dashboard State Variables
  const [selectedSourceFilter, setSelectedSourceFilter] = useState('all');
  const [selectedAgentFilter, setSelectedAgentFilter] = useState('all');
  const [selectedTimeframeFilter, setSelectedTimeframeFilter] = useState('all');

  const uniqueLeadSources = useMemo(() => {
    const sources = new Set<string>();
    candidates.forEach(c => {
      if (c.lead_source?.trim()) {
        sources.add(c.lead_source.trim());
      }
    });
    return Array.from(sources);
  }, [candidates]);

  const leadGenAgents = useMemo(() => {
    return allUsers.filter(u => 
      u.role === 'jpc_lead_gen' || 
      u.role === 'jpc_sales' || 
      u.role === 'administrator' || 
      u.role === 'jpc_sysadmin' ||
      u.role === 'jpc_manager'
    );
  }, [allUsers]);

  const filteredCRMLeads = useMemo(() => {
    return candidates.filter(c => {
      // 1. Source filter
      if (selectedSourceFilter !== 'all' && c.lead_source !== selectedSourceFilter) return false;
      
      // 2. Agent filter (Created/sales assigned rep)
      if (selectedAgentFilter !== 'all') {
        const matchesLeadCreator = String(c.lead_generated_by) === selectedAgentFilter;
        const matchesSalesRep = String(c.assigned_sales) === selectedAgentFilter;
        if (!matchesLeadCreator && !matchesSalesRep) return false;
      }

      // 3. Timeframe filter
      if (selectedTimeframeFilter !== 'all' && c.created_at) {
        const createdDate = new Date(c.created_at);
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - createdDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (selectedTimeframeFilter === '7days' && diffDays > 7) return false;
        if (selectedTimeframeFilter === '30days' && diffDays > 30) return false;
        if (selectedTimeframeFilter === '90days' && diffDays > 90) return false;
      }
      return true;
    });
  }, [candidates, selectedSourceFilter, selectedAgentFilter, selectedTimeframeFilter]);

  const funnelData = useMemo(() => {
    const totalPool = filteredCRMLeads;
    const totalLeads = totalPool.length;
    
    // Step progression counts
    const agreementSentCount = totalPool.filter(c => c.flags?.agreement_sent || c.current_stage !== 'lead_generation').length;
    const agreementSignedCount = totalPool.filter(c => c.flags?.agreement_signed || (c.current_stage !== 'lead_generation' && c.current_stage !== 'cs_qc')).length;
    const activeOpCandidates = totalPool.filter(c => !['lead_generation', 'cs_qc', 'not_interested', 'not_eligible'].includes(c.current_stage)).length;
    const closedSales = totalPool.filter(c => ['completed', 'offer', 'sales'].includes(c.current_stage)).length;

    return [
      { step: '1. Inbound Leads', count: totalLeads, rate: 100, color: '#3b82f6' },
      { step: '2. Agreement Sent', count: agreementSentCount, rate: totalLeads > 0 ? Math.round((agreementSentCount / totalLeads) * 100) : 0, color: '#8b5cf6' },
      { step: '3. Agreement Signed', count: agreementSignedCount, rate: totalLeads > 0 ? Math.round((agreementSignedCount / totalLeads) * 100) : 0, color: '#ec4899' },
      { step: '4. Operations Setup', count: activeOpCandidates, rate: totalLeads > 0 ? Math.round((activeOpCandidates / totalLeads) * 100) : 0, color: '#f59e0b' },
      { step: '5. Success/Won Sales', count: closedSales, rate: totalLeads > 0 ? Math.round((closedSales / totalLeads) * 100) : 0, color: '#10b981' },
    ];
  }, [filteredCRMLeads]);

  const pipelineDataDynamic = useMemo(() => {
    const stagesToShow = [
      { key: 'lead_generation', name: 'Lead Gen', color: '#3b82f6' },
      { key: 'cs_qc', name: 'Agreement Sent', color: '#ec4899' },
      { key: 'resume_team', name: 'Resume Prep', color: '#eab308' },
      { key: 'marketing_active', name: 'Marketing Active', color: '#14b8a6' },
      { key: 'interviewing', name: 'Interviewing', color: '#a855f7' },
      { key: 'sales', name: 'Sales Account', color: '#6366f1' },
      { key: 'completed', name: 'Completed/Offer', color: '#10b981' },
    ];

    return stagesToShow.map(s => {
      const count = filteredCRMLeads.filter(c => c.current_stage === s.key).length;
      return {
        name: s.name,
        Leads: count,
        fill: s.color
      };
    });
  }, [filteredCRMLeads]);

  const sourceChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredCRMLeads.forEach(c => {
      const src = c.lead_source?.trim() || 'Direct/Self';
      counts[src] = (counts[src] || 0) + 1;
    });

    const COLORS = ['#3f51b5', '#009688', '#e91e63', '#ff9800', '#9c27b0', '#03a9f4', '#8bc34a', '#e91e63'];
    return Object.entries(counts).map(([name, value], idx) => ({
      name,
      value,
      color: COLORS[idx % COLORS.length]
    })).sort((a, b) => b.value - a.value);
  }, [filteredCRMLeads]);

  const repLeaderboardData = useMemo(() => {
    const repsData: Record<string, { total: number, converted: number }> = {};
    
    filteredCRMLeads.forEach(c => {
      const leadGenId = c.lead_generated_by ? String(c.lead_generated_by) : null;
      const salesRepId = c.assigned_sales ? String(c.assigned_sales) : null;
      
      const idsToTrack = Array.from(new Set([leadGenId, salesRepId].filter(id => id !== null))) as string[];
      
      idsToTrack.forEach(agentId => {
        if (!repsData[agentId]) {
          repsData[agentId] = { total: 0, converted: 0 };
        }
        repsData[agentId].total += 1;
        if (['completed', 'offer', 'sales'].includes(c.current_stage)) {
          repsData[agentId].converted += 1;
        }
      });
    });

    return Object.entries(repsData).map(([agentId, data]) => {
      const repInfo = allUsers.find(u => String(u.id) === agentId);
      return {
        name: repInfo?.display_name || `Rep ID #${agentId}`,
        'Leads Handled': data.total,
        'Successful Sales': data.converted,
      };
    }).sort((a, b) => b['Successful Sales'] - a['Successful Sales'] || b['Leads Handled'] - a['Leads Handled']).slice(0, 5);
  }, [filteredCRMLeads, allUsers]);

  const financialTrajectoryData = useMemo(() => {
    const monthlyStats: Record<string, { revenue: number, pipelineValue: number }> = {};
    
    filteredCRMLeads.forEach(c => {
      if (!c.created_at) return;
      const date = new Date(c.created_at);
      const monthName = date.toLocaleString('default', { month: 'short', year: '2-digit' });
      
      if (!monthlyStats[monthName]) {
        monthlyStats[monthName] = { revenue: 0, pipelineValue: 0 };
      }

      const amt = Number(c.package_amount) || 0;
      if (['completed', 'offer', 'sales'].includes(c.current_stage)) {
        monthlyStats[monthName].revenue += amt;
      } else if (c.flags?.agreement_signed) {
        monthlyStats[monthName].revenue += amt * 0.70; // 70% weighted signed contract
      } else if (c.flags?.agreement_sent) {
        monthlyStats[monthName].pipelineValue += amt * 0.35; // 35% prospective proposal
      } else {
        monthlyStats[monthName].pipelineValue += amt * 0.10; // 10% cold lead value
      }
    });

    return Object.entries(monthlyStats).map(([month, data]) => ({
      month,
      'Realized Revenue ($)': Math.round(data.revenue),
      'Potential Pipeline ($)': Math.round(data.pipelineValue)
    }));
  }, [filteredCRMLeads]);

  useEffect(() => {
    const cached = localStorage.getItem('dashboard_thoughts');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setQuotesList(parsed);
        }
      } catch (e) {}
    }

    getDoc(doc(db, 'jpc_settings', 'dashboard_thoughts'))
      .then((snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data && Array.isArray(data.quotes) && data.quotes.length > 0) {
            setQuotesList(data.quotes);
            localStorage.setItem('dashboard_thoughts', JSON.stringify(data.quotes));
          }
        }
      })
      .catch((err) => {
        console.warn('Could not read thoughts from Firestore settings:', err);
      });
  }, []);

  useEffect(() => {
    if (quotesList.length > 0) {
      setMotivationalQuote(quotesList[Math.floor(Math.random() * quotesList.length)]);
    }
    
    const updateTime = () => {
      const timeFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
      setCurrentTime(timeFormatter.format(new Date()));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [quotesList]);

  useEffect(() => {
    if (!isAuthReady) return;

    const unsubCandidates = subscribeToCollection<Candidate>('jpc_candidates', (data) => {
      setCandidates(data);
      setIsLoading(false);
    });

    const unsubFollowUps = subscribeToCollection<FollowUp>('jpc_followups', (data) => {
      setFollowUps(data);
    });

    let unsubNotifications = () => {};
    if (user) {
      const q = query(
        collection(db, 'jpc_notifications'),
        where('recipient_id', '==', String(user.id))
      );
      unsubNotifications = subscribeToQuery<Notification>(q, setNotifications, 'jpc_notifications');
    }

    const unsubResumeRequests = subscribeToCollection<ResumeChangeRequest>('jpc_resume_requests', (data) => {
      setResumeRequests(data);
    });

    const unsubInterviews = subscribeToCollection<InterviewSupportRequest>('jpc_interview_requests', (data) => {
      setInterviews(data);
    });

    const unsubTargetRequests = subscribeToCollection<TargetReductionRequest>('jpc_target_reductions', (data) => {
      setTargetRequests(data);
    });

    const unsubApps = subscribeToCollection<Application>('jpc_applications', (data) => {
      setApplications(data);
    });

    const unsubUsers = subscribeToCollection<User>('jpc_users', (data) => {
      setAllUsers(data);
    });

    const unsubAnnouncements = subscribeToCollection<FeatureAnnouncement>('jpc_feature_announcements', (data) => {
      setFeatureAnnouncements(data.filter(a => a.is_active));
    });

    return () => {
      unsubCandidates();
      unsubFollowUps();
      unsubNotifications();
      unsubResumeRequests();
      unsubInterviews();
      unsubTargetRequests();
      unsubApps();
      unsubUsers();
      unsubAnnouncements();
    };
  }, [isAuthReady, user]);

  const activeCandidates = useMemo(() => {
    let filtered = candidates.filter(c => c.current_stage !== 'not_interested' && c.current_stage !== 'completed');
    if (user?.role === 'jpc_recruiter') {
      filtered = filtered.filter(c => String(c.assigned_recruiter) === String(user.id));
    } else if (user?.role === 'jpc_lead_gen') {
      filtered = filtered.filter(c => String(c.lead_generated_by) === String(user.id));
    } else if (user?.role === 'jpc_marketing') {
      filtered = filtered.filter(c => String(c.assigned_marketing_leader) === String(user.id) || String(c.assigned_recruiter) === String(user.id));
    }
    return filtered;
  }, [candidates, user]);

  const completedCount = useMemo(() => {
    let filtered = candidates.filter(c => c.current_stage === 'completed');
    if (user?.role === 'jpc_recruiter') {
      filtered = filtered.filter(c => String(c.assigned_recruiter) === String(user.id));
    } else if (user?.role === 'jpc_lead_gen') {
      filtered = filtered.filter(c => String(c.lead_generated_by) === String(user.id));
    } else if (user?.role === 'jpc_marketing') {
      filtered = filtered.filter(c => String(c.assigned_marketing_leader) === String(user.id) || String(c.assigned_recruiter) === String(user.id));
    }
    return filtered.length;
  }, [candidates, user]);

  const notInterestedCount = useMemo(() => {
    let filtered = candidates.filter(c => c.current_stage === 'not_interested');
    if (user?.role === 'jpc_recruiter') {
      filtered = filtered.filter(c => String(c.assigned_recruiter) === String(user.id));
    } else if (user?.role === 'jpc_lead_gen') {
      filtered = filtered.filter(c => String(c.lead_generated_by) === String(user.id));
    } else if (user?.role === 'jpc_marketing') {
      filtered = filtered.filter(c => String(c.assigned_marketing_leader) === String(user.id) || String(c.assigned_recruiter) === String(user.id));
    }
    return filtered.length;
  }, [candidates, user]);
  
  const today = new Date().toISOString().split('T')[0];
  const personalFollowUps = useMemo(() => {
    return user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager' 
      ? followUps 
      : followUps.filter(f => f.created_by === user?.id);
  }, [followUps, user]);

  const dueTodayCount = useMemo(() => personalFollowUps.filter(f => !f.done && f.followup_date <= today).length, [personalFollowUps, today]);

  const pendingResumeRequests = useMemo(() => {
    if (user?.role === 'jpc_marketing') return resumeRequests.filter(r => r.status === 'pending_tl');
    if (user?.role === 'jpc_cs' || user?.role === 'jpc_compliance_person') return resumeRequests.filter(r => r.status === 'pending_cs');
    if (user?.role === 'jpc_resume') return resumeRequests.filter(r => r.status === 'pending_resume_team');
    return [];
  }, [resumeRequests, user]);

  const activeInterviews = useMemo(() => {
    const activeStatuses = [
      'pending_request', 
      'booking_link_generated', 
      'candidate_slot_selected', 
      'proxy_assigned', 
      'confirmed', 
      'live', 
      'rescheduled',
      'next_round'
    ];
    
    if (isProxyUser(user)) {
      return interviews.filter(i => activeStatuses.includes(i.overall_status));
    }
    
    if (user?.role === 'jpc_cs' || user?.role === 'jpc_compliance_person' || user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager' || user?.role === 'jpc_recruiter') {
      let filtered = interviews.filter(i => activeStatuses.includes(i.overall_status));
      
      if (user?.role === 'jpc_recruiter') {
        filtered = filtered.filter(i => i.recruiter_id === user.id);
      } else if (user?.role === 'jpc_cs' || user?.role === 'jpc_compliance_person') {
        filtered = filtered.filter(i => i.cs_id === user.id || !i.cs_id);
      }
      
      return filtered;
    }
    
    return [];
  }, [interviews, user]);

  const pendingTargetRequests = useMemo(() => {
    if (user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager' || user?.role === 'jpc_cs' || user?.role === 'jpc_compliance_person') {
      return targetRequests.filter(r => r.status === 'pending');
    }
    
    if (user?.role === 'jpc_marketing') {
      // Marketing TLs see all requests based on 'TL just get notifications of all'
      return targetRequests.filter(r => r.status === 'pending');
    }
    
    return [];
  }, [targetRequests, user, candidates]);

  const appStats = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    let filteredApps = applications;
    if (user?.role === 'jpc_recruiter') {
      // Recruiters only see apps for their assigned candidates
      const myCandidateIds = candidates
        .filter(c => String(c.assigned_recruiter) === String(user.id))
        .map(c => c.id);
      filteredApps = applications.filter(a => myCandidateIds.includes(a.candidate_id));
    } else if (user?.role === 'jpc_marketing') {
      // Marketing TLs only see apps for candidates in their cluster or assigned to them as recruiter
      const myCandidateIds = candidates
        .filter(c => String(c.assigned_marketing_leader) === String(user.id) || String(c.assigned_recruiter) === String(user.id))
        .map(c => c.id);
      filteredApps = applications.filter(a => myCandidateIds.includes(a.candidate_id));
    }
    
    const dayApps = filteredApps.filter(a => a.applied_at === todayStr);
    const weekApps = filteredApps.filter(a => new Date(a.applied_at) >= startOfWeek);
    const monthApps = filteredApps.filter(a => new Date(a.applied_at) >= startOfMonth);
    
    return {
      day: dayApps.length,
      week: weekApps.length,
      month: monthApps.length,
      lifetime: filteredApps.length
    };
  }, [applications, user, candidates]);

  const activeAnnouncements = useMemo(() => {
    if (!user) return [];
    return featureAnnouncements.filter(a => {
      if (dismissedAnnouncements.includes(a.id)) return false;
      return a.target_teams === 'ALL' || (Array.isArray(a.target_teams) && a.target_teams.includes(user.role));
    });
  }, [featureAnnouncements, user, dismissedAnnouncements]);

  const handleDismissAnnouncement = (id: string) => {
    const newDismissed = [...dismissedAnnouncements, id];
    setDismissedAnnouncements(newDismissed);
    localStorage.setItem('dismissed_announcements', JSON.stringify(newDismissed));
  };

  const stats = [
    { label: 'Active Candidates', value: activeCandidates.length, icon: Users, color: 'text-accent-blue', bg: 'bg-accent-blue/10' },
    { label: 'Completed', value: completedCount, icon: CheckCircle2, color: 'text-accent-green', bg: 'bg-accent-green/10' },
    { label: 'Follow-Ups Due', value: dueTodayCount, icon: Clock, color: 'text-accent-amber', bg: 'bg-accent-amber/10' },
    { label: 'Not Interested', value: notInterestedCount, icon: UserX, color: 'text-accent-red', bg: 'bg-accent-red/10' },
  ];

  const targetAlerts = useMemo(() => {
    if (user?.role !== 'administrator' && user?.role !== 'jpc_sysadmin' && user?.role !== 'jpc_manager' && user?.role !== 'jpc_cs' && user?.role !== 'jpc_compliance_person') return [];
    
    const todayStr = getEasternDate();
    const alerts: { candidate: Candidate, count: number, target: number }[] = [];
    
    // Only check candidates in marketing/interview stages
    const marketingCandidates = candidates.filter(c => {
      const isMarketingStage = ['marketing_active', 'interviewing'].includes(c.current_stage);
      if (user?.role === 'jpc_cs' || user?.role === 'jpc_compliance_person') {
        return isMarketingStage && String(c.assigned_cs) === String(user.id);
      }
      return isMarketingStage;
    });

    marketingCandidates.forEach(c => {
      const dayApps = applications.filter(a => a.candidate_id === c.id && a.applied_at === todayStr).length;
      const target = (c.profiles_count || 1) * (c.custom_daily_target || 40);
      if (dayApps < target) {
        if (isEasternDayOngoing(todayStr)) {
          return; // Skip alerts during active shift hours (until 6:15 PM ET)
        }
        alerts.push({ candidate: c, count: dayApps, target });
      }
    });

    return alerts.sort((a, b) => a.count - b.count);
  }, [candidates, applications, user]);

  const recentCandidates = useMemo(() => {
    let filtered = [...candidates];
    if (user?.role === 'jpc_recruiter') {
      filtered = filtered.filter(c => String(c.assigned_recruiter) === String(user.id));
    } else if (user?.role === 'jpc_lead_gen') {
      filtered = filtered.filter(c => String(c.lead_generated_by) === String(user.id));
    }
    return filtered.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 5);
  }, [candidates, user]);

  const handleExportLeadsAndSales = () => {
    setIsExporting(true);
    try {
      if (candidates.length === 0) {
        showToast('No leads or sales data found to export', 'error');
        setIsExporting(false);
        return;
      }

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

      // Map all Candidates (complete records, including all statuses)
      const dataRows = candidates.map(c => {
        const candidateFollowUps = followUps.filter(f => f.candidate_id === c.id);
        const hasActiveFollowUp = candidateFollowUps.some(f => !f.done);
        
        // Mapped Lead Status matching user requirement: Interested, Not Interested, Follow-up, Converted/Sales, Pending
        let leadStatus = 'Pending';
        if (c.current_stage === 'not_interested') {
          leadStatus = 'Not Interested';
        } else if (c.current_stage === 'not_eligible') {
          leadStatus = 'Not Eligible';
        } else if (c.current_stage === 'completed' || c.current_stage === 'offer') {
          leadStatus = 'Converted/Sales';
        } else if (c.current_stage === 'sales') {
          leadStatus = 'Converted/Sales';
        } else if (hasActiveFollowUp) {
          leadStatus = 'Follow-up';
        } else if (c.current_stage === 'lead_generation') {
          if (c.flags?.agreement_signed) {
            leadStatus = 'Interested';
          } else if (c.flags?.agreement_sent) {
            leadStatus = 'Pending';
          } else {
            leadStatus = 'Interested';
          }
        } else {
          leadStatus = 'Converted/Sales';
        }

        const leadGenUser = allUsers.find(u => String(u.id) === String(c.lead_generated_by));
        const salesUser = allUsers.find(u => String(u.id) === String(c.assigned_sales));
        const csUser = allUsers.find(u => String(u.id) === String(c.assigned_cs));
        const recruiterUser = allUsers.find(u => String(u.id) === String(c.assigned_recruiter));
        const marketingUser = allUsers.find(u => String(u.id) === String(c.assigned_marketing_leader));
        
        const totalApps = applications.filter(a => a.candidate_id === c.id).length;

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
          'Assigned CS Rep': csUser?.display_name || 'Unassigned',
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

      // Generate sheets
      const wsData = XLSX.utils.json_to_sheet(dataRows);
      
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsData, 'All Lead & Sales Data');

      // Autofit columns on data sheet
      const maxColWidths = dataRows.reduce((acc: any, row: any) => {
        Object.keys(row).forEach((key, colIndex) => {
          const val = String(row[key] || '');
          acc[colIndex] = Math.max(acc[colIndex] || 10, val.length + 3, key.length + 3);
        });
        return acc;
      }, []);
      wsData['!cols'] = maxColWidths.map((w: number) => ({ wch: w }));

      // Save Excel workbook file
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
      <div className="h-full flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Feature Blast Alerts */}
      <AnimatePresence>
        {activeAnnouncements.length > 0 && (
          <div className="space-y-4">
            {activeAnnouncements.map((announcement) => (
              <motion.div
                key={announcement.id}
                initial={{ opacity: 0, height: 0, scale: 0.95 }}
                animate={{ opacity: 1, height: 'auto', scale: 1 }}
                exit={{ opacity: 0, height: 0, scale: 0.95 }}
                className="bg-accent-blue/10 border border-accent-blue/20 rounded-[32px] p-8 relative overflow-hidden group shadow-xl shadow-accent-blue/5"
              >
                <div className="absolute -right-20 -top-20 w-64 h-64 bg-accent-blue/10 rounded-full blur-[80px]" />
                
                <div className="flex flex-col md:flex-row items-start md:items-center gap-8 relative z-10">
                  <div className="w-16 h-16 bg-accent-blue rounded-3xl flex items-center justify-center text-white shadow-xl shadow-accent-blue/30 shrink-0">
                    <Zap className="w-8 h-8" />
                  </div>
                  
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                      <span className="px-3 py-1 bg-accent-blue text-white text-[10px] font-black uppercase tracking-widest rounded-full">New Feature Blast</span>
                      <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">Released {new Date(announcement.created_at).toLocaleDateString()}</span>
                    </div>
                    <h2 className="text-2xl font-black text-text-primary tracking-tight">{announcement.title}</h2>
                    <p className="text-sm font-medium text-text-secondary leading-relaxed max-w-3xl">{announcement.summary}</p>
                    
                    <div className="flex flex-wrap gap-4 mt-6">
                      {announcement.image_url && (
                        <a 
                          href={announcement.image_url} 
                          target="_blank" 
                          rel="noreferrer"
                          className="flex items-center gap-2 px-4 py-2 bg-white/10 dark:bg-bg-tertiary border border-border-primary rounded-xl text-[10px] font-black text-text-primary hover:bg-white hover:text-accent-blue transition-all uppercase tracking-widest shadow-sm"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          View Image
                        </a>
                      )}
                      {announcement.pdf_url && (
                        <a 
                          href={announcement.pdf_url} 
                          target="_blank" 
                          rel="noreferrer"
                          className="flex items-center gap-2 px-4 py-2 bg-white/10 dark:bg-bg-tertiary border border-border-primary rounded-xl text-[10px] font-black text-text-primary hover:bg-white hover:text-accent-red transition-all uppercase tracking-widest shadow-sm"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Documentation
                        </a>
                      )}
                      <a 
                        href="#feature-alerts"
                        className="flex items-center gap-2 px-4 py-2 bg-accent-blue text-white rounded-xl text-[10px] font-black hover:bg-accent-blue/90 transition-all uppercase tracking-widest shadow-lg shadow-accent-blue/20"
                      >
                        All Announcements
                        <ArrowRight className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>

                  <button 
                    onClick={() => handleDismissAnnouncement(announcement.id)}
                    className="absolute top-0 right-0 p-2 text-text-muted hover:text-accent-red transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-text-primary tracking-tight">Welcome back, {user?.display_name}!</h1>
          <div className="flex items-center gap-2 mt-1 group">
            <p className="text-text-secondary italic">"{motivationalQuote}"</p>
            <button
              onClick={() => setIsThoughtsModalOpen(true)}
              className="p-1 rounded-md text-text-muted hover:text-accent-blue hover:bg-bg-secondary/40 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
              title="Customize dashboard thoughts"
            >
              <FileEdit className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-bg-secondary border border-border-primary rounded-xl flex items-center gap-2">
            <span className="w-2 h-2 bg-accent-green rounded-full animate-pulse" />
            <span className="text-sm font-bold text-text-primary uppercase tracking-wider">System Live</span>
          </div>
        </div>
      </div>

      <TimeZoneClocks />

      {/* Confetti & Superstars Celebration Hall of Fame */}
      <CelebrationBanner candidates={candidates} allUsers={allUsers} />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: i * 0.1 }}
            className="bg-bg-secondary p-6 rounded-3xl border border-border-primary shadow-sm hover:shadow-md transition-all group"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110", stat.bg, stat.color)}>
                <stat.icon className="w-6 h-6" />
              </div>
              <ArrowUpRight className="w-5 h-5 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className="text-sm font-bold text-text-muted uppercase tracking-widest">{stat.label}</p>
            <h3 className="text-3xl font-bold text-text-primary mt-1">{stat.value}</h3>
          </motion.div>
        ))}
      </div>

      {/* Application Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-bg-secondary border border-border-primary rounded-[32px] p-8 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold text-text-primary tracking-tight">Application Performance</h2>
              <p className="text-text-secondary mt-1">Real-time tracking of job applications across the team.</p>
            </div>
            <div className="w-12 h-12 bg-accent-blue/10 rounded-2xl flex items-center justify-center text-accent-blue">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-1">
              <p className="text-xs font-bold text-text-muted uppercase tracking-widest">Today</p>
              <p className="text-4xl font-bold text-text-primary">{appStats.day}</p>
              <div className="h-1 w-12 bg-accent-blue rounded-full mt-2" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-bold text-text-muted uppercase tracking-widest">This Week</p>
              <p className="text-4xl font-bold text-text-primary">{appStats.week}</p>
              <div className="h-1 w-12 bg-accent-purple rounded-full mt-2" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-bold text-text-muted uppercase tracking-widest">This Month</p>
              <p className="text-4xl font-bold text-text-primary">{appStats.month}</p>
              <div className="h-1 w-12 bg-accent-teal rounded-full mt-2" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-bold text-text-muted uppercase tracking-widest">Lifetime</p>
              <p className="text-4xl font-bold text-text-primary">{appStats.lifetime}</p>
              <div className="h-1 w-12 bg-accent-green rounded-full mt-2" />
            </div>
          </div>
        </div>

        {targetAlerts.length > 0 && (
          <div className="bg-bg-secondary border border-border-primary rounded-[32px] p-8 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-bold text-text-primary tracking-tight">Target Not Met</h2>
                <p className="text-text-secondary mt-1">Candidates below daily application target.</p>
              </div>
              <div className="w-12 h-12 bg-accent-red/10 rounded-2xl flex items-center justify-center text-accent-red">
                <AlertCircle className="w-6 h-6" />
              </div>
            </div>
            
            <div className="space-y-4 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
              {targetAlerts.map(({ candidate, count, target }) => (
                <button 
                  key={candidate.id} 
                  onClick={() => {
                    setSelectedCandidate(candidate);
                    setIsSheetOpen(true);
                  }}
                  className="w-full flex items-center justify-between p-3 bg-bg-tertiary/50 rounded-2xl border border-border-primary hover:border-accent-blue transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-bg-secondary flex items-center justify-center text-[10px] font-bold text-text-secondary group-hover:bg-accent-blue/10 group-hover:text-accent-blue transition-colors">
                      {candidate.full_name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div className="text-left">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-bold text-text-primary group-hover:text-accent-blue transition-colors">{candidate.full_name}</p>
                        {candidate.is_free_trial && (
                          <FreeTrialBadge 
                            size="sm" 
                            startDate={candidate.free_trial_start_date} 
                            endDate={candidate.free_trial_end_date} 
                          />
                        )}
                      </div>
                      <p className="text-[10px] text-text-muted uppercase font-bold">{STAGES[candidate.current_stage].label}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn("text-sm font-bold", count === 0 ? "text-accent-red" : "text-accent-amber")}>
                      {count} / {target}
                    </p>
                    <div className="w-20 h-1 bg-bg-tertiary rounded-full mt-1 overflow-hidden">
                      <div 
                        className={cn("h-full", count === 0 ? "bg-accent-red" : "bg-accent-amber")} 
                        style={{ width: `${(count / target) * 100}%` }} 
                      />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Pipeline Overview */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-accent-blue" />
            Pipeline Overview
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Object.entries(STAGES).filter(([key]) => key !== 'not_interested').map(([key, stage], i) => {
              const count = candidates.filter(c => {
                const matchesStage = c.current_stage === key;
                if (!matchesStage) return false;
                
                if (user?.role === 'jpc_recruiter') {
                  return String(c.assigned_recruiter) === String(user.id);
                } else if (user?.role === 'jpc_lead_gen') {
                  return String(c.lead_generated_by) === String(user.id);
                } else if (user?.role === 'jpc_marketing') {
                  return String(c.assigned_marketing_leader) === String(user.id) || String(c.assigned_recruiter) === String(user.id);
                }
                return true;
              }).length;
              return (
                <motion.a
                  key={key}
                  href={`#pipeline?stage=${key}`}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-bg-secondary p-5 rounded-2xl border border-border-primary flex items-center justify-between hover:border-accent-blue transition-all group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-bg-tertiary flex items-center justify-center text-xl">
                      {stage.icon}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-text-primary">{stage.label}</p>
                      <p className="text-xs text-text-muted">{count} candidates</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-text-muted group-hover:text-accent-blue transition-colors" />
                </motion.a>
              );
            })}
          </div>
        </div>

        {/* Recent Activity / Follow-ups */}
        <div className="space-y-6">
          {notifications.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-accent-red" />
                Team Alerts
              </h2>
              <div className="space-y-3">
                {notifications.filter(n => !n.read).map(n => (
                  <div key={n.id} className="p-4 bg-accent-red/5 border border-accent-red/20 rounded-2xl relative group flex justify-between items-start">
                    <div>
                      <p className="text-xs text-text-primary pr-6">{n.message}</p>
                      <p className="text-[10px] text-text-muted mt-2 font-bold uppercase">
                        {new Date(n.created_at).toLocaleString()}
                      </p>
                    </div>
                    <button 
                      onClick={() => markNotificationAsRead(n.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-accent-red/10 rounded transition-opacity"
                      title="Mark as read"
                    >
                      <Check className="w-4 h-4 text-accent-red" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeInterviews.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                <Video className="w-5 h-5 text-accent-red" />
                Active Interviews
              </h2>
              <div className="bg-bg-secondary rounded-3xl border border-border-primary overflow-hidden shadow-sm">
                <div className="divide-y divide-border-primary">
                  {activeInterviews.slice(0, 3).map(int => {
                    const candidate = candidates.find(c => c.id === int.candidate_id);
                    return (
                      <a 
                        key={int.id} 
                        href="#interviews"
                        className="p-4 flex items-center gap-4 hover:bg-bg-tertiary transition-colors group"
                      >
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center",
                          int.overall_status === 'live' ? "bg-accent-red/10 text-accent-red animate-pulse" : "bg-accent-blue/10 text-accent-blue"
                        )}>
                          <Video className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-text-primary truncate">{candidate?.full_name || 'Candidate'}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-text-muted">{candidate?.id}</span>
                            <span className="text-[10px] text-text-muted">•</span>
                            <p className="text-[10px] text-text-muted truncate capitalize">{int.overall_status.replace('_', ' ')}</p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-text-muted" />
                      </a>
                    );
                  })}
                </div>
                <div className="p-3 bg-bg-tertiary/50 border-t border-border-primary">
                  <a href="#interviews" className="text-[10px] font-bold text-accent-blue hover:underline flex items-center justify-center gap-1 uppercase tracking-wider">
                    View All Interviews <ArrowRight className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          )}

          <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <Clock className="w-5 h-5 text-accent-amber" />
            Recent Updates
          </h2>
          
          {pendingTargetRequests.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-accent-blue" />
                Target Approvals
              </h2>
              <div className="bg-bg-secondary rounded-3xl border border-border-primary overflow-hidden shadow-sm">
                <div className="divide-y divide-border-primary">
                  {pendingTargetRequests.map(req => {
                    const candidate = candidates.find(c => c.id === req.candidate_id);
                    return (
                      <div key={req.id} className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-bg-tertiary flex items-center justify-center font-bold text-[10px]">
                              {candidate?.full_name.split(' ').map(n => n[0]).join('')}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-text-primary">{candidate?.full_name}</p>
                              <p className="text-[10px] text-text-muted">Requested Target: {req.requested_target}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {(user?.role === 'jpc_cs' || user?.role === 'jpc_compliance_person' || user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager') && (
                              <>
                                <button 
                                  onClick={async () => {
                                    try {
                                      const { updateTargetReductionRequest, saveCandidate, addNotification, logActivity } = await import('../services/storage');
                                      await updateTargetReductionRequest(req.id, { 
                                        status: 'approved', 
                                        cs_id: String(user?.id),
                                        updated_at: new Date().toISOString()
                                      });
                                      if (candidate) {
                                        await saveCandidate({
                                          ...candidate,
                                          custom_daily_target: Number(req.requested_target)
                                        }, user?.id ? String(user.id) : null);
                                        await addNotification({
                                          recipient_id: req.recruiter_id,
                                          sender_id: user?.id || null,
                                          type: 'system_alert',
                                          message: `Target reduction approved for ${candidate.full_name}`
                                        });
                                        await logActivity(candidate.id, 'Target reduction approved', `New target: ${req.requested_target} / profile`, user?.id || null);
                                        showToast(`Target reduction approved for ${candidate.full_name}`, 'success');
                                      }
                                    } catch (e) {
                                      console.error(e);
                                      showToast('Failed to approve request', 'error');
                                    }
                                  }}
                                  className="w-8 h-8 bg-accent-green/10 text-accent-green rounded-lg flex items-center justify-center hover:bg-accent-green hover:text-white transition-all"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={async () => {
                                    try {
                                      const { updateTargetReductionRequest, addNotification } = await import('../services/storage');
                                      const notes = window.prompt('Reason for rejection?');
                                      await updateTargetReductionRequest(req.id, { 
                                        status: 'rejected', 
                                        cs_id: String(user?.id),
                                        cs_notes: notes || '',
                                        updated_at: new Date().toISOString()
                                      });
                                      if (candidate) {
                                        await addNotification({
                                          recipient_id: req.recruiter_id,
                                          sender_id: user?.id || null,
                                          type: 'system_alert',
                                          message: `Target reduction rejected for ${candidate.full_name}`
                                        });
                                        const { logActivity } = await import('../services/storage');
                                        await logActivity(candidate.id, 'Target reduction rejected', `Reason: ${notes || 'No reason provided'}`, user?.id || null);
                                        showToast(`Target reduction rejected for ${candidate.full_name}`, 'success');
                                      }
                                    } catch (e) {
                                      console.error(e);
                                      showToast('Failed to reject request', 'error');
                                    }
                                  }}
                                  className="w-8 h-8 bg-accent-red/10 text-accent-red rounded-lg flex items-center justify-center hover:bg-accent-red hover:text-white transition-all"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        <p className="text-[10px] text-text-secondary italic bg-bg-tertiary p-2 rounded-lg leading-relaxed">
                          "{req.reason}"
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {pendingResumeRequests.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                <FileEdit className="w-5 h-5 text-accent-blue" />
                Resume Requests
              </h2>
              <div className="bg-bg-secondary rounded-3xl border border-border-primary overflow-hidden shadow-sm">
                <div className="divide-y divide-border-primary">
                  {pendingResumeRequests.slice(0, 3).map(req => (
                    <a 
                      key={req.id} 
                      href="#resume-log"
                      className="p-4 flex items-center gap-4 hover:bg-bg-tertiary transition-colors group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-accent-blue/10 flex items-center justify-center text-accent-blue">
                        <FileEdit className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-text-primary truncate">Resume Change Needed</p>
                        <p className="text-xs text-text-muted truncate">{req.details}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-text-muted" />
                    </a>
                  ))}
                </div>
                <div className="p-3 bg-bg-tertiary/50 border-t border-border-primary">
                  <a href="#resume-log" className="text-[10px] font-bold text-accent-blue hover:underline flex items-center justify-center gap-1 uppercase tracking-wider">
                    View All Requests <ArrowRight className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          )}

          <div className="bg-bg-secondary rounded-3xl border border-border-primary overflow-hidden shadow-sm">
            <div className="divide-y divide-border-primary">
              {recentCandidates.length > 0 ? recentCandidates.map(candidate => (
                <button 
                  key={candidate.id} 
                  onClick={() => {
                    setSelectedCandidate(candidate);
                    setIsSheetOpen(true);
                  }}
                  className="w-full text-left p-4 flex items-center gap-4 hover:bg-bg-tertiary transition-colors group"
                >
                  <div className="w-10 h-10 rounded-full bg-bg-tertiary flex items-center justify-center text-text-secondary font-bold text-xs group-hover:bg-accent-blue/10 group-hover:text-accent-blue transition-colors">
                    {candidate.full_name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-text-primary group-hover:text-accent-blue transition-colors truncate">{candidate.full_name}</p>
                      {candidate.is_free_trial && (
                        <FreeTrialBadge 
                          size="sm" 
                          startDate={candidate.free_trial_start_date} 
                          endDate={candidate.free_trial_end_date} 
                        />
                      )}
                      <span className="text-[10px] font-mono text-text-muted">{candidate.id}</span>
                    </div>
                    <p className="text-xs text-text-muted truncate">
                      Moved to <span className="text-accent-blue font-medium">{STAGES[candidate.current_stage].label}</span>
                    </p>
                  </div>
                  <p className="text-[10px] text-text-muted font-bold uppercase">
                    {new Date(candidate.updated_at).toLocaleDateString()}
                  </p>
                </button>
              )) : (
                <div className="p-8 text-center">
                  <AlertCircle className="w-8 h-8 text-text-muted mx-auto mb-2" />
                  <p className="text-sm text-text-muted">No recent activity</p>
                </div>
              )}
            </div>
            <div className="p-4 bg-bg-tertiary/50 border-t border-border-primary">
              <a href="#candidates" className="text-xs font-bold text-accent-blue hover:underline flex items-center justify-center gap-2">
                View All Candidates <ArrowRight className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Admin Only: System Diagnosis Options */}
      {(user?.role === 'jpc_sysadmin' || user?.role === 'administrator') && (
        <div className="bg-[#0f172a] border border-blue-900/50 rounded-3xl p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 blur-[100px] rounded-full pointer-events-none" />
          <div className="flex items-center gap-3 mb-6 relative z-10">
            <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">System Diagnosis</h2>
              <p className="text-sm text-slate-400">Firebase Configuration & Database Status</p>
            </div>
            <div className="ml-auto px-3 py-1 bg-accent-green/20 text-accent-green text-[10px] font-bold rounded-full border border-accent-green/30 tracking-widest uppercase">
              Authenticated: {user?.display_name}
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 relative z-10">
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 font-mono text-xs overflow-x-auto">
              <p className="text-slate-500 mb-2">// Current Firebase Configuration</p>
              <pre className="text-slate-300">
                <span className="text-blue-400">const</span> <span className="text-blue-300">firebaseConfig</span> <span className="text-blue-400">=</span> {'{\n'}
                <span className="text-teal-300">  projectId:</span> <span className="text-amber-300">"{firebaseConfig.projectId}"</span>,{'\n'}
                <span className="text-teal-300">  appId:</span> <span className="text-amber-300">"{firebaseConfig.appId}"</span>,{'\n'}
                <span className="text-teal-300">  apiKey:</span> <span className="text-amber-300">"{firebaseConfig.apiKey}"</span>,{'\n'}
                <span className="text-teal-300">  authDomain:</span> <span className="text-amber-300">"{firebaseConfig.authDomain}"</span>,{'\n'}
                <span className="text-teal-300">  firestoreDatabaseId:</span> <span className="text-amber-300">"{(firebaseConfig as any).firestoreDatabaseId}"</span>,{'\n'}
                <span className="text-teal-300">  storageBucket:</span> <span className="text-amber-300">"{firebaseConfig.storageBucket}"</span>,{'\n'}
                <span className="text-teal-300">  messagingSenderId:</span> <span className="text-amber-300">"{firebaseConfig.messagingSenderId}"</span>{'\n'}
                {'}'};
              </pre>
            </div>
            
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 space-y-4">
              <h4 className="text-white font-bold text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-400" />
                Database Migration Status
              </h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>Source DB:</span>
                  <span className="font-mono text-slate-300">ai-studio-f34...</span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>Dest DB (Prod):</span>
                  <span className="font-mono text-accent-green">production-placify</span>
                </div>
                <div className="w-full h-1 bg-slate-800 rounded-full mt-2 overflow-hidden">
                  <div className="w-full h-full bg-accent-green animate-pulse shadow-[0_0_8px_rgba(0,173,140,0.5)]" />
                </div>
              </div>
              
              <div className="pt-4 border-t border-slate-800">
                <p className="text-[10px] text-slate-400 leading-relaxed italic">
                  Note: All data (Candidates, Users, QC, Notifications) has been successfully ported to the 'production-placify' instance. 
                  Admin rules have been deployed to ensure your account maintains full control.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <CandidateSheet 
        candidate={selectedCandidate}
        isOpen={isSheetOpen}
        onClose={() => {
          setIsSheetOpen(false);
          setSelectedCandidate(null);
        }}
      />

      <ThoughtsConfigModal 
        isOpen={isThoughtsModalOpen}
        onClose={() => setIsThoughtsModalOpen(false)}
        onSaved={(newQuotes) => {
          setQuotesList(newQuotes);
        }}
      />
    </div>
  );
};
