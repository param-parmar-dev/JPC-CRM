import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { subscribeToCollection } from '../services/storage';
import { STAGES } from '../constants';
import { Search, Filter, X, Package, Phone, Mail, MapPin, Calendar, Users, ArrowRight, MoreVertical, Edit2, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { Candidate, Stage, User } from '../types';
import { useDebounce } from '../lib/hooks';
import { canUserAccessCandidate } from '../lib/permissions';
import { db } from '../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { FreeTrialBadge } from '../components/FreeTrialBadge';

const STAGE_ENTRIES = Object.entries(STAGES).filter(
  ([key]) => key !== 'not_interested' && key !== 'not_eligible' && key !== 'application_tracking'
);

export const Pipeline: React.FC = () => {
  const { user, isAuthReady } = useAuth();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [entityFilter, setEntityFilter] = useState<'all' | 'sivium' | 'recruiter' | 'normal'>('all');

  useEffect(() => {
    if (!isAuthReady || !user) return;
    
    // 1. Fetch relevant candidates based on role
    let cQuery = query(collection(db, 'jpc_candidates'));
    
    if (user.role === 'jpc_recruiter') {
      cQuery = query(cQuery, where('assigned_recruiter', '==', String(user.id)));
    } else if (user.role === 'jpc_marketing') {
      cQuery = query(cQuery, where('assigned_marketing_leader', '==', String(user.id)));
    }

    const unsub = onSnapshot(cQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Candidate));
      setCandidates(data.filter(c => c.current_stage !== 'not_interested' && c.current_stage !== 'not_eligible'));
      setIsLoading(false);
    }, (error) => {
      console.error('Pipeline candidates fetch error:', error);
      setIsLoading(false);
    });

    const unsubUsers = subscribeToCollection<User>('jpc_users', (data) => {
      setAllUsers(data);
    }, 500);

    return () => {
      unsub();
      unsubUsers();
    };
  }, [isAuthReady, user?.id, user?.role]);

  const groupedCandidates = useMemo(() => {
    const groups: Record<string, Candidate[]> = {};
    
    candidates.forEach(c => {
      // Role-based visibility check using permissions engine
      if (!canUserAccessCandidate(c, user, allUsers)) return;

      const searchLower = debouncedSearch.toLowerCase();
      const matchesSearch = (c.full_name || '').toLowerCase().includes(searchLower) ||
        (c.phone || '').includes(debouncedSearch) ||
        (c.email || '').toLowerCase().includes(searchLower);
      
      if (!matchesSearch) return;

      const matchesEntity = entityFilter === 'all' || 
        (entityFilter === 'normal' && (!c.marketing_entity || c.marketing_entity.length === 0)) ||
        (c.marketing_entity && c.marketing_entity.includes(entityFilter as any));
      
      if (!matchesEntity) return;

      if (!groups[c.current_stage]) {
        groups[c.current_stage] = [];
      }
      groups[c.current_stage].push(c);
    });

    return groups;
  }, [candidates, debouncedSearch, user, entityFilter, allUsers]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center p-20">
        <div className="w-12 h-12 border-4 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
      </div>
    );
  }

  const scrollToStage = (stageKey: string) => {
    const el = document.getElementById(`stage-col-${stageKey}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    }
  };

  return (
    <div className="h-full flex flex-col space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-text-primary tracking-tight">Pipeline Board</h1>
          <p className="text-xs sm:text-sm text-text-secondary mt-1">Track candidates through the recruitment lifecycle.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <select
            value={entityFilter}
            onChange={e => setEntityFilter(e.target.value as any)}
            className="bg-bg-secondary border border-border-primary rounded-xl sm:rounded-2xl px-4 py-2.5 sm:py-3 text-xs sm:text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors shadow-sm cursor-pointer"
          >
            <option value="all">All Entities</option>
            <option value="sivium">SIVIUM Only</option>
            <option value="recruiter">Recruiter Only</option>
            <option value="normal">Normal (No Entity)</option>
          </select>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input 
              type="text" 
              placeholder="Search candidates..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-bg-secondary border border-border-primary rounded-xl sm:rounded-2xl pl-10 pr-4 py-2.5 sm:py-3 text-xs sm:text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors shadow-sm"
            />
          </div>
        </div>
      </div>

      {/* Mobile Stage Quick-Jump Bar (md:hidden) */}
      <div className="flex md:hidden overflow-x-auto touch-scroll gap-2 py-1 scrollbar-hide -mx-1 px-1">
        {STAGE_ENTRIES.map(([key, stage]) => {
          const count = groupedCandidates[key]?.length || 0;
          return (
            <button
              key={key}
              onClick={() => scrollToStage(key)}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-bg-secondary border border-border-primary rounded-xl text-xs font-bold text-text-secondary hover:text-text-primary hover:border-accent-blue transition-all"
            >
              <span>{stage.icon}</span>
              <span className="truncate max-w-[100px]">{stage.label.split('. ')[1] || stage.label}</span>
              <span className="px-1.5 py-0.2 bg-bg-tertiary rounded-full text-[10px] text-text-muted">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto pb-6 snap-x snap-mandatory touch-scroll scrollbar-hide">
        <div className="flex gap-4 sm:gap-6 h-full min-w-max pb-4">
          {STAGE_ENTRIES.map(([key, stage]) => {
            const stageCandidates = groupedCandidates[key] || [];
            return (
              <div 
                key={key} 
                id={`stage-col-${key}`}
                className="w-[85vw] sm:w-80 shrink-0 snap-start flex flex-col bg-bg-secondary/30 rounded-2xl sm:rounded-3xl border border-border-primary/50 overflow-hidden shadow-sm"
              >
                <div className="p-3.5 sm:p-4 border-b border-border-primary flex items-center justify-between bg-bg-secondary/50 backdrop-blur-sm sticky top-0 z-10">
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-bg-tertiary flex items-center justify-center text-base sm:text-lg shrink-0">
                      {stage.icon}
                    </div>
                    <h3 className="font-bold text-text-primary text-xs sm:text-sm tracking-tight truncate">{stage.label}</h3>
                  </div>
                  <span className="px-2 py-0.5 bg-bg-tertiary border border-border-primary rounded-lg text-[10px] font-bold text-text-muted uppercase shrink-0">
                    {stageCandidates.length}
                  </span>
                </div>
                
                <div className="flex-1 p-3 sm:p-4 space-y-3 sm:space-y-4 overflow-y-auto custom-scrollbar max-h-[65vh] sm:max-h-[70vh]">
                  <AnimatePresence mode="popLayout">
                    {stageCandidates.map((candidate) => (
                      <motion.div
                        key={candidate.id}
                        layout
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="bg-bg-secondary p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border border-border-primary shadow-sm hover:shadow-md hover:border-accent-blue transition-all group cursor-pointer relative"
                        onClick={() => window.location.hash = `#candidate?id=${candidate.id}`}
                      >
                        <div className="flex items-start justify-between mb-2 sm:mb-3">
                          <div className="truncate pr-6">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h4 className="font-bold text-text-primary text-xs sm:text-sm group-hover:text-accent-blue transition-colors truncate">
                                {candidate.full_name}
                              </h4>
                              {candidate.is_free_trial && (
                                <FreeTrialBadge 
                                  startDate={candidate.free_trial_start_date}
                                  endDate={candidate.free_trial_end_date}
                                  size="sm"
                                />
                              )}
                            </div>
                            <p className="text-[10px] font-mono text-text-muted mt-0.5">{candidate.id}</p>
                          </div>
                          <div className="absolute right-3 top-3">
                            <MoreVertical className="w-4 h-4 text-text-muted group-hover:text-text-secondary transition-colors" />
                          </div>
                        </div>
                        
                        <div className="space-y-1.5 sm:space-y-2">
                          <div className="flex items-center gap-2 text-xs text-text-secondary">
                            <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="truncate">{candidate.phone}</span>
                          </div>
                          {candidate.package_name && (
                            <div className="flex items-center gap-2 text-xs text-text-secondary">
                              <Package className="w-3.5 h-3.5 flex-shrink-0" />
                              <span className="truncate">{candidate.package_name}</span>
                            </div>
                          )}
                        </div>

                        <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-border-primary flex items-center justify-between">
                          <div className="flex -space-x-2">
                            <div className="w-6 h-6 rounded-full bg-bg-tertiary border-2 border-bg-secondary flex items-center justify-center text-[8px] font-bold text-text-muted">
                              {candidate.full_name[0]}
                            </div>
                          </div>
                          <p className="text-[10px] font-bold text-text-muted uppercase">
                            {new Date(candidate.updated_at).toLocaleDateString()}
                          </p>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {stageCandidates.length === 0 && (
                    <div className="h-28 sm:h-32 border-2 border-dashed border-border-primary rounded-xl sm:rounded-2xl flex items-center justify-center">
                      <p className="text-xs text-text-muted font-medium">No candidates</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

