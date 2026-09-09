import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Link as LinkIcon, Calendar, Send, AlertCircle, Clock, ExternalLink } from 'lucide-react';
import { Candidate, Application } from '../types';
import { generateId, logActivity, handleFirestoreError, OperationType } from '../services/storage';
import { db } from '../firebase';
import { doc, setDoc, query, collection, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { cn, getEasternDate, formatDisplayDate } from '../lib/utils';
import { FreeTrialBadge } from './FreeTrialBadge';

interface TrackJobSheetProps {
  candidate: Candidate | null;
  isOpen: boolean;
  onClose: () => void;
  applications?: Application[]; // Optional now as we fetch internal
}

export const TrackJobSheet: React.FC<TrackJobSheetProps> = ({
  candidate,
  isOpen,
  onClose,
  applications: externalApplications = [],
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [internalApplications, setInternalApplications] = useState<Application[]>([]);
  const [jobLink, setJobLink] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [status, setStatus] = useState('Applied');
  const [notes, setNotes] = useState('');
  const [appliedAt, setAppliedAt] = useState(getEasternDate());
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch applications for the candidate specifically to ensure duplicate checks work
  // and load remains small globally.
  useEffect(() => {
    if (!candidate?.id || !isOpen) {
      setInternalApplications([]);
      return;
    }

    const q = query(
      collection(db, 'jpc_applications'),
      where('candidate_id', '==', candidate.id)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Application));
      setInternalApplications(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `jpc_applications/candidate/${candidate.id}`);
    });

    return () => unsub();
  }, [candidate?.id, isOpen]);

  // Use either external (if provided and candidate matches) or internal apps
  const applications = externalApplications.length > 0 && externalApplications[0].candidate_id === candidate?.id
    ? externalApplications 
    : internalApplications;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!candidate || !jobLink) return;

    const isDuplicate = applications
      .filter(app => app.candidate_id === candidate.id)
      .some(
        app =>
          app.job_link.trim().toLowerCase() === jobLink.trim().toLowerCase()
      );

    if (isDuplicate) {
      showToast(
        'DUPLICATE LINK! This job has already been applied for this candidate.',
        'error'
      );
      return;
    }

    setIsSubmitting(true);

    const id = generateId();

    const newApp: Application = {
      id,
      candidate_id: candidate.id,
      recruiter_id: String(user?.id),
      job_link: jobLink,
      job_title: jobTitle,
      company_name: companyName || 'N/A',
      status,
      notes,
      sheet_type: candidate.job_interest,
      applied_at: appliedAt,
      created_at: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'jpc_applications', id), newApp);

      await logActivity(
        candidate.id,
        'Job Applied',
        `Applied to ${jobTitle} at ${companyName} via Link: ${jobLink} by ${user?.display_name}`,
        user?.id || null
      );

      showToast('Application tracked successfully', 'success');

      setJobLink('');
      setJobTitle('');
      setCompanyName('');
      setNotes('');
      setAppliedAt(getEasternDate());

      onClose();
    } catch (error) {
      console.error('Save error:', error);
      showToast('Failed to save application', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && candidate && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[70]"
          />

          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-full max-w-md bg-bg-secondary shadow-2xl z-[80] overflow-hidden flex flex-col border-l border-border-primary"
          >
            <div className="p-6 border-b border-border-primary flex items-center justify-between bg-bg-primary">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-accent-blue/10 flex items-center justify-center text-accent-blue font-bold">
                  {candidate.full_name.charAt(0)}
                </div>

                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-bold text-text-primary tracking-tight">
                      Track Application
                    </h2>
                    {candidate.is_free_trial && (
                      <FreeTrialBadge 
                        size="sm" 
                        startDate={candidate.free_trial_start_date} 
                        endDate={candidate.free_trial_end_date} 
                      />
                    )}
                  </div>
                  <p className="text-xs text-text-muted">
                    For {candidate.full_name}
                  </p>
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-2 hover:bg-bg-tertiary rounded-xl transition-all"
              >
                <X className="w-6 h-6 text-text-secondary" />
              </button>
            </div>

            <div className="px-6 py-4 bg-bg-tertiary/30 border-b border-border-primary">
              <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                <Clock className="w-3 h-3" />
                Recent Applications
              </h3>

              <div className="space-y-2 max-h-[120px] overflow-y-auto pr-2 no-scrollbar">
                {applications
                  .filter(app => app.candidate_id === candidate.id)
                  .sort(
                    (a, b) =>
                      new Date(b.created_at).getTime() -
                      new Date(a.created_at).getTime()
                  )
                  .slice(0, 3)
                  .map(app => (
                    <div
                      key={app.id}
                      className="p-2 bg-bg-secondary border border-border-primary rounded-lg flex items-center justify-between gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-accent-blue truncate font-mono">
                          {app.job_link}
                        </p>

                        <p className="text-[9px] text-text-muted mt-0.5">
                          {formatDisplayDate(app.applied_at)}
                        </p>
                      </div>

                      <a
                        href={app.job_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 text-text-muted hover:text-accent-blue"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  ))}

                {applications.filter(app => app.candidate_id === candidate.id)
                  .length === 0 && (
                  <p className="text-[10px] text-text-muted italic py-2 text-center">
                    No previous applications tracked.
                  </p>
                )}
              </div>
            </div>

            <form
              onSubmit={handleSubmit}
              className="flex-1 p-6 space-y-8 overflow-y-auto no-scrollbar"
            >
              <div className="space-y-6">
                <div className="bg-accent-blue/5 border border-accent-blue/20 rounded-2xl p-4 flex items-start gap-4">
                  <AlertCircle className="w-5 h-5 text-accent-blue shrink-0 mt-0.5" />

                  <div>
                    <p className="text-sm font-bold text-text-primary">
                      Direct Application Tracking
                    </p>

                    <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                      Tracking is automatically assigned to you. Just paste the job link to register the application for{' '}
                      <strong>{candidate.full_name}</strong>.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-text-muted uppercase tracking-widest flex items-center gap-2">
                    <LinkIcon className="w-3.5 h-3.5" />
                    Job URL / Link
                  </label>

                  <input
                    type="text"
                    value={jobLink}
                    onChange={e => setJobLink(e.target.value)}
                    placeholder="https://linkedin.com/jobs/view/..."
                    className="w-full bg-bg-tertiary border border-border-primary rounded-2xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-text-muted uppercase tracking-widest">
                      Job Title
                    </label>

                    <input
                      type="text"
                      value={jobTitle}
                      onChange={e => setJobTitle(e.target.value)}
                      placeholder="e.g. Software Engineer"
                      className="w-full bg-bg-tertiary border border-border-primary rounded-2xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-text-muted uppercase tracking-widest">
                      Company Name
                    </label>

                    <input
                      type="text"
                      value={companyName}
                      onChange={e => setCompanyName(e.target.value)}
                      placeholder="e.g. Google"
                      className="w-full bg-bg-tertiary border border-border-primary rounded-2xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-text-muted uppercase tracking-widest">
                      Status
                    </label>

                    <select
                      value={status}
                      onChange={e => setStatus(e.target.value)}
                      className="w-full bg-bg-tertiary border border-border-primary rounded-2xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors"
                    >
                      <option value="Applied">Applied</option>
                      <option value="Interviewing">Interviewing</option>
                      <option value="Offer">Offer</option>
                      <option value="Rejected">Rejected</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-text-muted uppercase tracking-widest flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5" />
                      Applied Date
                    </label>

                    <input
                      type="date"
                      value={appliedAt}
                      onChange={e => setAppliedAt(e.target.value)}
                      className="w-full bg-bg-tertiary border border-border-primary rounded-2xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-text-muted uppercase tracking-widest">
                    Notes
                  </label>

                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Any additional notes..."
                    className="w-full bg-bg-tertiary border border-border-primary rounded-2xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors min-h-[80px] resize-none"
                  />
                </div>
              </div>

              {jobLink &&
                applications
                  .filter(app => app.candidate_id === candidate.id)
                  .some(
                    app =>
                      app.job_link.trim().toLowerCase() ===
                      jobLink.trim().toLowerCase()
                  ) && (
                  <div className="p-4 bg-accent-red/5 border border-accent-red/20 rounded-2xl flex items-center gap-3 text-accent-red">
                    <AlertCircle className="w-5 h-5" />
                    <p className="text-xs font-bold uppercase tracking-wider">
                      Duplicate link for this candidate!
                    </p>
                  </div>
                )}
            </form>

            <div className="p-6 border-t border-border-primary bg-bg-primary">
              <button
                type="submit"
                onClick={handleSubmit}
                disabled={isSubmitting || !jobLink}
                className={cn(
                  'w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg',
                  isSubmitting || !jobLink
                    ? 'bg-bg-tertiary text-text-muted cursor-not-allowed'
                    : 'bg-accent-blue text-white hover:bg-accent-blue/90 shadow-accent-blue/20'
                )}
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}

                Submit Application
              </button>

              <button
                onClick={onClose}
                className="w-full mt-3 py-3 text-sm font-bold text-text-muted hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
