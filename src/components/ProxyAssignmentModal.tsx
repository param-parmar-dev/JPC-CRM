import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, User as UserIcon, AlertCircle, CheckCircle2 } from 'lucide-react';
import { InterviewSupportRequest, InterviewRound, User, ProxyAvailability } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { updateInterviewRound, updateInterviewSupportRequest, logInterviewActivity, addInterviewNotification } from '../services/storage';
import { syncInterviewRoundToGoogleCalendar, checkProxyAvailability } from '../services/calendarService';
import { findBestProxyForWindow, isProxyUser } from '../services/interviewService';
import { db } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';
import { TimeSlotSelector } from './TimeSlotSelector';

interface ProxyAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  round: InterviewRound;
  request: InterviewSupportRequest;
  team: User[];
  allRounds: InterviewRound[];
  allAvailabilities: ProxyAvailability[];
  allCalendarEvents: any[];
  onSuccess: () => void;
}

export const ProxyAssignmentModal: React.FC<ProxyAssignmentModalProps> = ({ 
  isOpen, 
  onClose, 
  round, 
  request, 
  team, 
  allRounds, 
  allAvailabilities, 
  allCalendarEvents, 
  onSuccess 
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingCalendar, setIsCheckingCalendar] = useState(false);
  const [calendarStatus, setCalendarStatus] = useState<{ isAvailable: boolean; error?: string } | null>(null);

  // Parse initial values
  const initialDate = round.booked_slot_time ? round.booked_slot_time.substring(0, 10) : (round.interview_date || '');
  
  const [date, setDate] = useState(initialDate);
  const [selectedSlot, setSelectedSlot] = useState<string>(round.booked_slot_time || '');
  const [selectedProxyId, setSelectedProxyId] = useState<string>('');

  const [isManualTime, setIsManualTime] = useState(false);
  const [manualStart, setManualStart] = useState(round.booked_slot_time ? round.booked_slot_time.substring(11, 16) : '');
  const [manualEnd, setManualEnd] = useState(round.booked_slot_end ? round.booked_slot_end.substring(11, 16) : '');

  const startTime = isManualTime ? manualStart : (selectedSlot ? selectedSlot.substring(11, 16) : '');
  const endTime = isManualTime ? manualEnd : (selectedSlot ? (allAvailabilities.find(a => a.slot_start === selectedSlot)?.slot_end.substring(11, 16) || '') : '');

  const isTimeRangeValid = useMemo(() => {
    if (!startTime || !endTime) return true;
    return startTime < endTime;
  }, [startTime, endTime]);

  // Compute best proxy matching
  const assignmentResult = useMemo(() => {
    if (!date || !startTime || !endTime || !isTimeRangeValid) {
      const errorMsg = !isTimeRangeValid 
        ? 'End time must be after start time.' 
        : 'Please input date, start time, and end time to calculate assignments.';
      return { bestProxy: null, availableProxies: [], errors: [errorMsg] };
    }
    return findBestProxyForWindow(date, startTime, endTime, team, allRounds, allAvailabilities, allCalendarEvents, round.id);
  }, [date, startTime, endTime, team, allRounds, allAvailabilities, allCalendarEvents, round.id, isTimeRangeValid]);

  // Set initial selected proxy when assignmentResult changes
  useEffect(() => {
    if (assignmentResult.bestProxy && !selectedProxyId) {
      setSelectedProxyId(assignmentResult.bestProxy.id);
    }
  }, [assignmentResult.bestProxy]);

  const selectedProxy = useMemo(() => {
    return team.find(u => u.id === selectedProxyId);
  }, [selectedProxyId, team]);

  const isSelectedProxyAvailable = useMemo(() => {
    if (!selectedProxyId) return true;
    return assignmentResult.availableProxies.some(p => p.id === selectedProxyId);
  }, [selectedProxyId, assignmentResult.availableProxies]);

  // Real-time Google Calendar check
  useEffect(() => {
    let active = true;
    const checkGCal = async () => {
      if (!selectedProxy || !date || !startTime || !endTime) {
        setCalendarStatus(null);
        return;
      }

      setIsCheckingCalendar(true);
      const bookedStart = `${date}T${startTime}:00`;
      const bookedEnd = `${date}T${endTime}:00`;
      
      const dStart = new Date(bookedStart);
      const dEnd = new Date(bookedEnd);

      const result = await checkProxyAvailability(
        String(selectedProxy.id), 
        dStart.toISOString(), 
        dEnd.toISOString()
      );
      
      if (active) {
        setCalendarStatus(result);
        setIsCheckingCalendar(false);
      }
    };

    checkGCal();
    return () => { active = false; };
  }, [selectedProxy, date, startTime, endTime]);

  const handleAssign = async () => {
    if (!user) return;
    if (!selectedProxy) {
      showToast('Please select a proxy to assign.', 'error');
      return;
    }

    if (!isSelectedProxyAvailable) {
      showToast('This proxy has a scheduling conflict and cannot be assigned to this slot.', 'error');
      return;
    }

    if (calendarStatus && !calendarStatus.isAvailable) {
      if (!window.confirm("Google Calendar shows this proxy might be BUSY during this time. Assign anyway?")) {
        return;
      }
    }

    setIsSubmitting(true);
    try {
      // Use selectedProxy from the state (calculated via useMemo based on selectedProxyId)
      if (!selectedProxy) throw new Error('No proxy selected');
      
      const bookedStart = `${date}T${startTime}:00`;
      const bookedEnd = `${date}T${endTime}:00`;

      const startD = new Date(bookedStart);
      const endD = new Date(bookedEnd);
      const duration_minutes = Math.max(15, Math.round((endD.getTime() - startD.getTime()) / 60000));

      // 1. Update Round
      await updateInterviewRound(round.id, {
        proxy_user_id: String(selectedProxy.id),
        interview_date: date,
        booked_slot_time: bookedStart,
        booked_slot_end: bookedEnd,
        duration_minutes: duration_minutes,
        status: 'confirmed'
      });

      // 2. Update Request Status
      await updateInterviewSupportRequest(request.id, {
        proxy_user_id: String(selectedProxy.id),
        overall_status: 'confirmed'
      });

      // 3. Synchronize directly with proxy's real Google Calendar
      try {
        await syncInterviewRoundToGoogleCalendar(round.id, request.id, String(selectedProxy.id));
      } catch (calErr) {
        console.error('[ProxyAssignmentModal] Proxy assignment calendar sync error:', calErr);
      }

      // Logging activity
      await logInterviewActivity(round.id, 'Proxy Assigned', `Proxy ${selectedProxy.display_name} automatically allocated to ${round.round_label}`, String(user.id));
      
      await addInterviewNotification({
        recipient_user_id: String(selectedProxy.id),
        interview_round_id: round.id,
        notification_type: 'proxy_assigned',
        message: `You have been automatically allocated to an interview round for ${request.job_title} at ${request.interview_company_name}.`,
      });

      // Notify proxy by email
      try {
        let smtpSettings: any = null;
        const cached = localStorage.getItem('smtp_settings');
        if (cached) smtpSettings = JSON.parse(cached);

        if (selectedProxy.email) {
          await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: selectedProxy.email,
              subject: 'Automatic Interview Allocation Confirmed',
              text: `Hello ${selectedProxy.display_name}. You have been allocated to support candidate ${request.candidate_id || 'Candidate'} on ${date} at ${startTime} - ${endTime} (EST).`,
              html: `<p>Hello <strong>${selectedProxy.display_name}</strong>,</p>
                     <p>You have been automatically assigned to support candidate's interview round (<strong>${round.round_label}</strong>) at <strong>${request.interview_company_name}</strong>.</p>
                     <ul>
                       <li><strong>Date:</strong> ${date}</li>
                       <li><strong>Time Slot:</strong> ${startTime} - ${endTime} EST</li>
                       <li><strong>15m Pre/Post Reservation buffers:</strong> Included</li>
                     </ul>`,
              smtpSettings: smtpSettings || undefined
            })
          }).catch(console.error);
        }
      } catch (e) {}

      onSuccess();
      onClose();
    } catch (error) {
      console.error(error);
      showToast('Failed to assign proxy.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[70] flex items-center justify-center p-2 sm:p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 40 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-bg-secondary w-full max-w-md rounded-2xl sm:rounded-[36px] shadow-2xl overflow-hidden border border-border-primary flex flex-col max-h-[94vh]"
      >
        <div className="p-5 sm:p-8 flex-1 overflow-y-auto touch-scroll">
          <div className="flex items-center justify-between mb-6 sm:mb-8">
            <div>
              <span className="text-[10px] font-black text-accent-blue uppercase tracking-[0.3em]">Coordination</span>
              <h2 className="text-2xl sm:text-3xl font-black text-text-primary tracking-tight mt-1">Reassign Proxy</h2>
              <p className="text-xs font-bold text-text-muted mt-1 sm:mt-2">Round: {round.round_label}</p>
            </div>
            <button onClick={onClose} className="p-2 sm:p-3 hover:bg-bg-tertiary rounded-2xl transition-colors">
              <X className="w-5 sm:w-6 h-5 sm:h-6 text-text-muted" />
            </button>
          </div>

          <div className="space-y-6">
            <div className="space-y-4 bg-bg-tertiary/40 p-5 rounded-3xl border border-border-primary/50">
              <div className="flex items-center justify-between px-1">
                <span className="text-[9px] font-black text-text-muted uppercase tracking-wider">Time Selection</span>
                <button 
                  onClick={() => setIsManualTime(!isManualTime)}
                  className="text-[9px] font-bold text-accent-blue hover:underline uppercase"
                >
                  {isManualTime ? 'Use Presets' : 'Enter Manually'}
                </button>
              </div>

              <div className="space-y-1">
                <span className="text-[9px] font-black text-text-muted uppercase tracking-wider block">Interview Date</span>
                <input 
                  type="date"
                  value={date}
                  onChange={e => { setDate(e.target.value); setSelectedSlot(''); }}
                  className="w-full bg-bg-secondary border border-border-primary rounded-xl text-xs p-2 font-bold text-text-primary focus:ring-1 focus:ring-accent-blue"
                />
              </div>

              {!isManualTime ? (
                <div className="space-y-1">
                  <span className="text-[9px] font-black text-text-muted uppercase tracking-wider block">Available Time Slot</span>
                  <TimeSlotSelector
                    value={selectedSlot}
                    onChange={setSelectedSlot}
                    availabilities={allAvailabilities}
                    date={date}
                    className="w-full"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <span className="text-[9px] font-black text-text-muted uppercase tracking-wider block">Start Time (EST)</span>
                    <input 
                      type="time"
                      value={manualStart}
                      onChange={e => setManualStart(e.target.value)}
                      className="w-full bg-bg-secondary border border-border-primary rounded-xl text-xs p-2 font-bold text-text-primary focus:ring-1 focus:ring-accent-blue"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] font-black text-text-muted uppercase tracking-wider block">End Time (EST)</span>
                    <input 
                      type="time"
                      value={manualEnd}
                      onChange={e => setManualEnd(e.target.value)}
                      className="w-full bg-bg-secondary border border-border-primary rounded-xl text-xs p-2 font-bold text-text-primary focus:ring-1 focus:ring-accent-blue"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-text-muted uppercase tracking-widest px-1">Selected Allocation</label>
              
              <div className="space-y-3">
                <div className="space-y-1">
                  <span className="text-[9px] font-black text-text-muted uppercase tracking-wider block">Choose Proxy Member</span>
                  <select
                    value={selectedProxyId}
                    onChange={e => setSelectedProxyId(e.target.value)}
                    className="w-full bg-bg-secondary border border-border-primary rounded-xl text-xs p-2 font-bold text-text-primary focus:ring-1 focus:ring-accent-blue"
                  >
                    <option value="">-- Select Proxy --</option>
                    {team.filter(isProxyUser).map(p => {
                      const isAvailable = assignmentResult.availableProxies.some(ap => ap.id === p.id);
                      const isRecommended = p.id === assignmentResult.bestProxy?.id;
                      return (
                        <option key={p.id} value={p.id}>
                          {p.display_name} {isRecommended ? '(Recommended)' : ''} {!isAvailable ? '(Busy/Conflict)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {assignmentResult.errors && assignmentResult.errors.length > 0 && !selectedProxyId && (
                <div className="p-5 bg-rose-500/10 border border-rose-500/20 rounded-3xl flex gap-3 items-start mt-4">
                  <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-black text-rose-500">Allocation Conflict</p>
                    <p className="text-[10px] text-text-secondary mt-1 leading-relaxed">
                      {assignmentResult.errors[0]}
                    </p>
                  </div>
                </div>
              )}

              {!isSelectedProxyAvailable && selectedProxy && (
                <div className="p-5 bg-accent-red/10 border border-accent-red/20 rounded-3xl flex gap-3 items-start mt-4">
                  <AlertCircle className="w-5 h-5 text-accent-red shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-black text-accent-red">Scheduling Conflict Detected</p>
                    <p className="text-[10px] text-text-secondary mt-1 leading-relaxed">
                      This proxy is already assigned to another interview or has a manual block during this time window (including 15m buffers).
                    </p>
                  </div>
                </div>
              )}

              {selectedProxy && (
                <div className="p-5 bg-accent-green/5 border border-accent-green/10 rounded-3xl space-y-4 mt-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-bg-secondary flex items-center justify-center border border-border-primary text-accent-green">
                      <UserIcon className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-base font-black text-text-primary">{selectedProxy.display_name}</p>
                      <p className="text-[10px] text-accent-green font-black uppercase tracking-wider mt-0.5">
                        {selectedProxyId === assignmentResult.bestProxy?.id ? 'Recommended Profile' : 'Selected Profile'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="pt-3 border-t border-border-primary/50 text-[10px] text-text-muted font-bold space-y-1">
                        <p>🕒 Time: {(() => {
                           if (!startTime || !endTime) return '';
                           const format = (t: string) => {
                             const [h, m] = t.split(':');
                             const hours = parseInt(h);
                             return `${hours % 12 || 12}:${m} ${hours >= 12 ? 'PM' : 'AM'}`;
                           };
                           return `${format(startTime)} EST to ${format(endTime)} EST`;
                        })()}</p>
                        <p>⏳ Buffer: 15m Pre/Post</p>
                    <p>⚡ Workload: Lowest current workload ({allRounds.filter(r => String(r.proxy_user_id) === String(selectedProxyId) && ['confirmed','live'].includes(r.status)).length} active interviews)</p>
                    
                    {/* Real-time Calendar Status */}
                    <div className="mt-2 pt-2 border-t border-border-primary/30">
                      {isCheckingCalendar ? (
                        <p className="text-accent-blue animate-pulse flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 bg-accent-blue rounded-full animate-ping" />
                          Checking Real-time Google Calendar Availability...
                        </p>
                      ) : calendarStatus ? (
                        calendarStatus.isAvailable ? (
                          <p className="text-accent-green flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Confirmed Available on Google Calendar
                          </p>
                        ) : (
                          <p className="text-accent-red flex items-center gap-1.5 font-black">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Potential Conflict on Google Calendar: {calendarStatus.error || 'User is Busy'}
                          </p>
                        )
                      ) : null}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4">
              <button 
                type="button" 
                onClick={onClose}
                className="w-full sm:flex-1 py-3.5 sm:py-4 bg-bg-tertiary text-text-primary font-bold rounded-[20px] hover:bg-bg-tertiary/80 transition-all text-sm text-center"
              >
                Cancel
              </button>
              <button 
                onClick={handleAssign}
                disabled={!selectedProxyId || isSubmitting || isCheckingCalendar || !isSelectedProxyAvailable || !isTimeRangeValid}
                className="w-full sm:flex-1 py-3.5 sm:py-4 bg-accent-blue text-white font-bold rounded-[20px] hover:bg-accent-blue/90 shadow-xl shadow-accent-blue/20 transition-all text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                Commit Assignment
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
