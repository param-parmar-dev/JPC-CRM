import { addProxyAvailability, now } from './storage';
import { ProxyAvailability, User, Candidate, InterviewSupportRequest } from '../types';
import { collection, query, where, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { parseLocalTimeToDate } from '../lib/utils';

export function isProxyUser(u: User): boolean {
  if (!u) return false;
  if (u.deleted_at) return false;

  // Explicit jpc_proxy role
  if (u.role === 'jpc_proxy') return true;

  const emailLower = u.email?.toLowerCase() || '';
  const usernameLower = u.username?.toLowerCase() || '';
  const displayNameLower = u.display_name?.toLowerCase() || '';

  // Nihal Khalyani (nihal.khalyani@auriic.co) is a resume person, not a proxy
  if (emailLower === 'nihal.khalyani@auriic.co' || usernameLower === 'nihal.khalyani') {
    return false;
  }

  // Nihal Proxy (nihalnx09@gmail.com) is explicitly a proxy
  if (emailLower === 'nihalnx09@gmail.com' || usernameLower === 'nihalnx09' || usernameLower === 'nihalnx') {
    return true;
  }

  // Rudraksh proxy checks
  if (usernameLower === 'rudraksh.rawal' || displayNameLower.includes('rudra')) {
    return true;
  }

  // General fallback for names containing "nihal" but ignoring resume email or resume user
  if (displayNameLower.includes('nihal')) {
    return true;
  }

  return false;
}

/**
 * Checks if a given date string (e.g. YYYY-MM-DD) represents a weekend day (Saturday or Sunday)
 * in a timezone-agnostic manner.
 */
export const isWeekendString = (dateStr: string): boolean => {
  const datePart = dateStr.split('T')[0];
  if (!datePart) return false;
  const parts = datePart.split('-');
  if (parts.length !== 3) return false;
  const [year, month, day] = parts.map(Number);
  const d = new Date(year, month - 1, day);
  const dow = d.getDay();
  return dow === 0 || dow === 6; // 0 is Sunday, 6 is Saturday
};

/**
 * Clean up existing duplicate or weekend slots for a specified proxy user in Firestore.
 */
export const cleanupDuplicateProxySlots = async (proxyUserId: string) => {
  try {
    const q = query(
      collection(db, 'jpc_proxy_availability'),
      where('proxy_user_id', 'in', [String(proxyUserId), proxyUserId])
    );
    const snap = await getDocs(q);
    const slotsMap = new Map<string, any[]>();
    const weekendDocsToDelete: string[] = [];

    snap.docs.forEach(dDoc => {
      const data = dDoc.data();
      const start = data.slot_start;
      
      if (start) {
        // If it lands on a weekend, flag for immediate deletion
        if (isWeekendString(start)) {
          weekendDocsToDelete.push(dDoc.id);
          return;
        }

        if (!slotsMap.has(start)) {
          slotsMap.set(start, []);
        }
        slotsMap.get(start)!.push({ id: dDoc.id, ...data });
      }
    });

    // Delete weekend records
    for (const docId of weekendDocsToDelete) {
      await deleteDoc(doc(db, 'jpc_proxy_availability', docId));
      console.log(`Cleaned up weekend slot doc: ${docId}`);
    }

    // Deduplicate same slot_start records
    for (const [start, docList] of slotsMap.entries()) {
      if (docList.length > 1) {
        // Sort to keep the best one: booked first, then manual, then system-created
        docList.sort((a, b) => {
          if (a.slot_status === 'booked' && b.slot_status !== 'booked') return -1;
          if (b.slot_status === 'booked' && a.slot_status !== 'booked') return 1;
          if (a.created_by === 'manual' && b.created_by !== 'manual') return -1;
          if (b.created_by === 'manual' && a.created_by !== 'manual') return 1;
          return 0;
        });

        // Delete duplicates (indices from 1 to end)
        for (let idx = 1; idx < docList.length; idx++) {
          await deleteDoc(doc(db, 'jpc_proxy_availability', docList[idx].id));
          console.log(`Cleaned up duplicate slot at: ${start} (doc ID: ${docList[idx].id})`);
        }
      }
    }
  } catch (error) {
    console.error('Error in cleanupDuplicateProxySlots:', error);
  }
};

/**
 * Automatically generates 30-minute availability slots for a proxy member
 * between 9:30 AM and 6:30 PM EST for the next 30 weekdays.
 */
export const generateDefaultProxySlots = async (proxyUserId: string) => {
  // 1. Clean up first
  await cleanupDuplicateProxySlots(proxyUserId);

  const slots: Omit<ProxyAvailability, 'id' | 'created_at' | 'updated_at'>[] = [];
  const today = new Date();
  
  // 2. Fetch existing slots for this proxy to prevent duplicate creation
  let existingStarts = new Set<string>();
  try {
    const q = query(
      collection(db, 'jpc_proxy_availability'),
      where('proxy_user_id', '==', proxyUserId)
    );
    const snap = await getDocs(q);
    snap.docs.forEach(doc => {
      const d = doc.data();
      if (d && d.slot_start) {
        existingStarts.add(d.slot_start);
      }
    });
  } catch (error) {
    console.error('Error fetching existing availability:', error);
  }

  // Generate for the next 30 days
  for (let i = 0; i < 30; i++) {
    const date = new Date();
    date.setDate(today.getDate() + i);
    
    // Format the date representing America/New_York timezone to be 100% timezone-safe
    const dateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
    
    // Skip weekends (0 is Sunday, 6 is Saturday)
    if (isWeekendString(dateStr)) continue;
    
    // 9:30 AM to 6:30 PM (18:30)
    // We work in EST. Note: In a real app, use a library like luxon for timezone math.
    // For this implementation, we will store times in a way that represents EST.
    
    let currentHour = 9;
    let currentMinute = 30;

    while (currentHour < 18 || (currentHour === 18 && currentMinute < 30)) {
      const startTime = `${dateStr}T${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}:00`;
      
      let nextHour = currentHour;
      let nextMinute = currentMinute + 30;
      if (nextMinute >= 60) {
        nextHour++;
        nextMinute = 0;
      }
      
      const endTime = `${dateStr}T${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}:00`;

      // Skip if this slot_start already exists or is a weekend (extra safety layer)
      if (!existingStarts.has(startTime) && !isWeekendString(startTime)) {
        slots.push({
          proxy_user_id: proxyUserId,
          slot_start: startTime,
          slot_end: endTime,
          slot_status: 'available',
          recurrence_type: 'none',
          timezone: 'America/New_York',
          created_by: 'system'
        });
      }

      currentHour = nextHour;
      currentMinute = nextMinute;
    }
  }

  // Batch create would be better, but we'll use individual calls for now or implement a batch version in storage.
  for (const slot of slots) {
    await addProxyAvailability(slot);
  }
};

export const getSlotStatusColor = (status: ProxyAvailability['slot_status']) => {
  switch (status) {
    case 'available': return 'bg-accent-green/10 text-accent-green border-accent-green/20';
    case 'booked': return 'bg-accent-red/10 text-accent-red border-accent-red/20';
    case 'unavailable': return 'bg-accent-gray/10 text-accent-gray border-accent-gray/20';
    case 'leave': return 'bg-accent-amber/10 text-accent-amber border-accent-amber/20';
    case 'break': return 'bg-accent-blue/10 text-accent-blue border-accent-blue/20';
    case 'completed': return 'bg-accent-purple/10 text-accent-purple border-accent-purple/20';
    default: return 'bg-bg-tertiary text-text-muted border-border-primary';
  }
};

export interface GroupedRoundTime {
  round_label: string;
  interview_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string; // HH:MM
}

/**
 * Finds the best available proxy for a given daily time window, taking into account
 * 15-minute buffers before/after, existing rounds, manual blocks, and leave, with workload balancing.
 */
export const findBestProxyForWindow = (
  dateStr: string,
  startTimeJoint: string,
  endTimeJoint: string,
  proxies: any[],
  allRounds: any[],
  allAvailabilities: any[],
  calendarEvents: any[] = [],
  excludeRoundId?: string
): { bestProxy: any; availableProxies: any[]; errors: string[] } => {
  const errors: string[] = [];
  
  // 1. Create buffered window for checking
  const jointStart = new Date(`${dateStr}T${startTimeJoint}:00`);
  const jointEnd = new Date(`${dateStr}T${endTimeJoint}:00`);

  if (isNaN(jointStart.getTime()) || isNaN(jointEnd.getTime())) {
    return { bestProxy: null, availableProxies: [], errors: ['Invalid date or time formats.'] };
  }

  // 15 minutes before and after
  const reservedStart = new Date(jointStart.getTime() - 15 * 60 * 1000);
  const reservedEnd = new Date(jointEnd.getTime() + 15 * 60 * 1000);

  // 2. Filter active proxies (exclude hardcoded leave or deleted proxy members)
  const activeProxies = proxies.filter(u => {
    if (!isProxyUser(u)) return false;
    
    // Check leave
    if (u.is_on_leave) return false;
    if (u.leave_return_date) {
      const returnDate = parseLocalTimeToDate(u.leave_return_date);
      if (!isNaN(returnDate.getTime()) && returnDate > jointStart) {
        return false;
      }
    }
    return true;
  });

  const availableProxies: any[] = [];

  for (const proxy of activeProxies) {
    let hasConflict = false;

    // Check conflict: Existing Round bookings (excluding cancelled & rejected ones)
    const proxyRounds = allRounds.filter(r => 
      String(r.proxy_user_id) === String(proxy.id) && 
      r.status !== 'cancelled' && 
      r.status !== 'rejected' &&
      r.booked_slot_time &&
      (excludeRoundId ? r.id !== excludeRoundId : true)
    );

    for (const rnd of proxyRounds) {
      const startOfRnd = new Date(rnd.booked_slot_time);
      let endOfRnd: Date;
      if (rnd.booked_slot_end) {
        endOfRnd = new Date(rnd.booked_slot_end);
      } else {
        const duration = rnd.duration_minutes || rnd.duration || 30;
        endOfRnd = new Date(startOfRnd.getTime() + duration * 60 * 1000);
      }

      // Buffer other round by 15 mins
      const rndReservedStart = new Date(startOfRnd.getTime() - 15 * 60 * 1000);
      const rndReservedEnd = new Date(endOfRnd.getTime() + 15 * 60 * 1000);

      // Overlap?
      if (rndReservedStart < reservedEnd && reservedStart < rndReservedEnd) {
        hasConflict = true;
        break;
      }
    }

    if (hasConflict) continue;

    // Check conflict: Manual Availability Blocks (e.g., unavailable, break, leave)
    const proxyAvails = allAvailabilities.filter(av => 
      String(av.proxy_user_id) === String(proxy.id) &&
      ['unavailable', 'break', 'leave'].includes(av.slot_status)
    );

    for (const av of proxyAvails) {
      const startOfAv = new Date(av.slot_start);
      const endOfAv = new Date(av.slot_end);

      if (startOfAv < reservedEnd && reservedStart < endOfAv) {
        hasConflict = true;
        break;
      }
    }

    if (hasConflict) continue;

    // Check conflict: Google Calendar Events
    const proxyCalEvents = calendarEvents.filter(ev => 
      String(ev.proxy_user_id) === String(proxy.id) || String(ev.proxyId) === String(proxy.id)
    );

    for (const ev of proxyCalEvents) {
      const startOfEv = new Date(ev.start_time || ev.start);
      const endOfEv = new Date(ev.end_time || ev.end);

      if (startOfEv < reservedEnd && reservedStart < endOfEv) {
        hasConflict = true;
        break;
      }
    }

    if (hasConflict) continue;

    // Clean of conflicts! Add to candidates
    availableProxies.push(proxy);
  }

  if (availableProxies.length === 0) {
    return { 
      bestProxy: null, 
      availableProxies: [], 
      errors: ['Currently no proxy is available for the selected interview time. Please choose another time.'] 
    };
  }

  // 3. Select best proxy based on workload
  // Workload = Count of active/confirmed/live interview rounds assigned
  const availableWithWorkload = availableProxies.map(proxy => {
    const workload = allRounds.filter(r => 
      String(r.proxy_user_id) === String(proxy.id) && 
      ['confirmed', 'live'].includes(r.status)
    ).length;
    
    return { proxy, workload };
  });

  // Sort: 1) Connected Google Calendar first, 2) Lowest workload first, 3) Stable sort order by display_name
  availableWithWorkload.sort((a, b) => {
    const connA = a.proxy.google_calendar_connected ? 1 : 0;
    const connB = b.proxy.google_calendar_connected ? 1 : 0;
    if (connA !== connB) {
      return connB - connA;
    }
    if (a.workload !== b.workload) {
      return a.workload - b.workload;
    }
    const nameA = a.proxy.display_name || '';
    const nameB = b.proxy.display_name || '';
    return nameA.localeCompare(nameB);
  });

  return {
    bestProxy: availableWithWorkload[0].proxy,
    availableProxies: availableWithWorkload.map(item => item.proxy),
    errors: []
  };
};

/**
 * Returns the latest resume version for a candidate.
 * Inspects candidate.resume_versions (checking is_current, latest version number or upload date),
 * falling back to the top-level resume_url / resume_base64 and resume_filename.
 */
export function getLatestCandidateResume(candidate?: Candidate | null): {
  url: string;
  filename: string;
  versionNumber?: number;
} {
  if (!candidate) {
    return { url: '', filename: 'resume.pdf' };
  }

  // Helper to pick the best non-generic filename
  const resolveFilename = (versionFilename?: string | null) => {
    if (versionFilename && versionFilename !== 'original_resume.pdf' && versionFilename !== 'resume.pdf') {
      return versionFilename;
    }
    if (candidate.resume_filename && candidate.resume_filename !== 'original_resume.pdf' && candidate.resume_filename !== 'resume.pdf') {
      return candidate.resume_filename;
    }
    return versionFilename || candidate.resume_filename || (candidate.full_name ? `${candidate.full_name.replace(/\s+/g, '_')}_Resume.pdf` : 'resume.pdf');
  };

  // 1. Inspect candidate.resume_versions if available
  if (candidate.resume_versions && Array.isArray(candidate.resume_versions) && candidate.resume_versions.length > 0) {
    // Check for explicitly marked current version with valid URL
    const currentVersion = candidate.resume_versions.find(v => v.is_current && (v.url || (v as any).base64));
    if (currentVersion) {
      return {
        url: currentVersion.url || (currentVersion as any).base64 || candidate.resume_url || candidate.resume_base64 || '',
        filename: resolveFilename(currentVersion.filename),
        versionNumber: currentVersion.version_number
      };
    }

    // Sort by version_number descending, or by uploaded_at descending
    const sorted = [...candidate.resume_versions].sort((a, b) => {
      if (typeof a.version_number === 'number' && typeof b.version_number === 'number') {
        return b.version_number - a.version_number;
      }
      return new Date(b.uploaded_at || 0).getTime() - new Date(a.uploaded_at || 0).getTime();
    });

    const latest = sorted[0];
    if (latest && (latest.url || (latest as any).base64)) {
      return {
        url: latest.url || (latest as any).base64 || candidate.resume_url || candidate.resume_base64 || '',
        filename: resolveFilename(latest.filename),
        versionNumber: latest.version_number
      };
    }
  }

  // 2. Fallback to candidate's main resume fields
  const fallbackUrl = candidate.resume_url || candidate.resume_base64 || '';
  const fallbackFilename = candidate.resume_filename || (candidate.full_name ? `${candidate.full_name.replace(/\s+/g, '_')}_Resume.pdf` : 'resume.pdf');

  return {
    url: fallbackUrl,
    filename: fallbackFilename,
    versionNumber: candidate.resume_versions && candidate.resume_versions.length > 0 ? candidate.resume_versions.length : undefined
  };
}

/**
 * Returns comprehensive interview resume information for an interview support request.
 * Discloses whether an "Other Resume" is active, provides URLs/filenames for both Other Resume and Master Resume,
 * and determines the exact resume that must be presented to proxies (strictly hiding the master resume when an other resume is active).
 */
export function getInterviewResumeInfo(
  request?: InterviewSupportRequest | null, 
  candidate?: Candidate | null
) {
  const latestCandidateResume = getLatestCandidateResume(candidate);

  // Check if an Other Resume is actively configured on the request
  const hasDirectOtherResume = Boolean(request?.use_other_resume && request?.other_resume_url);
  const hasOtherUrlField = Boolean(request?.other_resume_url);
  // Also check if latest_resume_id has a custom URL that is not 'original' and not candidate's default filename
  const hasLatestUrl = Boolean(
    request?.latest_resume_id && 
    request.latest_resume_id !== 'original' && 
    request.latest_resume_id !== candidate?.resume_filename &&
    (request.latest_resume_id.startsWith('http') || request.latest_resume_id.startsWith('data:') || request.latest_resume_id.includes('/'))
  );

  const hasOtherResume = hasDirectOtherResume || hasOtherUrlField || hasLatestUrl;

  const otherResumeUrl = request?.other_resume_url || (hasLatestUrl ? request?.latest_resume_id : null) || null;
  const otherResumeFilename = request?.other_resume_filename || (hasOtherResume ? 'Custom_Interview_Resume.pdf' : null);

  const masterResumeUrl = latestCandidateResume.url;
  const masterResumeFilename = latestCandidateResume.filename;
  const masterResumeVersion = latestCandidateResume.versionNumber;

  return {
    hasOtherResume,
    otherResumeUrl,
    otherResumeFilename: otherResumeFilename || 'Custom_Interview_Resume.pdf',
    masterResumeUrl,
    masterResumeFilename,
    masterResumeVersion,
    // What proxies MUST see:
    proxyResumeUrl: (hasOtherResume && otherResumeUrl) ? otherResumeUrl : masterResumeUrl,
    proxyResumeFilename: (hasOtherResume && otherResumeFilename) ? otherResumeFilename : masterResumeFilename,
    // Active resume for the interview:
    activeResumeUrl: (hasOtherResume && otherResumeUrl) ? otherResumeUrl : masterResumeUrl,
    activeResumeFilename: (hasOtherResume && otherResumeFilename) ? otherResumeFilename : masterResumeFilename,
  };
}


