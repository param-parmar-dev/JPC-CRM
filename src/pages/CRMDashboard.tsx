import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { subscribeToCollection } from '../services/storage';
import { STAGES } from '../constants';
import { TimeZoneClocks } from '../components/TimeZoneClocks';
import { 
  Users, CheckCircle2, Clock, Calendar, ArrowUpRight, 
  FileText, Download, Filter, BarChart as BarChartIcon, 
  DollarSign, Activity, ChevronRight, ShieldCheck, TrendingUp, Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { Candidate, FollowUp, Application, User } from '../types';
import { 
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell 
} from 'recharts';
import { useDebounce } from '../lib/hooks';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-bg-secondary p-3 sm:p-4 border border-border-primary rounded-xl sm:rounded-2xl shadow-xl backdrop-blur-md max-w-[240px] sm:max-w-none text-xs pointer-events-none">
        <p className="text-[10px] sm:text-xs font-bold text-text-muted mb-1 uppercase tracking-wider truncate">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-[11px] sm:text-xs font-bold flex items-center gap-1.5 mt-0.5" style={{ color: entry.stroke || entry.fill || entry.color }}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.stroke || entry.fill || entry.color }} />
            <span className="truncate">{entry.name}: {typeof entry.value === 'number' ? `$${entry.value.toLocaleString()}` : entry.value}</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export const CRMDashboard: React.FC = () => {
  const { user, isAuthReady } = useAuth();
  const { showToast } = useToast();
  
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 640 : false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Search state for quick CRM reference
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);

  // CRM Leads & Sales Graph Dashboard Filters
  const [selectedSourceFilter, setSelectedSourceFilter] = useState('all');
  const [selectedAgentFilter, setSelectedAgentFilter] = useState('all');
  const [selectedTimeframeFilter, setSelectedTimeframeFilter] = useState('all');

  useEffect(() => {
    if (!isAuthReady) return;

    setIsLoading(true);
    // Limit subscriptions to recent 1000 items for dashboard overview to prevent browser hang
    const unsubCandidates = subscribeToCollection<Candidate>('jpc_candidates', (data) => {
      const active = data.filter(c => !c.deleted_at);
      setCandidates(active);
    }, 1000);

    const unsubFollowUps = subscribeToCollection<FollowUp>('jpc_followups', (data) => {
      setFollowUps(data);
    }, 1000);

    const unsubApps = subscribeToCollection<Application>('jpc_applications', (data) => {
      setApplications(data);
    }, 1000);

    const unsubUsers = subscribeToCollection<User>('jpc_users', (data) => {
      setAllUsers(data);
      setIsLoading(false);
    });

    return () => {
      unsubCandidates();
      unsubFollowUps();
      unsubApps();
      unsubUsers();
    };
  }, [isAuthReady]);

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

      // 4. Search query
      if (debouncedSearch.trim()) {
        const q = debouncedSearch.toLowerCase();
        const nameMatch = c.full_name?.toLowerCase().includes(q);
        const emailMatch = c.email?.toLowerCase().includes(q);
        const companyMatch = c.current_company?.toLowerCase().includes(q);
        const stageMatch = STAGES[c.current_stage]?.label?.toLowerCase().includes(q);
        if (!nameMatch && !emailMatch && !companyMatch && !stageMatch) return false;
      }

      return true;
    });
  }, [candidates, selectedSourceFilter, selectedAgentFilter, selectedTimeframeFilter, debouncedSearch]);

  const funnelData = useMemo(() => {
    const totalPool = filteredCRMLeads;
    const totalLeads = totalPool.length;
    
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

  const sourceChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredCRMLeads.forEach(c => {
      const src = c.lead_source?.trim() || 'Direct/Self';
      counts[src] = (counts[src] || 0) + 1;
    });

    const COLORS = ['#3f51b5', '#009688', '#e91e63', '#ff9800', '#9c27b0', '#03a9f4', '#8bc34a', '#ec4899'];
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
        monthlyStats[monthName].revenue += amt * 0.70;
      } else if (c.flags?.agreement_sent) {
        monthlyStats[monthName].pipelineValue += amt * 0.35;
      } else {
        monthlyStats[monthName].pipelineValue += amt * 0.10;
      }
    });

    return Object.entries(monthlyStats).map(([month, data]) => ({
      month,
      'Realized Revenue ($)': Math.round(data.revenue),
      'Potential Pipeline ($)': Math.round(data.pipelineValue)
    }));
  }, [filteredCRMLeads]);

  const handleExportLeadsAndSales = async () => {
    setIsExporting(true);
    try {
      const XLSX = await import('xlsx');
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

      const dataRows = candidates.map(c => {
        const candidateFollowUps = followUps.filter(f => f.candidate_id === c.id);
        const hasActiveFollowUp = candidateFollowUps.some(f => !f.done);
        
        let leadStatus = 'Pending';
        if (c.current_stage === 'not_interested') {
          leadStatus = 'Not Interested';
        } else if (c.current_stage === 'not_eligible') {
          leadStatus = 'Not Eligible';
        } else if (c.current_stage === 'completed' || c.current_stage === 'offer' || c.current_stage === 'sales') {
          leadStatus = 'Converted/Sales';
        } else if (hasActiveFollowUp) {
          leadStatus = 'Follow-up';
        } else if (c.current_stage === 'lead_generation') {
          leadStatus = c.flags?.agreement_signed ? 'Interested' : 'Interested';
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
          'Assigned Compliance': csUser?.display_name || 'Unassigned',
          'Assigned Recruiter': recruiterUser?.display_name || 'Unassigned',
          'Marketing Team Leader': marketingUser?.display_name || 'Unassigned',
          'Selected Plan / Package': cleanExcelValue(c.package_name),
          'Total Fee / Amount ($)': c.package_amount || 0,
          'Agreement Sent': c.flags?.agreement_sent ? 'Yes' : 'No',
          'Agreement Signed': c.flags?.agreement_signed ? 'Yes' : 'No',
          'Candidate Portal Acc': c.email ? 'Yes' : 'No',
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

      // Autofit columns
      const maxColWidths = dataRows.reduce((acc: any, row: any) => {
        Object.keys(row).forEach((key, colIndex) => {
          const val = String(row[key] || '');
          acc[colIndex] = Math.max(acc[colIndex] || 15, val.length + 2, key.length + 2);
        });
        return acc;
      }, []);
      wsData['!cols'] = maxColWidths.map((w: number) => ({ wch: w }));

      XLSX.writeFile(wb, `Leads_Sales_Performance_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
      showToast('Leads & Sales data report generated successfully!', 'success');
    } catch (e: any) {
      console.error(e);
      showToast(`Error generating report: ${e.message || e}`, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
        <p className="text-sm font-semibold text-text-secondary mt-4 animate-pulse">Loading CRM active databases...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-8">
      {/* Title block */}
      <div className="relative overflow-hidden bg-gradient-to-r from-bg-secondary via-bg-tertiary to-bg-secondary border border-border-primary rounded-2xl sm:rounded-[32px] p-4 sm:p-8 md:p-10 shadow-sm flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 sm:gap-6">
        <div className="space-y-1.5 sm:space-y-2 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 sm:px-3 sm:py-1 bg-accent-blue/10 text-accent-blue text-[9px] sm:text-[10px] font-black uppercase tracking-widest rounded-full">CRM Interactive Module</span>
            <span className="text-[9px] sm:text-[10px] text-text-muted uppercase font-black tracking-widest flex items-center gap-1">
              <Activity className="w-3 h-3 text-accent-teal" /> Realtime Sync Active
            </span>
          </div>
          <h1 className="text-xl sm:text-3xl md:text-4xl font-extrabold text-text-primary tracking-tight font-heading">
            CRM Dedicated Leads & Sales Dashboard
          </h1>
          <p className="text-text-secondary max-w-2xl text-xs sm:text-sm md:text-base leading-relaxed">
            Complete high-fidelity analytics and structural performance tracking. Filter customer funnel, trajectories, representative performance, and download structured Lead and Sales sheet directly.
          </p>
        </div>

        <button
          onClick={handleExportLeadsAndSales}
          disabled={isExporting}
          className="w-full lg:w-auto shrink-0 flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-accent-blue text-white font-bold rounded-xl sm:rounded-2xl hover:bg-accent-blue/90 hover:-translate-y-0.5 disabled:opacity-50 transition-all shadow-[0_4px_16px_rgba(0,173,140,0.25)] ring-1 ring-white/10 text-xs sm:text-sm cursor-pointer"
        >
          {isExporting ? (
            <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Download className="w-4 h-4 sm:w-5 sm:h-5" />
          )}
          <span>Download All Lead & Sales Data</span>
        </button>
      </div>

      <TimeZoneClocks />

      {/* Analytical Filtering Controls bar */}
      <div className="p-3.5 sm:p-6 bg-bg-secondary border border-border-primary rounded-2xl sm:rounded-[24px] shadow-sm flex flex-col lg:flex-row flex-wrap items-stretch lg:items-center justify-between gap-3.5 sm:gap-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Filter className="w-4 h-4 sm:w-5 sm:h-5 text-accent-blue shrink-0" />
            <h3 className="font-bold text-text-primary text-xs sm:text-sm uppercase tracking-wider">Interactive Query Filters</h3>
          </div>
          {(selectedSourceFilter !== 'all' || selectedAgentFilter !== 'all' || selectedTimeframeFilter !== 'all' || searchQuery.trim()) && (
            <button
              onClick={() => {
                setSelectedSourceFilter('all');
                setSelectedAgentFilter('all');
                setSelectedTimeframeFilter('all');
                setSearchQuery('');
              }}
              className="text-[11px] sm:text-xs text-accent-blue hover:underline font-bold"
            >
              Reset Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-row lg:items-center gap-2.5 sm:gap-3.5 w-full lg:w-auto">
          {/* Search bar */}
          <div className="relative w-full sm:col-span-2 lg:col-span-1 lg:w-64">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search leads, names, email..."
              className="w-full pl-9 pr-4 py-2.5 bg-bg-tertiary border border-border-primary rounded-xl text-xs font-bold text-text-primary placeholder:text-text-muted outline-none focus:border-accent-blue transition-colors"
            />
          </div>

          <div className="w-full">
            <select
              value={selectedSourceFilter}
              onChange={(e) => setSelectedSourceFilter(e.target.value)}
              className="w-full px-3 sm:px-4 py-2.5 bg-bg-tertiary border border-border-primary rounded-xl text-xs font-bold text-text-primary outline-none focus:border-accent-blue transition-colors cursor-pointer truncate"
            >
              <option value="all">All Channels (Lead Source)</option>
              {uniqueLeadSources.map(src => (
                <option key={src} value={src}>{src}</option>
              ))}
            </select>
          </div>

          <div className="w-full">
            <select
              value={selectedAgentFilter}
              onChange={(e) => setSelectedAgentFilter(e.target.value)}
              className="w-full px-3 sm:px-4 py-2.5 bg-bg-tertiary border border-border-primary rounded-xl text-xs font-bold text-text-primary outline-none focus:border-accent-blue transition-colors cursor-pointer truncate"
            >
              <option value="all">All Sales / Lead Advocates</option>
              {leadGenAgents.map(ag => (
                <option key={ag.id} value={String(ag.id)}>{ag.display_name} ({ag.role.replace('jpc_', '').toUpperCase()})</option>
              ))}
            </select>
          </div>

          <div className="w-full sm:col-span-2 lg:col-span-1">
            <select
              value={selectedTimeframeFilter}
              onChange={(e) => setSelectedTimeframeFilter(e.target.value)}
              className="w-full px-3 sm:px-4 py-2.5 bg-bg-tertiary border border-border-primary rounded-xl text-xs font-bold text-text-primary outline-none focus:border-accent-blue transition-colors cursor-pointer truncate"
            >
              <option value="all">All Date Horizons</option>
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
              <option value="90days">Last 90 Days</option>
            </select>
          </div>
        </div>
      </div>

      {/* CRM Dynamic metric summary row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-6 animate-fade-in">
        <div className="bg-bg-secondary p-3.5 sm:p-6 rounded-2xl sm:rounded-3xl border border-border-primary shadow-sm hover:shadow-md transition-all flex items-center justify-between min-w-0">
          <div className="min-w-0">
            <p className="text-[9px] sm:text-[10px] font-black text-text-muted uppercase tracking-wider truncate">Filtered Volume</p>
            <p className="text-xl sm:text-3xl font-black text-text-primary mt-0.5 sm:mt-1 truncate">{filteredCRMLeads.length}</p>
            <p className="text-[10px] sm:text-xs text-accent-blue font-bold mt-0.5 sm:mt-1 truncate">Matched leads</p>
          </div>
          <div className="p-2.5 sm:p-4 bg-accent-blue/10 text-accent-blue rounded-xl sm:rounded-2xl shrink-0 ml-2">
            <Users className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
        </div>

        <div className="bg-bg-secondary p-3.5 sm:p-6 rounded-2xl sm:rounded-3xl border border-border-primary shadow-sm hover:shadow-md transition-all flex items-center justify-between min-w-0">
          <div className="min-w-0">
            <p className="text-[9px] sm:text-[10px] font-black text-text-muted uppercase tracking-wider truncate">Converted Sales</p>
            <p className="text-xl sm:text-3xl font-black text-accent-green mt-0.5 sm:mt-1 truncate">
              {filteredCRMLeads.filter(c => ['completed', 'offer', 'sales'].includes(c.current_stage)).length}
            </p>
            <p className="text-[10px] sm:text-xs text-text-secondary font-bold mt-0.5 sm:mt-1 truncate">
              Share: {filteredCRMLeads.length > 0 ? Math.round((filteredCRMLeads.filter(c => ['completed', 'offer', 'sales'].includes(c.current_stage)).length / filteredCRMLeads.length) * 100) : 0}%
            </p>
          </div>
          <div className="p-2.5 sm:p-4 bg-accent-green/10 text-accent-green rounded-xl sm:rounded-2xl shrink-0 ml-2">
            <CheckCircle2 className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
        </div>

        <div className="bg-bg-secondary p-3.5 sm:p-6 rounded-2xl sm:rounded-3xl border border-border-primary shadow-sm hover:shadow-md transition-all flex items-center justify-between min-w-0">
          <div className="min-w-0">
            <p className="text-[9px] sm:text-[10px] font-black text-text-muted uppercase tracking-wider truncate">Gross Value</p>
            <p className="text-xl sm:text-3xl font-black text-accent-purple mt-0.5 sm:mt-1 truncate">
              ${filteredCRMLeads.reduce((sum, c) => sum + (c.package_amount || 0), 0).toLocaleString()}
            </p>
            <p className="text-[10px] sm:text-xs text-text-secondary font-bold mt-0.5 sm:mt-1 truncate">Sum value</p>
          </div>
          <div className="p-2.5 sm:p-4 bg-accent-purple/10 text-accent-purple rounded-xl sm:rounded-2xl shrink-0 ml-2">
            <DollarSign className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
        </div>

        <div className="bg-bg-secondary p-3.5 sm:p-6 rounded-2xl sm:rounded-3xl border border-border-primary shadow-sm hover:shadow-md transition-all flex items-center justify-between min-w-0">
          <div className="min-w-0">
            <p className="text-[9px] sm:text-[10px] font-black text-text-muted uppercase tracking-wider truncate">Contracts Active</p>
            <p className="text-xl sm:text-3xl font-black text-accent-teal mt-0.5 sm:mt-1 truncate">
              {filteredCRMLeads.filter(c => c.flags?.agreement_signed).length}
            </p>
            <p className="text-[10px] sm:text-xs text-text-secondary font-bold mt-0.5 sm:mt-1 truncate">
              Pending: {filteredCRMLeads.filter(c => c.flags?.agreement_sent && !c.flags?.agreement_signed).length}
            </p>
          </div>
          <div className="p-2.5 sm:p-4 bg-accent-teal/10 text-accent-teal rounded-xl sm:rounded-2xl shrink-0 ml-2">
            <ShieldCheck className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
        </div>
      </div>

      {filteredCRMLeads.length === 0 ? (
        <div className="py-12 sm:py-24 text-center bg-bg-secondary border border-dashed border-border-primary rounded-2xl sm:rounded-[32px] p-6">
          <BarChartIcon className="w-12 h-12 sm:w-16 sm:h-16 text-text-muted mx-auto mb-4 stroke-[1.5]" />
          <h4 className="text-lg sm:text-xl font-bold text-text-primary">No matching leads in active workspace</h4>
          <p className="text-xs sm:text-sm text-text-muted mt-2 max-w-sm mx-auto">
            Try resetting your filters or selecting alternate lead sources or active representatives channels.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8">
          
          {/* Customer Funnel phase progression */}
          <div className="p-4 sm:p-6 lg:p-8 bg-bg-secondary border border-border-primary rounded-2xl sm:rounded-[32px] flex flex-col justify-between shadow-sm min-w-0 overflow-hidden">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-accent-blue/10 text-accent-blue text-[9px] font-black uppercase tracking-widest rounded-full">Phase Funnel</span>
              </div>
              <h4 className="text-base sm:text-lg font-bold text-text-primary flex items-center gap-2 mt-2">
                <BarChartIcon className="w-4 h-4 sm:w-5 sm:h-5 text-accent-blue shrink-0" />
                <span>CRM Customer Funnel Phase Progression (%)</span>
              </h4>
              <p className="text-xs text-text-secondary mt-1">Cumulative conversion ratios comparing candidate leads generation up to closed won sales.</p>
            </div>
            <div className="w-full h-64 sm:h-72 mt-4 sm:mt-8">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnelData} layout="vertical" margin={{ left: isMobile ? 0 : 10, right: isMobile ? 15 : 30, top: 10, bottom: 10 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#e5e5e5" opacity={0.2} />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={(val) => `${val}%`} fontSize={isMobile ? 9 : 10} stroke="#858585" />
                  <YAxis dataKey="step" type="category" width={isMobile ? 82 : 115} tickFormatter={(val) => isMobile ? (val.split('. ')[1] || val) : val} fontSize={isMobile ? 9 : 10} stroke="#858585" />
                  <Tooltip 
                    formatter={(value: any, name: any) => {
                      if (name === 'rate') return [`${value}% Conversion`, 'Ratio'];
                      return [`${value} Accounts`, 'Volume'];
                    }}
                    contentStyle={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', borderRadius: '12px' }}
                  />
                  <Bar dataKey="rate" radius={[0, 8, 8, 0]} maxBarSize={isMobile ? 18 : 22}>
                    {funnelData.map((entry, index) => (
                      <Cell key={`funnel-cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Trajectory comparison */}
          <div className="p-4 sm:p-6 lg:p-8 bg-bg-secondary border border-border-primary rounded-2xl sm:rounded-[32px] flex flex-col justify-between shadow-sm min-w-0 overflow-hidden">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-accent-purple/10 text-accent-purple text-[9px] font-black uppercase tracking-widest rounded-full">Financial Yield</span>
              </div>
              <h4 className="text-base sm:text-lg font-bold text-text-primary flex items-center gap-2 mt-2">
                <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-accent-purple shrink-0" />
                <span>Realized Revenue vs Potential Pipeline ($)</span>
              </h4>
              <p className="text-xs text-text-secondary mt-1">Aggregation tracking of real invoices (closed sales) compared with forecast lead funnel estimations.</p>
            </div>
            <div className="w-full h-64 sm:h-72 mt-4 sm:mt-8">
              {financialTrajectoryData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-text-muted">No prospective financial pipeline tracked for filtered parameters.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={financialTrajectoryData} margin={{ left: isMobile ? -15 : 5, right: isMobile ? 5 : 15, top: 10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="colorRealized" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.35}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorPotential" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" opacity={0.2} />
                    <XAxis dataKey="month" fontSize={isMobile ? 8 : 10} stroke="#858585" />
                    <YAxis tickFormatter={(val) => val >= 1000 ? `$${Math.round(val / 1000)}k` : `$${val}`} fontSize={isMobile ? 8 : 10} stroke="#858585" />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: isMobile ? '10px' : '11px' }} />
                    <Area type="monotone" dataKey="Realized Revenue ($)" stroke="#10b981" fillOpacity={1} fill="url(#colorRealized)" strokeWidth={2.5} />
                    <Area type="monotone" dataKey="Potential Pipeline ($)" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorPotential)" strokeWidth={2.5} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Acquisition Channels Distribution */}
          <div className="p-4 sm:p-6 lg:p-8 bg-bg-secondary border border-border-primary rounded-2xl sm:rounded-[32px] flex flex-col justify-between shadow-sm min-w-0 overflow-hidden">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-accent-teal/10 text-accent-teal text-[9px] font-black uppercase tracking-widest rounded-full">Stream Sources</span>
              </div>
              <h4 className="text-base sm:text-lg font-bold text-text-primary flex items-center gap-2 mt-2">
                <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-accent-teal shrink-0" />
                <span>Acquisition Channel Share & Inbound Stream</span>
              </h4>
              <p className="text-xs text-text-secondary mt-1">Interactive share breakdown of lead channels across connected job portals.</p>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-8 mt-4 sm:mt-8">
              <div className="w-full sm:w-1/2 h-48 sm:h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sourceChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={isMobile ? 42 : 55}
                      outerRadius={isMobile ? 65 : 75}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {sourceChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: any, name: any) => [`${value} Leads`, name]}
                      contentStyle={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', borderRadius: '12px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-full sm:w-1/2 space-y-1.5 sm:space-y-2 max-h-[160px] sm:max-h-[220px] overflow-y-auto pr-1 sm:pr-2 custom-scrollbar">
                {sourceChartData.map((item, index) => {
                  const pct = filteredCRMLeads.length > 0 ? Math.round((item.value / filteredCRMLeads.length) * 100) : 0;
                  return (
                    <div key={index} className="flex items-center justify-between p-2 sm:p-2.5 bg-bg-tertiary border border-border-primary rounded-xl text-[11px] sm:text-xs shadow-sm">
                      <div className="flex items-center gap-2 truncate">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                        <span className="font-bold text-text-primary truncate">{item.name}</span>
                      </div>
                      <span className="font-black text-text-muted shrink-0 ml-2">{item.value} ({pct}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Representatives team performance leaderboard */}
          <div className="p-4 sm:p-6 lg:p-8 bg-bg-secondary border border-border-primary rounded-2xl sm:rounded-[32px] flex flex-col justify-between shadow-sm min-w-0 overflow-hidden">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-accent-green/10 text-accent-green text-[9px] font-black uppercase tracking-widest rounded-full">Reps Leaderboard</span>
              </div>
              <h4 className="text-base sm:text-lg font-bold text-text-primary flex items-center gap-2 mt-2">
                <Users className="w-4 h-4 sm:w-5 sm:h-5 text-accent-green shrink-0" />
                <span>Advocate Conversion Rankings (Top 5)</span>
              </h4>
              <p className="text-xs text-text-secondary mt-1">Aggregated leads volume vs closed sales conversions across active teammates.</p>
            </div>
            <div className="w-full h-64 sm:h-72 mt-4 sm:mt-8">
              {repLeaderboardData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-text-muted font-bold">No active agent assignments compiled on matched selection.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={repLeaderboardData} margin={{ left: isMobile ? -15 : 5, right: isMobile ? 5 : 10, top: 10, bottom: isMobile ? 15 : 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" opacity={0.2} />
                    <XAxis 
                      dataKey="name" 
                      fontSize={isMobile ? 8 : 9} 
                      stroke="#858585" 
                      tickFormatter={(name) => isMobile && name.includes(' ') ? `${name.split(' ')[0]} ${name.split(' ')[1]?.[0] || ''}.` : name}
                      interval={0}
                    />
                    <YAxis fontSize={isMobile ? 8 : 9} stroke="#858585" />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: isMobile ? '10px' : '11px' }} />
                    <Bar dataKey="Leads Handled" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={isMobile ? 12 : 16} />
                    <Bar dataKey="Successful Sales" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={isMobile ? 12 : 16} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

        </div>
      )}

      {/* Leads quick reference table & mobile cards */}
      <div className="bg-bg-secondary border border-border-primary rounded-2xl sm:rounded-[32px] p-4 sm:p-6 lg:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 mb-4 sm:mb-6">
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-text-primary">Filtered Lead Records ({filteredCRMLeads.length})</h3>
            <p className="text-xs text-text-secondary mt-0.5">Summary list view matching existing criteria for high speed validation.</p>
          </div>
          <div className="text-xs text-text-muted shrink-0 sm:text-right">
            Real-time verification: <span className="text-text-primary font-bold">{candidates.length} total raw candidates</span>
          </div>
        </div>

        {/* Mobile Card List (block md:hidden) */}
        <div className="block md:hidden space-y-2.5">
          {filteredCRMLeads.slice(0, 15).map((c) => {
            const stageLabel = STAGES[c.current_stage]?.label || c.current_stage;
            return (
              <div
                key={c.id}
                onClick={() => window.location.hash = `#candidate?id=${c.id}`}
                className="bg-bg-tertiary/60 border border-border-primary rounded-2xl p-3.5 space-y-2.5 shadow-sm active:scale-[0.99] transition-all cursor-pointer hover:border-accent-blue/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-accent-blue/10 flex items-center justify-center text-accent-blue font-bold text-xs shrink-0">
                        {c.full_name ? c.full_name.charAt(0).toUpperCase() : '?'}
                      </div>
                      <h4 className="font-bold text-text-primary text-sm truncate hover:text-accent-blue transition-colors">
                        {c.full_name}
                      </h4>
                    </div>
                    {c.email && (
                      <p className="text-[11px] text-text-muted truncate mt-1 pl-9">
                        {c.email}
                      </p>
                    )}
                  </div>
                  <span
                    className={cn(
                      "px-2 py-0.5 text-[9px] font-bold rounded-lg shrink-0 inline-block text-center",
                      ['completed', 'offer', 'sales'].includes(c.current_stage) ? "bg-accent-green/10 text-accent-green" :
                      c.current_stage === 'not_interested' ? "bg-accent-red/10 text-accent-red" :
                      c.current_stage === 'not_eligible' ? "bg-accent-red/20 text-accent-red/90" :
                      "bg-accent-blue/10 text-accent-blue"
                    )}
                  >
                    {stageLabel.split('. ')[1] || stageLabel}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs bg-bg-secondary/70 border border-border-primary/50 rounded-xl p-2.5">
                  <div className="truncate">
                    <span className="text-[9px] font-black uppercase tracking-wider block text-text-muted">Source</span>
                    <span className="text-text-primary font-bold text-xs truncate block">{c.lead_source || 'organic'}</span>
                  </div>
                  <div className="truncate">
                    <span className="text-[9px] font-black uppercase tracking-wider block text-text-muted">Package</span>
                    <span className="text-text-primary font-bold text-xs truncate block">{c.package_name || '—'}</span>
                  </div>
                  <div className="truncate">
                    <span className="text-[9px] font-black uppercase tracking-wider block text-text-muted">Agreement</span>
                    <span className="block text-xs font-bold truncate">
                      {c.flags?.agreement_signed ? (
                        <span className="text-accent-green">Signed</span>
                      ) : c.flags?.agreement_sent ? (
                        <span className="text-accent-amber">Pending Sent</span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </span>
                  </div>
                  <div className="truncate">
                    <span className="text-[9px] font-black uppercase tracking-wider block text-text-muted">Fee</span>
                    <span className="text-accent-purple font-black text-xs block">
                      {c.package_amount ? `$${c.package_amount.toLocaleString()}` : '$0'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          {filteredCRMLeads.length === 0 && (
            <div className="p-8 text-center text-text-muted italic border border-dashed border-border-primary rounded-xl">
              No active leads matching current parameters
            </div>
          )}
        </div>

        {/* Desktop Table View (hidden md:block) */}
        <div className="hidden md:block overflow-x-auto rounded-2xl border border-border-primary bg-bg-tertiary custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-bg-secondary select-none border-b border-border-primary text-text-muted font-bold uppercase tracking-wider">
                <th className="p-4">Name</th>
                <th className="p-4">Source Channel</th>
                <th className="p-4">Package Plan</th>
                <th className="p-4">Stage</th>
                <th className="p-4">Agreement Status</th>
                <th className="p-4 text-right">Fee ($)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-primary font-medium text-text-primary">
              {filteredCRMLeads.slice(0, 15).map((c) => {
                const stageLabel = STAGES[c.current_stage]?.label || c.current_stage;
                return (
                  <tr key={c.id} className="hover:bg-bg-secondary/40 transition-colors cursor-pointer" onClick={() => window.location.hash = `#candidate?id=${c.id}`}>
                    <td className="p-4">
                      <div className="font-bold hover:text-accent-blue transition-colors">{c.full_name}</div>
                      <div className="text-[10px] text-text-muted">{c.email || 'No email registered'}</div>
                    </td>
                    <td className="p-4 text-text-muted">
                      {c.lead_source || 'organic'}
                    </td>
                    <td className="p-4">
                      {c.package_name || '—'}
                    </td>
                    <td className="p-4">
                      <span className={cn(
                        "px-2.5 py-1 text-[10px] font-bold rounded-lg shrink-0 inline-block",
                        ['completed', 'offer', 'sales'].includes(c.current_stage) ? "bg-accent-green/10 text-accent-green" :
                        c.current_stage === 'not_interested' ? "bg-accent-red/10 text-accent-red" :
                        c.current_stage === 'not_eligible' ? "bg-accent-red/20 text-accent-red/90" :
                        "bg-accent-blue/10 text-accent-blue"
                      )}>
                        {stageLabel}
                      </span>
                    </td>
                    <td className="p-4 space-x-1">
                      {c.flags?.agreement_signed ? (
                        <span className="px-2 py-0.5 bg-accent-green/10 text-accent-green text-[10px] rounded-md font-bold">Signed</span>
                      ) : c.flags?.agreement_sent ? (
                        <span className="px-2 py-0.5 bg-accent-amber/10 text-accent-amber text-[10px] rounded-md font-bold">Pending Sent</span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="p-4 text-right font-bold">
                      {c.package_amount ? `$${c.package_amount.toLocaleString()}` : '$0'}
                    </td>
                  </tr>
                );
              })}
              {filteredCRMLeads.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-text-muted italic">
                    No active leads matching current parameters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filteredCRMLeads.length > 15 && (
          <p className="text-[11px] text-text-muted text-center mt-3 font-bold">
            Showing initial 15 of {filteredCRMLeads.length} leads. Please extract complete roster with "Download All Lead & Sales Data" report.
          </p>
        )}
      </div>
    </div>
  );
};
