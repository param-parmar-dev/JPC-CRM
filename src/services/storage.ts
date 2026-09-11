import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocFromServer,
  getDocs, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  writeBatch,
  limit,
  runTransaction
} from 'firebase/firestore';
import { clearPreviousCalendarEvents } from './calendarService';
import { isSalesWorkingHours } from '../lib/utils';
import { db, auth } from '../firebase';
import { 
  Candidate, 
  Payment, 
  Promise as PromiseType, 
  QCChecklistItem, 
  FollowUp, 
  ActivityLog, 
  User, 
  Stage, 
  InterviewSupportRequest,
  InterviewRound,
  ProxyAvailability,
  InterviewFeedback,
  BookingLink,
  InterviewNotification,
  InterviewActivityLog,
  Notification as AppNotification,
  FeatureAnnouncement,
  ResumeSubstitutionRequest,
  LeadRoundRobinConfig,
  LeadRoundRobinAssignment
} from '../types';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  
  if (errInfo.error.includes('Missing or insufficient permissions')) {
    throw new Error(JSON.stringify(errInfo));
  } else if (errInfo.error.includes('Quota exceeded')) {
    // Only alert once per session to avoid spamming the user
    if (!(window as any).__quotaAlertShown) {
      alert("Uh oh! The database daily quota limit has been exceeded. The application will pause data syncing until midnight Pacific Time. Please try again tomorrow!");
      (window as any).__quotaAlertShown = true;
    }
  } else {
    throw new Error(JSON.stringify(errInfo));
  }
}

// Helper to test connection
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Please check your Firebase configuration.");
    }
  }
}

// Generic Data Access
export const subscribeToCollection = <T>(collectionName: string, callback: (data: T[]) => void, limitCount?: number) => {
  let q = query(collection(db, collectionName));
  if (limitCount) {
    q = query(q, limit(limitCount));
  }
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as T));
    callback(data);
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, collectionName);
  });
};

export const subscribeToCollectionWithLimit = <T>(collectionName: string, limitCount: number, callback: (data: T[]) => void) => {
  const q = query(collection(db, collectionName), limit(limitCount));
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as T));
    callback(data);
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, collectionName);
  });
};

export const subscribeToQuery = <T>(q: any, callback: (data: T[]) => void, collectionName: string) => {
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as T));
    callback(data);
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, collectionName);
  });
};

// Users
export const saveUser = async (user: User) => {
  try {
    await setDoc(doc(db, 'jpc_users', String(user.id)), user);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `jpc_users/${user.id}`);
  }
};

export const getUserById = async (id: string | number): Promise<User | null> => {
  try {
    const docSnap = await getDoc(doc(db, 'jpc_users', String(id)));
    return docSnap.exists() ? (docSnap.data() as User) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `jpc_users/${id}`);
    return null;
  }
};

export const getUsers = async (): Promise<User[]> => {
  try {
    const snap = await getDocs(collection(db, 'jpc_users'));
    return snap.docs.map(d => d.data() as User);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'jpc_users');
    return [];
  }
};

// Candidates
export const checkDuplicateCandidate = async (phone: string, email: string, whatsapp: string = ''): Promise<string | null> => {
  try {
    const candidatesRef = collection(db, 'jpc_candidates');
    
    // Check Phone
    if (phone && phone.trim() !== '') {
      const pQuery = query(candidatesRef, where('phone', '==', phone.trim()));
      const snap = await getDocs(pQuery);
      const activeDoc = snap.docs.find(d => !d.data().deleted_at);
      if (activeDoc) return `A candidate with the phone number ${phone} already exists.`;
    }

    // Check Email
    if (email && email.trim() !== '') {
      const eQuery = query(candidatesRef, where('email', '==', email.trim()));
      const snap = await getDocs(eQuery);
      const activeDoc = snap.docs.find(d => !d.data().deleted_at);
      if (activeDoc) return `A candidate with the email ${email} already exists.`;
    }

    // Check WhatsApp
    if (whatsapp && whatsapp.trim() !== '') {
      const wQuery = query(candidatesRef, where('whatsapp', '==', whatsapp.trim()));
      const snap = await getDocs(wQuery);
      const activeDoc = snap.docs.find(d => !d.data().deleted_at);
      if (activeDoc) return `A candidate with the WhatsApp number ${whatsapp} already exists.`;
    }

    return null;
  } catch (error) {
    console.error("Error checking for duplicate candidates:", error);
    return null;
  }
};

/**
 * Unified, atomic candidate creation flow.
 * Combines lead creation, durable idempotency, deterministic deduplication locks,
 * and round-robin sales assignment in one atomic operation.
 */
