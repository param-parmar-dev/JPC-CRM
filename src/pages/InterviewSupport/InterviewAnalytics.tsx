import React, { useMemo, useState } from 'react';
import { 
  InterviewSupportRequest, 
  InterviewRound, 
  Candidate, 
  User 
} from '../../types';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { 
  BarChart2, 
  Users, 
  UserCheck, 
  UserMinus, 
  Search, 
  Filter,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  ArrowUpRight
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';

interface AnalyticsProps {
  requests: InterviewSupportRequest[];
  rounds: InterviewRound[];
  candidates: Candidate[];
  team: User[];
}

const COLORS = ['#00AD8C', '#EF4444', '#6366F1', '#F59E0B'];

export const InterviewAnalytics: React.FC<AnalyticsProps> = ({ requests, rounds, candidates, team }) => {
  const [journeySearch, setJourneySearch] = useState('');
  const [proxyFilter, setProxyFilter] = useState<'all' | 'proxy' | 'no_proxy'>('all');

  const stats = useMemo(() => {
    // Screening stats
    const screeningRounds = rounds.filter(r => r.round_type === 'screening');
    const screeningTotal = screeningRounds.length;
    const screeningWithProxy = screeningRounds.filter(r => r.proxy_user_id !== null).length;
    const screeningNoProxy = screeningTotal - screeningWithProxy;

    // Interview stats (all non-screening)
    const interviewRounds = rounds.filter(r => r.round_type !== 'screening');
    const interviewTotal = interviewRounds.length;
    const interviewWithProxy = interviewRounds.filter(r => r.proxy_user_id !== null).length;
    const interviewNoProxy = interviewTotal - interviewWithProxy;

    const proxyTotal = screeningWithProxy + interviewWithProxy;
    const noProxyTotal = screeningNoProxy + interviewNoProxy;

    return {
      screening: {
        total: screeningTotal,
        proxy: screeningWithProxy,
        noProxy: screeningNoProxy,
        proxyPercent: screeningTotal > 0 ? (screeningWithProxy / screeningTotal) * 100 : 0
      },
      interview: {
        total: interviewTotal,
        proxy: interviewWithProxy,
        noProxy: interviewNoProxy,
        proxyPercent: interviewTotal > 0 ? (interviewWithProxy / interviewTotal) * 100 : 0
      },
      overall: {
        proxy: proxyTotal,
        noProxy: noProxyTotal,
        total: proxyTotal + noProxyTotal
      }
    };
  }, [rounds]);

  const journeys = useMemo(() => {
    return requests.map(req => {
      const candidate = candidates.find(c => c.id === req.candidate_id);
      const reqRounds = rounds.filter(r => r.request_id === req.id);
      
      const screening = reqRounds.find(r => r.round_type === 'screening');
      const assessments = reqRounds.filter(r => r.round_type !== 'screening');
      
      const hasProxy = reqRounds.some(r => r.proxy_user_id !== null);

      return {
        id: req.id,
        candidateName: candidate?.full_name || 'Unknown',
        company: req.interview_company_name,
        jobTitle: req.job_title,
        status: req.overall_status,
        screening: screening ? {
          type: screening.round_type,
          hasProxy: !!screening.proxy_user_id,
          status: screening.status
        } : null,
        interviews: assessments.map(a => ({
          type: a.round_type,
          hasProxy: !!a.proxy_user_id,
          status: a.status
        })),
        hasProxy,
        createdAt: req.created_at
      };
    }).filter(j => {
      const matchesSearch = j.candidateName.toLowerCase().includes(journeySearch.toLowerCase()) || 
                          j.company.toLowerCase().includes(journeySearch.toLowerCase());
      
      const matchesProxy = proxyFilter === 'all' || 
                          (proxyFilter === 'proxy' && j.hasProxy) || 
                          (proxyFilter === 'no_proxy' && !j.hasProxy);
                          
      return matchesSearch && matchesProxy;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [requests, rounds, candidates, journeySearch, proxyFilter]);

  const chartData = [
    {
      name: 'Screening',
      'Proxy Support': stats.screening.proxy,
      'No Proxy': stats.screening.noProxy,
    },
    {
      name: 'Interviews',
      'Proxy Support': stats.interview.proxy,
      'No Proxy': stats.interview.noProxy,
    },
  ];

  const pieData = [
    { name: 'Proxy Taken', value: stats.overall.proxy },
    { name: 'No Proxy Support', value: stats.overall.noProxy },
  ];

  return (
    <div className="space-y-10">
      {/* Analytics Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-text-primary tracking-tight">Interview & Screening Tracker</h2>
          <p className="text-text-secondary mt-1 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-accent-blue" />
            Performance breakdown and support utilization
          </p>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard 
          label="Screening Total" 
          value={stats.screening.total} 
          subValue={`${stats.screening.proxyPercent.toFixed(0)}% Proxy Support`}
          icon={Users}
          color="text-accent-blue"
          bg="bg-accent-blue/10"
        />
        <StatCard 
          label="Interview Total" 
          value={stats.interview.total} 
          subValue={`${stats.interview.proxyPercent.toFixed(0)}% Proxy Support`}
          icon={ArrowUpRight}
          color="text-accent-purple"
          bg="bg-accent-purple/10"
        />
        <StatCard 
          label="Proxy Support Taken" 
          value={stats.overall.proxy} 
          subValue="Across all rounds"
          icon={UserCheck}
          color="text-accent-green"
          bg="bg-accent-green/10"
        />
        <StatCard 
          label="No Proxy Support" 
          value={stats.overall.noProxy} 
          subValue="Self-attended/Unknown"
          icon={UserMinus}
          color="text-accent-red"
          bg="bg-accent-red/10"
        />
      </div>

      {/* Visual Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-bg-secondary border border-border-primary rounded-3xl sm:rounded-[40px] p-5 sm:p-8">
          <h3 className="text-xl font-black text-text-primary mb-8 flex items-center gap-2">
            Support Breakdown: Screening vs Interview
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                <XAxis dataKey="name" stroke="#64748B" fontSize={12} />
                <YAxis stroke="#64748B" fontSize={12} />
                <Tooltip contentStyle={{backgroundColor: 'var(--bg-secondary)', borderRadius: '16px', border: '1px solid var(--border-primary)'}} />
                <Legend iconType="circle" />
                <Bar dataKey="Proxy Support" fill="#00AD8C" radius={[6, 6, 0, 0]} />
                <Bar dataKey="No Proxy" fill="#EF4444" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-bg-secondary border border-border-primary rounded-3xl sm:rounded-[40px] p-5 sm:p-8">
          <h3 className="text-xl font-black text-text-primary mb-8">Overall Split</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{backgroundColor: 'var(--bg-secondary)', borderRadius: '16px', border: '1px solid var(--border-primary)'}} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Candidate Journey Table */}
      <div className="bg-bg-secondary border border-border-primary rounded-3xl sm:rounded-[40px] overflow-hidden">
        <div className="p-5 sm:p-8 border-b border-border-primary bg-bg-tertiary/30">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <h3 className="text-xl font-black text-text-primary">Candidate Journey History</h3>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 w-full lg:w-auto">
              <div className="relative flex-1 sm:flex-initial">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input 
                  type="text"
                  placeholder="Filter journeys..."
                  value={journeySearch}
                  onChange={(e) => setJourneySearch(e.target.value)}
                  className="w-full sm:w-64 bg-bg-tertiary border border-border-primary rounded-2xl pl-10 pr-4 py-2.5 text-xs text-text-primary focus:ring-2 focus:ring-accent-blue/20 outline-none"
                />
              </div>
              <div className="flex items-center gap-1 bg-bg-tertiary p-1 rounded-2xl border border-border-primary overflow-x-auto">
                {(['all', 'proxy', 'no_proxy'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setProxyFilter(f)}
                    className={cn(
                      "px-3 sm:px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                      proxyFilter === f ? "bg-accent-blue text-white shadow-lg shadow-accent-blue/20" : "text-text-muted hover:text-text-primary"
                    )}
                  >
                    {f.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto touch-scroll">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border-primary">
                <th className="px-8 py-5 text-[10px] font-black text-text-muted uppercase tracking-widest">Candidate & Company</th>
                <th className="px-8 py-5 text-[10px] font-black text-text-muted uppercase tracking-widest text-center">Screening</th>
                <th className="px-8 py-5 text-[10px] font-black text-text-muted uppercase tracking-widest text-center">Interviews</th>
                <th className="px-8 py-5 text-[10px] font-black text-text-muted uppercase tracking-widest text-center">Support Status</th>
                <th className="px-8 py-5 text-[10px] font-black text-text-muted uppercase tracking-widest text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-primary">
              {journeys.map((j) => (
                <tr key={j.id} className="hover:bg-bg-tertiary/30 transition-colors group">
                  <td className="px-8 py-6">
                    <div className="flex flex-col">
                      <span className="text-sm font-black text-text-primary">{j.candidateName}</span>
                      <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">{j.company} • {j.jobTitle}</span>
                    </div>
                  </td>
                  <td className="px-8 py-6 text-center">
                    {j.screening ? (
                      <div className="flex flex-col items-center">
                         {j.screening.hasProxy ? (
                           <ShieldCheck className="w-5 h-5 text-accent-green mb-1" />
                         ) : (
                           <ShieldAlert className="w-5 h-5 text-accent-red mb-1 opacity-50" />
                         )}
                         <span className="text-[9px] font-black text-text-muted uppercase">{j.screening.hasProxy ? 'Proxy Taken' : 'No Proxy'}</span>
                      </div>
                    ) : (
                      <span className="text-[10px] font-bold text-text-muted italic">No Screening</span>
                    )}
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="flex gap-1">
                        {j.interviews.map((int, i) => (
                          <div 
                            key={i} 
                            className={cn(
                              "w-3 h-3 rounded-full",
                              int.hasProxy ? "bg-accent-green" : "bg-accent-red opacity-30"
                            )}
                            title={`${int.type}: ${int.hasProxy ? 'Proxy' : 'Self-attended'}`}
                          />
                        ))}
                        {j.interviews.length === 0 && <span className="text-[10px] font-bold text-text-muted italic">N/A</span>}
                      </div>
                      <span className="text-[10px] font-bold text-text-muted">
                        {j.interviews.filter(i => i.hasProxy).length}/{j.interviews.length} Support
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-6 text-center">
                    <div className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                      j.hasProxy ? "bg-accent-green/10 text-accent-green" : "bg-accent-red/10 text-accent-red"
                    )}>
                      {j.hasProxy ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                      {j.hasProxy ? 'Proxy Utilized' : 'Self Attended'}
                    </div>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <button className="p-2 hover:bg-bg-secondary rounded-xl transition-colors text-text-muted hover:text-accent-blue">
                      <ArrowUpRight className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
              {journeys.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center text-text-muted italic">
                    No journeys found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ 
  label: string; 
  value: number | string; 
  subValue: string; 
  icon: any; 
  color: string; 
  bg: string;
}> = ({ label, value, subValue, icon: Icon, color, bg }) => (
  <motion.div 
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    className="bg-bg-secondary border border-border-primary rounded-[40px] p-8 hover:shadow-xl hover:shadow-accent-blue/5 transition-all"
  >
    <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center mb-6", bg)}>
      <Icon className={cn("w-6 h-6", color)} />
    </div>
    <div className="space-y-1">
      <p className="text-4xl font-black text-text-primary tracking-tight">{value}</p>
      <p className="text-[11px] font-black text-text-muted uppercase tracking-widest">{label}</p>
    </div>
    <p className="text-xs font-bold text-text-secondary mt-4 flex items-center gap-1.5">
      <ArrowRight className="w-3 h-3 text-accent-blue" />
      {subValue}
    </p>
  </motion.div>
);
