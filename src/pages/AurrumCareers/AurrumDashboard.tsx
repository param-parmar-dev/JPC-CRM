import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  TrendingUp,
  Video,
  DollarSign,
  Clock,
  CheckCircle2,
  Plus,
  ArrowRight,
  Phone,
  Mail,
  Calendar,
  Briefcase,
  Sparkles,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useAuth } from '../../contexts/AuthContext';
import {
  subscribeToAurrumCandidates,
  subscribeToAurrumFollowUps,
  subscribeToCollection,
  updateFollowUp,
} from '../../services/storage';
import {
  Candidate,
  FollowUp,
  User,
  InterviewSupportRequest,
  InterviewRound,
} from '../../types';
import { AurrumFlowHeader } from './AurrumFlowHeader';
import {
  AurrumCandidateModal,
  AURRUM_STAGES,
  resolveAurrumStage,
} from './AurrumCandidateModal';
import { cn } from '../../lib/utils';

const CHART_COLORS = ['#00AD8C', '#3B82F6', '#F59E0B', '#8B5CF6', '#10B981', '#F43F5E'];

export const AurrumDashboard: React.FC = () => {
  const { isAuthReady } = useAuth();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [interviewRequests, setInterviewRequests] = useState<InterviewSupportRequest[]>([]);
  const [interviewRounds, setInterviewRounds] = useState<InterviewRound[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);

  useEffect(() => {
    if (!isAuthReady) return;

    const unsubCandidates = subscribeToAurrumCandidates(data => {
      setCandidates(data);
      setIsLoading(false);
    });
    const unsubFollowUps = subscribeToAurrumFollowUps(setFollowUps);
    const unsubUsers = subscribeToCollection<User>('jpc_users', setAllUsers);
    const unsubReqs = subscribeToCollection<InterviewSupportRequest>(
      'jpc_interview_requests',
      setInterviewRequests
    );
    const unsubRounds = subscribeToCollection<InterviewRound>(
      'jpc_interview_rounds',
      setInterviewRounds
    );

    return () => {
      unsubCandidates();
      unsubFollowUps();
      unsubUsers();
      unsubReqs();
      unsubRounds();
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

  const metrics = useMemo(() => {
    const totalCandidates = candidates.length;
    const inLead = candidates.filter(c => resolveAurrumStage(c) === 'lead').length;
    const inSales = candidates.filter(c => resolveAurrumStage(c) === 'sales').length;
    const converted = candidates.filter(
      c =>
        resolveAurrumStage(c) === 'converted' ||
        resolveAurrumStage(c) === 'interview_support' ||
        c.aurrum_sales_status === 'Converted'
    ).length;
    const totalPackageValue = candidates.reduce(
      (sum, c) => sum + (Number(c.package_amount) || 0),
      0
    );
    const convertedRevenue = candidates
      .filter(
        c =>
          resolveAurrumStage(c) === 'converted' ||
          resolveAurrumStage(c) === 'interview_support' ||
          c.aurrum_sales_status === 'Converted'
      )
      .reduce((sum, c) => sum + (Number(c.package_amount) || 0), 0);

    const pendingFollowUps = followUps.filter(f => !f.done).length;
    const todayStr = new Date().toISOString().split('T')[0];
    const todayInterviews = interviewRounds.filter(
      r =>
        r.status !== 'cancelled' &&
        (r.booked_slot_time || r.interview_date || '').startsWith(todayStr)
    ).length;
    const activeInterviewBookings = interviewRequests.filter(
      r => r.overall_status === 'confirmed' || r.overall_status === 'live'
    ).length;

    return {
      totalCandidates,
      inLead,
      inSales,
      converted,
      totalPackageValue,
      convertedRevenue,
      pendingFollowUps,
      todayInterviews,
      activeInterviewBookings,
    };
  }, [candidates, followUps, interviewRounds, interviewRequests]);

  const stageDistribution = useMemo(() => {
    return AURRUM_STAGES.map(stage => ({
      name: stage.label.replace(/^\d+\.\s*/, ''),
      count: candidates.filter(c => resolveAurrumStage(c) === stage.value).length,
      color: stage.color,
    }));
  }, [candidates]);

  const sourceDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    candidates.forEach(c => {
      const src = c.lead_source || 'Other';
      counts[src] = (counts[src] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [candidates]);

  const recentCandidates = useMemo(() => {
    return [...candidates]
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .slice(0, 6);
  }, [candidates]);

  const pendingFollowUpItems = useMemo(() => {
    return followUps
      .filter(f => !f.done)
      .sort((a, b) => (a.followup_date || '').localeCompare(b.followup_date || ''))
      .slice(0, 6);
  }, [followUps]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center p-20">
        <div className="w-12 h-12 border-4 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-16">
      <AurrumFlowHeader
        activeStep="dashboard"
        title="Aurrum Careers Dashboard"
        subtitle="Dedicated analytics, candidate counts, sales conversion, and Interview Support overview for Aurrum Careers."
        actions={
          <>
            <button
              onClick={() => {
                setEditingCandidate(null);
                setIsAddModalOpen(true);
              }}
              className="flex items-center gap-2 px-5 py-2.5 bg-accent-blue text-white font-bold rounded-xl hover:bg-accent-blue/90 transition-all shadow-lg shadow-accent-blue/20 text-xs sm:text-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Aurrum Candidate</span>
            </button>
          </>
        }
      />

      {/* KPI Metrics Grid (Strictly Aurrum Only) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <a
          href="#aurrum-candidates"
          className="bg-bg-secondary border border-border-primary rounded-2xl p-5 hover:border-accent-blue/40 transition-all group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-accent-blue/10 text-accent-blue flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-accent-blue group-hover:translate-x-0.5 transition-all" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-text-primary">
            {metrics.totalCandidates}
          </p>
          <p className="text-[11px] font-bold text-text-muted uppercase tracking-wider mt-1">
            Aurrum Candidates
          </p>
        </a>

        <a
          href="#aurrum-sales"
          className="bg-bg-secondary border border-border-primary rounded-2xl p-5 hover:border-amber-500/40 transition-all group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
            <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-amber-500 group-hover:translate-x-0.5 transition-all" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-text-primary">
            {metrics.inLead + metrics.inSales}
          </p>
          <p className="text-[11px] font-bold text-text-muted uppercase tracking-wider mt-1">
            Active in Aurrum Sales
          </p>
        </a>

        <a
          href="#aurrum-sales"
          className="bg-bg-secondary border border-border-primary rounded-2xl p-5 hover:border-emerald-500/40 transition-all group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-text-primary">{metrics.converted}</p>
          <p className="text-[11px] font-bold text-text-muted uppercase tracking-wider mt-1">
            Converted to Support
          </p>
        </a>

        <div className="bg-bg-secondary border border-border-primary rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
              Closed: ${metrics.convertedRevenue.toLocaleString()}
            </span>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-text-primary">
            ${metrics.totalPackageValue.toLocaleString()}
          </p>
          <p className="text-[11px] font-bold text-text-muted uppercase tracking-wider mt-1">
            Aurrum Pipeline Value
          </p>
        </div>

        <a
          href="#aurrum-interviews"
          className="bg-bg-secondary border border-border-primary rounded-2xl p-5 hover:border-accent-blue/40 transition-all group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-accent-blue/10 text-accent-blue flex items-center justify-center">
              <Video className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold text-accent-blue bg-accent-blue/10 px-2 py-0.5 rounded-full">
              Today: {metrics.todayInterviews}
            </span>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-text-primary">
            {metrics.activeInterviewBookings}
          </p>
          <p className="text-[11px] font-bold text-text-muted uppercase tracking-wider mt-1">
            Confirmed Bookings
          </p>
        </a>
      </div>

      {/* 4-Step Flow Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <a
          href="#aurrum-candidates"
          className="bg-bg-secondary border border-border-primary rounded-2xl p-6 hover:border-accent-blue/40 transition-all flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-accent-blue">
                Step 01 → 02
              </span>
              <Users className="w-5 h-5 text-accent-blue" />
            </div>
            <h3 className="text-lg font-black text-text-primary mt-2">Aurrum Candidates</h3>
            <p className="text-xs text-text-secondary mt-1">
              Manage all Aurrum Careers candidates separately from the main CRM database.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-border-primary flex items-center justify-between text-xs font-bold text-accent-blue">
            <span>View {metrics.totalCandidates} Candidates</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </a>

        <a
          href="#aurrum-sales"
          className="bg-bg-secondary border border-border-primary rounded-2xl p-6 hover:border-amber-500/40 transition-all flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">
                Step 02 → 03
              </span>
              <TrendingUp className="w-5 h-5 text-amber-500" />
            </div>
            <h3 className="text-lg font-black text-text-primary mt-2">Aurrum Sales Pipeline</h3>
            <p className="text-xs text-text-secondary mt-1">
              Track Aurrum leads, follow-ups, packages, and conversions into Interview Support.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-border-primary flex items-center justify-between text-xs font-bold text-amber-500">
            <span>Manage Sales ({metrics.pendingFollowUps} Pending Follow-ups)</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </a>

        <a
          href="#aurrum-interviews"
          className="bg-bg-secondary border border-border-primary rounded-2xl p-6 hover:border-purple-500/40 transition-all flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-purple-400">
                Step 03 → 04
              </span>
              <Video className="w-5 h-5 text-purple-400" />
            </div>
            <h3 className="text-lg font-black text-text-primary mt-2">
              Interview Support & Proxy
            </h3>
            <p className="text-xs text-text-secondary mt-1">
              Manage Interview Support bookings, current interviews, proxy availability, and assignments.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-border-primary flex items-center justify-between text-xs font-bold text-purple-400">
            <span>Open Interview Support</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </a>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-bg-secondary border border-border-primary rounded-3xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-base font-black text-text-primary">
                Aurrum Careers Funnel Breakdown
              </h3>
              <p className="text-xs text-text-secondary">
                Candidates across the Aurrum Careers stages (isolated from main CRM)
              </p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stageDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    borderColor: '#334155',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="count" name="Candidates" radius={[8, 8, 0, 0]}>
                  {stageDistribution.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-bg-secondary border border-border-primary rounded-3xl p-6">
          <h3 className="text-base font-black text-text-primary">Aurrum Lead Sources</h3>
          <p className="text-xs text-text-secondary mb-4">Acquisition breakdown</p>
          {sourceDistribution.length > 0 ? (
            <>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sourceDistribution}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={3}
                    >
                      {sourceDistribution.map((_, idx) => (
                        <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5 mt-2">
                {sourceDistribution.slice(0, 4).map((item, idx) => (
                  <div key={item.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-text-secondary truncate">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                      />
                      {item.name}
                    </span>
                    <span className="font-bold text-text-primary">{item.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-56 flex flex-col items-center justify-center text-center text-text-muted">
              <Sparkles className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-xs font-semibold">No Aurrum candidates added yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Recent Aurrum Candidates & Pending Sales Follow-Ups */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-bg-secondary border border-border-primary rounded-3xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-black text-text-primary">Recent Aurrum Candidates</h3>
              <p className="text-xs text-text-secondary">Latest additions to Aurrum Careers</p>
            </div>
            <a
              href="#aurrum-candidates"
              className="text-xs font-bold text-accent-blue hover:underline flex items-center gap-1"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>

          {recentCandidates.length > 0 ? (
            <div className="space-y-2.5">
              {recentCandidates.map(c => {
                const st = AURRUM_STAGES.find(s => s.value === resolveAurrumStage(c));
                return (
                  <div
                    key={c.id}
                    onClick={() => {
                      setEditingCandidate(c);
                      setIsAddModalOpen(true);
                    }}
                    className="p-3.5 rounded-2xl bg-bg-tertiary/60 border border-border-primary hover:border-accent-blue/40 transition-all flex items-center justify-between gap-3 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-text-primary truncate">{c.full_name}</p>
                      <div className="flex items-center gap-3 text-[11px] text-text-muted mt-0.5">
                        {c.phone && (
                          <span className="flex items-center gap-1 truncate">
                            <Phone className="w-3 h-3" />
                            {c.phone}
                          </span>
                        )}
                        {c.job_interest && (
                          <span className="flex items-center gap-1 truncate">
                            <Briefcase className="w-3 h-3" />
                            {c.job_interest}
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 border"
                      style={{
                        color: st?.color || '#3B82F6',
                        borderColor: `${st?.color || '#3B82F6'}40`,
                        backgroundColor: `${st?.color || '#3B82F6'}15`,
                      }}
                    >
                      {st?.label.replace(/^\d+\.\s*/, '') || 'Lead'}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center text-text-muted">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p className="text-xs font-semibold">No Aurrum candidates yet.</p>
            </div>
          )}
        </div>

        <div className="bg-bg-secondary border border-border-primary rounded-3xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-black text-text-primary">
                Aurrum Sales Follow-Ups
              </h3>
              <p className="text-xs text-text-secondary">Upcoming calls & follow-ups</p>
            </div>
            <a
              href="#aurrum-sales"
              className="text-xs font-bold text-accent-blue hover:underline flex items-center gap-1"
            >
              <span>Go to Sales</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>

          {pendingFollowUpItems.length > 0 ? (
            <div className="space-y-2.5">
              {pendingFollowUpItems.map(f => {
                const cand = candidates.find(c => c.id === f.candidate_id);
                return (
                  <div
                    key={f.id}
                    className="p-3.5 rounded-2xl bg-bg-tertiary/60 border border-border-primary flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-text-primary truncate">
                        {cand?.full_name || 'Aurrum Candidate'}
                      </p>
                      <p className="text-xs text-text-secondary truncate mt-0.5">{f.note}</p>
                      <span className="text-[10px] font-bold text-amber-500 flex items-center gap-1 mt-1">
                        <Calendar className="w-3 h-3" />
                        Due: {f.followup_date}
                      </span>
                    </div>
                    <button
                      onClick={() => updateFollowUp({ ...f, done: true })}
                      className="px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500 hover:text-white text-[10px] font-black uppercase tracking-wider transition-all shrink-0 cursor-pointer"
                    >
                      Mark Done
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center text-text-muted">
              <Clock className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p className="text-xs font-semibold">No pending Aurrum sales follow-ups.</p>
            </div>
          )}
        </div>
      </div>

      <AurrumCandidateModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingCandidate(null);
        }}
        candidate={editingCandidate}
        salesUsers={salesUsers}
      />
    </div>
  );
};