export const createLeadCandidate = async (
  candidate: Candidate,
  userId: string | null,
  idempotencyKey?: string
): Promise<{
  success: boolean;
  candidateId: string;
  assignedSalesId: string | null;
  assignedSalesName?: string;
  isUnassigned?: boolean;
  duplicatePrevented?: boolean;
  alreadyExisted?: boolean;
}> => {
  const effectiveId = candidate.id || generateId();
  const effectiveKey = idempotencyKey || generateId('sub_');

  // 1. Primary: Server-side atomic creation endpoint (/api/leads)
  try {
    const currentUser = auth.currentUser;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Idempotency-Key': effectiveKey
    };

    if (currentUser) {
      const idToken = await currentUser.getIdToken();
      headers['Authorization'] = `Bearer ${idToken}`;
    }

    const response = await fetch('/api/leads', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...candidate,
        id: effectiveId,
        idempotency_key: effectiveKey
      })
    });

    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        candidateId: data.candidateId || effectiveId,
        assignedSalesId: data.assigned_sales || null,
        assignedSalesName: data.assigned_sales_name || undefined,
        isUnassigned: data.isUnassigned,
        duplicatePrevented: data.duplicatePrevented || false,
        alreadyExisted: data.alreadyExisted || false
      };
    } else {
      console.warn('POST /api/leads returned non-OK status:', response.status);
    }
  } catch (apiErr) {
    console.warn('Call to /api/leads failed, falling back to client-side atomic save:', apiErr);
  }

  // 2. Client-side transactional fallback with deterministic locks
  try {
    const digitsOnly = (candidate.phone || '').replace(/[^0-9]/g, '');
    const cleanPhone = (digitsOnly.length === 11 && digitsOnly.startsWith('1')) ? digitsOnly.slice(1) : digitsOnly;
    const cleanEmail = (candidate.email || '').toLowerCase().trim();

    const phoneLockRef = cleanPhone.length >= 7 ? doc(db, 'jpc_lead_locks', `phone_${cleanPhone}`) : null;
    const emailLockRef = cleanEmail.length >= 5 ? doc(db, 'jpc_lead_locks', `email_${cleanEmail.replace(/[^a-z0-9@._-]/g, '_')}`) : null;

    const result = await runTransaction(db, async (transaction) => {
      const lockRefs = [phoneLockRef, emailLockRef].filter(Boolean);
      for (const lRef of lockRefs) {
        const lockDoc = await transaction.get(lRef!);
        if (lockDoc.exists()) {
          const lockData = lockDoc.data();
          const existingCandId = lockData?.candidate_id;
          if (existingCandId && existingCandId !== effectiveId) {
            const existingCandDoc = await transaction.get(doc(db, 'jpc_candidates', existingCandId));
            if (existingCandDoc.exists() && !existingCandDoc.data().deleted_at) {
              return {
                candidateId: existingCandId,
                assignedSalesId: existingCandDoc.data().assigned_sales || null,
                duplicatePrevented: true,
                alreadyExisted: true
              };
            }
          }
        }
      }

      // Acquire locks and save candidate
      const lockPayload = {
        candidate_id: effectiveId,
        phone: cleanPhone,
        email: cleanEmail,
        updated_at: new Date().toISOString()
      };
      if (phoneLockRef) transaction.set(phoneLockRef, lockPayload, { merge: true });
      if (emailLockRef) transaction.set(emailLockRef, lockPayload, { merge: true });

      const candRef = doc(db, 'jpc_candidates', effectiveId);
      const data = {
        ...candidate,
        id: effectiveId,
        updated_at: new Date().toISOString()
      };
      transaction.set(candRef, data, { merge: true });

      return {
        candidateId: effectiveId,
        assignedSalesId: candidate.assigned_sales || null,
        duplicatePrevented: false,
        alreadyExisted: false
      };
    });

    return {
      success: true,
      candidateId: result.candidateId,
      assignedSalesId: result.assignedSalesId,
      duplicatePrevented: result.duplicatePrevented,
      alreadyExisted: result.alreadyExisted
    };
  } catch (clientErr) {
    console.error('Error in client-side createLeadCandidate fallback:', clientErr);
    // Ultimate fallback to saveCandidate
    await saveCandidate(candidate, userId);
    return {
      success: true,
      candidateId: effectiveId,
      assignedSalesId: candidate.assigned_sales ? String(candidate.assigned_sales) : null,
      duplicatePrevented: false
    };
  }
};

export const getFaizUserId = async (): Promise<string | null> => {
  try {
    const q = query(
      collection(db, 'jpc_users'),
      where('role', '==', 'jpc_cs')
    );
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      const u = d.data();
      if (
        u.username === 'care' || 
        String(u.display_name).toLowerCase().includes('faiz') || 
        String(u.email).toLowerCase() === 'care@auriic.co'
      ) {
        return d.id;
      }
    }
    if (!snap.empty) {
      return snap.docs[0].id;
    }
  } catch (e) {
    console.error('Error finding Faiz Ahmadi user:', e);
  }
  return null;
};

