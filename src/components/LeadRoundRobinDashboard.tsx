import React, { useState, useEffect, useMemo } from 'react';
import { User, LeadRoundRobinConfig, Candidate } from '../types';
import { 
  getLeadRoundRobinConfig, 
  subscribeToLeadRoundRobin, 
  updateLeadRoundRobinConfig, 
  getEligibleSalesUsers,
  subscribeToCollection,
  updateSalesAvailability
} from '../services/storage';
import { useToast } from '../contexts/ToastContext';
import { 
  RotateCw, Users, CheckCircle2, Clock, ArrowRight, 
  UserCheck, Shield, AlertCircle, Sparkles, UserX,
  ChevronUp, ChevronDown, RefreshCw, BarChart2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface LeadRoundRobinDashboardProps {
  allUsers: User[];
  isAdminOrManager: boolean;
}

export const LeadRoundRobinDashboard: React.FC<LeadRoundRobinDashboardProps> = ({
  allUsers,
  isAdminOrManager
}) => {
  const { showToast } = useToast();
  const [config, setConfig] = useState<LeadRoundRobinConfig | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const unsubConfig = subscribeToLeadRoundRobin((cfg) => {
      setConfig(cfg);
    });

    const unsubCandidates = subscribeToCollection<Candidate>('jpc_candidates', (data) => {
      setCandidates(data.filter(c => !c.deleted_at));
    }, 500);

    return () => {
      unsubConfig();
      unsubCandidates();
    };
  }, []);

  const allSalesReps = useMemo(() => {
    return allUsers.filter(u => u.role === 'jpc_sales' && !u.deleted_at);
  }, [allUsers]);

  const eligibleReps = useMemo(() => {
    if (!config) return [];
    return getEligibleSalesUsers(allUsers, config);
  }, [allUsers, config]);

  // Compute next rep in line
  const nextRepInfo = useMemo(() => {
    if (!config || eligibleReps.length === 0) return { nextRep: null, nextIndex: 0 };

    let nextIndex = 0;
    if (config.last_assigned_user_id) {
      const lastIdx = eligibleReps.findIndex(u => String(u.id) === String(config.last_assigned_user_id));
      if (lastIdx !== -1) {
        nextIndex = (lastIdx + 1) % eligibleReps.length;
      } else {
        nextIndex = ((config.last_assigned_index ?? -1) + 1) % eligibleReps.length;
      }
    }
    return {
      nextRep: eligibleReps[nextIndex] || eligibleReps[0],
      nextIndex
    };
  }, [config, eligibleReps]);

  // Sales rep stats
  const repStats = useMemo(() => {
    const counts: Record<string, { total: number; today: number; lastAssigned?: string }> = {};

    allSalesReps.forEach(rep => {
      counts[String(rep.id)] = { total: 0, today: 0 };
    });

    const todayStr = new Date().toISOString().split('T')[0];

    candidates.forEach(cand => {
      if (cand.assigned_sales && counts[String(cand.assigned_sales)]) {
        counts[String(cand.assigned_sales)].total += 1;
        if (cand.created_at && cand.created_at.startsWith(todayStr)) {
          counts[String(cand.assigned_sales)].today += 1;
        }
      }
    });

    return counts;
  }, [allSalesReps, candidates]);

  const toggleExcludeUser = async (userId: string | number) => {
    if (!isAdminOrManager || !config) return;
    setIsUpdating(true);
    try {
      const strId = String(userId);
      const currentExcluded = (config.excluded_user_ids || []).map(id => String(id));
      let newExcluded: string[];
      if (currentExcluded.includes(strId)) {
        newExcluded = currentExcluded.filter(id => id !== strId);
        showToast('Sales rep restored to round-robin rotation', 'success');
      } else {
        newExcluded = [...currentExcluded, strId];
        showToast('Sales rep paused from round-robin rotation', 'info');
      }

      await updateLeadRoundRobinConfig({
        excluded_user_ids: newExcluded
      });
    } catch (err) {
      console.error('Error toggling user exclusion:', err);
      showToast('Failed to update rotation settings', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const toggleSalesAvailability = async (userId: string | number, currentStatus?: string) => {
    if (!isAdminOrManager) return;
    setIsUpdating(true);
    try {
      const next = currentStatus === 'Active' ? 'Deactive' : 'Active';
      await updateSalesAvailability(next, userId);
      showToast(`Sales rep status updated to ${next}`, 'success');
    } catch (err) {
      console.error('Error toggling availability:', err);
      showToast('Failed to update sales availability', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const toggleEnabled = async () => {
    if (!isAdminOrManager || !config) return;
    setIsUpdating(true);
    try {
      const newEnabled = !config.enabled;
      await updateLeadRoundRobinConfig({ enabled: newEnabled });
      showToast(newEnabled ? 'Round-Robin automation enabled' : 'Round-Robin automation paused', 'success');
    } catch (err) {
      console.error('Error toggling round robin state:', err);
      showToast('Failed to update automation setting', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const moveOrder = async (index: number, direction: 'up' | 'down') => {
    if (!isAdminOrManager || !config || eligibleReps.length < 2) return;
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= eligibleReps.length) return;

    setIsUpdating(true);
    try {
      const newOrder = [...eligibleReps];
      const temp = newOrder[index];
      newOrder[index] = newOrder[targetIdx];
      newOrder[targetIdx] = temp;

      await updateLeadRoundRobinConfig({
        custom_order_user_ids: newOrder.map(u => String(u.id))
      });
      showToast('Rotation order updated', 'success');
    } catch (err) {
      console.error('Error reordering reps:', err);
      showToast('Failed to reorder rotation', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const resetRotation = async () => {
    if (!isAdminOrManager || !config) return;
    setIsUpdating(true);
    try {
      await updateLeadRoundRobinConfig({
        last_assigned_index: -1,
        last_assigned_user_id: null,
        last_assigned_at: null
      });
      showToast('Round-robin rotation reset to first sales representative', 'success');
    } catch (err) {
      console.error('Error resetting round robin:', err);
      showToast('Failed to reset rotation', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  if (!config) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="w-10 h-10 border-4 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Top Banner / Summary Card */}
      <div className="bg-gradient-to-r from-accent-blue/10 via-accent-purple/10 to-accent-teal/10 border border-border-primary rounded-3xl p-6 lg:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-accent-blue/20 flex items-center justify-center text-accent-blue shadow-inner">
                <RotateCw className="w-6 h-6 animate-spin-slow" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-text-primary tracking-tight">
                    Continuous Round-Robin Lead Assignment
                  </h2>
                  <span className={cn(
                    "px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider",
                    config.enabled ? "bg-accent-teal/20 text-accent-teal" : "bg-accent-amber/20 text-accent-amber"
                  )}>
                    {config.enabled ? "Active" : "Paused"}
                  </span>
                </div>
                <p className="text-sm text-text-secondary mt-0.5">
                  Automatically rotates new incoming leads sequentially among sales team members (1st → Salesperson A, 2nd → Salesperson B, 3rd → Salesperson C).
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {isAdminOrManager && (
              <>
                <button
                  onClick={toggleEnabled}
                  disabled={isUpdating}
                  className={cn(
                    "px-5 py-2.5 font-bold text-sm rounded-xl transition-all flex items-center gap-2 border",
                    config.enabled 
                      ? "bg-bg-secondary text-text-primary border-border-primary hover:bg-bg-tertiary" 
                      : "bg-accent-teal text-white border-accent-teal shadow-lg shadow-accent-teal/20"
                  )}
                >
                  <RefreshCw className="w-4 h-4" />
                  {config.enabled ? "Pause Automation" : "Enable Automation"}
                </button>
                <button
                  onClick={resetRotation}
                  disabled={isUpdating}
                  className="px-4 py-2.5 bg-bg-secondary hover:bg-bg-tertiary border border-border-primary text-text-secondary hover:text-text-primary font-bold text-sm rounded-xl transition-all flex items-center gap-1.5"
                >
                  <RotateCw className="w-4 h-4" />
                  Reset Pointer
                </button>
              </>
            )}
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-border-primary/60">
          <div className="bg-bg-secondary/70 p-4 rounded-2xl border border-border-primary/40">
            <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Next in Line</span>
            <div className="text-base font-extrabold text-accent-blue mt-1 truncate flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-accent-blue shrink-0" />
              <span>{nextRepInfo.nextRep ? nextRepInfo.nextRep.display_name : 'None available'}</span>
            </div>
          </div>
          <div className="bg-bg-secondary/70 p-4 rounded-2xl border border-border-primary/40">
            <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Active in Rotation</span>
            <div className="text-base font-extrabold text-text-primary mt-1 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-accent-teal shrink-0" />
              <span>{eligibleReps.length} of {allSalesReps.length} Reps</span>
            </div>
          </div>
          <div className="bg-bg-secondary/70 p-4 rounded-2xl border border-border-primary/40">
            <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Total Leads Assigned</span>
            <div className="text-base font-extrabold text-text-primary mt-1 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-accent-green shrink-0" />
              <span>{config.total_leads_assigned || 0}</span>
            </div>
          </div>
          <div className="bg-bg-secondary/70 p-4 rounded-2xl border border-border-primary/40">
            <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Last Assigned At</span>
            <div className="text-base font-extrabold text-text-primary mt-1 truncate flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-accent-amber shrink-0" />
              <span>
                {config.last_assigned_at 
                  ? new Date(config.last_assigned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                  : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Rotation Queue Flow Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <div>
            <h3 className="text-lg font-bold text-text-primary">Active Rotation Sequence</h3>
            <p className="text-xs text-text-muted">The precise order in which upcoming leads will be assigned.</p>
          </div>
          <span className="text-xs text-text-muted">
            Continuous Circular Cycle (1 → {eligibleReps.length} → 1)
          </span>
        </div>

        {eligibleReps.length === 0 ? (
          <div className="p-8 text-center bg-bg-secondary rounded-2xl border border-border-primary">
            <AlertCircle className="w-8 h-8 text-accent-amber mx-auto mb-2" />
            <p className="font-bold text-text-primary">No active sales reps in rotation</p>
            <p className="text-xs text-text-muted mt-1">Check leave status or re-enable excluded sales reps below.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {eligibleReps.map((rep, idx) => {
              const isNext = nextRepInfo.nextRep && String(nextRepInfo.nextRep.id) === String(rep.id);
              const isLast = config.last_assigned_user_id && String(config.last_assigned_user_id) === String(rep.id);
              const stats = repStats[String(rep.id)] || { total: 0, today: 0 };

              return (
                <motion.div
                  key={rep.id}
                  layout
                  className={cn(
                    "p-5 rounded-2xl border transition-all relative overflow-hidden flex flex-col justify-between",
                    isNext 
                      ? "bg-accent-blue/10 border-accent-blue shadow-lg shadow-accent-blue/10 ring-2 ring-accent-blue/20" 
                      : "bg-bg-secondary border-border-primary hover:border-border-secondary"
                  )}
                >
                  {isNext && (
                    <div className="absolute top-0 right-0 bg-accent-blue text-white text-[10px] font-extrabold uppercase px-3 py-1 rounded-bl-xl flex items-center gap-1 shadow-sm">
                      <Sparkles className="w-3 h-3" />
                      Next In Line
                    </div>
                  )}

                  <div>
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm",
                        isNext ? "bg-accent-blue text-white" : "bg-bg-tertiary text-text-primary"
                      )}>
                        {idx + 1}
                      </div>
                      <div className="truncate pr-6">
                        <h4 className="font-bold text-text-primary truncate">{rep.display_name}</h4>
                        <span className="text-[11px] text-text-muted truncate block">@{rep.username}</span>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-border-primary/50 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-[10px] font-bold text-text-muted uppercase block">Assigned Today</span>
                        <span className="font-extrabold text-text-primary text-sm">{stats.today} leads</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-bold text-text-muted uppercase block">Total Leads</span>
                        <span className="font-extrabold text-accent-blue text-sm">{stats.total}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-border-primary/40 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      {isLast && (
                        <span className="px-2 py-0.5 rounded-md bg-accent-teal/15 text-accent-teal text-[10px] font-bold">
                          Last Assigned
                        </span>
                      )}
                    </div>

                    {isAdminOrManager && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => moveOrder(idx, 'up')}
                          disabled={idx === 0 || isUpdating}
                          className="p-1 rounded-lg hover:bg-bg-tertiary text-text-secondary disabled:opacity-30"
                          title="Move earlier in rotation"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => moveOrder(idx, 'down')}
                          disabled={idx === eligibleReps.length - 1 || isUpdating}
                          className="p-1 rounded-lg hover:bg-bg-tertiary text-text-secondary disabled:opacity-30"
                          title="Move later in rotation"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => toggleExcludeUser(rep.id)}
                          disabled={isUpdating}
                          className="p-1 rounded-lg hover:bg-accent-red/10 text-accent-red"
                          title="Pause from rotation"
                        >
                          <UserX className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* All Sales Reps Table & Roster Status */}
      <div className="bg-bg-secondary border border-border-primary rounded-3xl overflow-hidden">
        <div className="p-6 border-b border-border-primary flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-text-primary">Sales Team Round-Robin Roster</h3>
            <p className="text-xs text-text-muted">Manage active participants, leave status, and rotation availability.</p>
          </div>
          <div className="text-xs text-text-secondary">
            {allSalesReps.length} Registered Sales Representatives
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-border-primary bg-bg-tertiary/40">
                <th className="py-3.5 px-6 font-bold text-text-secondary text-xs uppercase tracking-wider">Representative</th>
                <th className="py-3.5 px-6 font-bold text-text-secondary text-xs uppercase tracking-wider">Availability</th>
                <th className="py-3.5 px-6 font-bold text-text-secondary text-xs uppercase tracking-wider">Rotation Status</th>
                <th className="py-3.5 px-6 font-bold text-text-secondary text-xs uppercase tracking-wider">Leave Status</th>
                <th className="py-3.5 px-6 font-bold text-text-secondary text-xs uppercase tracking-wider">Leads Today</th>
                <th className="py-3.5 px-6 font-bold text-text-secondary text-xs uppercase tracking-wider">All-Time Leads</th>
                {isAdminOrManager && (
                  <th className="py-3.5 px-6 font-bold text-text-secondary text-xs uppercase tracking-wider text-right">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-primary/60">
              {allSalesReps.map((rep) => {
                const isExcluded = (config.excluded_user_ids || []).map(id => String(id)).includes(String(rep.id));
                const isOnLeave = !!rep.is_on_leave;
                const isNext = nextRepInfo.nextRep && String(nextRepInfo.nextRep.id) === String(rep.id);
                const stats = repStats[String(rep.id)] || { total: 0, today: 0 };

                let statusBadge = (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-accent-teal/15 text-accent-teal">
                    <UserCheck className="w-3.5 h-3.5" />
                    In Rotation
                  </span>
                );

                if (isOnLeave) {
                  statusBadge = (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-accent-amber/15 text-accent-amber">
                      <Clock className="w-3.5 h-3.5" />
                      On Leave (Auto-Skipped)
                    </span>
                  );
                } else if (isExcluded) {
                  statusBadge = (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-accent-red/15 text-accent-red">
                      <UserX className="w-3.5 h-3.5" />
                      Paused by Admin
                    </span>
                  );
                }

                return (
                  <tr key={rep.id} className="hover:bg-bg-tertiary/20 transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-accent-blue/10 text-accent-blue font-bold flex items-center justify-center text-xs">
                          {rep.display_name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-text-primary flex items-center gap-2">
                            <span>{rep.display_name}</span>
                            {isNext && (
                              <span className="text-[10px] font-extrabold bg-accent-blue text-white px-2 py-0.5 rounded-full">
                                NEXT
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-text-muted">{rep.email || rep.username}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "w-2.5 h-2.5 rounded-full transition-all",
                          rep.sales_availability_status === 'Active'
                            ? "bg-accent-green shadow-[0_0_6px_rgba(34,197,94,0.6)] animate-pulse"
                            : "bg-slate-400"
                        )} />
                        <span className={cn(
                          "font-bold text-xs",
                          rep.sales_availability_status === 'Active' ? "text-accent-green" : "text-text-muted"
                        )}>
                          {rep.sales_availability_status === 'Active' ? 'Active' : 'Deactive'}
                        </span>
                        {isAdminOrManager && (
                          <button
                            type="button"
                            onClick={() => toggleSalesAvailability(rep.id, rep.sales_availability_status)}
                            disabled={isUpdating}
                            className={cn(
                              "text-[10px] font-bold px-2 py-0.5 rounded border transition-colors ml-1 cursor-pointer",
                              rep.sales_availability_status === 'Active'
                                ? "bg-accent-red/10 text-accent-red border-accent-red/30 hover:bg-accent-red/20"
                                : "bg-accent-green/10 text-accent-green border-accent-green/30 hover:bg-accent-green/20"
                            )}
                          >
                            {rep.sales_availability_status === 'Active' ? 'Deactivate' : 'Activate'}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-6">{statusBadge}</td>
                    <td className="py-4 px-6 text-xs">
                      {isOnLeave ? (
                        <span className="text-accent-amber font-semibold">
                          On Leave {rep.leave_return_date ? `(Returns ${rep.leave_return_date})` : ''}
                        </span>
                      ) : (
                        <span className="text-text-muted">Available</span>
                      )}
                    </td>
                    <td className="py-4 px-6 font-bold text-text-primary">{stats.today}</td>
                    <td className="py-4 px-6 font-bold text-accent-blue">{stats.total}</td>
                    {isAdminOrManager && (
                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={() => toggleExcludeUser(rep.id)}
                          disabled={isUpdating}
                          className={cn(
                            "px-3 py-1.5 rounded-xl font-bold text-xs transition-colors border",
                            isExcluded
                              ? "bg-accent-teal/10 text-accent-teal border-accent-teal/30 hover:bg-accent-teal/20"
                              : "bg-bg-tertiary text-text-secondary border-border-primary hover:text-accent-red hover:bg-accent-red/10"
                          )}
                        >
                          {isExcluded ? 'Include in Rotation' : 'Pause from Rotation'}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Auto-Assignments History */}
      {config.recent_assignments && config.recent_assignments.length > 0 && (
        <div className="bg-bg-secondary border border-border-primary rounded-3xl overflow-hidden">
          <div className="p-6 border-b border-border-primary">
            <h3 className="text-lg font-bold text-text-primary">Recent Round-Robin Assignments</h3>
            <p className="text-xs text-text-muted">Live audit log of automatically routed leads.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-border-primary bg-bg-tertiary/40">
                  <th className="py-3 px-6 font-bold text-text-secondary text-xs uppercase tracking-wider">Candidate</th>
                  <th className="py-3 px-6 font-bold text-text-secondary text-xs uppercase tracking-wider">Assigned Sales Rep</th>
                  <th className="py-3 px-6 font-bold text-text-secondary text-xs uppercase tracking-wider">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-primary/50 text-xs">
                {config.recent_assignments.slice(0, 15).map((log, idx) => (
                  <tr key={idx} className="hover:bg-bg-tertiary/20 transition-colors">
                    <td className="py-3 px-6 font-bold text-text-primary">{log.candidate_name || 'Candidate'}</td>
                    <td className="py-3 px-6">
                      <span className="font-bold text-accent-blue flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5" />
                        {log.assigned_to_name}
                      </span>
                    </td>
                    <td className="py-3 px-6 text-text-muted">
                      {log.assigned_at ? new Date(log.assigned_at).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
