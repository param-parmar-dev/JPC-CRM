import React from 'react';
import { LayoutDashboard, Users, TrendingUp, Video, ChevronRight, Sparkles } from 'lucide-react';
import { cn } from '../../lib/utils';

interface AurrumFlowHeaderProps {
  activeStep: 'dashboard' | 'candidates' | 'sales' | 'interviews';
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}

const FLOW_STEPS = [
  {
    id: 'dashboard' as const,
    step: '01',
    label: 'Aurrum Dashboard',
    hash: '#aurrum-dashboard',
    icon: LayoutDashboard,
  },
  {
    id: 'candidates' as const,
    step: '02',
    label: 'Candidates',
    hash: '#aurrum-candidates',
    icon: Users,
  },
  {
    id: 'sales' as const,
    step: '03',
    label: 'Sales',
    hash: '#aurrum-sales',
    icon: TrendingUp,
  },
  {
    id: 'interviews' as const,
    step: '04',
    label: 'Interview Support',
    hash: '#aurrum-interviews',
    icon: Video,
  },
];

export const AurrumFlowHeader: React.FC<AurrumFlowHeaderProps> = ({
  activeStep,
  title,
  subtitle,
  actions,
}) => {
  return (
    <div className="space-y-5">
      {/* Flow Stepper Bar */}
      <div className="bg-bg-secondary border border-border-primary rounded-2xl p-2 sm:p-3 shadow-sm">
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto scrollbar-hide">
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[11px] font-black uppercase tracking-widest shrink-0">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Aurrum Careers</span>
          </div>

          {FLOW_STEPS.map((item, idx) => {
            const Icon = item.icon;
            const isActive = activeStep === item.id;
            return (
              <React.Fragment key={item.id}>
                <a
                  href={item.hash}
                  className={cn(
                    'flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap shrink-0',
                    isActive
                      ? 'bg-accent-blue text-white shadow-md shadow-accent-blue/20'
                      : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
                  )}
                >
                  <span
                    className={cn(
                      'text-[10px] font-black px-1.5 py-0.5 rounded-md',
                      isActive ? 'bg-white/20 text-white' : 'bg-bg-tertiary text-text-muted'
                    )}
                  >
                    {item.step}
                  </span>
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </a>
                {idx < FLOW_STEPS.length - 1 && (
                  <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Page Title & Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
              Aurrum Careers Workspace
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-text-primary tracking-tight mt-1.5">
            {title}
          </h1>
          <p className="text-xs sm:text-sm text-text-secondary mt-1">{subtitle}</p>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
    </div>
  );
};