export const autoAssignFaizToCandidates = async () => {
  try {
    const faizId = await getFaizUserId();
    if (!faizId) return;

    const snap = await getDocs(collection(db, 'jpc_candidates'));
    for (const d of snap.docs) {
      const candidate = d.data() as Candidate;
      if (
        (candidate.current_stage === 'marketing_active' || candidate.current_stage === 'interviewing') &&
        !candidate.assigned_cs
      ) {
        console.log(`Auto-assigning CS (Faiz Ahmadi) to candidate: ${candidate.full_name}`);
        await updateDoc(doc(db, 'jpc_candidates', candidate.id), {
          assigned_cs: faizId,
          updated_at: new Date().toISOString()
        });
        try {
          await logActivity(
            candidate.id,
            'CS Assigned Automatically',
            'CS automatically assigned to Faiz Ahmadi (care) for Active Marketing/Interviewing stage.',
            'system'
          );
        } catch (le) {}
      }
    }
  } catch (error) {
    console.error('Error in autoAssignFaizToCandidates:', error);
  }
};

export const saveCandidate = async (candidate: Candidate, userId: string | null) => {
  try {
    let finalCandidate = { ...candidate };

    // Prevent Lead Generation from overriding or modifying assigned_sales
    const currentUid = userId || auth.currentUser?.uid;
    if (currentUid) {
      try {
        const userDoc = await getDoc(doc(db, 'jpc_users', String(currentUid)));
        if (userDoc.exists() && userDoc.data().role === 'jpc_lead_gen') {
          const existingDoc = await getDoc(doc(db, 'jpc_candidates', finalCandidate.id));
          if (existingDoc.exists()) {
            finalCandidate.assigned_sales = existingDoc.data().assigned_sales ?? null;
          }
        }
      } catch (checkErr) {
        console.warn('Could not verify user role in saveCandidate:', checkErr);
      }
    }

    if (
      (finalCandidate.current_stage === 'marketing_active' || finalCandidate.current_stage === 'interviewing') &&
      !finalCandidate.assigned_cs
    ) {
      const faizId = await getFaizUserId();
      if (faizId) {
        finalCandidate.assigned_cs = faizId;
      }
    }
    const data = { ...finalCandidate, updated_at: new Date().toISOString() };
    await setDoc(doc(db, 'jpc_candidates', finalCandidate.id), data);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `jpc_candidates/${candidate.id}`);
  }
};

export const updateCandidate = async (id: string, updates: Partial<Candidate>) => {
  try {
    let finalUpdates = { ...updates };

    // Prevent Lead Generation from altering assigned_sales
    if (auth.currentUser?.uid) {
      try {
        const userDoc = await getDoc(doc(db, 'jpc_users', auth.currentUser.uid));
        if (userDoc.exists() && userDoc.data().role === 'jpc_lead_gen') {
          delete (finalUpdates as any).assigned_sales;
          delete (finalUpdates as any).sales_person_id;
        }
      } catch (checkErr) {
        console.warn('Could not verify user role in updateCandidate:', checkErr);
      }
    }

    let currentStage = updates.current_stage;
    let assignedCs = updates.assigned_cs;
    
    if (currentStage === undefined || assignedCs === undefined) {
      const docSnap = await getDoc(doc(db, 'jpc_candidates', id));
      if (docSnap.exists()) {
        const currentData = docSnap.data() as Candidate;
        if (currentStage === undefined) currentStage = currentData.current_stage;
        if (assignedCs === undefined) assignedCs = currentData.assigned_cs;
      }
    }
    
    if (
      (currentStage === 'marketing_active' || currentStage === 'interviewing') &&
      !assignedCs
    ) {
      const faizId = await getFaizUserId();
      if (faizId) {
        finalUpdates.assigned_cs = faizId;
      }
    }

    const data = { ...finalUpdates, updated_at: new Date().toISOString() };
    await updateDoc(doc(db, 'jpc_candidates', id), data);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `jpc_candidates/${id}`);
  }
};

export const getCandidateById = async (id: string): Promise<Candidate | null> => {
  try {
    const docSnap = await getDoc(doc(db, 'jpc_candidates', id));
    return docSnap.exists() ? (docSnap.data() as Candidate) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `jpc_candidates/${id}`);
    return null;
  }
};

export const deleteCandidate = async (id: string) => {
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'jpc_candidates', id));
    
    const collectionsWithCandidateId = [
      'jpc_payments',
      'jpc_promises',
      'jpc_qc_checklist',
      'jpc_followups',
      'jpc_activity_logs',
      'jpc_applications',
      'jpc_resume_requests',
      'jpc_interview_requests', // Updated
      'jpc_users',
      'jpc_report_logs'
    ];

    for (const collName of collectionsWithCandidateId) {
      const q = query(collection(db, collName), where('candidate_id', '==', id));
      const snapshot = await getDocs(q);
      snapshot.forEach(d => {
        batch.delete(d.ref);
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `jpc_candidates/${id}`);
  }
};

