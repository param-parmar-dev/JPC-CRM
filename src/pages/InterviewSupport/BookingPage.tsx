import React, { useState, useEffect, useMemo } from 'react';
import { 
  db 
} from '../../firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  limit, 
  doc, 
  getDoc,
  updateDoc,
  setDoc
} from 'firebase/firestore';
import { 
  InterviewRound, 
  BookingLink, 
  ProxyAvailability, 
  InterviewSupportRequest,
  Candidate,
  User
} from '../../types';
import { 
  Calendar, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  ChevronRight, 
  Globe, 
  MapPin,
  Building,
  Briefcase,
  Upload,
  FileText
} from 'lucide-react';
import { cn, getCalendarDateInfo, parseLocalTimeToDate, getCurrentEasternISOString } from '../../lib/utils';
import { useToast } from '../../contexts/ToastContext';
import { uploadFile } from '../../services/fileService';
import { syncInterviewRoundToGoogleCalendar } from '../../services/calendarService';
import { findBestProxyForWindow, isProxyUser } from '../../services/interviewService';

const DetailCard: React.FC<{ label: string; value: string | undefined; icon: any }> = ({ label, value, icon: Icon }) => (
  <div className="flex items-center gap-5 p-5 bg-bg-tertiary rounded-[24px] border border-border-primary shadow-sm hover:border-accent-blue/30 transition-all">
    <div className="w-12 h-12 bg-bg-secondary rounded-xl flex items-center justify-center border border-border-primary text-accent-blue font-sans">
      <Icon className="w-6 h-6" />
    </div>
    <div>
      <p className="text-[10px] font-black text-text-muted uppercase tracking-widest font-sans">{label}</p>
      <p className="text-lg font-black text-text-primary mt-0.5 font-sans">{value || 'N/A'}</p>
    </div>
  </div>
);

import { Users, X } from 'lucide-react';

