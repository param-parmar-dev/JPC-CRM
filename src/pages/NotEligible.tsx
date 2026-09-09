import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { subscribeToCollection, saveCandidate, logActivity } from '../services/storage';
import { UserX, Search, Trash2, RotateCcw, AlertCircle, Clock, Calendar, Phone, Mail } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Candidate, User } from '../types';
import { canUserAccessCandidate } from '../lib/permissions';
import { FreeTrialBadge } from '../components/FreeTrialBadge';

export const NotEligible: React.FC = () => {
  const { user, isAuthReady } = useAuth();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isAuthReady) return;
    const unsub = subscribeToCollection<Candidate>('jpc_candidates', (data) => {
      setCandidates(data.filter(c => c.current_stage === 'not_eligible'));
      setIsLoading(false);
    });
    const unsubUsers = subscribeToCollection<User>('jpc_users', (data) => {
      setAllUsers(data);
    });
    return () => {
      unsub();
      unsubUsers();
    };
  }, [isAuthReady]);

  const filteredCandidates = useMemo(() => {
    return candidates.filter(c => {
      if (!canUserAccessCandidate(c, user, allUsers)) return false;

      return (
        (c.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.phone || '').includes(search) ||
        (c.email || '').toLowerCase().includes(search.toLowerCase())
      );
    });
  }, [candidates, search, user, allUsers]);

  const handleRestore = async (candidate: Candidate) => {
    const updated: Candidate = {
      ...candidate,
      current_stage: 'lead_generation',
      not_eligible_at: null,
      updated_at: new Date().toISOString()
    };
    await saveCandidate(updated, user?.id ? String(user.id) : null);
    await logActivity(candidate.id, 'Candidate restored', 'Restored from Not Eligible to Lead Generation.', user?.id ? String(user.id) : null);
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-text-primary tracking-tight">Not Eligible</h1>
          <p className="text-text-secondary mt-1">Candidates who do not meet the eligibility criteria.</p>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
          <input 
            type="text" 
            placeholder="Search candidates..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-bg-secondary border border-border-primary rounded-2xl pl-12 pr-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors shadow-sm"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence mode="popLayout">
          {filteredCandidates.map((candidate, i) => {
            const neDate = candidate.not_eligible_at ? new Date(candidate.not_eligible_at) : new Date();

            return (
              <motion.div
                key={candidate.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: i * 0.05 }}
                className="bg-bg-secondary rounded-3xl border border-border-primary p-6 flex flex-col shadow-sm hover:shadow-md transition-all group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-bg-tertiary flex items-center justify-center text-text-secondary font-bold text-sm">
                    {candidate.full_name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div className="flex items-center gap-2 text-accent-red text-xs font-bold uppercase tracking-widest bg-accent-red/10 px-3 py-1 rounded-full">
                    <UserX className="w-3.5 h-3.5" />
                    Not Eligible
                  </div>
                </div>

                <div className="flex-1 space-y-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-text-primary group-hover:text-accent-blue transition-colors">{candidate.full_name}</h3>
                      {candidate.is_free_trial && (
                        <FreeTrialBadge 
                          size="sm" 
                          startDate={candidate.free_trial_start_date} 
                          endDate={candidate.free_trial_end_date} 
                        />
                      )}
                    </div>
                    <p className="text-[10px] font-mono text-text-muted mt-0.5">{candidate.id}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-text-secondary flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {candidate.phone}
                      </span>
                      <span className="w-1 h-1 bg-text-muted rounded-full" />
                      <span className="text-xs text-text-secondary flex items-center gap-1">
                        <Mail className="w-3 h-3" /> {candidate.email || '—'}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 bg-bg-tertiary/50 rounded-2xl border border-border-primary/50">
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-1">Marked Ineligible On</p>
                    <p className="text-sm text-text-primary font-medium flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-text-muted" />
                      {neDate.toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-border-primary flex items-center gap-3">
                  {(user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager' || user?.role === 'jpc_lead_gen' || user?.role === 'jpc_sales') && (
                    <button 
                      onClick={() => handleRestore(candidate)}
                      className="flex-1 flex items-center justify-center gap-2 py-2 bg-accent-blue text-white text-xs font-bold rounded-xl hover:bg-accent-blue/90 transition-all shadow-lg shadow-accent-blue/20"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Restore
                    </button>
                  )}
                  <button 
                    onClick={() => window.location.hash = `#candidate?id=${candidate.id}`}
                    className="p-2 bg-bg-tertiary rounded-xl text-text-muted hover:text-accent-blue transition-all"
                  >
                    <AlertCircle className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {filteredCandidates.length === 0 && (
        <div className="py-20 text-center bg-bg-secondary rounded-3xl border border-border-primary border-dashed">
          <UserX className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h3 className="text-lg font-bold text-text-primary">No ineligible candidates</h3>
          <p className="text-text-secondary mt-1">All candidates meet the current criteria!</p>
        </div>
      )}
    </div>
  );
};
