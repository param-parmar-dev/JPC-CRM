import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { subscribeToCollection, updateFollowUp, logActivity, handleFirestoreError, OperationType } from '../services/storage';
import { STAGES } from '../constants';
import { Clock, CheckCircle2, Calendar, User, ArrowRight, AlertCircle, Search, Filter } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { FollowUp, Candidate, Stage } from '../types';
import { useDebounce } from '../lib/hooks';
import { db } from '../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { FreeTrialBadge } from '../components/FreeTrialBadge';

export const FollowUps: React.FC = () => {
  const { user, isAuthReady } = useAuth();
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('pending');

  useEffect(() => {
    if (!isAuthReady || !user) return;

    // 1. Fetch Follow-ups (Filter by creator if not manager/admin)
    let fQuery = query(collection(db, 'jpc_followups'));
    
    if (user.role !== 'administrator' && user.role !== 'jpc_sysadmin' && user.role !== 'jpc_manager') {
      fQuery = query(fQuery, where('created_by', '==', String(user.id)));
    }

    const unsubFollowUps = onSnapshot(fQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FollowUp));
      setFollowUps(data);
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'jpc_followups');
    });

    // 2. Fetch candidates assigned to user (or all if manager/admin)
    let cQuery = query(collection(db, 'jpc_candidates'));
    if (user.role === 'jpc_recruiter') {
      cQuery = query(cQuery, where('assigned_recruiter', '==', String(user.id)));
    } else if (user.role === 'jpc_marketing') {
      cQuery = query(cQuery, where('assigned_marketing_leader', '==', String(user.id)));
    }

    const unsubCandidates = onSnapshot(cQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Candidate));
      setCandidates(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'jpc_candidates');
    });

    return () => {
      unsubFollowUps();
      unsubCandidates();
    };
  }, [isAuthReady, user?.id, user?.role]);

  const candidatesMap = useMemo(() => {
    const map = new Map<string, Candidate>();
    candidates.forEach(c => map.set(c.id, c));
    return map;
  }, [candidates]);

  const today = new Date().toISOString().split('T')[0];

  const filteredFollowUps = useMemo(() => {
    // Subscription already handles initial filtering by user
    let list = followUps;

    if (filter === 'pending') list = list.filter(f => !f.done);
    if (filter === 'done') list = list.filter(f => f.done);

    const searchLower = debouncedSearch.toLowerCase();

    return list.filter(f => {
      const candidate = candidatesMap.get(f.candidate_id);
      if (!candidate) return false;
      
      const matchesSearch = candidate.full_name.toLowerCase().includes(searchLower) ||
                          f.note.toLowerCase().includes(searchLower);
      
      return matchesSearch;
    }).sort((a, b) => new Date(a.followup_date).getTime() - new Date(b.followup_date).getTime());
  }, [followUps, candidatesMap, user, filter, debouncedSearch]);

  const handleMarkDone = async (f: FollowUp) => {
    await updateFollowUp({ ...f, done: true });
    await logActivity(f.candidate_id, 'Follow-up completed', `Note: ${f.note}`, user?.id || null);
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center p-20">
        <div className="w-12 h-12 border-4 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-text-primary tracking-tight">Follow-Ups</h1>
          <p className="text-text-secondary mt-1">
            {user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager' 
              ? 'Manage all team follow-ups and reminders.' 
              : 'Track your personal follow-ups and reminders.'}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
            <input 
              type="text" 
              placeholder="Search follow-ups..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-bg-secondary border border-border-primary rounded-2xl pl-12 pr-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors shadow-sm"
            />
          </div>
          <div className="flex bg-bg-secondary border border-border-primary rounded-2xl p-1">
            {(['all', 'pending', 'done'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-xl transition-all",
                  filter === f ? "bg-accent-blue text-white shadow-lg shadow-accent-blue/20" : "text-text-muted hover:text-text-primary"
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence mode="popLayout">
          {filteredFollowUps.map((f, i) => {
            const candidate = candidatesMap.get(f.candidate_id);
            const isOverdue = !f.done && f.followup_date < today;
            const isToday = !f.done && f.followup_date === today;

            return (
              <motion.div
                key={f.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: i * 0.05 }}
                className={cn(
                  "bg-bg-secondary rounded-3xl border p-6 flex flex-col shadow-sm hover:shadow-md transition-all group",
                  isOverdue ? "border-accent-red/30 bg-accent-red/5" : isToday ? "border-accent-amber/30 bg-accent-amber/5" : "border-border-primary"
                )}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest",
                    f.done ? "bg-accent-green/10 text-accent-green" : isOverdue ? "bg-accent-red/10 text-accent-red" : "bg-accent-amber/10 text-accent-amber"
                  )}>
                    {f.done ? 'Completed' : isOverdue ? 'Overdue' : isToday ? 'Due Today' : 'Upcoming'}
                  </div>
                  <div className="flex items-center gap-2 text-text-muted text-xs font-medium">
                    <Calendar className="w-3.5 h-3.5" />
                    {f.followup_date}
                  </div>
                </div>

                <div className="flex-1 space-y-4">
                  <div 
                    onClick={() => window.location.hash = `#candidate?id=${candidate?.id}`}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-text-primary group-hover:text-accent-blue transition-colors truncate">{candidate?.full_name || 'Unknown Candidate'}</h3>
                      {candidate?.is_free_trial && (
                        <FreeTrialBadge 
                          startDate={candidate.free_trial_start_date}
                          endDate={candidate.free_trial_end_date}
                          size="sm"
                        />
                      )}
                    </div>
                    <p className="text-xs text-text-muted mt-1 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STAGES[f.stage as Stage]?.color }} />
                      {STAGES[f.stage as Stage]?.label}
                    </p>
                  </div>

                  <div className="p-4 bg-bg-tertiary/50 rounded-2xl border border-border-primary/50">
                    <p className="text-sm text-text-secondary italic line-clamp-3">"{f.note}"</p>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-border-primary flex items-center justify-between">
                  {f.done ? (
                    <div className="flex items-center gap-2 text-accent-green">
                      <CheckCircle2 className="w-4 h-4" />
                      <span className="text-xs font-bold uppercase">Done</span>
                    </div>
                  ) : (
                    <button 
                      onClick={() => handleMarkDone(f)}
                      className="flex items-center gap-2 text-accent-blue hover:text-accent-blue/80 transition-colors"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span className="text-xs font-bold uppercase">Mark Done</span>
                    </button>
                  )}
                  <a 
                    href={`#candidate?id=${candidate?.id}`}
                    className="p-2 bg-bg-tertiary rounded-xl text-text-muted hover:text-accent-blue transition-all"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </a>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {filteredFollowUps.length === 0 && (
        <div className="py-20 text-center bg-bg-secondary rounded-3xl border border-border-primary border-dashed">
          <Clock className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h3 className="text-lg font-bold text-text-primary">No follow-ups found</h3>
          <p className="text-text-secondary mt-1">You're all caught up!</p>
        </div>
      )}
    </div>
  );
};