// Payments
export const addPayment = async (payment: Omit<Payment, 'id' | 'created_at'>) => {
  const id = generateId();
  const data = { ...payment, id, created_at: new Date().toISOString() };
  try {
    await setDoc(doc(db, 'jpc_payments', id), data);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `jpc_payments/${id}`);
  }
};

export const updatePayment = async (payment: Payment) => {
  try {
    await updateDoc(doc(db, 'jpc_payments', payment.id), { ...payment });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `jpc_payments/${payment.id}`);
  }
};

// Promises
export const addPromise = async (promise: Omit<PromiseType, 'id' | 'created_at'>) => {
  const id = generateId();
  const data = { ...promise, id, created_at: new Date().toISOString() };
  try {
    await setDoc(doc(db, 'jpc_promises', id), data);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `jpc_promises/${id}`);
  }
};

export const updatePromise = async (promise: PromiseType) => {
  try {
    await updateDoc(doc(db, 'jpc_promises', promise.id), { ...promise });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `jpc_promises/${promise.id}`);
  }
};

// QC Checklist
export const updateQCChecklistItem = async (item: QCChecklistItem) => {
  try {
    await updateDoc(doc(db, 'jpc_qc_checklist', item.id), { ...item });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `jpc_qc_checklist/${item.id}`);
  }
};

export const seedQCChecklist = async (candidateId: string) => {
  const items = [
    { label: 'Candidate indidity Verification', hasTextBox: false },
    { label: 'Educational Verification', hasTextBox: false },
    { label: 'Visa Verification', hasTextBox: false },
    { label: 'Exprince Verification', hasTextBox: false },
    { label: 'Location Verification', hasTextBox: true },
    { label: 'Experirnce Verification', hasTextBox: false },
    { label: 'Domain Suggection By Candidatte', hasTextBox: true },
    { label: 'EAD Verification', hasTextBox: false }
  ];
  
  for (const item of items) {
    const id = generateId();
    const data = {
      id,
      candidate_id: candidateId,
      item_key: item.label.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '_'),
      item_label: item.label,
      checked: false,
      value: '',
      has_text_box: item.hasTextBox,
      created_at: new Date().toISOString()
    };
    try {
      await setDoc(doc(db, 'jpc_qc_checklist', id), data);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `jpc_qc_checklist/${id}`);
    }
  }
};

export const resetQCChecklist = async (candidateId: string) => {
  try {
    const q = query(collection(db, 'jpc_qc_checklist'), where('candidate_id', '==', candidateId));
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      await deleteDoc(doc(db, 'jpc_qc_checklist', d.id));
    }
    await seedQCChecklist(candidateId);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `jpc_qc_checklist reset for ${candidateId}`);
  }
};

export const migrateAllChecklists = async () => {
  try {
    const candidatesSnap = await getDocs(collection(db, 'jpc_candidates'));
    for (const candidateDoc of candidatesSnap.docs) {
      const candidateId = candidateDoc.id;
      const q = query(collection(db, 'jpc_qc_checklist'), where('candidate_id', '==', candidateId));
      const checklistSnap = await getDocs(q);
      
      const checklist = checklistSnap.docs.map(d => d.data() as QCChecklistItem);
      const isOld = checklist.length > 0 && (checklist.length !== 8 || !checklist.some(item => item.item_label === 'Candidate indidity Verification'));
      
      if (isOld) {
        console.log(`Migrating checklist for candidate ${candidateId}...`);
        for (const d of checklistSnap.docs) {
          await deleteDoc(doc(db, 'jpc_qc_checklist', d.id));
        }
        await seedQCChecklist(candidateId);
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'jpc_candidates during migration');
  }
};

// Notifications
export const addNotification = async (notification: Omit<AppNotification, 'id' | 'created_at' | 'read'>) => {
  const id = generateId();
  const data = { 
    ...notification, 
    id, 
    read: false, 
    created_at: new Date().toISOString() 
  };
  try {
    await setDoc(doc(db, 'jpc_notifications', id), data);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `jpc_notifications/${id}`);
  }
};

export const markNotificationAsRead = async (id: string) => {
  try {
    await updateDoc(doc(db, 'jpc_notifications', id), { read: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `jpc_notifications/${id}`);
  }
};

// Follow-ups
export const addFollowUp = async (followUp: Omit<FollowUp, 'id' | 'created_at'>) => {
  const id = generateId();
  const data = { ...followUp, id, created_at: new Date().toISOString() };
  try {
    await setDoc(doc(db, 'jpc_followups', id), data);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `jpc_followups/${id}`);
  }
};

export const updateFollowUp = async (followUp: FollowUp) => {
  try {
    await updateDoc(doc(db, 'jpc_followups', followUp.id), { ...followUp });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `jpc_followups/${followUp.id}`);
  }
};

