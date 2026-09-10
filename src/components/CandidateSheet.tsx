import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  Briefcase, 
  GraduationCap, 
  Calendar,
  ExternalLink,
  ClipboardList
} from 'lucide-react';
import { Candidate } from '../types';
import { cn } from '../lib/utils';
import { FreeTrialBadge } from './FreeTrialBadge';

interface CandidateSheetProps {
  candidate: Candidate | null;
  isOpen: boolean;
  onClose: () => void;
}

export const CandidateSheet: React.FC<CandidateSheetProps> = ({ candidate, isOpen, onClose }) => {
  if (!candidate && isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && candidate && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
          />
          
          {/* Sheet */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-full max-w-xl bg-bg-secondary border-l border-border-primary shadow-2xl z-[101] overflow-y-auto touch-scroll pb-safe"
          >
            {/* Header */}
            <div className="sticky top-0 bg-bg-secondary/80 backdrop-blur-md z-10 p-6 border-b border-border-primary flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-accent-blue/10 rounded-2xl flex items-center justify-center text-accent-blue font-bold text-xl">
                  {candidate.full_name.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl font-bold text-text-primary tracking-tight">{candidate.full_name}</h2>
                    {candidate.is_free_trial && (
                      <FreeTrialBadge 
                        startDate={candidate.free_trial_start_date}
                        endDate={candidate.free_trial_end_date}
                        size="sm"
                        showDaysRemaining={true}
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="px-2 py-0.5 bg-bg-tertiary text-text-secondary text-[10px] font-bold rounded-lg uppercase tracking-wider border border-border-primary">
                      {candidate.id}
                    </span>
                    <span className={cn(
                      "px-2 py-0.5 text-[10px] font-bold rounded-lg uppercase tracking-wider",
                      candidate.current_stage === 'not_interested' ? "bg-accent-red/10 text-accent-red" : "bg-accent-green/10 text-accent-green"
                    )}>
                      {candidate.current_stage.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-bg-tertiary rounded-xl transition-colors"
              >
                <X className="w-6 h-6 text-text-secondary" />
              </button>
            </div>

            {/* Content */}
            <div className="p-8 space-y-8">
              {/* Core Details */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Email Address</p>
                  <div className="flex items-center gap-2 text-text-primary">
                    <Mail className="w-4 h-4 text-text-muted" />
                    <span className="text-sm">{candidate.email || 'N/A'}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Phone Number</p>
                  <div className="flex items-center gap-2 text-text-primary">
                    <Phone className="w-4 h-4 text-text-muted" />
                    <span className="text-sm">{candidate.phone || 'N/A'}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">WhatsApp</p>
                  <div className="flex items-center gap-2 text-text-primary">
                    <Phone className="w-4 h-4 text-accent-green" />
                    <span className="text-sm">{candidate.whatsapp || 'N/A'}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Location</p>
                  <div className="flex items-center gap-2 text-text-primary">
                    <MapPin className="w-4 h-4 text-text-muted" />
                    <span className="text-sm">{candidate.location || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Professional */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-text-primary border-b border-border-primary pb-2 flex items-center gap-2">
                  <Briefcase className="w-4 h-4" />
                  Professional Profile
                </h3>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Job Interest</p>
                    <p className="text-sm text-text-primary">{candidate.job_interest || 'N/A'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Experience</p>
                    <p className="text-sm text-text-primary">{candidate.experience_years ? `${candidate.experience_years} Years` : 'N/A'}</p>
                  </div>
                  <div className="col-span-2 space-y-1">
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Skills</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {candidate.skills ? candidate.skills.split(',').map((skill, i) => (
                        <span key={i} className="px-3 py-1 bg-bg-tertiary text-text-primary text-xs rounded-lg border border-border-primary">
                          {skill.trim()}
                        </span>
                      )) : <span className="text-sm text-text-muted italic">No skills listed</span>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Education */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-text-primary border-b border-border-primary pb-2 flex items-center gap-2">
                  <GraduationCap className="w-4 h-4" />
                  Education
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <div>
                      <p className="text-sm font-bold text-text-primary">{candidate.degree || 'Degree'}</p>
                      <p className="text-xs text-text-secondary">{candidate.university || 'University'}</p>
                    </div>
                    <p className="text-xs font-bold text-text-muted">{candidate.graduation_year}</p>
                  </div>
                </div>
              </div>

              {/* System Info */}
              <div className="bg-bg-tertiary/50 rounded-2xl p-6 border border-border-primary space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-accent-purple/10 rounded-xl flex items-center justify-center text-accent-purple">
                    <ClipboardList className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-text-primary">System Information</h4>
                    <p className="text-[10px] text-text-muted uppercase tracking-wider">Internal tracking data</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div>
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Lead Source</p>
                    <p className="text-xs text-text-primary font-medium">{candidate.lead_source}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Created At</p>
                    <p className="text-xs text-text-primary font-medium">{new Date(candidate.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-3">
                <button 
                  onClick={() => {
                    window.location.hash = `#candidate?id=${candidate.id}`;
                    onClose();
                  }}
                  className="flex items-center justify-center gap-2 w-full py-4 bg-accent-blue text-white font-bold rounded-2xl hover:bg-accent-blue/90 transition-all shadow-lg shadow-accent-blue/20"
                >
                  <User className="w-5 h-5" />
                  View Full CRM Profile
                </button>

                {candidate.linkedin_url && (
                  <a 
                    href={candidate.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-4 bg-[#0A66C2] text-white font-bold rounded-2xl hover:bg-[#0A66C2]/90 transition-all shadow-lg shadow-[#0A66C2]/20 border border-white/10"
                  >
                    <ExternalLink className="w-5 h-5" />
                    Visit LinkedIn Profile
                  </a>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
