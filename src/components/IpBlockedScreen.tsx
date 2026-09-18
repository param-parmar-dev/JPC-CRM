import React, { useState, useEffect, useCallback } from 'react';
import { 
  ShieldAlert, 
  Copy, 
  Check, 
  RefreshCw, 
  LogIn, 
  Lock, 
  Globe, 
  Send, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  XCircle,
  Network
} from 'lucide-react';
import { motion } from 'motion/react';
import { IpAccessRequest } from '../types';

interface IpBlockedScreenProps {
  ip: string;
  reason?: string;
  message?: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  username?: string;
  onRetry: () => void;
}

export const IpBlockedScreen: React.FC<IpBlockedScreenProps> = ({
  ip,
  reason,
  message,
  userId,
  userEmail,
  userName,
  username,
  onRetry
}) => {
  const [copied, setCopied] = useState(false);
  
  // Request Form & Status State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [requestedScope, setRequestedScope] = useState<'global' | 'specific_ip'>('global');
  const [requestReason, setRequestReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // Existing request tracking
  const [existingRequest, setExistingRequest] = useState<IpAccessRequest | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  const handleCopyIp = () => {
    navigator.clipboard.writeText(ip);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Check if this user already submitted an access request
  const fetchMyRequestStatus = useCallback(async () => {
    if (!userId && !userEmail && !username) return;
    setIsCheckingStatus(true);
    try {
      const params = new URLSearchParams();
      if (userId) params.append('user_id', userId);
      if (userEmail) params.append('email', userEmail);
      if (username) params.append('username', username);

      const res = await fetch(`/api/auth/my-access-request?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.request) {
          setExistingRequest(data.request);
          if (data.request.status === 'approved') {
            setSubmitSuccess('Access has been approved by the Administrator! You can now log in.');
          }
        }
      }
    } catch (e) {
      console.warn('Failed to fetch request status:', e);
    } finally {
      setIsCheckingStatus(false);
    }
  }, [userId, userEmail, username]);

  useEffect(() => {
    fetchMyRequestStatus();
  }, [fetchMyRequestStatus]);

  // Handle request submission
  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestReason.trim()) {
      setSubmitError('Please provide a reason for requesting outside-office access.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch('/api/auth/request-external-access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: userId,
          user_email: userEmail,
          username: username,
          display_name: userName || username,
          request_type: requestedScope,
          reason: requestReason.trim()
        })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSubmitSuccess('Your request has been submitted to the Administrator. Please wait for approval.');
        setIsFormOpen(false);
        fetchMyRequestStatus();
      } else {
        setSubmitError(data.error || 'Failed to submit access request. Please try again.');
      }
    } catch (err) {
      console.error('Submission error:', err);
      setSubmitError('Network error while submitting access request. Please check your connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-bg-primary p-4 sm:p-6 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-accent-red/5 rounded-full blur-3xl pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="max-w-lg w-full bg-bg-secondary border border-border-primary/80 rounded-3xl p-6 sm:p-8 shadow-2xl relative z-10 flex flex-col items-center text-center"
      >
        {/* Shield Icon Badge */}
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-accent-red/10 border border-accent-red/20 flex items-center justify-center mb-5 text-accent-red shadow-lg shadow-accent-red/10">
          <ShieldAlert className="w-7 h-7 sm:w-8 sm:h-8" />
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-accent-red/10 border border-accent-red/20 rounded-full mb-3 text-accent-red text-xs font-bold uppercase tracking-wider">
          <Lock className="w-3 h-3" />
          <span>Outside Office Network</span>
        </div>

        <h1 className="text-xl sm:text-2xl font-bold text-text-primary font-heading tracking-tight mb-2">
          Network Access Restricted
        </h1>

        <p className="text-xs sm:text-sm text-text-secondary mb-5 leading-relaxed">
          {message || 'Your device is connecting from outside the approved office network (14.102.161.54). Access is denied by default unless approved by an Administrator.'}
        </p>

        {/* IP Badge Card */}
        <div className="w-full bg-bg-tertiary/70 border border-border-secondary rounded-2xl p-4 mb-5 text-left">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Your Current IP</span>
            <button
              onClick={handleCopyIp}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent-blue hover:underline cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-accent-green" />
                  <span className="text-accent-green">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy IP</span>
                </>
              )}
            </button>
          </div>
          <div className="font-mono text-base font-bold text-text-primary">
            {ip || '127.0.0.1'}
          </div>
          {reason && (
            <div className="mt-2 pt-2 border-t border-border-secondary/50 text-[11px] text-text-muted flex items-center gap-1">
              <span>Policy:</span>
              <code className="font-mono text-text-secondary bg-bg-secondary px-1.5 py-0.5 rounded text-[10px]">{reason}</code>
            </div>
          )}
        </div>

        {/* User Identity Info (if available) */}
        {(userName || userEmail) && (
          <div className="w-full bg-bg-primary/60 border border-border-secondary/50 rounded-xl px-3.5 py-2 mb-5 text-left flex items-center justify-between text-xs">
            <div className="truncate">
              <span className="text-text-muted">User: </span>
              <span className="font-bold text-text-primary">{userName || username}</span>
              {userEmail && <span className="text-text-muted ml-1">({userEmail})</span>}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* EXISTING REQUEST STATUS CARD (IF SUBMITTED) */}
        {/* ========================================================= */}
        {existingRequest && (
          <div className="w-full mb-5 text-left">
            {existingRequest.status === 'pending' && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-amber-600 font-bold text-xs">
                    <Clock className="w-4 h-4" />
                    <span>Access Request Pending Review</span>
                  </div>
                  <button
                    onClick={fetchMyRequestStatus}
                    disabled={isCheckingStatus}
                    className="text-[10px] font-bold text-amber-600 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${isCheckingStatus ? 'animate-spin' : ''}`} />
                    <span>Check Status</span>
                  </button>
                </div>
                <p className="text-[11px] text-text-secondary leading-relaxed">
                  You submitted a request for <strong>{existingRequest.request_type === 'global' ? 'Global Access' : `Current IP (${existingRequest.client_ip})`}</strong> on {new Date(existingRequest.created_at).toLocaleString()}. The Administrator has been notified.
                </p>
                {existingRequest.reason && (
                  <div className="text-[10px] text-text-muted bg-bg-secondary/70 p-2 rounded-lg italic">
                    "{existingRequest.reason}"
                  </div>
                )}
              </div>
            )}

            {existingRequest.status === 'approved' && (
              <div className="p-4 bg-accent-green/10 border border-accent-green/30 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-accent-green font-bold text-xs">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Access Request Approved!</span>
                </div>
                <p className="text-[11px] text-text-secondary leading-relaxed">
                  Your request has been approved by the Administrator ({existingRequest.granted_scope === 'global' ? '🌍 Global Access granted' : `🔒 Access approved for IP ${existingRequest.client_ip}`}). You can now log into the CRM.
                </p>
                <button
                  onClick={onRetry}
                  className="w-full py-2 bg-accent-green text-white font-bold rounded-xl text-xs hover:brightness-110 transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-accent-green/20"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Log In Now</span>
                </button>
              </div>
            )}

            {existingRequest.status === 'rejected' && (
              <div className="p-4 bg-accent-red/10 border border-accent-red/30 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-accent-red font-bold text-xs">
                    <XCircle className="w-4 h-4" />
                    <span>Access Request Declined</span>
                  </div>
                  <button
                    onClick={() => {
                      setExistingRequest(null);
                      setIsFormOpen(true);
                    }}
                    className="text-[10px] font-bold text-accent-blue hover:underline cursor-pointer"
                  >
                    Resubmit Request
                  </button>
                </div>
                <p className="text-[11px] text-text-secondary leading-relaxed">
                  {existingRequest.admin_notes || 'Your outside-office access request was declined by the Administrator. Please connect to an approved office network.'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* REQUEST SUBMISSION FORM OR TRIGGER */}
        {/* ========================================================= */}
        {(!existingRequest || existingRequest.status === 'rejected') && (
          <div className="w-full mb-5">
            {!isFormOpen ? (
              <button
                onClick={() => setIsFormOpen(true)}
                className="w-full py-3 px-4 bg-accent-purple/10 hover:bg-accent-purple/20 border border-accent-purple/30 text-accent-purple font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-xs cursor-pointer shadow-sm"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Request Outside-Office Access from Admin</span>
              </button>
            ) : (
              <motion.form
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                onSubmit={handleSubmitRequest}
                className="bg-bg-primary/80 border border-border-primary rounded-2xl p-4 text-left space-y-3 shadow-inner"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-text-primary uppercase tracking-wider">
                    Submit Access Request
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="text-[10px] text-text-muted hover:text-text-primary"
                  >
                    Cancel
                  </button>
                </div>

                {submitError && (
                  <div className="p-2.5 bg-accent-red/10 border border-accent-red/20 rounded-xl text-[11px] text-accent-red flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{submitError}</span>
                  </div>
                )}

                {/* Scope Selection */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                    Requested Access Scope
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRequestedScope('global')}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                        requestedScope === 'global'
                          ? 'bg-accent-green/10 border-accent-green text-text-primary ring-1 ring-accent-green/30'
                          : 'bg-bg-secondary border-border-primary text-text-secondary hover:border-border-secondary'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs text-text-primary mb-1">
                        <Globe className="w-3.5 h-3.5 text-accent-green" />
                        <span>Global Access</span>
                      </div>
                      <span className="text-[9px] text-text-muted">Work from any network</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setRequestedScope('specific_ip')}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                        requestedScope === 'specific_ip'
                          ? 'bg-accent-blue/10 border-accent-blue text-text-primary ring-1 ring-accent-blue/30'
                          : 'bg-bg-secondary border-border-primary text-text-secondary hover:border-border-secondary'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs text-text-primary mb-1">
                        <Network className="w-3.5 h-3.5 text-accent-blue" />
                        <span>This IP Only</span>
                      </div>
                      <span className="text-[9px] text-text-muted truncate font-mono">{ip || 'Current IP'}</span>
                    </button>
                  </div>
                </div>

                {/* Reason Textarea */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                    Reason for Outside-Office Access <span className="text-accent-red">*</span>
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={requestReason}
                    onChange={e => setRequestReason(e.target.value)}
                    placeholder="e.g. Working remotely today, field client meeting, home office setup..."
                    className="w-full bg-bg-secondary border border-border-primary rounded-xl p-2.5 text-xs text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:border-accent-blue resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="px-3 py-1.5 bg-bg-tertiary text-text-secondary rounded-lg text-xs font-semibold hover:bg-bg-tertiary/80 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-1.5 bg-accent-purple text-white font-bold rounded-lg text-xs hover:brightness-110 transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-accent-purple/20 disabled:opacity-50"
                  >
                    <Send className="w-3 h-3" />
                    <span>{isSubmitting ? 'Submitting...' : 'Send Request'}</span>
                  </button>
                </div>
              </motion.form>
            )}
          </div>
        )}

        {/* Retry / Return to Login Button */}
        <div className="w-full flex flex-col gap-2">
          <button
            onClick={onRetry}
            className="w-full py-3 px-4 bg-accent-blue hover:brightness-110 text-white font-bold rounded-xl transition-all shadow-lg shadow-accent-blue/20 flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            <span>Return to Login / Retry</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
};