// Activity Logs
export const logActivity = async (candidateId: string, action: string, details: string, userId: string | number | null) => {
  const id = generateId();
  const data = {
    id,
    candidate_id: candidateId,
    action,
    details,
    user_id: userId,
    created_at: new Date().toISOString()
  };
  try {
    await setDoc(doc(db, 'jpc_activity_logs', id), data);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `jpc_activity_logs/${id}`);
  }
};

// Interview Support System
export const addInterviewSupportRequest = async (request: Omit<InterviewSupportRequest, 'id' | 'created_at' | 'updated_at'>) => {
  const id = generateId();
  const data = { 
    ...request, 
    id, 
    created_at: now(),
    updated_at: now()
  };
  try {
    await setDoc(doc(db, 'jpc_interview_requests', id), data);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `jpc_interview_requests/${id}`);
  }
};

export const updateInterviewSupportRequest = async (id: string, updates: Partial<InterviewSupportRequest>) => {
  try {
    const data = { ...updates, updated_at: now() };
    await updateDoc(doc(db, 'jpc_interview_requests', id), data);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `jpc_interview_requests/${id}`);
  }
};

export const deleteInterviewSupportRequest = async (id: string) => {
  try {
    // 1. Find all rounds for this request to clear calendar events first
    const roundsQ = query(collection(db, 'jpc_interview_rounds'), where('request_id', '==', id));
    const roundsSnap = await getDocs(roundsQ);
    
    for (const roundDoc of roundsSnap.docs) {
      await clearPreviousCalendarEvents(roundDoc.id);
    }

    const batch = writeBatch(db);
    
    // 2. Delete the request
    batch.delete(doc(db, 'jpc_interview_requests', id));
    
    for (const roundDoc of roundsSnap.docs) {
      const roundId = roundDoc.id;
      
      // Delete the round
      batch.delete(roundDoc.ref);
      
      // Delete associated booking links
      const linksQ = query(collection(db, 'jpc_interview_booking_links'), where('interview_round_id', '==', roundId));
      const linksSnap = await getDocs(linksQ);
      linksSnap.forEach(d => batch.delete(d.ref));
      
      // Delete associated feedback
      const feedbackQ = query(collection(db, 'jpc_interview_feedback'), where('interview_round_id', '==', roundId));
      const feedbackSnap = await getDocs(feedbackQ);
      feedbackSnap.forEach(d => batch.delete(d.ref));
      
      // Delete associated notifications
      const notifQ = query(collection(db, 'jpc_interview_notifications'), where('interview_round_id', '==', roundId));
      const notifSnap = await getDocs(notifQ);
      notifSnap.forEach(d => batch.delete(d.ref));
      
      // Delete associated logs
      const logsQ = query(collection(db, 'jpc_interview_activity_logs'), where('interview_round_id', '==', roundId));
      const logsSnap = await getDocs(logsQ);
      logsSnap.forEach(d => batch.delete(d.ref));
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `jpc_interview_requests/${id} and its rounds`);
  }
};

export const addInterviewRound = async (round: Omit<InterviewRound, 'id' | 'created_at' | 'updated_at'>) => {
  const id = generateId();
  const data = { ...round, id, created_at: now(), updated_at: now() };
  try {
    await setDoc(doc(db, 'jpc_interview_rounds', id), data);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `jpc_interview_rounds/${id}`);
  }
};

export const updateInterviewRound = async (id: string, updates: Partial<InterviewRound>) => {
  try {
    const data = { ...updates, updated_at: now() };
    await updateDoc(doc(db, 'jpc_interview_rounds', id), data);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `jpc_interview_rounds/${id}`);
  }
};

export const addProxyAvailability = async (availability: Omit<ProxyAvailability, 'id' | 'created_at' | 'updated_at'>) => {
  const id = generateId();
  const data = { ...availability, id, created_at: now(), updated_at: now() };
  try {
    await setDoc(doc(db, 'jpc_proxy_availability', id), data);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `jpc_proxy_availability/${id}`);
  }
};

export const updateProxyAvailability = async (id: string, updates: Partial<ProxyAvailability>) => {
  try {
    const data = { ...updates, updated_at: now() };
    await updateDoc(doc(db, 'jpc_proxy_availability', id), data);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `jpc_proxy_availability/${id}`);
  }
};

export const deleteProxyAvailability = async (id: string) => {
  try {
    await deleteDoc(doc(db, 'jpc_proxy_availability', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `jpc_proxy_availability/${id}`);
  }
};

export const addInterviewFeedback = async (feedback: Omit<InterviewFeedback, 'id' | 'created_at'>) => {
  const id = generateId();
  const data = { ...feedback, id, created_at: now() };
  try {
    await setDoc(doc(db, 'jpc_interview_feedback', id), data);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `jpc_interview_feedback/${id}`);
  }
};

