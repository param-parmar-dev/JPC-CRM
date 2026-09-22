import React from 'react';
import { cn } from '../../lib/utils';

export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn("animate-pulse bg-bg-tertiary/60 rounded-xl", className)} />
);

export const TableSkeleton: React.FC<{
  rows?: number;
  title?: string;
  subtitle?: string;
  hasFilters?: boolean;
}> = ({ rows = 6, title, subtitle, hasFilters = true }) => {
  return (
    <div className="space-y-6 sm:space-y-8 animate-pulse w-full">
      {/* Optional Header */}
      {title && (
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-text-primary tracking-tight">{title}</h1>
            {subtitle && <p className="text-xs sm:text-sm text-text-secondary mt-1">{subtitle}</p>}
          </div>
          {hasFilters && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="h-10 w-28 bg-bg-secondary rounded-xl border border-border-primary" />
              <div className="h-10 w-36 bg-bg-secondary rounded-xl border border-border-primary" />
              <div className="h-10 w-32 bg-accent-blue/20 rounded-xl" />
            </div>
          )}
        </div>
      )}

      {/* Table Container */}
      <div className="bg-bg-secondary rounded-2xl sm:rounded-3xl border border-border-primary overflow-hidden shadow-sm">
        {/* Table Head */}
        <div className="px-6 py-4 border-b border-border-primary flex items-center gap-4 bg-bg-tertiary/40">
          <div className="h-4 w-40 bg-bg-tertiary rounded" />
          <div className="h-4 w-24 bg-bg-tertiary rounded hidden md:block" />
          <div className="h-4 w-32 bg-bg-tertiary rounded hidden lg:block" />
          <div className="h-4 w-28 bg-bg-tertiary rounded ml-auto" />
        </div>

        {/* Rows */}
        <div className="divide-y divide-border-primary/60">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="px-6 py-4.5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-bg-tertiary shrink-0" />
              <div className="space-y-2 flex-1 min-w-0">
                <div className="h-4 w-48 bg-bg-tertiary rounded" />
                <div className="h-3 w-32 bg-bg-tertiary/60 rounded" />
              </div>
              <div className="h-6 w-20 bg-bg-tertiary/70 rounded-full hidden sm:block" />
              <div className="h-6 w-24 bg-bg-tertiary/70 rounded-full hidden md:block" />
              <div className="h-8 w-20 bg-bg-tertiary rounded-xl shrink-0 ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const DashboardSkeleton: React.FC = () => {
  return (
    <div className="space-y-6 sm:space-y-10 animate-pulse w-full">
      {/* Top Banner / Announcement Placeholder */}
      <div className="h-24 bg-bg-secondary rounded-2xl border border-border-primary p-6 flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-accent-blue/10 shrink-0" />
        <div className="space-y-2 flex-1">
          <div className="h-4 w-48 bg-bg-tertiary rounded" />
          <div className="h-3 w-80 bg-bg-tertiary/60 rounded" />
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-bg-secondary p-5 sm:p-6 rounded-2xl sm:rounded-3xl border border-border-primary space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-3 w-20 bg-bg-tertiary rounded" />
              <div className="w-8 h-8 rounded-xl bg-bg-tertiary" />
            </div>
            <div className="h-8 w-24 bg-bg-tertiary rounded-lg" />
            <div className="h-2 w-full bg-bg-tertiary/50 rounded" />
          </div>
        ))}
      </div>

      {/* Charts / Panels Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-bg-secondary p-6 rounded-3xl border border-border-primary space-y-4">
          <div className="flex items-center justify-between">
            <div className="h-5 w-44 bg-bg-tertiary rounded" />
            <div className="h-8 w-28 bg-bg-tertiary rounded-xl" />
          </div>
          <div className="h-64 bg-bg-tertiary/40 rounded-2xl w-full" />
        </div>

        <div className="bg-bg-secondary p-6 rounded-3xl border border-border-primary space-y-4">
          <div className="h-5 w-36 bg-bg-tertiary rounded" />
          <div className="h-64 bg-bg-tertiary/40 rounded-2xl w-full flex items-center justify-center">
            <div className="w-36 h-36 rounded-full border-8 border-bg-tertiary" />
          </div>
        </div>
      </div>
    </div>
  );
};

export const BoardSkeleton: React.FC<{ columns?: number }> = ({ columns = 5 }) => {
  return (
    <div className="space-y-6 animate-pulse w-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="h-8 w-44 bg-bg-secondary rounded-xl" />
          <div className="h-4 w-72 bg-bg-secondary/60 rounded" />
        </div>
        <div className="h-10 w-44 bg-bg-secondary rounded-xl border border-border-primary" />
      </div>

      {/* Board Columns */}
      <div className="flex gap-4 overflow-x-hidden pb-4">
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="min-w-[280px] w-[300px] bg-bg-secondary/60 rounded-2xl border border-border-primary p-4 space-y-4 shrink-0">
            <div className="flex items-center justify-between pb-2 border-b border-border-primary/50">
              <div className="h-4 w-28 bg-bg-tertiary rounded" />
              <div className="h-5 w-7 bg-bg-tertiary rounded-full" />
            </div>
            <div className="space-y-3">
              {[1, 2, 3].map(j => (
                <div key={j} className="bg-bg-secondary rounded-xl p-4 border border-border-primary/70 space-y-3 shadow-sm">
                  <div className="h-4 w-36 bg-bg-tertiary rounded" />
                  <div className="h-3 w-24 bg-bg-tertiary/60 rounded" />
                  <div className="flex items-center justify-between pt-1">
                    <div className="h-5 w-16 bg-bg-tertiary rounded-full" />
                    <div className="h-4 w-12 bg-bg-tertiary rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
