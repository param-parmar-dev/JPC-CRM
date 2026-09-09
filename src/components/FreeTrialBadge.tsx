import React from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';

interface FreeTrialBadgeProps {
  startDate?: string | null;
  endDate?: string | null;
  size?: 'sm' | 'md' | 'lg';
  showDaysRemaining?: boolean;
  className?: string;
}

export const FreeTrialBadge: React.FC<FreeTrialBadgeProps> = ({
  endDate,
  size = 'sm',
  showDaysRemaining = false,
  className
}) => {
  let daysRemaining: number | null = null;
  if (endDate) {
    try {
      const end = new Date(endDate);
      const now = new Date();
      end.setHours(23, 59, 59, 999);
      const diff = end.getTime() - now.getTime();
      daysRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    } catch {
      daysRemaining = null;
    }
  }

  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-[9px]',
    md: 'px-2 py-0.5 text-[10px]',
    lg: 'px-3 py-1 text-xs'
  };

  const isExpired = daysRemaining !== null && daysRemaining === 0;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-black uppercase tracking-wider rounded-full whitespace-nowrap shadow-sm transition-all",
        isExpired 
          ? "bg-rose-500/10 text-rose-500 border border-rose-500/30"
          : "bg-gradient-to-r from-amber-500/15 to-orange-500/15 text-amber-500 border border-amber-500/30",
        sizeClasses[size],
        className
      )}
      title={
        endDate 
          ? `15-Day Free Trial (Ends ${new Date(endDate).toLocaleDateString()})` 
          : '15-Day Free Trial Active'
      }
    >
      <Sparkles className={cn(size === 'lg' ? 'w-3.5 h-3.5' : 'w-2.5 h-2.5', isExpired ? 'text-rose-500' : 'text-amber-500 animate-pulse')} />
      <span>{isExpired ? 'Trial Expired' : 'Free Trial'}</span>
      {showDaysRemaining && daysRemaining !== null && !isExpired && (
        <span className="font-bold lowercase text-[9px] bg-amber-500/20 px-1 py-0.2 rounded-full ml-0.5">
          {daysRemaining}d left
        </span>
      )}
    </span>
  );
};
