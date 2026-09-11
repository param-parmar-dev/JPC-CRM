import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Trello, 
  Users, 
  Clock, 
  Menu, 
  User as UserIcon, 
  TrendingUp,
  FileText
} from 'lucide-react';
import { cn } from '../lib/utils';
import { User } from '../types';
import { subscribeToCollection } from '../services/storage';

interface MobileBottomNavProps {
  currentHash: string;
  onOpenMenu: () => void;
  user: User | null;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentHash,
  onOpenMenu,
  user
}) => {
  const [followUpsCount, setFollowUpsCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToCollection<any>('jpc_followups', (data) => {
      const today = new Date().toISOString().split('T')[0];
      const personal = user.role === 'administrator' || user.role === 'jpc_manager'
        ? data
        : data.filter(f => f.created_by === user.id);
      const pendingCount = personal.filter(f => !f.done && f.followup_date <= today).length;
      setFollowUpsCount(pendingCount);
    });
    return () => unsub();
  }, [user]);

  if (!user) return null;

  const isCandidate = user.role === 'candidate' || user.role === 'jpc_candidate';

  const navItems = isCandidate
    ? [
        { label: 'Dashboard', hash: '#dashboard', icon: LayoutDashboard },
        { label: 'Profile', hash: `#candidate?id=${user.candidate_id}`, icon: UserIcon },
        { label: 'Receipt', hash: '#receipt', icon: FileText },
      ]
    : [
        { label: 'Home', hash: '#dashboard', icon: LayoutDashboard },
        { 
          label: (user.role === 'jpc_lead_gen' || user.role === 'jpc_sales') ? 'CRM' : 'Pipeline', 
          hash: (user.role === 'jpc_lead_gen') ? '#crm-dashboard' : '#pipeline', 
          icon: (user.role === 'jpc_lead_gen') ? TrendingUp : Trello 
        },
        { label: 'Candidates', hash: '#candidates', icon: Users },
        { 
          label: 'Follow-Ups', 
          hash: '#followups', 
          icon: Clock, 
          badge: followUpsCount 
        },
      ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-bg-secondary/95 backdrop-blur-xl border-t border-border-primary pb-safe flex items-center justify-around px-1 py-1 shadow-[0_-4px_20px_rgba(0,0,0,0.25)] md:hidden">
      {navItems.map((item) => {
        const isActive = currentHash.startsWith(item.hash);
        return (
          <a
            key={item.hash}
            href={item.hash}
            className={cn(
              "flex flex-col items-center justify-center py-1.5 px-2.5 rounded-xl transition-all relative flex-1 min-w-0 max-w-[72px] text-center",
              isActive 
                ? "text-accent-blue font-bold" 
                : "text-text-muted hover:text-text-primary"
            )}
          >
            <div className="relative">
              <item.icon className={cn(
                "w-5 h-5 transition-transform",
                isActive && "scale-110 text-accent-blue"
              )} />
              {item.badge !== undefined && item.badge > 0 && (
                <span className="absolute -top-1.5 -right-2.5 bg-accent-amber text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full ring-2 ring-bg-secondary leading-none flex items-center justify-center min-w-[16px] h-4">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </div>
            <span className={cn(
              "text-[10px] tracking-tight mt-1 truncate w-full",
              isActive ? "font-bold text-accent-blue" : "font-medium text-text-muted"
            )}>
              {item.label}
            </span>
          </a>
        );
      })}

      {/* Menu Drawer Button */}
      <button
        onClick={onOpenMenu}
        className="flex flex-col items-center justify-center py-1.5 px-2.5 rounded-xl text-text-muted hover:text-text-primary transition-all flex-1 min-w-0 max-w-[72px] text-center"
        aria-label="Open full menu"
      >
        <Menu className="w-5 h-5" />
        <span className="text-[10px] font-medium tracking-tight mt-1 truncate w-full">
          Menu
        </span>
      </button>
    </nav>
  );
};