export const BookingPage: React.FC = () => {
  const token = window.location.hash.split('/').pop();
  const { showToast } = useToast();
  const navigate = () => window.location.hash = '#dashboard';
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bookingLink, setBookingLink] = useState<BookingLink | null>(null);
  const [round, setRound] = useState<InterviewRound| null>(null);
  const [request, setRequest] = useState<InterviewSupportRequest | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [recruiter, setRecruiter] = useState<User | null>(null);
  
  const [availability, setAvailability] = useState<ProxyAvailability[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const [isAcknowledgeSuccess, setIsAcknowledgeSuccess] = useState(false);

  // States for 'interview-support-only' self-service form
  const [formCandidateName, setFormCandidateName] = useState('');
  const [formCandidateEmail, setFormCandidateEmail] = useState('');
  const [formCandidatePhone, setFormCandidatePhone] = useState('');
  const [formCandidateWhatsApp, setFormCandidateWhatsApp] = useState('');
  const [formCompany, setFormCompany] = useState('');
  const [formJobTitle, setFormJobTitle] = useState('');
  const [formJobLink, setFormJobLink] = useState('');
  const [formJobDescription, setFormJobDescription] = useState('');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Request Base / Custom Direct booking schedule states
  const [customDate, setCustomDate] = useState('');
  const [customStartTime, setCustomStartTime] = useState('');
  const [customEndTime, setCustomEndTime] = useState('');

  // Support databases for auto-assignment conflict checking
  const [proxyTeam, setProxyTeam] = useState<User[]>([]);
  const [allRounds, setAllRounds] = useState<InterviewRound[]>([]);
  const [allAvailabilities, setAllAvailabilities] = useState<ProxyAvailability[]>([]);
  const [allCalendarEvents, setAllCalendarEvents] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!token) throw new Error('Invalid link');

        // Load background helper collections for real-time conflict evaluation
        const usersSnap = await getDocs(collection(db, 'jpc_users'));
        const activeProxies = usersSnap.docs
          .map(d => ({ ...d.data(), id: d.id } as User))
          .filter(u => isProxyUser(u) && u.google_calendar_connected === true);
        setProxyTeam(activeProxies);

        const roundsSnap = await getDocs(collection(db, 'jpc_interview_rounds'));
        const activeRounds = roundsSnap.docs
          .map(d => ({ ...d.data(), id: d.id } as InterviewRound))
          .filter(r => r.status !== 'cancelled');
        setAllRounds(activeRounds);

        const availSnap = await getDocs(collection(db, 'jpc_proxy_availability'));
        const avails = availSnap.docs.map(d => ({ ...d.data(), id: d.id } as ProxyAvailability));
        setAllAvailabilities(avails);

        const calEventsSnap = await getDocs(collection(db, 'jpc_calendar_events'));
        const calEvents = calEventsSnap.docs.map(d => ({ ...d.data(), id: d.id }));
        setAllCalendarEvents(calEvents);

        // Check if this is the generic self-service form
        if (token === 'interview-support-only') {
          setLoading(false);
          return;
        }

        // 1. Get booking link
        const linkQuery = query(collection(db, 'jpc_interview_booking_links'), where('token', '==', token), limit(1));
        const linkSnap = await getDocs(linkQuery);
        if (linkSnap.empty) throw new Error('Invalid or expired booking link');
        
        const linkData = linkSnap.docs[0].data() as BookingLink;
        
        if (linkData.booked_at) {
          setError('ALREADY_BOOKED');
          setBookingLink(linkData);
          setLoading(false);
          return;
        }

        if (!linkData.is_active || new Date(linkData.expires_at) < new Date()) {
          throw new Error('This booking link has expired or is no longer active');
        }

        setBookingLink(linkData);

        // 2. Get round
        const roundSnap = await getDoc(doc(db, 'jpc_interview_rounds', linkData.interview_round_id));
        if (!roundSnap.exists()) throw new Error('Interview round not found');
        const roundData = roundSnap.data() as InterviewRound;
        setRound(roundData);

        // 3. Get request
        const reqSnap = await getDoc(doc(db, 'jpc_interview_requests', roundData.request_id));
        if (!reqSnap.exists()) throw new Error('Interview request not found');
        const reqData = reqSnap.data() as InterviewSupportRequest;
        setRequest(reqData);

        // 4. Get Candidate & Recruiter info
        const [candSnap, recSnap] = await Promise.all([
          getDoc(doc(db, 'jpc_candidates', reqData.candidate_id)),
          getDoc(doc(db, 'jpc_users', reqData.recruiter_id))
        ]);
        setCandidate(candSnap.data() as Candidate);
        setRecruiter(recSnap.data() as User);

        // 5. Get Availability - Only if proxy is required
        if (reqData.proxy_required) {
          // Booking works automatically based on slots available from BOTH/ALL proxies.
          // This allows dynamic/automatic assignment of the proxy who owns the booked slot.
          const availQuery = query(
            collection(db, 'jpc_proxy_availability'), 
            where('slot_status', '==', 'available')
          );
          const availSnap = await getDocs(availQuery);
          const nowEastern = getCurrentEasternISOString();

          // Only keep slots of proxies with Google Calendar connected
          const usersSnap = await getDocs(collection(db, 'jpc_users'));
          const connectedProxyIds = new Set(
            usersSnap.docs
              .map(d => d.data() as User)
              .filter(u => isProxyUser(u) && u.google_calendar_connected === true)
              .map(u => String(u.id))
          );

          setAvailability(availSnap.docs
            .map(d => ({ ...d.data(), id: d.id } as ProxyAvailability))
            .filter(slot => {
              // Compare formatted local strings directly to prevent client timezone offset bugs
              const isProxyConnected = connectedProxyIds.has(String(slot.proxy_user_id));
              return slot.slot_start >= nowEastern && isProxyConnected;
            })
          );
        }

        // Mark link as opened
        if (!linkData.opened_at) {
          await updateDoc(doc(db, 'jpc_interview_booking_links', linkData.id), { opened_at: new Date().toISOString() });
          
          // Notify Recruiter
          if (reqData.recruiter_id) {
            const notifId = Math.random().toString(36).slice(2, 11);
            await setDoc(doc(db, 'jpc_interview_notifications', notifId), {
              id: notifId,
              interview_round_id: linkData.interview_round_id,
              notification_type: 'link_opened',
              recipient_user_id: reqData.recruiter_id,
              message: `Candidate has viewed the interview details for ${reqData.interview_company_name}.`,
              is_read: false,
              created_at: new Date().toISOString()
            });
          }
        }

        setLoading(false);
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    };

    fetchData();
  }, [token]);

  const handleAcknowledge = async () => {
    if (!bookingLink || !round || !request) return;
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'jpc_interview_rounds', round.id), {
        status: 'confirmed'
      });

      await updateDoc(doc(db, 'jpc_interview_requests', request.id), {
        overall_status: 'confirmed'
      });

      await updateDoc(doc(db, 'jpc_interview_booking_links', bookingLink.id), {
        booked_at: new Date().toISOString(),
        is_active: false
      });

      const logId = Math.random().toString(36).slice(2, 11);
      await setDoc(doc(db, 'jpc_interview_activity_logs', logId), {
        id: logId,
        interview_round_id: round.id,
        action: 'CANDIDATE_ACKNOWLEDGED',
        action_by: 'candidate',
        created_at: new Date().toISOString()
      });

      const recruiterNotifId = Math.random().toString(36).slice(2, 11);
      await setDoc(doc(db, 'jpc_interview_notifications', recruiterNotifId), {
        id: recruiterNotifId,
        interview_round_id: round.id,
        notification_type: 'custom',
        recipient_user_id: request.recruiter_id,
        message: `Candidate ${candidate?.full_name || 'Generic'} has acknowledged the interview details for ${request.interview_company_name}.`,
        is_read: false,
        created_at: new Date().toISOString()
      });

      setIsAcknowledgeSuccess(true);
      showToast('Acknowledgement received!', 'success');
    } catch (error) {
      showToast('Update failed. Please try again.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const checkAndResolveAvailableSlot = async (selectedSlotIdStr: string) => {
    const selectedSlotBase = availability.find(s => s.id === selectedSlotIdStr);
    if (!selectedSlotBase) throw new Error('Selected slot details not found.');

    const usersSnap = await getDocs(collection(db, 'jpc_users'));
    let proxyUsers = usersSnap.docs
      .map(d => d.data() as User)
      .filter(u => isProxyUser(u) && u.google_calendar_connected === true);

    if (proxyUsers.length === 0) {
      throw new Error('No proxy specialists with an active/connected Google Calendar are available.');
    }

    const allRoundsSnap = await getDocs(collection(db, 'jpc_interview_rounds'));
    
    const chosenStart = new Date(selectedSlotBase.slot_start);
    const chosenEnd = selectedSlotBase.slot_end 
      ? new Date(selectedSlotBase.slot_end) 
      : new Date(chosenStart.getTime() + 60 * 60 * 1000);

    const busyProxyIds = new Set<string>();
    allRoundsSnap.docs.forEach(d => {
      const r = d.data();
      if (r.status === 'cancelled' || r.status === 'rejected' || !r.booked_slot_time) return;
      
      const rndStart = new Date(r.booked_slot_time);
      const rndEnd = r.booked_slot_end 
        ? new Date(r.booked_slot_end) 
        : new Date(rndStart.getTime() + (r.duration_minutes || 60) * 60 * 1000);
        
      const bufferRndStart = new Date(rndStart.getTime() - 15 * 60 * 1000);
      const bufferRndEnd = new Date(rndEnd.getTime() + 15 * 60 * 1000);
      
      if (bufferRndStart < chosenEnd && chosenStart < bufferRndEnd) {
        if (r.proxy_user_id) {
          busyProxyIds.add(String(r.proxy_user_id));
        }
      }
    });

    const sameTimeBlockedAvailsSnap = await getDocs(query(
      collection(db, 'jpc_proxy_availability'),
      where('slot_start', '==', selectedSlotBase.slot_start),
      where('slot_status', 'in', ['unavailable', 'leave', 'break'])
    ));
    const blockedProxyIds = new Set(sameTimeBlockedAvailsSnap.docs.map(d => String(d.data().proxy_user_id)));

    const allSameTimeSlotsSnap = await getDocs(query(
      collection(db, 'jpc_proxy_availability'),
      where('slot_start', '==', selectedSlotBase.slot_start)
    ));
    const sameTimeSlots = allSameTimeSlotsSnap.docs.map(d => ({ id: d.id, ...d.data() as ProxyAvailability }));

    const availableProxiesWithSlots = proxyUsers.map(pu => {
      const isBusyInRound = busyProxyIds.has(String(pu.id));
      const isBlockedInAvail = blockedProxyIds.has(String(pu.id));
      const proxySlot = sameTimeSlots.find(s => String(s.proxy_user_id) === String(pu.id));
      
      const isFree = !isBusyInRound && !isBlockedInAvail && proxySlot && proxySlot.slot_status === 'available';
      return {
        user: pu,
        slot: proxySlot,
        isFree
      };
    }).filter(item => item.isFree);

    if (availableProxiesWithSlots.length === 0) {
      throw new Error('CONFLICT_ALL_BUSY');
    }

    let chosenItem = availableProxiesWithSlots.find(item => item.slot?.id === selectedSlotIdStr);
    if (!chosenItem) {
      chosenItem = availableProxiesWithSlots[0];
    }
    return chosenItem.slot!;
  };

  const dates = useMemo(() => {
    const uniqueDates = Array.from(new Set(availability.map(a => a.slot_start.split('T')[0])));
    return uniqueDates.sort().map(d => getCalendarDateInfo(d));
  }, [availability]);

  const slotsForSelectedDate = useMemo(() => {
    if (!selectedDate) return [];
    
    // Filter slots for chosen date
    const filtered = availability.filter(a => a.slot_start.startsWith(selectedDate))
      .sort((a, b) => a.slot_start.localeCompare(b.slot_start));
    
    // Deduplicate slots by slot_start to avoid duplicate times selection list
    const seen = new Set<string>();
    return filtered.filter(slot => {
      if (seen.has(slot.slot_start)) return false;
      seen.add(slot.slot_start);
      return true;
    });
  }, [selectedDate, availability]);

  const selectedCalendarDateInfo = useMemo(() => {
    if (!selectedDate) return null;
    return getCalendarDateInfo(selectedDate);
  }, [selectedDate]);

  const assignmentResult = useMemo(() => {
    if (!customDate || !customStartTime || !customEndTime) {
      return { bestProxy: null, availableProxies: [], errors: ['Please input date, start time, and end time to calculate assignments.'] };
    }
    return findBestProxyForWindow(customDate, customStartTime, customEndTime, proxyTeam, allRounds, allAvailabilities, allCalendarEvents);
  }, [customDate, customStartTime, customEndTime, proxyTeam, allRounds, allAvailabilities, allCalendarEvents]);

  const handleBook = async () => {
    if (token === 'interview-support-only') {
      if (!formCandidateName.trim() || !formCandidateEmail.trim() || !formCandidatePhone.trim() || !formCandidateWhatsApp.trim() || !formCompany.trim() || !formJobTitle.trim() || !formJobDescription.trim()) {
        showToast('Please fill in all required fields.', 'error');
        return;
      }
      if (!customDate || !customStartTime || !customEndTime) {
        showToast('Please specify the date, start time, and end time.', 'error');
        return;
      }
      if (!assignmentResult.bestProxy) {
        showToast('No Proxy Specialist is available at this time. Please adjust the slot schedule.', 'error');
        return;
      }

      setIsSubmitting(true);
      try {
        const assignedProxy = assignmentResult.bestProxy;
        const bookedStart = `${customDate}T${customStartTime}:00`;
        const bookedEnd = `${customDate}T${customEndTime}:00`;

        const startD = new Date(bookedStart);
        const endD = new Date(bookedEnd);
        const durationMin = Math.max(15, Math.round((endD.getTime() - startD.getTime()) / 60000));

        // Upload Resume if selected
        let uploadedResumeUrl = '';
        if (resumeFile) {
          setIsUploading(true);
          try {
            uploadedResumeUrl = await uploadFile(resumeFile, {
              name: formCandidateName.trim(),
              email: formCandidateEmail.trim().toLowerCase(),
              phone: formCandidatePhone.trim()
            });
          } catch (uploadErr) {
            console.error('Failed to upload resume:', uploadErr);
            showToast('Failed to upload resume. Please try a different file, or submit without it.', 'error');
            setIsUploading(false);
            setIsSubmitting(false);
            return;
          }
          setIsUploading(false);
        }

        // 3. Search or create Candidate in the system
        let finalCandidateId = '';
        const emailQuery = query(collection(db, 'jpc_candidates'), where('email', '==', formCandidateEmail.trim().toLowerCase()));
        const candSnap = await getDocs(emailQuery);
        if (!candSnap.empty) {
          finalCandidateId = candSnap.docs[0].id;
          const candidateUpdates: any = {
            current_stage: 'interviewing',
            updated_at: new Date().toISOString()
          };
          if (uploadedResumeUrl) {
            candidateUpdates.resume_url = uploadedResumeUrl;
            candidateUpdates.resume_base64 = uploadedResumeUrl;
            candidateUpdates.resume_filename = resumeFile ? resumeFile.name : null;
          }
          await updateDoc(doc(db, 'jpc_candidates', finalCandidateId), candidateUpdates);
        } else {
          finalCandidateId = 'cand_' + Math.random().toString(36).slice(2, 11);
          const newCandidateObject: Candidate = {
            id: finalCandidateId,
            full_name: formCandidateName.trim(),
            phone: formCandidatePhone.trim(),
            email: formCandidateEmail.trim().toLowerCase(),
            whatsapp: formCandidateWhatsApp.trim(),
            job_interest: formJobTitle.trim(),
            domain_interested: 'Interview Support Only',
            location: 'N/A',
            education: 'N/A',
            degree: 'N/A',
            university: 'N/A',
            graduation_year: 'N/A',
            experience_years: '0',
            current_company: 'N/A',
            current_designation: 'N/A',
            skills: 'N/A',
            linkedin_url: 'N/A',
            lead_source: 'Interview Support Self-Service',
            lead_generated_by: null,
            assigned_sales: null,
            assigned_cs: null,
            assigned_resume: null,
            assigned_marketing_leader: null,
            assigned_recruiter: null,
            assigned_marketing: null,
            package_name: 'Interview Support',
            package_amount: 0,
            domain_suggested: 'N/A',
            notes: 'Registered and self-booked via interview support direct landing form.',
            current_stage: 'interviewing',
            resume_url: uploadedResumeUrl || null,
            resume_base64: uploadedResumeUrl || null,
            resume_filename: resumeFile ? resumeFile.name : null,
            flags: {
              agreement_sent: false,
              agreement_signed: false,
              qc_checklist_done: false,
              resume_approved: false,
              candidate_resume_approved: false,
              marketing_email_created: false,
              two_step_verification: false,
              linkedin_optimized: false,
              marketing_started: false
            },
            deleted_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          await setDoc(doc(db, 'jpc_candidates', finalCandidateId), newCandidateObject);
        }

        // 4. Create Support Request auto-assigned to the proxy user (Proxy Team)
        const reqId = 'req_' + Math.random().toString(36).slice(2, 11);
        const newRequestObject: InterviewSupportRequest = {
          id: reqId,
          candidate_id: finalCandidateId,
          recruiter_id: 'system',
          cs_id: null,
          company_name: formCompany.trim(),
          interview_company_name: formCompany.trim(),
          job_title: formJobTitle.trim(),
          interview_type: 'technical',
          timezone: 'America/New_York',
          notes: 'Self-booked via online Direct Interview Support link.',
          whatsapp_number: formCandidateWhatsApp.trim(),
          job_link: formJobLink.trim(),
          application_link: '',
          job_description: formJobDescription.trim(),
          latest_resume_id: 'original',
          proxy_required: true,
          proxy_user_id: assignedProxy.id,
          overall_status: 'confirmed',
          created_by: 'candidate',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        await setDoc(doc(db, 'jpc_interview_requests', reqId), newRequestObject);

        // 5. Create Interview Round mapped to the custom times & auto-assigned to the proxy
        const roundId = 'rnd_' + Math.random().toString(36).slice(2, 11);
        const newRoundObject: InterviewRound = {
          id: roundId,
          request_id: reqId,
          round_label: 'Technical Round',
          round_type: 'technical',
          interview_date: customDate,
          duration_minutes: durationMin,
          status: 'confirmed',
          proxy_user_id: assignedProxy.id,
          booking_link_token: 'interview-support-only',
          booked_slot_time: bookedStart,
          booked_slot_end: bookedEnd,
          live_started_at: null,
          completed_at: null,
          feedback_submitted_at: null,
          result: null,
          created_by: 'candidate',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        await setDoc(doc(db, 'jpc_interview_rounds', roundId), newRoundObject);

        // 6. Log internal Activity
        const logId = Math.random().toString(36).slice(2, 11);
        await setDoc(doc(db, 'jpc_interview_activity_logs', logId), {
          id: logId,
          interview_round_id: roundId,
          action: 'SLOT_BOOKED',
          action_by: 'candidate',
          meta_data: { date: customDate, start: bookedStart, end: bookedEnd, self_service: true },
          created_at: new Date().toISOString()
        });

        // 7. Dispatch Proxy Notification
        const notificationId = Math.random().toString(36).slice(2, 11);
        await setDoc(doc(db, 'jpc_interview_notifications', notificationId), {
          id: notificationId,
          interview_round_id: roundId,
          notification_type: 'slot_selected',
          recipient_user_id: assignedProxy.id,
          message: `Direct Profile Confirmed! Candidate ${formCandidateName} has entered details and reserved your proxy slot on ${parseLocalTimeToDate(bookedStart, 'America/New_York').toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' })} EST.`,
          is_read: false,
          created_at: new Date().toISOString()
        });

        // Sync to Proxy Google Calendar if connected
        try {
          await syncInterviewRoundToGoogleCalendar(roundId, reqId, assignedProxy.id);
        } catch (calErr) {
          console.error('[CalendarSync] Direct booking calendar sync error:', calErr);
        }

        setIsSuccess(true);
        showToast('Interview support booked and assigned successfully!', 'success');
      } catch (err: any) {
        showToast('Encountered error during booking: ' + err.message, 'error');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (!selectedSlotId || !bookingLink || !round || !request) return;
    setIsSubmitting(true);
    try {
      let slot: ProxyAvailability;
      try {
        slot = await checkAndResolveAvailableSlot(selectedSlotId);
      } catch (resolveErr: any) {
        if (resolveErr.message === 'CONFLICT_ALL_BUSY') {
          showToast('All proxy specialists (Nihal and Rudra) are busy, on leave, or already booked at this exact time. Please select another slot.', 'error');
        } else {
          showToast(resolveErr.message || 'Error checking availability. Please try again.', 'error');
        }
        setIsSubmitting(false);
        return;
      }

      const slotRef = doc(db, 'jpc_proxy_availability', slot.id);
      // Update Slot
      await updateDoc(slotRef, { slot_status: 'booked' });

      // 3. Update Round
      await updateDoc(doc(db, 'jpc_interview_rounds', round.id), {
        status: 'booked',
        interview_date: slot.slot_start,
        booked_slot_time: slot.slot_start,
        booked_slot_end: slot.slot_end,
        proxy_user_id: slot.proxy_user_id
      });

      // 4. Update Booking Link
      await updateDoc(doc(db, 'jpc_interview_booking_links', bookingLink.id), {
        booked_at: new Date().toISOString(),
        is_active: false
      });

      // 5. Update Request status and proxy_user_id
      await updateDoc(doc(db, 'jpc_interview_requests', request.id), {
        overall_status: 'candidate_slot_selected',
        proxy_user_id: slot.proxy_user_id
      });

      // 5. Activity Log
      const logId = Math.random().toString(36).slice(2, 11);
      await setDoc(doc(db, 'jpc_interview_activity_logs', logId), {
        id: logId,
        interview_round_id: round.id,
        action: 'SLOT_BOOKED',
        action_by: 'candidate',
        meta_data: { slot_id: slot.id, time: slot.slot_start },
        created_at: new Date().toISOString()
      });

      // 6. Notifications
      const now = new Date().toISOString();
      
      // Notify Proxy
      const proxyNotifId = Math.random().toString(36).slice(2, 11);
      await setDoc(doc(db, 'jpc_interview_notifications', proxyNotifId), {
        id: proxyNotifId,
        interview_round_id: round.id,
        notification_type: 'slot_selected',
        recipient_user_id: slot.proxy_user_id,
        message: `Interview booked! Candidate ${candidate?.full_name || 'Generic'} has scheduled their interview for ${parseLocalTimeToDate(slot.slot_start, 'America/New_York').toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' })} EST.`,
        is_read: false,
        created_at: now
      });

      // Notify Recruiter
      const recruiterNotifId = Math.random().toString(36).slice(2, 11);
      await setDoc(doc(db, 'jpc_interview_notifications', recruiterNotifId), {
        id: recruiterNotifId,
        interview_round_id: round.id,
        notification_type: 'slot_selected',
        recipient_user_id: request.recruiter_id,
        message: `Candidate ${candidate?.full_name || 'Generic'} has booked their round for ${request.interview_company_name}.`,
        is_read: false,
        created_at: now
      });

      // Sync to Proxy Google Calendar if connected
      try {
        await syncInterviewRoundToGoogleCalendar(round.id, request.id, slot.proxy_user_id);
      } catch (calErr) {
        console.error('[CalendarSync] Existing request calendar sync error:', calErr);
      }

      setIsSuccess(true);
      showToast('Interview booked successfully!', 'success');
    } catch (error) {
      showToast('Booking failed. Please try again.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center p-6">
        <div className="w-12 h-12 border-4 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
      </div>
    );
  }

  if (error === 'ALREADY_BOOKED' || isSuccess || isAcknowledgeSuccess) {
    const isSupportOnly = token === 'interview-support-only';
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4 sm:p-6">
        <div className="max-w-md w-full bg-bg-secondary p-6 sm:p-12 rounded-3xl sm:rounded-[40px] md:rounded-[60px] border border-border-primary shadow-2xl text-center animate-fade-in">
          <div className="w-24 h-24 bg-accent-green/10 rounded-full flex items-center justify-center mx-auto mb-8 border border-accent-green/20">
            <CheckCircle2 className="w-12 h-12 text-accent-green" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-text-primary tracking-tight mb-4">
            {isAcknowledgeSuccess ? 'Acknowledged!' : 'Confirmed!'}
          </h1>
          <p className="text-text-secondary font-medium leading-relaxed">
            {isAcknowledgeSuccess 
              ? "You have acknowledged the interview details. Your recruiter has been notified."
              : isSupportOnly
                ? "Your Interview Support request has been successfully created and your technical round's proxy slot is reserved. Our expert Proxy Team is automatically assigned!"
                : "Your interview has been successfully scheduled. You'll receive a confirmation email with all the details shortly."}
          </p>
          <div className="mt-10 pt-10 border-t border-border-primary">
            <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.3em]">Next Steps</p>
            <p className="text-sm font-bold text-text-primary mt-2">
              {isAcknowledgeSuccess 
                ? 'Wait for further instructions from your recruiter' 
                : isSupportOnly
                  ? 'Keep an eye on WhatsApp and email for coordination'
                  : 'Check your email for the calendar invite'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4 sm:p-6">
        <div className="max-w-md w-full bg-bg-secondary p-6 sm:p-12 rounded-3xl sm:rounded-[40px] md:rounded-[60px] border border-border-primary shadow-2xl text-center">
          <div className="w-20 h-20 bg-accent-red/10 rounded-full flex items-center justify-center mx-auto mb-8 border border-accent-red/20">
            <AlertCircle className="w-10 h-10 text-accent-red" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-text-primary tracking-tight mb-4">Invalid Link</h1>
          <p className="text-text-secondary font-medium leading-relaxed">{error}</p>
          <button 
            onClick={() => navigate()}
            className="mt-8 px-8 py-3 bg-bg-tertiary text-text-primary font-bold rounded-2xl border border-border-primary hover:bg-bg-tertiary/70 transition-all"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  if (token === 'interview-support-only') {
    return (
      <div className="min-h-screen bg-bg-primary py-6 sm:py-12 px-3 sm:px-6">
        <div className="max-w-5xl mx-auto space-y-8 sm:space-y-12 animate-fade-in">
          {/* Top Branding/Header */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 sm:gap-8 bg-bg-secondary p-6 sm:p-10 rounded-3xl sm:rounded-[40px] md:rounded-[60px] border border-border-primary shadow-xl">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-accent-blue flex items-center justify-center">
                  <Calendar className="w-4 h-4 text-white" />
                </span>
                <span className="text-[10px] font-black text-text-muted uppercase tracking-[0.4em]">Interview Support System</span>
              </div>
              <h1 className="text-3xl sm:text-5xl font-black text-text-primary tracking-tight leading-[1.1]">
                Book <span className="text-accent-blue">Interview Support</span>
              </h1>
              <p className="text-sm text-text-secondary max-w-2xl font-medium leading-relaxed">
                Provide your candidate information and technical interview details below. The system will lock your chosen time slot and automatically assign our Proxy Team to support you.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Form Section */}
            <div className="lg:col-span-7 bg-bg-secondary rounded-3xl sm:rounded-[40px] md:rounded-[60px] p-6 sm:p-10 border border-border-primary shadow-xl space-y-8">
              <h2 className="text-2xl font-black text-text-primary tracking-tight">1. Candidate & Job Information</h2>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-widest px-1">Candidate Full Name *</label>
                  <input 
                    required
                    type="text"
                    value={formCandidateName}
                    onChange={e => setFormCandidateName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full px-5 py-4 bg-bg-tertiary border border-border-primary rounded-[20px] text-sm focus:ring-2 focus:ring-accent-blue/20 outline-none font-bold text-text-primary h-[56px]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-widest px-1">Email Address *</label>
                  <input 
                    required
                    type="email"
                    value={formCandidateEmail}
                    onChange={e => setFormCandidateEmail(e.target.value)}
                    placeholder="john.doe@example.com"
                    className="w-full px-5 py-4 bg-bg-tertiary border border-border-primary rounded-[20px] text-sm focus:ring-2 focus:ring-accent-blue/20 outline-none font-bold text-text-primary h-[56px]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-widest px-1">Phone Number *</label>
                  <input 
                    required
                    type="tel"
                    value={formCandidatePhone}
                    onChange={e => setFormCandidatePhone(e.target.value)}
                    placeholder="+1 (555) 019-2834"
                    className="w-full px-5 py-4 bg-bg-tertiary border border-border-primary rounded-[20px] text-sm focus:ring-2 focus:ring-accent-blue/20 outline-none font-bold text-text-primary h-[56px]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-widest px-1">WhatsApp Number *</label>
                  <input 
                    required
                    type="tel"
                    value={formCandidateWhatsApp}
                    onChange={e => setFormCandidateWhatsApp(e.target.value)}
                    placeholder="For instant coordination"
                    className="w-full px-5 py-4 bg-bg-tertiary border border-border-primary rounded-[20px] text-sm focus:ring-2 focus:ring-accent-blue/20 outline-none font-bold text-text-primary h-[56px]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-widest px-1">Interview Company *</label>
                  <input 
                    required
                    type="text"
                    value={formCompany}
                    onChange={e => setFormCompany(e.target.value)}
                    placeholder="Target Company"
                    className="w-full px-5 py-4 bg-bg-tertiary border border-border-primary rounded-[20px] text-sm focus:ring-2 focus:ring-accent-blue/20 outline-none font-bold text-text-primary h-[56px]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-widest px-1">Job Title *</label>
                  <input 
                    required
                    type="text"
                    value={formJobTitle}
                    onChange={e => setFormJobTitle(e.target.value)}
                    placeholder="Software Engineer, etc."
                    className="w-full px-5 py-4 bg-bg-tertiary border border-border-primary rounded-[20px] text-sm focus:ring-2 focus:ring-accent-blue/20 outline-none font-bold text-text-primary h-[56px]"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-widest px-1">Job Link (Optional)</label>
                  <input 
                    type="url"
                    value={formJobLink}
                    onChange={e => setFormJobLink(e.target.value)}
                    placeholder="Paste job posting or description URL"
                    className="w-full px-5 py-4 bg-bg-tertiary border border-border-primary rounded-[20px] text-sm focus:ring-2 focus:ring-accent-blue/20 outline-none font-bold text-text-primary h-[56px]"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-widest px-1">Job Description</label>
                  <textarea 
                    required
                    value={formJobDescription}
                    onChange={e => setFormJobDescription(e.target.value)}
                    placeholder="Paste full job description or any specific topics/requirements..."
                    rows={4}
                    className="w-full px-5 py-4 bg-bg-tertiary border border-border-primary rounded-[20px] text-sm focus:ring-2 focus:ring-accent-blue/20 outline-none resize-none font-bold text-text-primary"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2 text-left">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-widest px-1">Upload Resume (Required) <span className="text-accent-red font-black">*</span></label>
                  <div className="flex items-center gap-4 bg-bg-tertiary border border-border-primary rounded-[20px] p-4">
                    <input 
                      type="file" 
                      id="resume-upload-input"
                      accept=".pdf,.doc,.docx"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) {
                          if (file.size > 5 * 1024 * 1024) {
                            showToast('File is too large (Max 5MB). Please compress or upload a smaller file.', 'error');
                            return;
                          }
                          setResumeFile(file);
                          showToast(`Selected resume: ${file.name}`, 'success');
                        }
                      }}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => document.getElementById('resume-upload-input')?.click()}
                      className="px-6 py-3 bg-bg-secondary hover:bg-bg-secondary/80 text-text-primary text-xs font-bold rounded-xl border border-border-primary hover:border-accent-blue/30 transition-all flex items-center gap-2 shrink-0 active:scale-95"
                    >
                      <Upload className="w-4 h-4 text-accent-blue" />
                      Browse Resume
                    </button>
                    {resumeFile ? (
                      <div className="flex items-center gap-2 overflow-hidden flex-1">
                        <FileText className="w-4 h-4 text-accent-blue shrink-0" />
                        <span className="text-xs text-text-primary font-bold truncate">
                          {resumeFile.name}
                        </span>
                        <span className="text-[10px] text-text-muted shrink-0">
                          ({(resumeFile.size / (1024 * 1024)).toFixed(2)} MB)
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-accent-red truncate font-medium">
                        Resume is required (PDF, DOC, DOCX up to 5MB)
                      </span>
                    )}
                    {resumeFile && (
                      <button
                        type="button"
                        onClick={() => {
                          setResumeFile(null);
                          const input = document.getElementById('resume-upload-input') as HTMLInputElement;
                          if (input) input.value = '';
                        }}
                        className="p-1 hover:bg-bg-secondary rounded-full ml-auto text-text-muted hover:text-text-primary transition-colors"
                        title="Remove resume"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Custom Date & Time Inputs matching Request Base */}
              <div className="border-t border-border-primary pt-8 space-y-8 font-sans">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h2 className="text-2xl font-black text-text-primary tracking-tight">2. Select Date & Time (EST)</h2>
                    <p className="text-[10px] font-bold text-amber-500 animate-pulse">⚠️ IMPORTANT: PLEASE PUT ALL TIMINGS IN EST TIMEZONE</p>
                  </div>
                  <div className="bg-bg-tertiary px-4 py-2 rounded-2xl border border-border-primary text-[10px] font-black text-text-muted uppercase tracking-widest flex items-center gap-1.5 font-sans h-fit self-start sm:self-auto">
                    <MapPin className="w-3" /> Timezone: America/New_York (EST)
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-widest px-1">Interview Date *</label>
                    <input 
                      required
                      type="date"
                      value={customDate}
                      onChange={e => setCustomDate(e.target.value)}
                      className="w-full px-5 py-4 bg-bg-tertiary border border-border-primary rounded-[20px] text-sm focus:ring-2 focus:ring-accent-blue/20 outline-none font-bold text-text-primary h-[56px] font-sans"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-widest px-1">Start Time (EST) *</label>
                    <input 
                      required
                      type="time"
                      value={customStartTime}
                      onChange={e => setCustomStartTime(e.target.value)}
                      className="w-full px-5 py-4 bg-bg-tertiary border border-border-primary rounded-[20px] text-sm focus:ring-2 focus:ring-accent-blue/20 outline-none font-bold text-text-primary h-[56px] font-sans"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-widest px-1">End Time *</label>
                    <input 
                      required
                      type="time"
                      value={customEndTime}
                      onChange={e => setCustomEndTime(e.target.value)}
                      className="w-full px-5 py-4 bg-bg-tertiary border border-border-primary rounded-[20px] text-sm focus:ring-2 focus:ring-accent-blue/20 outline-none font-bold text-text-primary h-[56px] font-sans"
                    />
                  </div>
                </div>

                {/* Assignment & Availability Details Feedback */}
                {customDate && customStartTime && customEndTime && (
                  <div className="p-6 rounded-[24px] border transition-all animate-fade-in space-y-2 bg-bg-tertiary/60 border-border-primary/50">
                    {assignmentResult.bestProxy ? (
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-accent-green/10 text-accent-green rounded-xl flex items-center justify-center border border-accent-green/20">
                          <CheckCircle2 className="w-5 h-5 animate-bounce-slow" />
                        </div>
                        <div>
                          <p className="text-sm font-black text-text-primary">Specialist Available</p>
                          <p className="text-xs font-bold text-text-secondary mt-0.5">
                            Our primary Proxy Specialist ({assignmentResult.bestProxy.display_name}) is active and available. Booking this slot will lock in support instantly.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-4 p-1">
                        <div className="w-10 h-10 bg-accent-red/10 text-accent-red rounded-xl flex items-center justify-center border border-accent-red/20 shrink-0">
                          <AlertCircle className="w-5 h-5 text-accent-red animate-pulse" />
                        </div>
                        <div>
                          <p className="text-sm font-black text-text-primary">Schedule Conflict Detected</p>
                          <p className="text-xs font-bold text-text-secondary mt-0.5">
                            All specialists have a conflicting session, leave block, or another booking. Please choose a different date/time.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Review and Booking confirmation Sticky card */}
            <div className="lg:col-span-5 lg:sticky lg:top-8 font-sans">
              <div className="bg-bg-secondary rounded-3xl sm:rounded-[40px] md:rounded-[60px] p-6 sm:p-10 border border-border-primary shadow-2xl space-y-8 overflow-hidden relative">
                <div className="relative z-10 space-y-8">
                  <h2 className="text-2xl font-black text-text-primary tracking-tight">Review Support Details</h2>
                  
                  <div className="space-y-6">
                    <div className="flex items-center gap-5">
                      <div className="w-14 h-14 bg-bg-tertiary rounded-2xl flex items-center justify-center border border-border-primary shadow-sm text-accent-blue">
                        <Briefcase className="w-7 h-7" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-text-muted uppercase tracking-widest leading-none">Selected Company</p>
                        <p className="text-xl font-black text-text-primary mt-1">{formCompany || '—'}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-5">
                      <div className="w-14 h-14 bg-bg-tertiary rounded-2xl flex items-center justify-center border border-border-primary shadow-sm text-accent-blue">
                        <Users className="w-7 h-7" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-text-muted uppercase tracking-widest leading-none">Candidate</p>
                        <p className="text-xl font-black text-text-primary mt-1">{formCandidateName || '—'}</p>
                      </div>
                    </div>

                    {customDate && (
                      <div className="flex items-center gap-5 animate-fade-in">
                        <div className="w-14 h-14 bg-bg-tertiary rounded-2xl flex items-center justify-center border border-border-primary shadow-sm text-accent-blue">
                          <Calendar className="w-7 h-7" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-text-muted uppercase tracking-widest leading-none">Date & Time Slot</p>
                          <p className="text-xl font-black text-text-primary mt-1">
                            {new Date(`${customDate}T00:00:00`).toLocaleDateString('en-US', {
                              weekday: 'long',
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })}
                          </p>
                          {customStartTime && customEndTime && (
                            <p className="text-sm font-bold text-accent-blue mt-0.5 animate-fade-in">
                              at {customStartTime} - {customEndTime} EST
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="p-6 bg-bg-tertiary/50 rounded-[32px] border border-border-primary/50 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-text-secondary">
                      <CheckCircle2 className="w-4 h-4 text-accent-green" />
                      Automatic Proxy Assignment
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-text-secondary">
                      <CheckCircle2 className="w-4 h-4 text-accent-green" />
                      Locks slot immediately (No Conflicts)
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-text-secondary">
                      <CheckCircle2 className="w-4 h-4 text-accent-green" />
                      Assigned to expert Proxy Team
                    </div>
                  </div>

                  <button 
                    disabled={!formCandidateName || !formCandidateEmail || !formCandidatePhone || !formCandidateWhatsApp || !formCompany || !formJobTitle || !formJobLink || !customDate || !customStartTime || !customEndTime || !resumeFile || !assignmentResult.bestProxy || isSubmitting || isUploading}
                    onClick={handleBook}
                    className={cn(
                      "w-full py-6 rounded-[30px] font-black text-lg transition-all flex items-center justify-center gap-3 shadow-2xl",
                      (!formCandidateName || !formCandidateEmail || !formCandidatePhone || !formCandidateWhatsApp || !formCompany || !formJobTitle || !formJobLink || !customDate || !customStartTime || !customEndTime || !resumeFile || !assignmentResult.bestProxy)
                        ? "bg-bg-tertiary text-text-muted border border-border-primary cursor-not-allowed" 
                        : "bg-accent-blue text-white shadow-accent-blue/30 hover:scale-[1.02] active:scale-[0.98] hover:shadow-accent-blue/40"
                    )}
                  >
                    {isSubmitting || isUploading ? (
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span className="text-sm font-bold">{isUploading ? 'Uploading Resume...' : 'Placing Booking...'}</span>
                      </div>
                    ) : (
                      <>
                        Book Interview Support
                        <ChevronRight className="w-6 h-6" />
                      </>
                    )}
                  </button>
                </div>

                <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-accent-blue/5 blur-[100px] rounded-full pointer-events-none" />
              </div>

              <p className="mt-6 text-center text-xs font-bold text-text-muted leading-relaxed max-w-xs mx-auto">
                Need help? Submit the details correctly and our team will coordinate using your WhatsApp number.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary py-6 sm:py-12 px-3 sm:px-6">
      <div className="max-w-4xl mx-auto space-y-8 sm:space-y-10">
        {/* Top Branding/Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 sm:gap-8 bg-bg-secondary p-6 sm:p-10 rounded-3xl sm:rounded-[40px] md:rounded-[60px] border border-border-primary shadow-xl animate-fade-in animate-duration-300">
          <div className="space-y-4 font-sans">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-accent-blue flex items-center justify-center">
                <Calendar className="w-4 h-4 text-white" />
              </span>
              <span className="text-[10px] font-black text-text-muted uppercase tracking-[0.4em]">Interview Support System</span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-black text-text-primary tracking-tight leading-[1.1]">
              Confirm your rounds at <span className="text-accent-blue">{request?.interview_company_name}</span>
            </h1>
            <div className="flex flex-wrap gap-4 sm:gap-6 text-sm">
              <div className="flex items-center gap-2 text-text-secondary">
                <Briefcase className="w-5 h-5 text-accent-blue" />
                <span className="font-bold">{request?.job_title}</span>
              </div>
              <div className="flex items-center gap-2 text-text-secondary">
                <Globe className="w-5 h-5 text-accent-blue" />
                <span className="font-bold">Virtual Event</span>
              </div>
            </div>
          </div>
          <div className="hidden lg:block w-px h-24 bg-border-primary mx-4" />
          <div className="flex flex-col items-start sm:items-end gap-2 bg-bg-tertiary/50 p-5 sm:p-6 rounded-2xl sm:rounded-[32px] border border-border-primary/50 shrink-0 font-sans w-full sm:w-auto">
            <p className="text-[10px] font-black text-text-muted uppercase tracking-widest leading-none">Coordinated by</p>
            <div className="flex items-center gap-3">
              <div className="text-left sm:text-right">
                <p className="text-base font-black text-text-primary">{recruiter?.display_name || 'System'}</p>
                <p className="text-xs font-bold text-text-muted">Placify Recruiter</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-bg-secondary shadow-lg flex items-center justify-center border border-border-primary text-accent-blue font-black font-sans">
                 P
              </div>
            </div>
          </div>
        </div>

        <div className="bg-bg-secondary rounded-3xl sm:rounded-[40px] md:rounded-[60px] p-6 sm:p-12 border border-border-primary shadow-2xl space-y-8 sm:space-y-10">
          <div className="flex flex-col md:flex-row gap-12">
            <div className="flex-1 space-y-8 font-sans">
              <h2 className="text-3xl font-black text-text-primary tracking-tight">Scheduled Interview Timeline</h2>
              <p className="text-sm text-text-secondary font-medium leading-relaxed font-sans">Below are the custom rounds scheduled on your behalf by your recruitment specialist. Please check your calendar and acknowledge schedule receipt below.</p>
              
              <div className="space-y-4">
                <div className="bg-bg-tertiary/60 p-6 rounded-[32px] border border-border-primary/50 relative overflow-hidden flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-bg-secondary flex items-center justify-center border border-border-primary text-accent-blue">
                     <Clock className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-text-primary uppercase tracking-wider">{round?.round_label}</h3>
                    <p className="text-lg font-black text-text-primary mt-1">
                      {round?.booked_slot_time ? parseLocalTimeToDate(round.booked_slot_time, 'America/New_York').toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' }) + ' EST' : 'Date TBD'}
                    </p>
                    <p className="text-[10px] text-text-muted font-bold mt-1 uppercase tracking-widest leading-none">Duration: {round?.duration_minutes} Minutes</p>
                  </div>
                </div>
              </div>

               {request?.job_description && (
                 <div className="space-y-4 pt-4">
                   <h3 className="text-[10px] font-black text-text-muted uppercase tracking-widest px-1">Detailed Job Description</h3>
                   <div className="p-8 bg-bg-tertiary rounded-[32px] border border-border-primary/50 text-sm text-text-secondary leading-relaxed whitespace-pre-wrap max-h-[250px] overflow-y-auto custom-scrollbar">
                     {request.job_description}
                   </div>
                 </div>
               )}
            </div>

            <div className="w-full md:w-80 space-y-6 shrink-0 font-sans">
              <div className="p-8 bg-bg-tertiary rounded-[40px] border border-border-primary space-y-6">
                <p className="text-xs font-bold text-text-secondary leading-relaxed font-sans">
                  Please review the job details above. By clicking acknowledge, you confirm that you have received the interview schedule and details.
                </p>
                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-text-secondary">
                    <CheckCircle2 className="w-4 h-4 text-accent-green" />
                    Auto-Buffering Activated
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold text-text-secondary">
                    <CheckCircle2 className="w-4 h-4 text-accent-green" />
                    Proxy Allocation Confirmed
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold text-text-secondary">
                    <CheckCircle2 className="w-4 h-4 text-accent-green" />
                    Calendar Sync Pending
                  </div>
                </div>
                <button 
                  onClick={handleAcknowledge}
                  disabled={isSubmitting}
                  className="w-full py-5 bg-accent-blue text-white font-black rounded-[24px] shadow-xl shadow-accent-blue/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Acknowledging...' : 'I Acknowledge'}
                </button>
              </div>
            </div>
          </div>
       </div>
      </div>
    </div>
  );
};
