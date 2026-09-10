import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  X, Calendar, Clock, User as UserIcon, Building, Briefcase, 
  Globe, Mail, Phone, ExternalLink, Link as LinkIcon, Edit3, Save, 
  CheckCircle2, AlertCircle, RefreshCw, FileText
} from 'lucide-react';
import { InterviewSupportRequest, InterviewRound, Candidate, User, InterviewFeedback, ProxyAvailability } from '../types';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { cn, parseLocalTimeToDate } from '../lib/utils';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { handleViewFile } from '../services/fileService';
import { ResumeSubstitutionModal } from './ResumeSubstitutionModal';
import { ProxyAssignmentModal } from './ProxyAssignmentModal';
import { FreeTrialBadge } from './FreeTrialBadge';

interface InterviewDetailsModalProps {
  request: InterviewSupportRequest;
  onClose: () => void;
  rounds: InterviewRound[];
  candidates: Candidate[];
  team: User[];
  feedbacks: InterviewFeedback[];
  availabilities: ProxyAvailability[];
  calendarEvents: any[];
  canEdit: boolean;
}

export const InterviewDetailsModal: React.FC<InterviewDetailsModalProps> = ({
  request,
  onClose,
  rounds,
  candidates,
  team,
  feedbacks,
  availabilities,
  calendarEvents,
  canEdit
}) => {
  const { user: currentUser } = useAuth();
  const { showToast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [substitutionRequest, setSubstitutionRequest] = useState<InterviewSupportRequest | null>(null);
  const [reassignConfig, setReassignConfig] = useState<{ round: InterviewRound } | null>(null);

  const canReassignProxy = currentUser && ['jpc_cs', 'jpc_sysadmin', 'administrator', 'jpc_manager'].includes(currentUser.role);

  // Form states for editing
  const [company, setCompany] = useState(request.interview_company_name);
  const [jobTitle, setJobTitle] = useState(request.job_title);
  const [jobDescription, setJobDescription] = useState(request.job_description || '');
  const [jobLink, setJobLink] = useState(request.job_link || '');
  const [notes, setNotes] = useState(request.notes || '');

  const candidate = candidates.find(c => c.id === request.candidate_id);
  const reqRounds = rounds.filter(r => r.request_id === request.id);
  const recruiter = team.find(u => String(u.id) === String(request.recruiter_id));
  const cs = team.find(u => String(u.id) === String(request.cs_id));

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'jpc_interview_requests', request.id), {
        interview_company_name: company,
        job_title: jobTitle,
        job_description: jobDescription,
        job_link: jobLink,
        notes: notes,
        updated_at: new Date().toISOString()
      });
      showToast('Interview details updated successfully!', 'success');
      setIsEditing(false);
    } catch (e) {
      showToast('Failed to save changes. Please try again.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-bg-secondary w-full max-w-5xl rounded-2xl sm:rounded-[36px] shadow-2xl border border-border-primary overflow-hidden flex flex-col my-4 sm:my-8 max-h-[94vh] sm:max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-5 sm:px-10 py-4 sm:py-8 border-b border-border-primary shrink-0 flex items-center justify-between bg-bg-tertiary">
          <div>
            <span className={cn(
              "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border",
              request.overall_status === 'completed' ? "bg-accent-green/10 text-accent-green border-accent-green/20" :
              request.overall_status === 'live' ? "bg-accent-red/10 text-accent-red border-accent-red/20 animate-pulse" :
              "bg-accent-blue/10 text-accent-blue border-accent-blue/20"
            )}>
              {request.overall_status.replace('_', ' ')}
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-text-primary tracking-tight mt-2 sm:mt-3">
              {isEditing ? 'Edit Interview Details' : `${candidate?.full_name || 'Candidate'}'s Application`}
            </h2>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {canEdit && !isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="px-3.5 sm:px-5 py-2 sm:py-2.5 bg-bg-secondary border border-border-primary hover:border-accent-blue text-xs font-bold text-text-primary rounded-xl transition-all flex items-center gap-1.5 sm:gap-2"
              >
                <Edit3 className="w-3.5 h-3.5 text-accent-blue" />
                <span className="hidden sm:inline">Edit Info</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 sm:p-3 hover:bg-bg-primary rounded-full transition-all border border-border-primary hover:border-text-secondary/20"
            >
              <X className="w-5 h-5 text-text-secondary" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto touch-scroll p-5 sm:p-10 space-y-6 sm:space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Col: Info Brief */}
            <div className="lg:col-span-2 space-y-8">
              {/* Form or Info Block */}
              {isEditing ? (
                <div className="p-8 bg-bg-tertiary rounded-3xl border border-border-primary space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="text-[10px] font-black text-text-muted uppercase tracking-widest block mb-2">Company Name</label>
                      <input
                        type="text"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        className="w-full px-4 py-3 bg-bg-secondary border border-border-primary rounded-xl text-sm outline-none focus:ring-2 focus:ring-accent-blue/20"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-text-muted uppercase tracking-widest block mb-2">Job Title / Designation</label>
                      <input
                        type="text"
                        value={jobTitle}
                        onChange={(e) => setJobTitle(e.target.value)}
                        className="w-full px-4 py-3 bg-bg-secondary border border-border-primary rounded-xl text-sm outline-none focus:ring-2 focus:ring-accent-blue/20"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-widest block mb-2">Job Description (JD)</label>
                    <textarea
                      rows={3}
                      value={jobDescription}
                      onChange={(e) => setJobDescription(e.target.value)}
                      className="w-full px-4 py-3 bg-bg-secondary border border-border-primary rounded-xl text-sm outline-none focus:ring-2 focus:ring-accent-blue/20 resize-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-widest block mb-2">Job Board Link</label>
                    <input
                      type="url"
                      value={jobLink}
                      onChange={(e) => setJobLink(e.target.value)}
                      className="w-full px-4 py-3 bg-bg-secondary border border-border-primary rounded-xl text-sm outline-none focus:ring-2 focus:ring-accent-blue/20"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-widest block mb-2">Additional Instructions / Notes</label>
                    <textarea
                      rows={4}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full px-4 py-3 bg-bg-secondary border border-border-primary rounded-xl text-sm outline-none focus:ring-2 focus:ring-accent-blue/20 resize-none"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      onClick={() => setIsEditing(false)}
                      className="px-5 py-2.5 border border-border-primary hover:bg-bg-secondary rounded-xl text-xs font-bold text-text-secondary transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="px-6 py-2.5 bg-accent-blue hover:bg-accent-blue/90 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-bg-tertiary/40 border border-border-primary/50 rounded-3xl p-8 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 bg-bg-secondary rounded-xl flex items-center justify-center border border-border-primary text-accent-blue shrink-0">
                        <Building className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-[9px] font-black text-text-muted uppercase tracking-widest">Company</span>
                        <p className="text-base font-black text-text-primary mt-0.5">{request.interview_company_name}</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 bg-bg-secondary rounded-xl flex items-center justify-center border border-border-primary text-accent-blue shrink-0">
                        <Briefcase className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-[9px] font-black text-text-muted uppercase tracking-widest">Designation</span>
                        <p className="text-base font-black text-text-primary mt-0.5">{request.job_title}</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 bg-bg-secondary rounded-xl flex items-center justify-center border border-border-primary text-accent-blue shrink-0">
                        <Globe className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-[9px] font-black text-text-muted uppercase tracking-widest">Category Type</span>
                        <p className="text-xs font-bold text-text-secondary mt-1 capitalize">{request.interview_type}</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 bg-bg-secondary rounded-xl flex items-center justify-center border border-border-primary text-accent-blue shrink-0">
                        <LinkIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-[9px] font-black text-text-muted uppercase tracking-widest">Job Description</span>
                        <p className="text-xs mt-1 border-b">
                          {request.job_link ? (
                            <a 
                              href={request.job_link} 
                              target="_blank" 
                              referrerPolicy="no-referrer"
                              className="text-accent-blue hover:underline flex items-center gap-1 font-bold"
                            >
                              Open Job Board <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : 'No Job link provided'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {request.job_description && (
                    <div className="pt-4 border-t border-border-primary">
                      <span className="text-[9px] font-black text-text-muted uppercase tracking-widest block mb-2">Job Description Details</span>
                      <p className="text-xs text-text-secondary leading-relaxed bg-bg-secondary border border-border-primary rounded-2xl p-4 whitespace-pre-wrap">
                        {request.job_description}
                      </p>
                    </div>
                  )}

                  {request.notes && (
                    <div className="pt-4 border-t border-border-primary">
                      <span className="text-[9px] font-black text-text-muted uppercase tracking-widest block mb-1">Instructions & Support Notes</span>
                      <p className="text-xs text-text-secondary leading-relaxed bg-bg-secondary border border-border-primary rounded-2xl p-4 whitespace-pre-wrap">
                        {request.notes}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Rounds Timeline */}
              <div className="space-y-4">
                <h3 className="text-lg font-black text-text-primary tracking-tight">Interview Rounds Roadmap</h3>
                <div className="space-y-4">
                  {reqRounds.map((round, rIndex) => {
                    const matchedFeedback = feedbacks.find(fb => fb.interview_round_id === round.id);
                    const proxyUser = team.find(t => String(t.id) === String(round.proxy_user_id));
                    
                    return (
                      <div 
                        key={round.id}
                        className="bg-bg-secondary border border-border-primary rounded-3xl p-6 transition-all hover:border-border-primary/80 relative"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                          <div className="flex items-center gap-3">
                            <span className="w-8 h-8 rounded-full bg-accent-blue/10 text-accent-blue border border-accent-blue/20 flex items-center justify-center text-xs font-black">
                              {rIndex + 1}
                            </span>
                            <div>
                              <p className="text-sm font-black text-text-primary capitalize">{round.round_label}</p>
                              <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                                Status: {round.status}
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            {round.status === 'completed' ? (
                              <span className="px-3 py-1 bg-accent-green/10 text-accent-green border border-accent-green/20 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Completed
                              </span>
                            ) : (
                              <span className="px-3 py-1 bg-accent-blue/10 text-accent-blue border border-accent-blue/20 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1">
                                <Clock className="w-3 h-3 animate-pulse" /> Pending
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-text-secondary border-t border-border-primary pt-4">
                          <div className="space-y-2">
                            <p className="flex items-center gap-2 font-medium">
                              <Calendar className="w-4 h-4 text-accent-blue shrink-0" />
                              <span className="font-bold text-text-primary">Date & Time:</span>
                              {round.booked_slot_time || round.interview_date 
                                ? parseLocalTimeToDate(round.booked_slot_time || round.interview_date, 'America/New_York').toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' }) + ' EST' 
                                : 'Not scheduled yet'}
                            </p>
                            <p className="flex items-center gap-2 font-medium">
                              <UserIcon className="w-4 h-4 text-accent-blue shrink-0" />
                              <span className="font-bold text-text-primary">Assigned Proxy:</span>
                              {proxyUser?.display_name || 'No proxy assigned'}
                              {canReassignProxy && round.status !== 'completed' && round.status !== 'cancelled' && (
                                <button
                                  onClick={() => setReassignConfig({ round })}
                                  className="ml-3 px-3 py-1 bg-accent-amber/10 hover:bg-accent-amber/20 border border-accent-amber/30 rounded-lg text-[9px] font-black text-accent-amber uppercase tracking-wider transition-all"
                                >
                                  Reassign Proxy
                                </button>
                              )}
                            </p>
                          </div>

                          <div className="space-y-1">
                            {matchedFeedback ? (
                              <div className="p-3 bg-bg-tertiary border border-border-primary rounded-xl">
                                <p className="font-black text-[9px] text-accent-green uppercase tracking-wide flex items-center gap-1 mb-1">
                                  <FileText className="w-3 h-3" /> Feedback Logged
                                </p>
                                <p className="text-[10px] line-clamp-2 text-text-secondary italic">"{matchedFeedback.interview_notes || 'View feedback'}"</p>
                              </div>
                            ) : (
                              <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-1 bg-bg-tertiary p-3 rounded-xl">
                                <AlertCircle className="w-3.5 h-3.5 text-accent-blue" /> Evaluator summary pending
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Col: Personnel Sidebar */}
            <div className="space-y-6">
              {/* Candidate Card */}
              <div className="p-6 bg-bg-tertiary border border-border-primary rounded-3xl space-y-4">
                <span className="text-[9px] font-black text-accent-blue uppercase tracking-[0.2em] block mb-2">Candidate Dossier</span>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-accent-blue/10 border border-accent-blue/25 rounded-2xl flex items-center justify-center text-accent-blue text-sm font-black">
                      {candidate?.full_name?.charAt(0) || <UserIcon className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-black text-text-primary">{candidate?.full_name || 'Candidate Name'}</h4>
                        {candidate?.is_free_trial && (
                          <FreeTrialBadge 
                            size="sm" 
                            startDate={candidate.free_trial_start_date}
                            endDate={candidate.free_trial_end_date}
                          />
                        )}
                      </div>
                      <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mt-0.5">{candidate?.experience_years ? `${candidate.experience_years} Years Exp` : 'Exp level unknown'}</p>
                    </div>
                  </div>

                  <div className="space-y-2.5 text-xs text-text-secondary pt-2 border-t border-border-primary/50">
                    <p className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-text-muted" />
                      <span className="truncate">{candidate?.email || 'N/A'}</span>
                    </p>
                    <p className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-text-muted" />
                      <span>{candidate?.phone || 'N/A'}</span>
                    </p>
                    {candidate?.linkedin_url && (
                      <p className="pt-2">
                        <a 
                          href={candidate.linkedin_url} 
                          target="_blank" 
                          referrerPolicy="no-referrer"
                          className="px-4 py-2 bg-bg-secondary hover:border-accent-blue border border-border-primary rounded-xl text-[10px] font-bold text-accent-blue font-black flex items-center gap-1.5 justify-center transition-all cursor-pointer"
                        >
                          LinkedIn Account Profile <ExternalLink className="w-3 h-3" />
                        </a>
                      </p>
                    )}
                    {(candidate?.resume_url || candidate?.resume_base64) && (
                      <p className="pt-1">
                        <button 
                          onClick={() => handleViewFile(
                            candidate.resume_url || candidate.resume_base64 || '', 
                            candidate.resume_filename || 'resume.pdf'
                          )}
                          className="w-full px-4 py-2 bg-bg-secondary hover:border-accent-purple border border-border-primary rounded-xl text-[10px] font-bold text-accent-purple font-black flex items-center gap-1.5 justify-center transition-all cursor-pointer animate-none"
                        >
                          Candidate Master Resume <ExternalLink className="w-3 h-3" />
                        </button>
                      </p>
                    )}
                    <p className="pt-1">
                      <button 
                        onClick={() => setSubstitutionRequest(request)}
                        className="w-full px-4 py-2 bg-accent-purple/10 hover:border-accent-purple border border-accent-purple/20 rounded-xl text-[10px] font-bold text-accent-purple flex items-center gap-1.5 justify-center transition-all cursor-pointer"
                      >
                         Use Other Resume <FileText className="w-3 h-3" />
                      </button>
                    </p>
                  </div>
                </div>
              </div>

              {/* Support Staff */}
              <div className="p-6 bg-bg-tertiary border border-border-primary rounded-3xl space-y-4">
                <span className="text-[9px] font-black text-accent-purple uppercase tracking-[0.2em] block mb-2">Support Liaison</span>
                
                <div className="space-y-4">
                  <div>
                    <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider block font-black text-accent-purple">Recruiter Owner</span>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="w-6 h-6 rounded-full bg-accent-purple/10 text-accent-purple text-[10px] font-extrabold flex items-center justify-center">
                        R
                      </div>
                      <span className="text-xs font-black text-text-primary">{recruiter?.display_name || 'System Auto'}</span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider block font-black text-accent-amber">Customer Service</span>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="w-6 h-6 rounded-full bg-accent-amber/10 text-accent-amber text-[10px] font-extrabold flex items-center justify-center">
                        CS
                      </div>
                      <span className="text-xs font-black text-text-primary">{cs?.display_name || 'Support Queue'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* End of content */}
        {substitutionRequest && (
          <ResumeSubstitutionModal
            isOpen={!!substitutionRequest}
            onClose={() => setSubstitutionRequest(null)}
            request={substitutionRequest}
          />
        )}
        {reassignConfig && (
          <ProxyAssignmentModal
            isOpen={!!reassignConfig}
            onClose={() => setReassignConfig(null)}
            round={reassignConfig.round}
            request={request}
            team={team}
            allRounds={rounds}
            allAvailabilities={availabilities}
            allCalendarEvents={calendarEvents}
            onSuccess={() => {
              showToast('Proxy reassigned successfully!', 'success');
              setReassignConfig(null);
            }}
          />
        )}
      </motion.div>
    </div>
  );
};