export const addBookingLink = async (link: Omit<BookingLink, 'id' | 'created_at'>) => {
  const id = generateId();
  const data = { ...link, id, created_at: now() };
  try {
    await setDoc(doc(db, 'jpc_interview_booking_links', id), data);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `jpc_interview_booking_links/${id}`);
  }
};

export const updateBookingLink = async (id: string, updates: Partial<BookingLink>) => {
  try {
    await updateDoc(doc(db, 'jpc_interview_booking_links', id), updates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `jpc_interview_booking_links/${id}`);
  }
};

export const logInterviewActivity = async (roundId: string, action: string, details: any, userId: string) => {
  const id = generateId();
  const data: InterviewActivityLog = {
    id,
    interview_round_id: roundId,
    action,
    action_by: userId,
    meta_data: details,
    created_at: now()
  };
  try {
    await setDoc(doc(db, 'jpc_interview_activity_logs', id), data);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `jpc_interview_activity_logs/${id}`);
  }
};

export const addInterviewNotification = async (notification: Omit<InterviewNotification, 'id' | 'created_at' | 'is_read'>) => {
  const id = generateId();
  const data: InterviewNotification = {
    ...notification,
    id,
    is_read: false,
    created_at: now()
  };
  try {
    await setDoc(doc(db, 'jpc_interview_notifications', id), data);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `jpc_interview_notifications/${id}`);
  }
};

// Target Reduction Requests
export const addTargetReductionRequest = async (request: Omit<any, 'id' | 'created_at' | 'updated_at'>) => {
  const id = generateId();
  const data = { 
    ...request, 
    id, 
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  try {
    await setDoc(doc(db, 'jpc_target_reductions', id), data);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `jpc_target_reductions/${id}`);
  }
};

export const updateTargetReductionRequest = async (id: string, updates: Partial<any>) => {
  try {
    const data = { ...updates, updated_at: new Date().toISOString() };
    await updateDoc(doc(db, 'jpc_target_reductions', id), data);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `jpc_target_reductions/${id}`);
  }
};

// Feature Announcements
export const addFeatureAnnouncement = async (announcement: Omit<FeatureAnnouncement, 'id' | 'created_at' | 'is_active'>) => {
  const id = generateId();
  const data = { 
    ...announcement, 
    id, 
    is_active: true,
    created_at: now() 
  };
  try {
    await setDoc(doc(db, 'jpc_feature_announcements', id), data);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `jpc_feature_announcements/${id}`);
  }
};

export const addResumeSubstitutionRequest = async (request: Omit<ResumeSubstitutionRequest, 'id' | 'created_at' | 'updated_at'>) => {
  const id = generateId();
  const data = { 
    ...request, 
    id, 
    created_at: now(),
    updated_at: now()
  };
  try {
    await setDoc(doc(db, 'jpc_resume_substitutions', id), data);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `jpc_resume_substitutions/${id}`);
  }
};

export const updateFeatureAnnouncement = async (id: string, updates: Partial<FeatureAnnouncement>) => {
  try {
    await updateDoc(doc(db, 'jpc_feature_announcements', id), updates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `jpc_feature_announcements/${id}`);
  }
};

export const deleteFeatureAnnouncement = async (id: string) => {
  try {
    await deleteDoc(doc(db, 'jpc_feature_announcements', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `jpc_feature_announcements/${id}`);
  }
};

// Lead Round-Robin Auto-Assignment System
export const DEFAULT_ROUND_ROBIN_CONFIG: LeadRoundRobinConfig = {
  id: 'lead_round_robin',
  last_assigned_user_id: null,
  last_assigned_index: -1,
  last_assigned_at: null,
  enabled: true,
  excluded_user_ids: [],
  custom_order_user_ids: [],
  total_leads_assigned: 0,
  recent_assignments: []
};

export const getLeadRoundRobinConfig = async (): Promise<LeadRoundRobinConfig> => {
  try {
    const docRef = doc(db, 'jpc_settings', 'lead_round_robin');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { ...DEFAULT_ROUND_ROBIN_CONFIG, ...docSnap.data() } as LeadRoundRobinConfig;
    }
    return DEFAULT_ROUND_ROBIN_CONFIG;
  } catch (error) {
    console.error('Error fetching lead round robin config:', error);
    return DEFAULT_ROUND_ROBIN_CONFIG;
  }
};

export const subscribeToLeadRoundRobin = (callback: (config: LeadRoundRobinConfig) => void) => {
  const docRef = doc(db, 'jpc_settings', 'lead_round_robin');
  return onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      callback({ ...DEFAULT_ROUND_ROBIN_CONFIG, ...docSnap.data() } as LeadRoundRobinConfig);
    } else {
      callback(DEFAULT_ROUND_ROBIN_CONFIG);
    }
  }, (error) => {
    console.error('Error subscribing to lead round robin config:', error);
  });
};

