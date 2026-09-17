import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  X, 
  CheckCircle2, 
  XCircle, 
  ShieldCheck, 
  Building, 
  UserCheck, 
  FileText, 
  AlertTriangle,
  Loader2,
  Calendar,
  DollarSign,
  MapPin,
  Clock,
  Send
} from 'lucide-react';
import { Candidate, InterviewOfferRequest, User } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { isComplianceHead } from '../lib/permissions';
import { 
  updateInterviewOfferRequest, 
  updateCandidate, 
  logActivity, 
  addNotification, 
  now 
} from '../services/storage';

interface ComplianceOfferApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidate: Candidate;
  request: InterviewOfferRequest | null;
  onSuccess: () => void;
}

export const ComplianceOfferApprovalModal: React.FC<ComplianceOfferApprovalModalProps> = ({
  isOpen,
  onClose,
  candidate,
  request,
  onSuccess
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');

  if (!isOpen || !request) return null;

  const canReview = isComplianceHead(user);

  const handleApprove = async () => {
    if (!canReview) {
      showToast('Only Compliance Head or Administrators can approve this request', 'error');
      return;
    }

    setIsApproving(true);
    try {
      const nowTimestamp = now();
      const reviewerName = user?.display_name || user?.username || 'Compliance Head';

      // 1. Update request status to 'approved'
      await updateInterviewOfferRequest(request.id, {
        status: 'approved',
        compliance_reviewer_id: user?.id || null,
        compliance_reviewer_name: reviewerName,
        compliance_reviewed_at: nowTimestamp,
        compliance_remarks: approvalNotes.trim() || 'Approved for placement and Offer stage transition.'
      });

      // 2. Update Candidate: transition stage to 'offer' and mark status as 'approved'
      await updateCandidate(candidate.id, {
        current_stage: 'offer',
        interview_offer_status: 'approved',
        interview_offer_rejection_reason: null
      });

      // 3. Trigger SMTP Email Notification to all configured Admin recipients
      try {
        const emailRes = await fetch('/api/candidate/notify-offer-approved', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            candidate: {
              id: candidate.id,
              full_name: candidate.full_name,
              phone: candidate.phone,
              email: candidate.email
            },
            request: {
              ...request,
              compliance_remarks: approvalNotes.trim() || 'Approved for placement and Offer stage transition.'
            },
            reviewerName
          })
        });

        if (!emailRes.ok) {
          console.warn('Backend email endpoint returned non-200, trying standard /api/send-email fallback');
        }
      } catch (emailErr) {
        console.error('Failed to trigger SMTP email notification:', emailErr);
      }

      // 4. Log Activity
      await logActivity(
        candidate.id,
        'Offer Approved by Compliance Head',
        `Compliance Head ${reviewerName} approved the interview completion report. Candidate moved from Interviewing to Offer stage. Notes: ${approvalNotes.trim() || 'None'}`,
        user?.id || null
      );

      // 5. Notify submitter & team members
      if (request.submitted_by) {
        try {
          await addNotification({
            recipient_id: String(request.submitted_by),
            sender_id: user?.id || null,
            type: 'system_alert',
            message: `Great news! Compliance Head ${reviewerName} has APPROVED candidate ${candidate.full_name}'s move to Offer stage.`
          });
        } catch (e) {}
      }

      showToast(`Offer Approved! Candidate ${candidate.full_name} moved to Offer stage. Notification sent.`, 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error approving offer request:', err);
      showToast('Failed to approve request: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!canReview) {
      showToast('Only Compliance Head or Administrators can reject this request', 'error');
      return;
    }

    if (!rejectionReason.trim()) {
      showToast('Please provide a specific rejection reason or remarks', 'error');
      return;
    }

    setIsRejecting(true);
    try {
      const nowTimestamp = now();
      const reviewerName = user?.display_name || user?.username || 'Compliance Head';

      // 1. Update request status to 'rejected'
      await updateInterviewOfferRequest(request.id, {
        status: 'rejected',
        compliance_reviewer_id: user?.id || null,
        compliance_reviewer_name: reviewerName,
        compliance_reviewed_at: nowTimestamp,
        compliance_remarks: rejectionReason.trim()
      });

      // 2. Update Candidate: remains in Interviewing stage, status set to 'rejected'
      await updateCandidate(candidate.id, {
        interview_offer_status: 'rejected',
        interview_offer_rejection_reason: rejectionReason.trim()
      });

      // 3. Log Activity
      await logActivity(
        candidate.id,
        'Offer Request Rejected by Compliance Head',
        `Compliance Head ${reviewerName} rejected the interview-to-offer request. Reason: ${rejectionReason.trim()}. Candidate remains in Interviewing stage.`,
        user?.id || null
      );

      // 4. Notify Submitter
      if (request.submitted_by) {
        try {
          await addNotification({
            recipient_id: String(request.submitted_by),
            sender_id: user?.id || null,
            type: 'system_alert',
            message: `Interview-to-Offer request for ${candidate.full_name} was REJECTED by Compliance Head ${reviewerName}. Reason: ${rejectionReason.trim()}`
          });
        } catch (e) {}
      }

      showToast('Offer request rejected. Candidate remains in Interviewing stage.', 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error rejecting offer request:', err);
      showToast('Failed to reject request: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setIsRejecting(false);
    }
  };

  const isPending = request.status === 'pending_compliance_approval';

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[75] flex items-center justify-center p-4 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-bg-secondary w-full max-w-3xl rounded-3xl shadow-2xl border border-border-primary overflow-hidden my-6"
      >
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-accent-teal/10 via-accent-blue/10 to-transparent border-b border-border-primary flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-accent-teal/20 flex items-center justify-center text-accent-teal">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-accent-teal uppercase tracking-widest">Compliance Review</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  request.status === 'approved' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                  request.status === 'rejected' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' :
                  'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                }`}>
                  {request.status.replace(/_/g, ' ')}
                </span>
              </div>
              <h2 className="text-xl font-bold text-text-primary tracking-tight mt-1">Interview-to-Offer Clearance</h2>
              <p className="text-xs text-text-secondary">
                Candidate: <strong className="text-text-primary">{candidate.full_name}</strong> ({candidate.id})
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

        {/* Content Body */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {/* Status Indicator */}
          {!canReview && isPending && (
            <div className="p-3 bg-accent-blue/10 border border-accent-blue/20 rounded-2xl text-xs text-accent-blue flex items-center gap-2">
              <Clock className="w-4 h-4 shrink-0" />
              <span>Awaiting review by Compliance Head. Only authorized Compliance personnel can approve or reject this request.</span>
            </div>
          )}

          {request.status === 'rejected' && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl space-y-1">
              <div className="flex items-center gap-2 text-rose-500 text-xs font-bold uppercase">
                <XCircle className="w-4 h-4" /> Request Rejected by {request.compliance_reviewer_name || 'Compliance Head'}
              </div>
              <p className="text-xs text-text-primary pl-6">
                <strong>Remarks:</strong> {request.compliance_remarks || 'No remarks provided.'}
              </p>
              {request.compliance_reviewed_at && (
                <p className="text-[10px] text-text-muted pl-6">
                  Reviewed on {new Date(request.compliance_reviewed_at).toLocaleString()}
                </p>
              )}
            </div>
          )}

          {request.status === 'approved' && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl space-y-1">
              <div className="flex items-center gap-2 text-emerald-500 text-xs font-bold uppercase">
                <CheckCircle2 className="w-4 h-4" /> Approved by {request.compliance_reviewer_name || 'Compliance Head'}
              </div>
              <p className="text-xs text-text-primary pl-6">
                Candidate was successfully moved to <strong>Offer</strong> stage.
              </p>
              {request.compliance_reviewed_at && (
                <p className="text-[10px] text-text-muted pl-6">
                  Approved on {new Date(request.compliance_reviewed_at).toLocaleString()}
                </p>
              )}
            </div>
          )}

          {/* Section: Proxy Person Info */}
          <div className="p-4 bg-bg-tertiary/40 border border-border-primary rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-accent-purple" />
                <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider">Proxy Information</h4>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                request.proxy_attended === 'yes' ? 'bg-emerald-500/10 text-emerald-500' :
                request.proxy_attended === 'no' ? 'bg-rose-500/10 text-rose-500' :
                'bg-bg-secondary text-text-muted'
              }`}>
                Attended: {request.proxy_attended ? String(request.proxy_attended).toUpperCase() : 'N/A'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-text-muted font-bold">Proxy Person: </span>
                <span className="text-text-primary font-medium">{request.proxy_person_name || 'None'}</span>
              </div>
              {request.proxy_support_notes && (
                <div className="sm:col-span-2">
                  <span className="text-text-muted font-bold">Proxy Support Notes: </span>
                  <span className="text-text-secondary">{request.proxy_support_notes}</span>
                </div>
              )}
            </div>
          </div>

          {/* Section: Interview Details */}
          <div className="p-4 bg-bg-tertiary/40 border border-border-primary rounded-2xl space-y-3">
            <div className="flex items-center gap-2">
              <Building className="w-4 h-4 text-accent-blue" />
              <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider">Interview & Offer Specifics</h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-text-muted font-bold block">Company / Client</span>
                <span className="text-text-primary font-bold">{request.interview_details?.company_name || 'N/A'}</span>
              </div>
              <div>
                <span className="text-text-muted font-bold block">Job Title / Role</span>
                <span className="text-text-primary font-medium">{request.interview_details?.job_title || 'N/A'}</span>
              </div>
              <div>
                <span className="text-text-muted font-bold block">Round Type</span>
                <span className="text-text-primary font-medium">{request.interview_details?.round_label || 'N/A'}</span>
              </div>
              <div>
                <span className="text-text-muted font-bold block">Interview Date & Time</span>
                <span className="text-text-primary font-medium">
                  {request.interview_details?.interview_date || 'N/A'} {request.interview_details?.interview_time || ''}
                </span>
              </div>
              <div>
                <span className="text-text-muted font-bold block">Mode / Platform</span>
                <span className="text-text-primary font-medium">{request.interview_details?.interview_mode || 'N/A'}</span>
              </div>
              <div>
                <span className="text-text-muted font-bold block">Offered Package / CTC</span>
                <span className="text-emerald-500 font-bold">{request.interview_details?.offered_package || 'Not Specified'}</span>
              </div>
              <div>
                <span className="text-text-muted font-bold block">Location / Work Mode</span>
                <span className="text-text-primary font-medium">{request.interview_details?.offered_location || 'N/A'}</span>
              </div>
              <div>
                <span className="text-text-muted font-bold block">Expected Joining Date</span>
                <span className="text-text-primary font-medium">{request.interview_details?.expected_joining_date || 'N/A'}</span>
              </div>
              <div>
                <span className="text-text-muted font-bold block">Recommendation</span>
                <span className="text-accent-blue font-bold">
                  {request.recommendation_status ? String(request.recommendation_status).replace(/_/g, ' ').toUpperCase() : 'RECOMMENDED'}
                </span>
              </div>
            </div>
          </div>

          {/* Section: Feedback & Remarks */}
          <div className="p-4 bg-bg-tertiary/40 border border-border-primary rounded-2xl space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-500" />
              <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider">Interview Feedback & Evaluation</h4>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-text-muted font-bold block mb-1">Feedback & Overall Remarks:</span>
                <div className="p-3 bg-bg-secondary rounded-xl border border-border-primary text-text-primary whitespace-pre-line leading-relaxed">
                  {request.feedback_and_remarks || 'No detailed feedback provided.'}
                </div>
              </div>

              {request.questions_asked && (
                <div>
                  <span className="text-text-muted font-bold block mb-1">Questions Asked in Interview:</span>
                  <div className="p-3 bg-bg-secondary rounded-xl border border-border-primary text-text-secondary whitespace-pre-line leading-relaxed">
                    {request.questions_asked}
                  </div>
                </div>
              )}

              {request.technical_remarks && (
                <div>
                  <span className="text-text-muted font-bold block mb-1">Technical & Competency Notes:</span>
                  <div className="p-3 bg-bg-secondary rounded-xl border border-border-primary text-text-secondary whitespace-pre-line leading-relaxed">
                    {request.technical_remarks}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Submission Meta */}
          <div className="text-[11px] text-text-muted flex items-center justify-between px-1">
            <span>Submitted by: <strong>{request.submitted_by_name}</strong></span>
            <span>Date: {new Date(request.created_at).toLocaleString()}</span>
          </div>

          {/* Compliance Decision Controls (Only for authorized users and pending status) */}
          {canReview && isPending && (
            <div className="p-5 bg-gradient-to-r from-bg-tertiary/80 to-bg-tertiary/40 border-2 border-accent-blue/30 rounded-2xl space-y-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-accent-blue" />
                <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider">Compliance Head Decision</h4>
              </div>

              {!showRejectBox ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-text-muted uppercase block mb-1">
                      Approval Notes / Compliance Conditions (Optional)
                    </label>
                    <input 
                      type="text"
                      placeholder="e.g. Cleared for offer; client signed NDA verified."
                      value={approvalNotes}
                      onChange={e => setApprovalNotes(e.target.value)}
                      className="w-full p-2.5 text-xs bg-bg-secondary rounded-xl border border-border-primary text-text-primary focus:outline-none focus:border-accent-blue"
                    />
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      disabled={isApproving || isRejecting}
                      onClick={handleApprove}
                      className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isApproving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" /> Approving & Sending Email...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" /> Approve & Move to Offer Stage
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      disabled={isApproving || isRejecting}
                      onClick={() => setShowRejectBox(true)}
                      className="py-3 px-6 bg-rose-500/10 border border-rose-500/30 text-rose-500 hover:bg-rose-500 hover:text-white font-bold text-xs rounded-xl transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" /> Reject Request
                    </button>
                  </div>
                  <p className="text-[10px] text-text-muted text-center">
                    Note: Approving will automatically move the candidate to Offer stage and dispatch an SMTP email notification to all Admin recipient addresses.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 p-4 bg-rose-500/5 border border-rose-500/20 rounded-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-rose-500 uppercase">Specify Rejection Reason</span>
                    <button 
                      type="button" 
                      onClick={() => setShowRejectBox(false)}
                      className="text-xs text-text-muted hover:text-text-primary"
                    >
                      Cancel Rejection
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    placeholder="Enter explicit reasons for rejection (e.g., candidate failed proxy clearance, client feedback discrepancy, missing document proof)..."
                    value={rejectionReason}
                    onChange={e => setRejectionReason(e.target.value)}
                    required
                    className="w-full p-2.5 text-xs bg-bg-secondary rounded-xl border border-rose-500/30 text-text-primary focus:outline-none focus:border-rose-500"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowRejectBox(false)}
                      className="px-4 py-2 bg-bg-secondary text-text-secondary text-xs rounded-xl hover:bg-bg-tertiary"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isRejecting}
                      onClick={handleReject}
                      className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {isRejecting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Rejecting...
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3.5 h-3.5" /> Confirm Rejection
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-bg-tertiary/30 border-t border-border-primary flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-bg-tertiary text-text-primary font-bold text-xs rounded-xl hover:bg-bg-tertiary/80 transition-all border border-border-primary"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
};
