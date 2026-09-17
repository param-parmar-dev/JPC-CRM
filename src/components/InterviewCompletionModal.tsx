import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { 
  X, 
  Briefcase, 
  UserCheck, 
  Calendar, 
  FileText, 
  AlertCircle, 
  Send, 
  Loader2,
  Building,
  DollarSign,
  MapPin,
  CheckCircle2
} from 'lucide-react';
import { Candidate, User, InterviewOfferRequest } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { 
  createInterviewOfferRequest, 
  updateCandidate, 
  logActivity, 
  addNotification, 
  generateId, 
  now 
} from '../services/storage';

interface InterviewCompletionModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidate: Candidate;
  teamUsers?: User[];
  defaultValues?: {
    company_name?: string;
    job_title?: string;
    round_label?: string;
    interview_date?: string;
    proxy_user_id?: string | null;
    proxy_person_name?: string;
    offered_package?: string;
  };
  onSuccess: () => void;
}

export const InterviewCompletionModal: React.FC<InterviewCompletionModalProps> = ({
  isOpen,
  onClose,
  candidate,
  teamUsers = [],
  defaultValues,
  onSuccess
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State: Proxy Information
  const [selectedProxyId, setSelectedProxyId] = useState<string>('');
  const [proxyPersonName, setProxyPersonName] = useState<string>('');
  const [proxyAttended, setProxyAttended] = useState<'yes' | 'no' | 'n/a'>('yes');
  const [proxySupportNotes, setProxySupportNotes] = useState<string>('');

  // Form State: Interview Details
  const [companyName, setCompanyName] = useState<string>('');
  const [jobTitle, setJobTitle] = useState<string>('');
  const [roundLabel, setRoundLabel] = useState<string>('Technical Round');
  const [interviewDate, setInterviewDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [interviewTime, setInterviewTime] = useState<string>('');
  const [interviewMode, setInterviewMode] = useState<string>('Zoom');
  const [offeredPackage, setOfferedPackage] = useState<string>('');
  const [offeredLocation, setOfferedLocation] = useState<string>('Remote');
  const [expectedJoiningDate, setExpectedJoiningDate] = useState<string>('');

  // Form State: Feedback & Remarks
  const [feedbackAndRemarks, setFeedbackAndRemarks] = useState<string>('');
  const [questionsAsked, setQuestionsAsked] = useState<string>('');
  const [technicalRemarks, setTechnicalRemarks] = useState<string>('');
  const [recommendationStatus, setRecommendationStatus] = useState<'recommended_for_offer' | 'strong_hire' | 'conditional_offer'>('recommended_for_offer');
  const [additionalNotes, setAdditionalNotes] = useState<string>('');

  // Filter proxy users from team
  const proxyUsers = useMemo(() => {
    return teamUsers.filter(u => u.role === 'jpc_proxy');
  }, [teamUsers]);

  // Prepopulate when opened
  useEffect(() => {
    if (isOpen) {
      if (defaultValues?.company_name) setCompanyName(defaultValues.company_name);
      if (defaultValues?.job_title) setJobTitle(defaultValues.job_title);
      if (defaultValues?.round_label) setRoundLabel(defaultValues.round_label);
      if (defaultValues?.interview_date) setInterviewDate(defaultValues.interview_date);
      if (defaultValues?.offered_package) setOfferedPackage(defaultValues.offered_package);

      if (defaultValues?.proxy_user_id) {
        setSelectedProxyId(defaultValues.proxy_user_id);
        const match = teamUsers.find(u => String(u.id) === String(defaultValues.proxy_user_id));
        if (match) setProxyPersonName(match.display_name);
      } else if (defaultValues?.proxy_person_name) {
        setProxyPersonName(defaultValues.proxy_person_name);
      }
    }
  }, [isOpen, defaultValues, teamUsers, candidate]);

  // Handle Proxy Selection from Dropdown
  const handleProxySelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedProxyId(val);
    if (val === 'custom') {
      setProxyPersonName('');
    } else if (val === 'none') {
      setProxyPersonName('No Proxy (Candidate Self)');
      setProxyAttended('n/a');
    } else {
      const match = teamUsers.find(u => String(u.id) === val);
      if (match) {
        setProxyPersonName(match.display_name);
        setProxyAttended('yes');
      }
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validations
    if (!proxyPersonName.trim()) {
      showToast('Please specify the Proxy Person name', 'error');
      return;
    }
    if (!companyName.trim()) {
      showToast('Please provide the hiring Company Name', 'error');
      return;
    }
    if (!jobTitle.trim()) {
      showToast('Please provide the Job Title / Role', 'error');
      return;
    }
    if (!interviewDate) {
      showToast('Please specify the Interview Date', 'error');
      return;
    }
    if (!feedbackAndRemarks.trim()) {
      showToast('Please provide Interview Feedback and Remarks', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const requestId = `offer_req_${generateId()}`;
      const nowTimestamp = now();

      const newRequest: InterviewOfferRequest = {
        id: requestId,
        candidate_id: candidate.id,
        candidate_name: candidate.full_name,
        candidate_email: candidate.email || '',
        candidate_phone: candidate.phone || '',
        candidate_package: candidate.package_name || candidate.package_amount || '',
        submitted_by: user?.id || 'unknown',
        submitted_by_name: user?.display_name || user?.username || 'Team Member',
        proxy_user_id: selectedProxyId && selectedProxyId !== 'custom' && selectedProxyId !== 'none' ? selectedProxyId : null,
        proxy_person_name: proxyPersonName.trim(),
        proxy_attended: proxyAttended,
        proxy_support_notes: proxySupportNotes.trim() || '',
        interview_details: {
          company_name: companyName.trim(),
          job_title: jobTitle.trim(),
          round_label: roundLabel.trim(),
          interview_date: interviewDate,
          interview_time: interviewTime.trim() || '',
          interview_mode: interviewMode.trim() || 'video',
          offered_package: offeredPackage.trim() || '',
          offered_role: jobTitle.trim(),
          offered_location: offeredLocation.trim() || '',
          expected_joining_date: expectedJoiningDate || '',
        },
        feedback_and_remarks: feedbackAndRemarks.trim(),
        questions_asked: questionsAsked.trim() || '',
        technical_remarks: technicalRemarks.trim() || '',
        recommendation_status: recommendationStatus,
        additional_interview_notes: additionalNotes.trim() || '',
        status: 'pending_compliance_approval',
        created_at: nowTimestamp,
        updated_at: nowTimestamp
      };

      // 1. Create the Interview Offer Approval Request
      await createInterviewOfferRequest(newRequest);

      // 2. Mark candidate in pending approval status (do NOT move to Offer!)
      await updateCandidate(candidate.id, {
        interview_offer_status: 'pending_approval',
        interview_offer_request_id: requestId,
        interview_offer_rejection_reason: null,
        latest_interview_offer_request: newRequest
      });

      // 3. Log Activity
      await logActivity(
        candidate.id,
        'Interview Completion Submitted',
        `Submitted interview completion form for ${companyName} (${jobTitle}). Sent to Compliance Head for approval. Proxy: ${proxyPersonName}.`,
        user?.id || null
      );

      // 4. Notify Compliance Heads and Management
      const complianceMembers = teamUsers.filter(u => 
        u.role === 'jpc_cs' || 
        u.role === 'administrator' || 
        u.role === 'jpc_sysadmin' || 
        u.role === 'jpc_manager' ||
        String(u.display_name).toLowerCase().includes('faiz') ||
        u.username === 'care'
      );

      for (const compUser of complianceMembers) {
        try {
          await addNotification({
            recipient_id: String(compUser.id),
            sender_id: user?.id || null,
            type: 'system_alert',
            message: `Candidate ${candidate.full_name} has completed interview for ${companyName} and requires Compliance Head approval to move to Offer stage.`
          });
        } catch (notifErr) {
          console.warn('Could not send notification to compliance member:', notifErr);
        }
      }

      showToast('Interview completion report submitted! Sent to Compliance Head for approval.', 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error submitting interview completion form:', err);
      showToast('Failed to submit form: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[70] flex items-center justify-center p-4 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-bg-secondary w-full max-w-3xl rounded-3xl shadow-2xl border border-border-primary overflow-hidden my-6"
      >
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-accent-blue/10 via-accent-purple/10 to-transparent border-b border-border-primary flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-accent-blue/20 flex items-center justify-center text-accent-blue">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-black text-accent-blue uppercase tracking-widest">Stage Gate Clearance</span>
              <h2 className="text-xl font-bold text-text-primary tracking-tight">Interview Completion Form</h2>
              <p className="text-xs text-text-secondary mt-0.5">
                Moving <strong className="text-text-primary">{candidate.full_name}</strong> to Offer requires interview details and Compliance Head approval.
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-2 text-text-muted hover:text-text-primary rounded-xl hover:bg-bg-tertiary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[75vh] overflow-y-auto custom-scrollbar">
          {/* Notice Banner */}
          <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-600 dark:text-amber-400">
              <span className="font-bold">Compliance Head Review Required:</span> Submitting this form does not immediately place the candidate in the Offer stage. It routes the interview findings to the Compliance Head for review and formal approval.
            </div>
          </div>

          {/* Section 1: Proxy Person Details */}
          <div className="p-5 bg-bg-tertiary/40 border border-border-primary rounded-2xl space-y-4">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-accent-purple" />
              <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">
                1. Proxy Person Information
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-text-muted uppercase block mb-1">
                  Select Proxy Person <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedProxyId}
                  onChange={handleProxySelect}
                  className="w-full p-2.5 text-xs bg-bg-secondary rounded-xl border border-border-primary text-text-primary focus:outline-none focus:border-accent-blue"
                >
                  <option value="">-- Choose from Team --</option>
                  {proxyUsers.length > 0 && (
                    <optgroup label="Dedicated Proxy Team">
                      {proxyUsers.map(u => (
                        <option key={u.id} value={u.id}>{u.display_name} ({u.username})</option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="All Team Members">
                    {teamUsers.filter(u => u.role !== 'jpc_proxy').map(u => (
                      <option key={u.id} value={u.id}>{u.display_name} - {u.role}</option>
                    ))}
                  </optgroup>
                  <option value="custom">Other / External Proxy (Enter Name)</option>
                  <option value="none">No Proxy (Candidate Self Attended)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-text-muted uppercase block mb-1">
                  Proxy Person's Name <span className="text-rose-500">*</span>
                </label>
                <input 
                  type="text"
                  placeholder="Full name of proxy support person"
                  value={proxyPersonName}
                  onChange={e => setProxyPersonName(e.target.value)}
                  required
                  className="w-full p-2.5 text-xs bg-bg-secondary rounded-xl border border-border-primary text-text-primary focus:outline-none focus:border-accent-blue"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-text-muted uppercase block mb-1">
                  Proxy Attendance Status
                </label>
                <div className="flex gap-2">
                  {[
                    { val: 'yes', label: 'Attended' },
                    { val: 'no', label: 'Not Attended' },
                    { val: 'n/a', label: 'Not Applicable' }
                  ].map(opt => (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => setProxyAttended(opt.val as any)}
                      className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all ${
                        proxyAttended === opt.val 
                          ? 'bg-accent-blue text-white border-accent-blue shadow-sm' 
                          : 'bg-bg-secondary text-text-secondary border-border-primary hover:bg-bg-tertiary'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-text-muted uppercase block mb-1">
                  Proxy Support Remarks
                </label>
                <input 
                  type="text"
                  placeholder="Notes on proxy setup, audio/video, coaching, etc."
                  value={proxySupportNotes}
                  onChange={e => setProxySupportNotes(e.target.value)}
                  className="w-full p-2.5 text-xs bg-bg-secondary rounded-xl border border-border-primary text-text-primary focus:outline-none focus:border-accent-blue"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Interview Details */}
          <div className="p-5 bg-bg-tertiary/40 border border-border-primary rounded-2xl space-y-4">
            <div className="flex items-center gap-2">
              <Building className="w-4 h-4 text-accent-blue" />
              <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">
                2. Interview & Offer Details
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-bold text-text-muted uppercase block mb-1">
                  Hiring Company <span className="text-rose-500">*</span>
                </label>
                <input 
                  type="text"
                  placeholder="e.g. Acme Corp / Google"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  required
                  className="w-full p-2.5 text-xs bg-bg-secondary rounded-xl border border-border-primary text-text-primary focus:outline-none focus:border-accent-blue"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-text-muted uppercase block mb-1">
                  Job Title / Role <span className="text-rose-500">*</span>
                </label>
                <input 
                  type="text"
                  placeholder="e.g. Senior Full Stack Engineer"
                  value={jobTitle}
                  onChange={e => setJobTitle(e.target.value)}
                  required
                  className="w-full p-2.5 text-xs bg-bg-secondary rounded-xl border border-border-primary text-text-primary focus:outline-none focus:border-accent-blue"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-text-muted uppercase block mb-1">
                  Interview Round
                </label>
                <select
                  value={roundLabel}
                  onChange={e => setRoundLabel(e.target.value)}
                  className="w-full p-2.5 text-xs bg-bg-secondary rounded-xl border border-border-primary text-text-primary focus:outline-none focus:border-accent-blue"
                >
                  <option value="Screening Round">Screening Round</option>
                  <option value="Technical Round 1">Technical Round 1</option>
                  <option value="Technical Round 2">Technical Round 2</option>
                  <option value="System Design">System Design</option>
                  <option value="Managerial Round">Managerial Round</option>
                  <option value="HR / Culture Fit">HR / Culture Fit</option>
                  <option value="Final Round">Final Round</option>
                  <option value="Client Interview">Client Interview</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-text-muted uppercase block mb-1">
                  Interview Date <span className="text-rose-500">*</span>
                </label>
                <input 
                  type="date"
                  value={interviewDate}
                  onChange={e => setInterviewDate(e.target.value)}
                  required
                  className="w-full p-2.5 text-xs bg-bg-secondary rounded-xl border border-border-primary text-text-primary focus:outline-none focus:border-accent-blue"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-text-muted uppercase block mb-1">
                  Interview Time / Slot
                </label>
                <input 
                  type="text"
                  placeholder="e.g. 10:00 AM - 11:00 AM EST"
                  value={interviewTime}
                  onChange={e => setInterviewTime(e.target.value)}
                  className="w-full p-2.5 text-xs bg-bg-secondary rounded-xl border border-border-primary text-text-primary focus:outline-none focus:border-accent-blue"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-text-muted uppercase block mb-1">
                  Platform / Mode
                </label>
                <select
                  value={interviewMode}
                  onChange={e => setInterviewMode(e.target.value)}
                  className="w-full p-2.5 text-xs bg-bg-secondary rounded-xl border border-border-primary text-text-primary focus:outline-none focus:border-accent-blue"
                >
                  <option value="Zoom">Zoom</option>
                  <option value="Google Meet">Google Meet</option>
                  <option value="Microsoft Teams">Microsoft Teams</option>
                  <option value="Webex">Cisco Webex</option>
                  <option value="Phone Call">Phone Call</option>
                  <option value="On-site">On-site</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-text-muted uppercase block mb-1">
                  Offered Package / CTC
                </label>
                <input 
                  type="text"
                  placeholder="e.g. $120,000/yr or 85/hr"
                  value={offeredPackage}
                  onChange={e => setOfferedPackage(e.target.value)}
                  className="w-full p-2.5 text-xs bg-bg-secondary rounded-xl border border-border-primary text-text-primary focus:outline-none focus:border-accent-blue"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-text-muted uppercase block mb-1">
                  Work Location / Mode
                </label>
                <select
                  value={offeredLocation}
                  onChange={e => setOfferedLocation(e.target.value)}
                  className="w-full p-2.5 text-xs bg-bg-secondary rounded-xl border border-border-primary text-text-primary focus:outline-none focus:border-accent-blue"
                >
                  <option value="Remote">Remote</option>
                  <option value="Hybrid">Hybrid</option>
                  <option value="On-site">On-site</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-text-muted uppercase block mb-1">
                  Expected Joining Date
                </label>
                <input 
                  type="date"
                  value={expectedJoiningDate}
                  onChange={e => setExpectedJoiningDate(e.target.value)}
                  className="w-full p-2.5 text-xs bg-bg-secondary rounded-xl border border-border-primary text-text-primary focus:outline-none focus:border-accent-blue"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Interview Feedback & Remarks */}
          <div className="p-5 bg-bg-tertiary/40 border border-border-primary rounded-2xl space-y-4">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-500" />
              <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">
                3. Interview Feedback, Remarks & Questions
              </h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-text-muted uppercase block mb-1">
                  Interview Feedback & Remarks <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="Comprehensive feedback on candidate answers, interviewer engagement, areas of confidence, client comments..."
                  value={feedbackAndRemarks}
                  onChange={e => setFeedbackAndRemarks(e.target.value)}
                  required
                  className="w-full p-3 text-xs bg-bg-secondary rounded-xl border border-border-primary text-text-primary focus:outline-none focus:border-accent-blue resize-y"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-text-muted uppercase block mb-1">
                    Key Questions Asked in Interview
                  </label>
                  <textarea
                    rows={3}
                    placeholder="List the technical / behavioral questions asked during the round..."
                    value={questionsAsked}
                    onChange={e => setQuestionsAsked(e.target.value)}
                    className="w-full p-3 text-xs bg-bg-secondary rounded-xl border border-border-primary text-text-primary focus:outline-none focus:border-accent-blue resize-y"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-text-muted uppercase block mb-1">
                    Technical & Competency Notes
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Candidate technical strengths, coding test results, framework familiarity..."
                    value={technicalRemarks}
                    onChange={e => setTechnicalRemarks(e.target.value)}
                    className="w-full p-3 text-xs bg-bg-secondary rounded-xl border border-border-primary text-text-primary focus:outline-none focus:border-accent-blue resize-y"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-text-muted uppercase block mb-1">
                    Recommendation Status
                  </label>
                  <select
                    value={recommendationStatus}
                    onChange={e => setRecommendationStatus(e.target.value as any)}
                    className="w-full p-2.5 text-xs bg-bg-secondary rounded-xl border border-border-primary text-text-primary focus:outline-none focus:border-accent-blue font-bold"
                  >
                    <option value="recommended_for_offer">Recommended for Offer (Standard)</option>
                    <option value="strong_hire">Strong Hire / High Priority Placement</option>
                    <option value="conditional_offer">Conditional Offer (Pending Documentation / Client)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-text-muted uppercase block mb-1">
                    Additional Notes for Compliance Head
                  </label>
                  <input 
                    type="text"
                    placeholder="Any special agreement terms or background notes..."
                    value={additionalNotes}
                    onChange={e => setAdditionalNotes(e.target.value)}
                    className="w-full p-2.5 text-xs bg-bg-secondary rounded-xl border border-border-primary text-text-primary focus:outline-none focus:border-accent-blue"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-bg-tertiary text-text-primary font-bold text-xs rounded-xl hover:bg-bg-tertiary/80 transition-all border border-border-primary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-accent-blue text-white font-bold text-xs rounded-xl hover:bg-accent-blue/90 transition-all shadow-md shadow-accent-blue/20 flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Submitting...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" /> Submit for Compliance Approval
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