export const updateLeadRoundRobinConfig = async (updates: Partial<LeadRoundRobinConfig>) => {
  try {
    const docRef = doc(db, 'jpc_settings', 'lead_round_robin');
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      await setDoc(docRef, { ...DEFAULT_ROUND_ROBIN_CONFIG, ...updates, id: 'lead_round_robin' });
    } else {
      await updateDoc(docRef, updates);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'jpc_settings/lead_round_robin');
  }
};

export const getEligibleSalesUsers = (allUsers: User[], config?: LeadRoundRobinConfig): User[] => {
  // 1. Working hours validation (Monday - Friday, 9:30 AM - 6:30 PM America/New_York)
  if (!isSalesWorkingHours()) {
    return [];
  }

  const allSales = allUsers.filter(u => u.role === 'jpc_sales' && !u.deleted_at);
  if (allSales.length === 0) return [];

  // 2. Strict Active check: Sales Person MUST have clicked Active, and NOT be on leave
  const activeSales = allSales.filter(u => !u.is_on_leave && u.sales_availability_status === 'Active');
  if (activeSales.length === 0) return [];

  // 3. Exclude manually excluded user IDs if specified in settings
  const excludedIds = (config?.excluded_user_ids || []).map(id => String(id));
  const filtered = excludedIds.length > 0
    ? activeSales.filter(u => !excludedIds.includes(String(u.id)))
    : activeSales;

  if (filtered.length === 0) return [];

  // 4. Handle custom order if configured
  const customOrder = (config?.custom_order_user_ids || []).map(id => String(id));
  if (customOrder.length > 0) {
    const ordered: User[] = [];
    customOrder.forEach(id => {
      const found = filtered.find(u => String(u.id) === id);
      if (found) ordered.push(found);
    });
    const remaining = filtered
      .filter(u => !customOrder.includes(String(u.id)))
      .sort((a, b) => (a.display_name || '').localeCompare(b.display_name || ''));
    return [...ordered, ...remaining];
  }

  // Default deterministic ordering: alphabetical by display_name
  return [...filtered].sort((a, b) => (a.display_name || '').localeCompare(b.display_name || ''));
};

export const getNextSalespersonPreview = async (): Promise<{
  nextUser: User | null;
  nextIndex: number;
  allEligibleUsers: User[];
  config: LeadRoundRobinConfig;
}> => {
  const [config, users] = await Promise.all([
    getLeadRoundRobinConfig(),
    getUsers()
  ]);

  const eligible = getEligibleSalesUsers(users, config);
  if (eligible.length === 0) {
    return { nextUser: null, nextIndex: 0, allEligibleUsers: [], config };
  }

  // Find index of last assigned user in current eligible list
  let nextIndex = 0;
  if (config.last_assigned_user_id) {
    const lastUserIdx = eligible.findIndex(u => String(u.id) === String(config.last_assigned_user_id));
    if (lastUserIdx !== -1) {
      nextIndex = (lastUserIdx + 1) % eligible.length;
    } else {
      // If user was removed or not found, advance from last known index
      nextIndex = ((config.last_assigned_index ?? -1) + 1) % eligible.length;
    }
  }

  return {
    nextUser: eligible[nextIndex] || eligible[0],
    nextIndex,
    allEligibleUsers: eligible,
    config
  };
};

