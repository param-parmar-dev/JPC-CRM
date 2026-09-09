import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, 
  Trello, 
  Users, 
  Clock, 
  UserX, 
  Shield, 
  LogOut, 
  Sun, 
  Moon,
  Menu,
  X,
  FileText,
  FileEdit,
  Video,
  User as UserIcon,
  Zap,
  TrendingUp,
  FolderTree
} from 'lucide-react';
import { cn, isSalesWorkingHours } from '../lib/utils';
import { subscribeToCollection, updateSalesAvailability } from '../services/storage';
import { useToast } from '../contexts/ToastContext';
import { isProxyUser } from '../services/interviewService';
import { FollowUp, Candidate, User } from '../types';
import { canUserAccessCandidate } from '../lib/permissions';

interface SidebarProps {
  currentHash: string;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentHash, isOpen, setIsOpen }) => {
  const { user, logout, isAuthReady } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useToast();

  const [allFollowUps, setAllFollowUps] = useState<FollowUp[]>([]);
  const [allCandidates, setAllCandidates] = useState<Candidate[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [salesStatus, setSalesStatus] = useState<'Active' | 'Deactive'>(user?.sales_availability_status || 'Deactive');
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);

  useEffect(() => {
    if (user?.sales_availability_status) {
      setSalesStatus(user.sales_availability_status);
    }
  }, [user?.sales_availability_status]);

  const handleToggleSalesAvailability = async () => {
    if (!user || user.role !== 'jpc_sales') return;
    setIsTogglingStatus(true);
    const nextStatus = salesStatus === 'Active' ? 'Deactive' : 'Active';
    try {
      const result = await updateSalesAvailability(nextStatus, user.id);
      setSalesStatus(nextStatus);
      if (nextStatus === 'Active') {
        showToast('You are now Active. Eligible for automatic leads.', 'success');
        if (result.processedUnassigned && result.processedUnassigned > 0) {
          showToast(`Assigned ${result.processedUnassigned} unassigned backlog leads.`, 'info');
        }
      } else {
        showToast('You are now Deactive. Automatic assignments paused.', 'info');
      }
    } catch (err) {
      console.error('Error updating availability:', err);
      showToast('Failed to update availability status', 'error');
    } finally {
      setIsTogglingStatus(false);
    }
  };


  useEffect(() => {
    if (!isAuthReady) return;

    const unsubFollowUps = subscribeToCollection<FollowUp>('jpc_followups', (data) => {
      setAllFollowUps(data);
    });

    const unsubCandidates = subscribeToCollection<Candidate>('jpc_candidates', (data) => {
      setAllCandidates(data);
    });

    const unsubUsers = subscribeToCollection<User>('jpc_users', (data) => {
      setAllUsers(data);
    });

    return () => {
      unsubFollowUps();
      unsubCandidates();
      unsubUsers();
    };
  }, [isAuthReady]);

  const followUpsCount = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const personal = user?.role === 'administrator' || user?.role === 'jpc_manager' 
      ? allFollowUps 
      : allFollowUps.filter(f => f.created_by === user?.id);
    return personal.filter(f => !f.done && f.followup_date <= today).length;
  }, [user, allFollowUps]);

  const notInterestedCount = useMemo(() => {
    return allCandidates.filter(c => c.current_stage === 'not_interested' && canUserAccessCandidate(c, user, allUsers)).length;
  }, [allCandidates, user, allUsers]);

  const notEligibleCount = useMemo(() => {
    return allCandidates.filter(c => c.current_stage === 'not_eligible' && canUserAccessCandidate(c, user, allUsers)).length;
  }, [allCandidates, user, allUsers]);

  const navItems = [
    { label: 'Dashboard', hash: '#dashboard', icon: LayoutDashboard, visible: true },
    { 
      label: 'CRM Leads & Sales', 
      hash: '#crm-dashboard', 
      icon: TrendingUp, 
      visible: user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager' || user?.role === 'jpc_cs' || user?.role === 'jpc_compliance_person'
    },
    { label: 'My Profile', hash: `#candidate?id=${user?.candidate_id}`, icon: UserIcon, visible: (user?.role === 'candidate' || user?.role === 'jpc_candidate') && !!user?.candidate_id },
    { 
      label: 'Pipeline', 
      hash: '#pipeline', 
      icon: Trello, 
      visible: user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager' || user?.role === 'jpc_cs' || user?.role === 'jpc_compliance_person' || user?.role === 'jpc_recruiter' || user?.role === 'jpc_marketing' || user?.role === 'jpc_marketing_support' || user?.role === 'jpc_sales' || user?.role === 'jpc_resume'
    },
    { label: 'Candidates', hash: '#candidates', icon: Users, visible: user?.role !== 'candidate' && user?.role !== 'jpc_candidate' },
    { 
      label: 'Follow-Ups', 
      hash: '#followups', 
      icon: Clock, 
      visible: user?.role !== 'candidate' && user?.role !== 'jpc_candidate' && user?.role !== 'jpc_lead_gen' && user?.role !== 'jpc_resume' && user?.role !== 'jpc_proxy' && user?.role !== 'jpc_marketing' && user?.role !== 'jpc_marketing_support', 
      badge: followUpsCount 
    },
    { 
      label: 'App Tracker', 
      hash: '#applications', 
      icon: FileText, 
      visible: user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager' || user?.role === 'jpc_cs' || user?.role === 'jpc_compliance_person' || user?.role === 'jpc_recruiter' || user?.role === 'jpc_marketing'
    },
    { 
      label: 'Resume Log', 
      hash: '#resume-log', 
      icon: FileEdit, 
      visible: user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager' || user?.role === 'jpc_cs' || user?.role === 'jpc_compliance_person' || user?.role === 'jpc_recruiter' || user?.role === 'jpc_resume' || user?.role === 'jpc_marketing'
    },
    { 
      label: 'Resume Prep Log', 
      hash: '#resume-prep-log', 
      icon: FileText, 
      visible: user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager' || user?.role === 'jpc_cs' || user?.role === 'jpc_compliance_person' || user?.role === 'jpc_recruiter' || user?.role === 'jpc_resume' || user?.role === 'jpc_marketing'
    },
    { 
      label: 'RTR Log', 
      hash: '#rtr-log', 
      icon: FileEdit, 
      visible: user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager' || user?.role === 'jpc_cs' || user?.role === 'jpc_compliance_person' || user?.role === 'jpc_recruiter' || user?.role === 'jpc_resume' || user?.role === 'jpc_marketing'
    },
    { 
      label: 'Target Compliance', 
      hash: '#target-dashboard', 
      icon: TrendingUp, 
      visible: user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager' || user?.role === 'jpc_cs' || user?.role === 'jpc_compliance_person'
    },
    { 
      label: 'CV Repository', 
      hash: '#cv-repository', 
      icon: FileText, 
      visible: user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager' || user?.role === 'jpc_cs' || user?.role === 'jpc_compliance_person' || user?.role === 'jpc_recruiter' || user?.role === 'jpc_resume' || user?.role === 'jpc_marketing'
    },
    { 
      label: 'Domain Resumes', 
      hash: '#domain-resumes', 
      icon: FolderTree, 
      visible: user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager' || user?.role === 'jpc_cs' || user?.role === 'jpc_compliance_person' || user?.role === 'jpc_recruiter' || user?.role === 'jpc_resume' || user?.role === 'jpc_marketing'
    },
    { 
      label: 'Interview Support', 
      hash: '#interviews', 
      icon: Video, 
      visible: user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager' || user?.role === 'jpc_cs' || user?.role === 'jpc_compliance_person' || user?.role === 'jpc_recruiter' || isProxyUser(user) || user?.role === 'jpc_marketing'
    },
    { 
      label: 'Proxy Support', 
      hash: '#interviews-proxy', 
      icon: Clock, 
      visible: user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager' || isProxyUser(user)
    },
    { 
      label: 'Not Interested', 
      hash: '#not-interested', 
      icon: UserX, 
      visible: (user?.role === 'administrator' || user?.role === 'jpc_manager' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_lead_gen' || user?.role === 'jpc_sales'),
      badge: notInterestedCount
    },
    { 
      label: 'Not Eligible', 
      hash: '#not-eligible', 
      icon: UserX, 
      visible: (user?.role === 'administrator' || user?.role === 'jpc_manager' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_lead_gen' || user?.role === 'jpc_sales'),
      badge: notEligibleCount
    },
    { 
      label: 'Team', 
      hash: '#team', 
      icon: Shield, 
      visible: (user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager' || user?.role === 'jpc_marketing' || user?.role === 'jpc_cs' || user?.role === 'jpc_compliance_person')
    },
    { 
      label: 'Feature Alerts', 
      hash: '#feature-alerts', 
      icon: Zap, 
      visible: true 
    },
  ];

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 h-full w-[260px] bg-bg-secondary border-r border-border-primary z-50 transition-transform duration-300 md:translate-x-0 flex flex-col",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Brand Area */}
        <div className="p-6 flex items-center gap-3">
          <img 
            src={theme === 'dark' 
              ? "https://auriic.co/wp-content/uploads/2026/04/Auriic-logo-Header.webp" 
              : "https://auriic.co/wp-content/uploads/2026/05/Auriic_dark_Logo.webp"
            } 
            alt="Auriic Logo" 
            className="h-12 w-auto scale-110 origin-left"
            referrerPolicy="no-referrer"
          />
          <div className="hidden">
            <h1 className="font-heading font-bold text-lg leading-none">Auriic</h1>
            <span className="text-[10px] uppercase tracking-wider text-text-muted font-bold mt-1 block">
              {user?.role.replace('jpc_', '').replace('_', ' ')}
            </span>
          </div>
          <button 
            className="md:hidden ml-auto p-1 text-text-secondary"
            onClick={() => setIsOpen(false)}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-6 space-y-1.5 overflow-y-auto">
          {navItems.filter(item => item.visible).map(item => (
            <a
              key={item.hash}
              href={item.hash}
              onClick={() => setIsOpen(false)}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all group relative font-semibold",
                currentHash.startsWith(item.hash) 
                  ? "bg-accent-blue/10 text-accent-blue shadow-inner" 
                  : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
              )}
            >
              {currentHash.startsWith(item.hash) && (
                <motion.div 
                  layoutId="activeNavIndicator"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-accent-blue rounded-r-full shadow-[0_0_8px_rgba(0,173,140,0.5)]" 
                />
              )}
              <item.icon className={cn(
                "w-5 h-5 transition-transform duration-300",
                currentHash.startsWith(item.hash) ? "scale-110" : "group-hover:scale-110 group-hover:text-text-primary"
              )} />
              <span className="flex-1">{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm",
                  item.hash === '#not-interested' ? "bg-accent-red/20 text-accent-red" : "bg-accent-amber/20 text-accent-amber"
                )}>
                  {item.badge}
                </span>
              )}
            </a>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-5 border-t border-border-primary bg-bg-secondary/50 backdrop-blur-sm space-y-4">
          {/* Sales Person Availability Toggle */}
          {user?.role === 'jpc_sales' && (
            <div className="bg-bg-tertiary/70 border border-border-primary/80 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "w-2.5 h-2.5 rounded-full transition-all",
                    salesStatus === 'Active' 
                      ? "bg-accent-green shadow-[0_0_8px_rgba(34,197,94,0.7)] animate-pulse" 
                      : "bg-slate-400"
                  )} />
                  <span className="text-xs font-bold text-text-primary">
                    {salesStatus === 'Active' ? 'Active' : 'Deactive'}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={isTogglingStatus}
                  onClick={handleToggleSalesAvailability}
                  className={cn(
                    "px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer",
                    salesStatus === 'Active'
                      ? "bg-accent-red/20 text-accent-red hover:bg-accent-red/30 border border-accent-red/30"
                      : "bg-accent-green text-white hover:bg-accent-green/90 shadow-accent-green/20"
                  )}
                >
                  {isTogglingStatus ? (
                    <span className="text-[10px]">Updating...</span>
                  ) : salesStatus === 'Active' ? (
                    'Go Deactive'
                  ) : (
                    'Go Active'
                  )}
                </button>
              </div>
              <div className="text-[9px] text-text-muted flex items-center justify-between pt-1 border-t border-border-primary/40 font-medium">
                <span>EST 9:30 AM – 6:30 PM</span>
                <span className={cn("font-bold", isSalesWorkingHours() ? "text-accent-green" : "text-text-muted")}>
                  {isSalesWorkingHours() ? 'In Hours' : 'After Hours'}
                </span>
              </div>
            </div>
          )}

          <button
            onClick={toggleTheme}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-text-secondary bg-bg-tertiary hover:bg-border-primary hover:text-text-primary transition-all font-semibold text-sm shadow-sm"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
          </button>

          <div className="flex items-center gap-3 px-1 flex-wrap">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-purple/30 to-accent-blue/30 text-accent-purple flex items-center justify-center font-bold text-lg shadow-inner ring-1 ring-white/10">
              {user?.display_name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-text-primary truncate">{user?.display_name}</p>
              <div className="text-[9px] uppercase tracking-wider font-bold text-white bg-accent-blue/80 ring-1 ring-accent-blue shadow-[0_2px_4px_rgba(0,173,140,0.2)] inline-block px-2 py-0.5 rounded-md mt-1 whitespace-normal leading-tight">
                 {user?.role === 'administrator' ? 'Administrator' : 
                  user?.role === 'jpc_sysadmin' ? 'System Admin' :
                  user?.role === 'jpc_manager' ? 'Auriic Manager' :
                  user?.role === 'jpc_lead_gen' ? 'Lead Gen' :
                  user?.role === 'jpc_sales' ? 'Sales Team' :
                  user?.role === 'jpc_cs' ? 'Compliance Head' :
                  user?.role === 'jpc_compliance_person' ? 'Compliance Person' :
                  user?.role === 'jpc_resume' ? 'Resume Team' :
                  user?.role === 'jpc_recruiter' ? 'Recruiter' :
                  user?.role === 'jpc_marketing' ? 'Marketing Leader (TL)' :
                  user?.role === 'jpc_marketing_support' ? 'Marketing Support' :
                  isProxyUser(user) ? 'Proxy Team' :
                  user?.role === 'candidate' || user?.role === 'jpc_candidate' ? 'Candidate' : ''}
              </div>
            </div>
          </div>
          <button 
            onClick={logout}
            className="w-full text-xs text-center justify-center text-text-secondary hover:text-white hover:bg-accent-red py-2.5 rounded-xl transition-all flex items-center gap-2 font-bold group"
          >
            <LogOut className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Sign Out
          </button>

          <div className="pt-4 border-t border-border-primary flex flex-col items-center gap-2">
            <p className="text-[8px] font-bold text-text-muted uppercase tracking-widest">Powered by</p>
            <img 
              src={theme === 'dark' 
                ? "https://auriic.co/wp-content/uploads/2026/04/Auriic-logo-Header.webp" 
                : "https://auriic.co/wp-content/uploads/2026/05/Auriic_dark_Logo.webp"
              } 
              alt="Auriic Logo" 
              className="h-5 w-auto opacity-50 hover:opacity-100 transition-opacity"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      </aside>
    </>
  );
};