export const advanceLeadRoundRobin = async (
  candidateId: string,
  candidateName: string,
  overrideUserId?: string | number | null
): Promise<{ assignedUser: User | null; assignedUserId: string | number | null; index: number; isUnassigned?: boolean }> => {
  // 1. Single source of truth: unified backend round-robin assignment engine
  try {
    const currentUser = auth.currentUser;
    if (currentUser) {
      const idToken = await currentUser.getIdToken();
      const response = await fetch('/api/leads/round-robin/assign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          candidateId,
          candidateName,
          overrideUserId
        })
      });

      if (response.ok) {
        const data = await response.json();
        return {
          assignedUser: data.assignedUser || null,
          assignedUserId: data.assignedUserId || null,
          index: 0,
          isUnassigned: data.isUnassigned
        };
      }
    }
  } catch (apiErr) {
    console.warn('Backend assignment engine call failed, using client-side Firestore fallback:', apiErr);
  }

  // 2. Client-side Firestore transaction fallback
  try {
    const docRef = doc(db, 'jpc_settings', 'lead_round_robin');
    const users = await getUsers();
    const docSnap = await getDoc(docRef);
    const config: LeadRoundRobinConfig = docSnap.exists()
      ? ({ ...DEFAULT_ROUND_ROBIN_CONFIG, ...docSnap.data() } as LeadRoundRobinConfig)
      : DEFAULT_ROUND_ROBIN_CONFIG;

    const eligible = getEligibleSalesUsers(users, config);

    // If no eligible sales person is active and within working hours -> UNASSIGNED!
    if (eligible.length === 0 && !overrideUserId) {
      return { assignedUser: null, assignedUserId: null, index: 0, isUnassigned: true };
    }

    let assignedUser: User | null = null;
    let nextIndex: number = 0;

    if (overrideUserId) {
      const matched = users.find(u => String(u.id) === String(overrideUserId));
      assignedUser = matched || null;
      const idxInEligible = eligible.findIndex(u => String(u.id) === String(overrideUserId));
      nextIndex = idxInEligible !== -1 ? idxInEligible : (config.last_assigned_index ?? 0);
    } else {
      if (config.last_assigned_user_id) {
        const lastUserIdx = eligible.findIndex(u => String(u.id) === String(config.last_assigned_user_id));
        if (lastUserIdx !== -1) {
          nextIndex = (lastUserIdx + 1) % eligible.length;
        } else {
          nextIndex = ((config.last_assigned_index ?? -1) + 1) % eligible.length;
        }
      } else {
        nextIndex = 0;
      }
      assignedUser = eligible[nextIndex];
    }

    if (!assignedUser) {
      return { assignedUser: null, assignedUserId: null, index: 0, isUnassigned: true };
    }

    const newAssignment: LeadRoundRobinAssignment = {
      candidate_id: candidateId,
      candidate_name: candidateName,
      assigned_to_user_id: assignedUser.id,
      assigned_to_name: assignedUser.display_name,
      assigned_at: new Date().toISOString()
    };

    const recent = [newAssignment, ...(config.recent_assignments || [])].slice(0, 30);

    const updatedConfig: Partial<LeadRoundRobinConfig> = {
      id: 'lead_round_robin',
      last_assigned_user_id: String(assignedUser.id),
      last_assigned_index: nextIndex,
      last_assigned_at: new Date().toISOString(),
      total_leads_assigned: (config.total_leads_assigned || 0) + 1,
      recent_assignments: recent
    };

    await setDoc(docRef, { ...config, ...updatedConfig }, { merge: true });

    return { assignedUser, assignedUserId: assignedUser.id, index: nextIndex, isUnassigned: false };
  } catch (error) {
    console.error('Error in client fallback advanceLeadRoundRobin:', error);
    return { assignedUser: null, assignedUserId: null, index: 0, isUnassigned: true };
  }
};

export const batchAdvanceLeadRoundRobin = async (
  candidates: { id: string; name: string }[]
): Promise<Map<string, User | null>> => {
  const result = new Map<string, User | null>();
  if (candidates.length === 0) return result;

  for (const cand of candidates) {
    try {
      const res = await advanceLeadRoundRobin(cand.id, cand.name);
      result.set(cand.id, res.assignedUser);
    } catch (err) {
      console.error(`Error assigning candidate ${cand.id}:`, err);
      result.set(cand.id, null);
    }
  }

  return result;
};

/**
 * Updates a Sales Person's availability status (Active / Deactive).
 * If a rep becomes Active during working hours, backend will process unassigned lead backlog.
 */
export const updateSalesAvailability = async (
  status: 'Active' | 'Deactive',
  targetUserId?: string | number
): Promise<{ success: boolean; status: string; processedUnassigned?: number }> => {
  try {
    const currentUser = auth.currentUser;
    if (currentUser) {
      const idToken = await currentUser.getIdToken();
      const response = await fetch('/api/sales/availability', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ status, userId: targetUserId ? String(targetUserId) : undefined })
      });
      if (response.ok) {
        return await response.json();
      }
    }
  } catch (e) {
    console.warn('API call failed for updateSalesAvailability, falling back to direct Firestore:', e);
  }

  // Client Firestore Fallback
  const uid = targetUserId ? String(targetUserId) : auth.currentUser?.uid;
  if (uid) {
    const nowIso = new Date().toISOString();
    await setDoc(doc(db, 'jpc_users', uid), {
      sales_availability_status: status,
      sales_activated_at: status === 'Active' ? nowIso : null,
      sales_deactivated_at: status === 'Deactive' ? nowIso : null,
      updated_at: nowIso
    }, { merge: true });
  }

  return { success: true, status };
};

/**
 * Triggers backend processing of unassigned leads.
 */
export const processUnassignedLeadsBacklog = async (): Promise<{ success: boolean; processed?: number }> => {
  try {
    const currentUser = auth.currentUser;
    if (currentUser) {
      const idToken = await currentUser.getIdToken();
      const response = await fetch('/api/leads/assign-unassigned', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        }
      });
      if (response.ok) {
        return await response.json();
      }
    }
  } catch (e) {
    console.error('Failed to trigger backlog processing:', e);
  }
  return { success: false, processed: 0 };
};

// Utils
export const generateId = (prefix?: string) => (prefix ? `${prefix}` : '') + Math.random().toString(36).slice(2, 11);
export const now = () => new Date().toISOString();
