import React, { useState, useEffect, useMemo } from 'react';
import { 
  subscribeToCollection,
  saveCandidate, 
  logActivity, 
  addNotification,
  addPayment, 
  updatePayment,
  addPromise,
  updatePromise,
  updateQCChecklistItem,
  resetQCChecklist,
  addFollowUp,
  updateFollowUp,
  getUserById,
  now,
  updateCandidate,
  deleteCandidate,
  deleteInterviewSupportRequest
} from '../services/storage';
import { uploadFile, handleViewFile } from '../services/fileService';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { canUserAccessCandidate } from '../lib/permissions';
import { STAGES, TRANSITIONS, LEAD_SOURCES, ROLE_PERMISSIONS, PREVIOUS_STAGES } from '../constants';
import { 
  ArrowLeft, 
  Edit2, 
  Save, 
  X, 
  Phone, 
  Mail, 
  MapPin, 
  Linkedin, 
  GraduationCap, 
  Briefcase, 
  Package, 
  CreditCard, 
  MessageSquare, 
  Flag, 
  CheckSquare, 
  Clock, 
  History,
  Plus,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  FileText,
  FileEdit,
  Download,
  Upload,
  RotateCcw,
  User as UserIcon,
  ExternalLink,
  Calendar,
  Video,
  TrendingUp,
  ShieldCheck,
  Share2,
  Key,
  Copy,
  Check,
  Image,
  Trash2,
  Lock,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { canManageFreeTrial } from '../lib/permissions';
import { FreeTrialBadge } from '../components/FreeTrialBadge';
import { Candidate, Payment, Promise as PromiseType, QCChecklistItem, FollowUp, ActivityLog, User, Stage, ResumeChangeRequest, Application, InterviewSupportRequest, TargetReductionRequest, ResumeVersion } from '../types';
import { query, collection, where, onSnapshot, doc, setDoc, getDocs } from 'firebase/firestore';
import { db, firebaseConfig } from '../firebase';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut as secondarySignOut, updateProfile } from 'firebase/auth';

export const CandidateDetail: React.FC = () => {
  const { user, isAuthReady } = useAuth();
  const { showToast } = useToast();
  
  const params = new URLSearchParams(window.location.hash.split('?')[1]);
  const id = params.get('id');

  const isCandidate = user?.role === 'candidate' || user?.role === 'jpc_candidate';
  const isLeadGen = user?.role === 'jpc_lead_gen';
  const isSalesperson = user?.role === 'jpc_sales';
  const canEdit = !isCandidate && !isLeadGen;
  const canEditPersonal = !isCandidate; // Allowing Salespersons to edit personal info, including Lead Gen assignment
  const canEditResume = !isCandidate && !isSalesperson;
  const canEditPackage = !isCandidate;
  const canManagePayments = !isCandidate && !isLeadGen;
  const canManageFollowUps = !isCandidate && !isLeadGen;
  const canManageRemarks = !isCandidate && !isLeadGen;
  const canManageAgreement = user?.role === 'jpc_cs' || user?.role === 'jpc_compliance_person' || user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager';
  const canDelete = user?.role === 'administrator' || user?.role === 'jpc_sysadmin';
  const canEditFreeTrial = canManageFreeTrial(user);

  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [isUpdatingTrial, setIsUpdatingTrial] = useState(false);
  const [isEditingTrialDates, setIsEditingTrialDates] = useState(false);
  const [trialDatesForm, setTrialDatesForm] = useState({ start_date: '', end_date: '' });

  const canMoveStage = (() => {
    if (!user || !user.role || !candidate) return false;
    const permissions = ROLE_PERMISSIONS[user.role];
    if (!permissions) return false;
    if (permissions.allowedStages === 'ALL') return true;
    return permissions.allowedStages.includes(candidate.current_stage);
  })();

  const [payments, setPayments] = useState<Payment[]>([]);
  const [promises, setPromises] = useState<PromiseType[]>([]);
  const [checklist, setChecklist] = useState<QCChecklistItem[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [resumeRequests, setResumeRequests] = useState<ResumeChangeRequest[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [interviews, setInterviews] = useState<InterviewSupportRequest[]>([]);
  const [targetRequests, setTargetRequests] = useState<TargetReductionRequest[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isAuthReady || !id) return;

    // Security: Candidates can only see their own profile
    if ((user?.role === 'candidate' || user?.role === 'jpc_candidate') && user.candidate_id !== id) {
      showToast('Access denied. Redirecting to your profile.', 'error');
      window.location.hash = `#candidate?id=${user.candidate_id}`;
      return;
    }

    const unsubCandidate = onSnapshot(doc(db, 'jpc_candidates', id), (doc) => {
      if (doc.exists()) {
        const data = doc.data() as Candidate;
        
        // Role-based access check
        if (!canUserAccessCandidate(data, user, allUsers)) {
          showToast('Access denied. You do not have permission to view this candidate.', 'error');
          window.location.hash = '#candidates';
          return;
        }

        setCandidate(data);
        setIsLoading(false);
      }
    });

    const unsubPayments = onSnapshot(query(collection(db, 'jpc_payments'), where('candidate_id', '==', id)), (snap) => {
      setPayments(snap.docs.map(d => d.data() as Payment).sort((a, b) => a.part_number - b.part_number));
    });

    const unsubPromises = onSnapshot(query(collection(db, 'jpc_promises'), where('candidate_id', '==', id)), (snap) => {
      setPromises(snap.docs.map(d => d.data() as PromiseType).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    });

    const unsubChecklist = onSnapshot(query(collection(db, 'jpc_qc_checklist'), where('candidate_id', '==', id)), (snap) => {
      setChecklist(snap.docs.map(d => d.data() as QCChecklistItem).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
    });

    const unsubFollowUps = onSnapshot(query(collection(db, 'jpc_followups'), where('candidate_id', '==', id)), (snap) => {
      setFollowUps(snap.docs.map(d => d.data() as FollowUp));
    });

    const unsubActivity = onSnapshot(query(collection(db, 'jpc_activity_logs'), where('candidate_id', '==', id)), (snap) => {
      setActivityLogs(snap.docs.map(d => d.data() as ActivityLog));
    });

    const unsubResume = onSnapshot(query(collection(db, 'jpc_resume_requests'), where('candidate_id', '==', id)), (snap) => {
      setResumeRequests(snap.docs.map(d => d.data() as ResumeChangeRequest));
    });

    const unsubApps = onSnapshot(query(collection(db, 'jpc_applications'), where('candidate_id', '==', id)), (snap) => {
      setApplications(snap.docs.map(d => d.data() as Application));
    });

    const unsubTargetRequests = onSnapshot(query(collection(db, 'jpc_target_reductions'), where('candidate_id', '==', id)), (snap) => {
      setTargetRequests(snap.docs.map(d => d.data() as TargetReductionRequest));
    });

    const unsubInterviews = onSnapshot(query(collection(db, 'jpc_interview_requests'), where('candidate_id', '==', id)), (snap) => {
      setInterviews(snap.docs.map(d => d.data() as InterviewSupportRequest));
    });

    const unsubUsers = subscribeToCollection<User>('jpc_users', (data) => {
      setAllUsers(data);
    });

    return () => {
      unsubCandidate();
      unsubPayments();
      unsubPromises();
      unsubChecklist();
      unsubFollowUps();
      unsubActivity();
      unsubResume();
      unsubApps();
      unsubTargetRequests();
      unsubInterviews();
      unsubUsers();
    };
  }, [isAuthReady, id]);

  // Automatic "healing" of large documents (offloading raw base64 to CV repository)
  useEffect(() => {
    const healCandidate = async () => {
      if (!candidate || !id || !user) return;
      
      const largeFields = ['resume_base64', 'agreement_base64'];
      let needsHealing = false;
      const updates: any = {};
      
      for (const field of largeFields) {
        const val = (candidate as any)[field];
        if (val && val.startsWith('data:')) {
          needsHealing = true;
          try {
            console.log(`[Healer] Offloading large base64 data from field: ${field}`);
            const refUrl = await uploadFile(val, {
              name: candidate.full_name,
              email: candidate.email,
              phone: candidate.phone,
              filename: field === 'resume_base64' ? (candidate.resume_filename || 'resume.pdf') : (candidate.agreement_filename || 'agreement.pdf')
            });
            updates[field] = refUrl;
            if (field === 'resume_base64') updates.resume_url = refUrl;
            if (field === 'agreement_base64') updates.agreement_url = refUrl;
          } catch (e) {
            console.error(`[Healer] Healing failed for field ${field}:`, e);
          }
        }
      }

      if (needsHealing) {
        try {
          await updateCandidate(id, updates);
          console.log('[Healer] Candidate document optimized successfully.');
        } catch (e) {
          console.error('[Healer] Failed to update optimized candidate:', e);
        }
      }
    };
    healCandidate();
  }, [candidate, id, user]);

  const salesUsers = allUsers.filter(u => u.role === 'jpc_sales');
  const csUsers = allUsers.filter(u => u.role === 'jpc_cs' || u.role === 'jpc_compliance_person');
  const resumeUsers = allUsers.filter(u => u.role === 'jpc_resume' && !u.is_on_leave);
  const marketingLeaders = allUsers.filter(u => u.role === 'jpc_marketing' && !u.is_on_leave);
  const marketingUsers = allUsers.filter(u => (u.role === 'jpc_marketing_support' || u.role === 'jpc_marketing') && !u.is_on_leave);

  // Edit states
  const [isEditingPersonal, setIsEditingPersonal] = useState(false);
  const [isEditingEducation, setIsEditingEducation] = useState(false);
  const [isEditingPackage, setIsEditingPackage] = useState(false);
  const [isEditingRemarks, setIsEditingRemarks] = useState(false);
  const [isRequestingTarget, setIsRequestingTarget] = useState(false);
  const [isResumePatchingModalOpen, setIsResumePatchingModalOpen] = useState(false);
  const [isResumeUploadModalOpen, setIsResumeUploadModalOpen] = useState(false);
  const [isGeneratingAccess, setIsGeneratingAccess] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  
  const [isMarketingInactiveModalOpen, setIsMarketingInactiveModalOpen] = useState(false);
  const [isBackoutModalOpen, setIsBackoutModalOpen] = useState(false);
  const [isOfferModalOpen, setIsOfferModalOpen] = useState(false);
  const [inactiveReason, setInactiveReason] = useState('');
  const [backoutReason, setBackoutReason] = useState('');
  const [offerDetails, setOfferDetails] = useState('');

  const [personalForm, setPersonalForm] = useState<Partial<Candidate>>({});
  const [educationForm, setEducationForm] = useState<Partial<Candidate>>({});
  const [packageForm, setPackageForm] = useState<Partial<Candidate>>({});
  const [remarksForm, setRemarksForm] = useState('');
  const [targetForm, setTargetForm] = useState({ requested_target: 20, reason: '' });
  const [patchingDetails, setPatchingDetails] = useState('');
  const [resumePhrases, setResumePhrases] = useState('');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [isUploadingResume, setIsUploadingResume] = useState(false);

  const filteredRecruiters = useMemo(() => {
    if (!packageForm.assigned_marketing_leader) return [];
    return allUsers.filter(u => u.role === 'jpc_recruiter' && String(u.leader_id) === String(packageForm.assigned_marketing_leader) && !u.is_on_leave);
  }, [allUsers, packageForm.assigned_marketing_leader]);

  // Payment form
  const [paymentForm, setPaymentForm] = useState({
    part_number: 1,
    amount: 0,
    due_date: '',
    payment_method: 'Cash',
    notes: ''
  });

  // Promise form
  const [promiseText, setPromiseText] = useState('');

  // Follow-up form
  const [followUpForm, setFollowUpForm] = useState({
    date: '',
    note: ''
  });

  useEffect(() => {
    if (candidate) {
      setPersonalForm({ ...candidate });
      setEducationForm({ ...candidate });
      setPackageForm({ ...candidate });
      setRemarksForm(candidate.remarks || '');
      setTrialDatesForm({
        start_date: candidate.free_trial_start_date || '',
        end_date: candidate.free_trial_end_date || ''
      });
    }
  }, [candidate]);

  useEffect(() => {
    if ((user?.role === 'administrator' || user?.role === 'jpc_sysadmin') && checklist.length > 0 && (checklist.length !== 8 || !checklist.some(item => item.item_label === 'Candidate indidity Verification'))) {
      resetQCChecklist(id!);
    }
  }, [checklist, id, user]);

  const totalPaid = payments.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0);
  const paymentProgress = (candidate?.package_amount || 0) > 0 ? (totalPaid / (candidate?.package_amount || 1)) * 100 : 0;
  const nextPayment = payments.find(p => p.status === 'pending');

  const combinedLogs = useMemo(() => {
    const logs = activityLogs.map(log => {
      const actor = allUsers.find(u => String(u.id) === String(log.user_id));
      return {
        id: log.id,
        action: log.action,
        details: log.details,
        user_name: actor?.display_name || 'System',
        user_role: actor?.role,
        created_at: log.created_at,
        type: 'activity'
      };
    });

    const resumeLogs = resumeRequests.map(req => {
      const actor = allUsers.find(u => String(u.id) === String(req.recruiter_id));
      return {
        id: req.id,
        action: 'Resume Change Request',
        details: `Status: ${req.status.replace('_', ' ')}. Details: ${req.details}`,
        user_name: actor?.display_name || 'System',
        user_role: actor?.role,
        created_at: req.created_at,
        type: 'resume'
      };
    });

    const appLogs = applications.map(app => {
      const actor = allUsers.find(u => String(u.id) === String(app.recruiter_id));
      return {
        id: app.id,
        action: 'Job Application',
        details: `Applied via Link: ${app.job_link}.`,
        user_name: actor?.display_name || 'System',
        user_role: actor?.role,
        created_at: app.created_at,
        type: 'application'
      };
    });

    const interviewLogs = interviews.map(int => {
      const actor = allUsers.find(u => String(u.id) === String(int.created_by || int.recruiter_id));
      return {
        id: int.id,
        action: 'Interview Support',
        details: `Status: ${int.overall_status.replace('_', ' ')}. Company: ${int.company_name}`,
        user_name: actor?.display_name || 'System',
        user_role: actor?.role,
        created_at: int.created_at,
        type: 'interview'
      };
    });

    return [...logs, ...resumeLogs, ...appLogs, ...interviewLogs].sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [activityLogs, resumeRequests, applications, interviews, allUsers]);

  const appStats = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const dayApps = applications.filter(a => a.applied_at === todayStr);
    const weekApps = applications.filter(a => new Date(a.applied_at) >= startOfWeek);
    const monthApps = applications.filter(a => new Date(a.applied_at) >= startOfMonth);
    
    return {
      day: dayApps.length,
      week: weekApps.length,
      month: monthApps.length,
      lifetime: applications.length
    };
  }, [applications]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-text-primary">Candidate Not Found</h2>
          <a href="#candidates" className="text-accent-blue hover:underline mt-2 block">Back to Candidates</a>
        </div>
      </div>
    );
  }

  const hasPortal = allUsers.some(u => u.candidate_id === candidate.id);

  const generateRandomPassword = () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };

  const handleGenerateAccess = async () => {
    if (!candidate.email) {
      showToast('Candidate must have an email address to generate access.', 'error');
      return;
    }

    setIsGeneratingAccess(true);
    const password = generateRandomPassword();

    try {
      // 1. Create Firebase Auth user using a secondary app instance
      // This allows creating a user without logging out the current admin
      const secondaryApp = initializeApp(firebaseConfig, 'SecondaryCandidate');
      const secondaryAuth = getAuth(secondaryApp);
      
      try {
        const { user: fUser } = await createUserWithEmailAndPassword(
          secondaryAuth, 
          candidate.email, 
          password
        );
        await updateProfile(fUser, { displayName: candidate.full_name });
        
        // 2. Create user record in Firestore (jpc_users)
        const newUser: User = {
          id: fUser.uid,
          username: candidate.email.split('@')[0],
          display_name: candidate.full_name,
          role: 'candidate',
          candidate_id: candidate.id,
          created_at: new Date().toISOString()
        };

        await setDoc(doc(db, 'jpc_users', fUser.uid), newUser);
        
        // 3. Update candidate document to remove temp password if any
        await saveCandidate({
          ...candidate,
          temp_portal_password: null
        } as Candidate, user?.id ? String(user.id) : null);

        await secondarySignOut(secondaryAuth);
        
        setGeneratedPassword(password);
        showToast('Portal access created successfully!', 'success');
        await logActivity(candidate.id, 'Portal access generated', `Login credentials created for ${candidate.email}`, user?.id || null);
      } catch (authError: any) {
        console.error('Auth creation error:', authError);
        let message = 'Failed to create portal access';
        
        if (authError.code === 'auth/email-already-in-use') {
          // Try to find if this user already exists in Firestore
          const usersSnap = await getDocs(query(collection(db, 'jpc_users'), where('email', '==', candidate.email)));
          
          if (!usersSnap.empty) {
            const existingUser = usersSnap.docs[0].data() as User;
            
            // If they exist but aren't linked to this candidate, link them
            if (existingUser.candidate_id !== candidate.id) {
              await setDoc(doc(db, 'jpc_users', String(existingUser.id)), { 
                ...existingUser, 
                candidate_id: candidate.id,
                role: 'candidate' // Ensure they have the candidate role
              });
              
              showToast('Existing account linked to this candidate!', 'success');
              await logActivity(candidate.id, 'Portal access linked', `Existing account (${candidate.email}) was linked to this candidate profile`, user?.id || null);
              setIsGeneratingAccess(false);
              return;
            } else {
              message = 'This candidate already has portal access.';
            }
          } else {
            message = 'This email is already registered in our system. Please use a different email or contact support to link the existing account.';
          }
        } else if (authError.code === 'auth/weak-password') {
          message = 'Password should be at least 6 characters.';
        }
        showToast(message, 'error');
      }
    } catch (error) {
      console.error('Generate access error:', error);
      showToast('An error occurred while creating access', 'error');
    } finally {
      setIsGeneratingAccess(false);
    }
  };

  const handleEnableFreeTrial = async () => {
    if (!id || !candidate || isUpdatingTrial) return;
    setIsUpdatingTrial(true);
    try {
      const today = new Date();
      const startStr = today.toISOString().split('T')[0];
      const endDate = new Date(today);
      endDate.setDate(today.getDate() + 15);
      const endStr = endDate.toISOString().split('T')[0];

      const updates: Partial<Candidate> = {
        is_free_trial: true,
        free_trial_start_date: startStr,
        free_trial_end_date: endStr,
        free_trial_managed_by: user?.id ? String(user.id) : null,
        free_trial_updated_at: new Date().toISOString()
      };

      await updateCandidate(id, updates);
      await logActivity(
        candidate.id,
        'Enabled 15-day Free Trial',
        `15-day Free Trial enabled (${startStr} to ${endStr}) by ${user?.display_name || 'User'}`,
        user?.id ? String(user.id) : null
      );

      setTrialDatesForm({ start_date: startStr, end_date: endStr });
      showToast('15-Day Free Trial activated successfully!', 'success');
    } catch (err) {
      console.error('Failed to enable free trial:', err);
      showToast('Failed to enable free trial', 'error');
    } finally {
      setIsUpdatingTrial(false);
    }
  };

  const handleDisableFreeTrial = async () => {
    if (!id || !candidate || isUpdatingTrial) return;
    if (!window.confirm('Are you sure you want to disable the Free Trial for this candidate?')) return;
    setIsUpdatingTrial(true);
    try {
      const updates: Partial<Candidate> = {
        is_free_trial: false,
        free_trial_managed_by: user?.id ? String(user.id) : null,
        free_trial_updated_at: new Date().toISOString()
      };

      await updateCandidate(id, updates);
      await logActivity(
        candidate.id,
        'Disabled Free Trial',
        `Free Trial disabled by ${user?.display_name || 'User'}`,
        user?.id ? String(user.id) : null
      );

      showToast('Free Trial disabled successfully', 'success');
    } catch (err) {
      console.error('Failed to disable free trial:', err);
      showToast('Failed to disable free trial', 'error');
    } finally {
      setIsUpdatingTrial(false);
    }
  };

  const handleSaveTrialDates = async () => {
    if (!id || !candidate || isUpdatingTrial) return;
    if (!trialDatesForm.start_date || !trialDatesForm.end_date) {
      showToast('Please specify both start date and end date', 'error');
      return;
    }
    setIsUpdatingTrial(true);
    try {
      const updates: Partial<Candidate> = {
        free_trial_start_date: trialDatesForm.start_date,
        free_trial_end_date: trialDatesForm.end_date,
        free_trial_managed_by: user?.id ? String(user.id) : null,
        free_trial_updated_at: new Date().toISOString()
      };

      await updateCandidate(id, updates);
      await logActivity(
        candidate.id,
        'Updated Free Trial Dates',
        `Free Trial dates updated to ${trialDatesForm.start_date} - ${trialDatesForm.end_date} by ${user?.display_name || 'User'}`,
        user?.id ? String(user.id) : null
      );

      setIsEditingTrialDates(false);
      showToast('Free Trial dates updated successfully', 'success');
    } catch (err) {
      console.error('Failed to update trial dates:', err);
      showToast('Failed to update trial dates', 'error');
    } finally {
      setIsUpdatingTrial(false);
    }
  };

  const handleSavePersonal = async () => {
    const oldNotes = candidate.notes;
    const newNotes = personalForm.notes;
    
    await saveCandidate({ ...candidate, ...personalForm } as Candidate, user?.id ? String(user.id) : null);
    
    if (oldNotes !== newNotes) {
      const teamMembers = [candidate.assigned_sales, candidate.assigned_cs, candidate.assigned_recruiter].filter(Boolean);
      for (const memberId of teamMembers) {
        await addNotification({
          recipient_id: memberId as string,
          sender_id: user?.id || null,
          type: 'system_alert',
          message: `Notes for candidate ${candidate.full_name} have been updated.`
        });
      }
    }

    const behalfUser = personalForm.updated_behalf_of ? allUsers.find(u => String(u.id) === String(personalForm.updated_behalf_of)) : null;
    const logMsg = behalfUser 
      ? `Personal info updated on behalf of ${behalfUser.display_name} (Leave Cover).`
      : 'Personal information details were updated.';
    await logActivity(candidate.id, 'Updated personal info', logMsg, user?.id || null);
    setIsEditingPersonal(false);
    showToast('Personal info updated', 'success');
  };

  const handleSaveEducation = async () => {
    await saveCandidate({ ...candidate, ...educationForm } as Candidate, user?.id ? String(user.id) : null);
    
    const teamMembers = [candidate.assigned_sales, candidate.assigned_cs, candidate.assigned_recruiter].filter(Boolean);
    for (const memberId of teamMembers) {
      await addNotification({
        recipient_id: memberId as string,
        sender_id: user?.id || null,
        type: 'system_alert',
        message: `Education/Experience for candidate ${candidate.full_name} has been updated.`
      });
    }

    await logActivity(candidate.id, 'Updated education info', 'Education and experience details were updated.', user?.id || null);
    setIsEditingEducation(false);
    showToast('Education info updated', 'success');
  };

  const handleSavePackage = async () => {
    await saveCandidate({ ...candidate, ...packageForm } as Candidate, user?.id ? String(user.id) : null);
    
    // Check for assignments
    const assignmentFields = ['assigned_cs', 'assigned_resume', 'assigned_marketing_leader', 'assigned_recruiter', 'assigned_marketing', 'assigned_sales'];
    for (const field of assignmentFields) {
      if (packageForm[field as keyof Candidate] !== candidate[field as keyof Candidate] && packageForm[field as keyof Candidate]) {
        await addNotification({
          recipient_id: packageForm[field as keyof Candidate] as string,
          sender_id: user?.id || null,
          type: 'system_alert',
          message: `You have been assigned to candidate ${candidate.full_name}`
        });
      }
    }

    await logActivity(candidate.id, 'Updated package info', 'Package and team assignment details were updated.', user?.id || null);
    setIsEditingPackage(false);
    showToast('Package info updated', 'success');
  };

  const handleSaveRemarks = async () => {
    await saveCandidate({ ...candidate, remarks: remarksForm } as Candidate, user?.id ? String(user.id) : null);
    await logActivity(candidate.id, 'Updated remarks', 'Candidate remarks were updated.', user?.id || null);
    setIsEditingRemarks(false);
    showToast('Remarks updated', 'success');
  };

  const handlePaymentProofUpload = async (payment: Payment, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      showToast('Uploading proof...', 'info');
      const url = await uploadFile(file);
      const updated = {
        ...payment,
        proof_url: url,
        proof_base64: url,
        proof_filename: file.name
      };
      await updatePayment(updated);
      await logActivity(candidate!.id, 'Payment proof uploaded', `Proof uploaded for Part ${payment.part_number}`, user?.id || null);
      showToast('Payment proof uploaded', 'success');
    } catch (error) {
      showToast('Failed to upload proof', 'error');
    }
  };

  const handleDownloadResume = () => {
    const resumeUrl = candidate?.resume_url || candidate?.resume_base64;
    if (!resumeUrl) {
      showToast('No resume available for download', 'error');
      return;
    }
    handleViewFile(resumeUrl, candidate.resume_filename || 'resume.pdf');
  };

  const handleResumeUpload = async () => {
    if (!resumeFile || !candidate) return;

    setIsUploadingResume(true);
    try {
      showToast('Uploading resume...', 'info');
      const url = await uploadFile(resumeFile, {
        name: candidate.full_name,
        email: candidate.email || 'N/A',
        phone: candidate.phone || ''
      });

      // Prepare versions preserving all previous ones
      const existingVersions: ResumeVersion[] = candidate.resume_versions ? [...candidate.resume_versions] : [];
      if (existingVersions.length === 0 && (candidate.resume_url || candidate.resume_base64)) {
        existingVersions.push({
          id: `v1_${Date.now() - 1000}`,
          url: candidate.resume_url || candidate.resume_base64 || '',
          filename: candidate.resume_filename || 'original_resume.pdf',
          uploaded_at: candidate.updated_at || candidate.created_at || new Date().toISOString(),
          version_number: 1,
          is_current: false,
          notes: 'Original resume'
        });
      }

      const updatedPrevVersions = existingVersions.map(v => ({ ...v, is_current: false }));
      const newVersionNumber = updatedPrevVersions.length + 1;
      const newVersionObj: ResumeVersion = {
        id: `v${newVersionNumber}_${Date.now()}`,
        url: url,
        filename: resumeFile.name,
        uploaded_at: new Date().toISOString(),
        uploaded_by: user?.id || null,
        uploaded_by_name: user?.display_name || user?.username || 'Team Member',
        notes: resumePhrases ? `Phrases: ${resumePhrases}` : 'Updated resume',
        version_number: newVersionNumber,
        is_current: true
      };

      const finalVersions = [...updatedPrevVersions, newVersionObj];

      const updated: Candidate = {
        ...candidate,
        resume_url: url,
        resume_base64: url,
        resume_filename: resumeFile.name,
        resume_phrases: resumePhrases || candidate.resume_phrases,
        resume_versions: finalVersions,
        updated_at: new Date().toISOString()
      };
      await saveCandidate(updated, user?.id ? String(user.id) : null);
      await logActivity(candidate.id, 'Resume updated', `Resume updated to Version ${newVersionNumber} (${resumeFile.name})${resumePhrases ? `. Phrases: ${resumePhrases}` : ''}`, user?.id || null);
      showToast(`Resume Version ${newVersionNumber} uploaded successfully`, 'success');
      setIsResumeUploadModalOpen(false);
      setResumeFile(null);
      setResumePhrases('');
    } catch (error) {
      showToast('Failed to upload resume', 'error');
    } finally {
      setIsUploadingResume(false);
    }
  };

  const handleDownloadAgreement = () => {
    if (!candidate) return;
    const agreementUrl = candidate.agreement_url || candidate.agreement_base64;
    if (!agreementUrl) return;
    handleViewFile(agreementUrl, candidate.agreement_filename || 'agreement.pdf');
  };

  const handleAgreementUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !candidate) return;

    try {
      showToast('Uploading agreement...', 'info');
      const url = await uploadFile(file);
      const updated: Candidate = {
        ...candidate,
        agreement_url: url,
        agreement_base64: url,
        agreement_filename: file.name,
        updated_at: new Date().toISOString()
      };
      await saveCandidate(updated, user?.id ? String(user.id) : null);
      await logActivity(candidate.id, 'Agreement uploaded', `Agreement document uploaded: ${file.name}`, user?.id || null);
      showToast('Agreement uploaded successfully', 'success');
    } catch (error) {
      showToast('Failed to upload agreement', 'error');
    }
  };

  const handleMoveToMarketingInactive = async () => {
    if (!inactiveReason) {
      showToast('Please provide a reason', 'error');
      return;
    }
    const updated = { 
      ...candidate!, 
      current_stage: 'marketing_inactive' as Stage,
      updated_at: new Date().toISOString()
    };
    await saveCandidate(updated as Candidate, user?.id ? String(user.id) : null);
    await logActivity(candidate!.id, 'Status: Marketing Inactive', `Reason: ${inactiveReason}`, user?.id || null);
    showToast('Marked as Marketing Inactive', 'success');
    setIsMarketingInactiveModalOpen(false);
    setInactiveReason('');
  };

  const handleMoveToBackout = async () => {
    if (!backoutReason) {
      showToast('Please provide a reason', 'error');
      return;
    }
    const updated = { 
      ...candidate!, 
      current_stage: 'backout' as Stage,
      updated_at: new Date().toISOString()
    };
    await saveCandidate(updated as Candidate, user?.id ? String(user.id) : null);
    await logActivity(candidate!.id, 'Status: Backout', `Reason: ${backoutReason}`, user?.id || null);
    showToast('Marked as Backout', 'success');
    setIsBackoutModalOpen(false);
    setBackoutReason('');
  };

  const handleMoveToOffer = async () => {
    if (!offerDetails) {
      showToast('Please provide offer details', 'error');
      return;
    }
    const updated = { 
      ...candidate!, 
      current_stage: 'offer' as Stage,
      updated_at: new Date().toISOString()
    };
    await saveCandidate(updated as Candidate, user?.id ? String(user.id) : null);
    await logActivity(candidate!.id, 'Status: Offer Received', `Details: ${offerDetails}`, user?.id || null);
    showToast('Marked as Offer Received', 'success');
    setIsOfferModalOpen(false);
    setOfferDetails('');
  };

  const handleStageMove = async (newStage: Stage, isUndo = false) => {
    // CS now has admin-like access for stage movement as per update
    // if (!isUndo && user?.role === 'jpc_cs' && !candidate.agreement_url) {
    //   showToast('Agreement must be uploaded before moving to another step.', 'error');
    //   return;
    // }

    try {
      const oldStageLabel = STAGES[candidate.current_stage].label;
      const newStageLabel = STAGES[newStage].label;
      
      const updated = { 
        ...candidate, 
        current_stage: newStage,
        not_interested_at: newStage === 'not_interested' ? now() : null,
        not_eligible_at: newStage === 'not_eligible' ? now() : null,
        flags: {
          ...candidate.flags,
          sla_timeout_notified: false
        }
      };
      
      await saveCandidate(updated, user?.id ? String(user.id) : null);
      
      const teamMembers = [candidate.assigned_sales, candidate.assigned_cs, candidate.assigned_recruiter].filter(Boolean);
      for (const memberId of teamMembers) {
        if (!memberId) continue;
        try {
          await addNotification({
            recipient_id: memberId as string,
            sender_id: user?.id || null,
            type: 'system_alert',
            message: `Candidate ${candidate.full_name} moved from ${oldStageLabel} to ${newStageLabel}.`
          });
        } catch (e) {}
      }

      try {
        await logActivity(candidate.id, 'Stage moved', `Moved from ${oldStageLabel} to ${newStageLabel}`, user?.id || null);
      } catch (e) {}
      
      showToast(`Moved to ${newStageLabel}`, 'success');
    } catch (err: any) {
      console.error(err);
      showToast('Failed to change stage: ' + (err.message || 'Permission denied'), 'error');
    }
  };

  const handleToggleFlag = async (flag: keyof Candidate['flags']) => {
    const updated = {
      ...candidate,
      flags: { ...candidate.flags, [flag]: !candidate.flags[flag] }
    };
    await saveCandidate(updated, user?.id ? String(user.id) : null);
    await logActivity(candidate.id, 'Flag toggled', `Flag '${flag.replace(/_/g, ' ')}' was toggled.`, user?.id || null);
  };

  const handleCheckQC = async (item: QCChecklistItem) => {
    await updateQCChecklistItem({ ...item, checked: !item.checked });
    await logActivity(candidate.id, 'QC Item toggled', `QC Item '${item.item_label}' was toggled.`, user?.id || null);
  };

  const handleUpdateQCValue = async (item: QCChecklistItem, value: string) => {
    await updateQCChecklistItem({ ...item, value });
  };

  const handleResetChecklist = async () => {
    if (!candidate) return;
    if (window.confirm('This will delete current checklist items and reset to the new 8-item checklist. Continue?')) {
      await resetQCChecklist(candidate.id);
      await logActivity(candidate.id, 'QC Checklist Reset', 'Checklist was reset to the new 8-item format.', user?.id || null);
      showToast('Checklist reset successfully', 'success');
    }
  };

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentForm.amount || !paymentForm.due_date) {
      showToast('Amount and Due Date are required', 'error');
      return;
    }
    await addPayment({
      candidate_id: candidate.id,
      part_number: Number(paymentForm.part_number),
      amount: Number(paymentForm.amount),
      due_date: paymentForm.due_date,
      paid_on: null,
      status: 'pending',
      receipt_number: `RCP-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      payment_method: paymentForm.payment_method,
      notes: paymentForm.notes,
      created_by: user?.id || null
    });
    await logActivity(candidate.id, 'Payment plan added', `Added Part ${paymentForm.part_number} for $${paymentForm.amount}`, user?.id || null);
    showToast('Payment plan added', 'success');
    setPaymentForm({ part_number: payments.length + 2, amount: 0, due_date: '', payment_method: 'Cash', notes: '' });
  };

  const handleMarkPaid = async (payment: Payment) => {
    await updatePayment({ ...payment, status: 'paid', paid_on: now() });
    await logActivity(candidate.id, 'Payment received', `Part ${payment.part_number} ($${payment.amount}) marked as paid.`, user?.id || null);
    showToast('Payment marked as paid', 'success');
  };

  const handleAddPromise = async () => {
    if (!promiseText) return;
    await addPromise({
      candidate_id: candidate.id,
      promise_text: promiseText,
      made_by: user?.id || null,
      stage: candidate.current_stage,
      status: 'active'
    });
    await logActivity(candidate.id, 'Promise made', `New promise: ${promiseText}`, user?.id || null);
    setPromiseText('');
    showToast('Promise added', 'success');
  };

  const handleAddFollowUp = async () => {
    if (!followUpForm.date || !followUpForm.note) return;
    await addFollowUp({
      candidate_id: candidate!.id,
      stage: candidate!.current_stage,
      followup_date: followUpForm.date,
      note: followUpForm.note,
      done: false,
      created_by: user?.id || null
    });
    await logActivity(candidate!.id, 'Follow-up scheduled', `Scheduled for ${followUpForm.date}`, user?.id || null);
    setFollowUpForm({ date: '', note: '' });
    showToast('Follow-up scheduled', 'success');
  };

  const handleDeleteInterview = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this interview record?')) return;
    try {
      await deleteInterviewSupportRequest(id);
      showToast('Interview record deleted', 'success');
    } catch (error) {
      showToast('Failed to delete interview record', 'error');
    }
  };

  const handleRequestTargetReduction = async () => {
    if (!targetForm.reason || !targetForm.requested_target) {
      showToast('Please fill all fields', 'error');
      return;
    }

    try {
      const { addTargetReductionRequest } = await import('../services/storage');
      await addTargetReductionRequest({
        candidate_id: candidate!.id,
        recruiter_id: String(user?.id),
        requested_target: Number(targetForm.requested_target),
        reason: targetForm.reason,
        status: 'pending'
      });

      // Notify CS and ALL Marketing Leaders (TL)
      const recipients = new Set<string>();
      if (candidate?.assigned_cs) recipients.add(String(candidate.assigned_cs));
      
      // Notify all Marketing TLs as per "TL just get notifications of all"
      allUsers.filter(u => u.role === 'jpc_marketing').forEach(u => {
        recipients.add(String(u.id));
      });

      for (const recipientId of recipients) {
        await addNotification({
          recipient_id: recipientId,
          sender_id: user?.id || null,
          type: 'target_reduction_request',
          message: `Target reduction requested for ${candidate?.full_name} by ${user?.display_name}`
        });
      }

      await logActivity(candidate!.id, 'Target reduction requested', `Requested target: ${targetForm.requested_target}. Reason: ${targetForm.reason}`, user?.id || null);
      setIsRequestingTarget(false);
      setTargetForm({ requested_target: 20, reason: '' });
      showToast('Request submitted successfully', 'success');
    } catch (error) {
      showToast('Failed to submit request', 'error');
    }
  };

  const handleSubmitResumePatching = async () => {
    if (!patchingDetails) {
      showToast('Please provide details for the patching request', 'error');
      return;
    }

    try {
      const { generateId } = await import('../services/storage');
      const requestId = generateId();
      
      const mohitUser = allUsers.find(u => u.username === 'mohit.panchal' || u.email === 'mohit.panchal@auriic.co');
      const faizUser = allUsers.find(u => u.username === 'care' || String(u.display_name).toLowerCase().includes('faiz'));
      const isMohitTeam = (candidate && (String(candidate.assigned_marketing_leader) === String(mohitUser?.id) || String(candidate.assigned_marketing_leader) === String(faizUser?.id))) || 
                          (user && (String(user.leader_id) === String(mohitUser?.id) || String(user.leader_id) === String(faizUser?.id)));
      
      let initialStatus: ResumeChangeRequest['status'] = 'pending_tl';
      if (
        user?.role === 'jpc_cs' || 
        user?.role === 'administrator' || 
        user?.role === 'jpc_sysadmin' || 
        user?.role === 'jpc_manager'
      ) {
        initialStatus = 'pending_resume_team';
      } else if (isMohitTeam || user?.role === 'jpc_compliance_person') {
        initialStatus = 'pending_cs';
      } else {
        initialStatus = 'pending_tl';
      }

      const newRequest: ResumeChangeRequest = {
        id: requestId,
        candidate_id: candidate!.id,
        recruiter_id: String(user?.id),
        details: patchingDetails,
        status: initialStatus,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await setDoc(doc(db, 'jpc_resume_requests', requestId), newRequest);
      
      // Notify TL, CS, or Resume Team
      const marketingTL = allUsers.find(u => u.role === 'jpc_marketing');
      const resumeUser = allUsers.find(u => u.role === 'jpc_resume');
      const csUser = allUsers.find(u => u.role === 'jpc_cs');
      
      let recipientId: string | number | undefined = candidate?.assigned_marketing_leader || marketingTL?.id;
      if (initialStatus === 'pending_resume_team') {
        recipientId = resumeUser?.id || candidate?.assigned_marketing_leader || marketingTL?.id;
      } else if (initialStatus === 'pending_cs') {
        recipientId = faizUser?.id || csUser?.id || candidate?.assigned_marketing_leader || marketingTL?.id;
      }

      if (recipientId) {
        await addNotification({
          recipient_id: String(recipientId),
          sender_id: user?.id || null,
          type: 'resume_request',
          message: initialStatus === 'pending_resume_team'
            ? `Resume Patching requested for ${candidate?.full_name} submitted directly to Resume Team`
            : isMohitTeam
            ? `Resume Patching requested for ${candidate?.full_name} (TL Bypassed to Faiz)`
            : `Resume Patching requested for ${candidate?.full_name} by ${user?.display_name}`
        });
      }

      await logActivity(candidate!.id, 'Resume Patching Requested', `Details: ${patchingDetails}${isMohitTeam ? ' (Bypassed TL approval for Mohit Team to Faiz)' : ''}`, user?.id || null);
      setIsResumePatchingModalOpen(false);
      setPatchingDetails('');
      showToast(
        initialStatus === 'pending_resume_team'
          ? 'Resume patching request submitted directly to Resume Team'
          : isMohitTeam 
          ? 'Resume patching request forwarded directly to Faiz (CS)' 
          : 'Resume patching request submitted to TL', 
        'success'
      );
    } catch (error) {
      console.error('Patching request error:', error);
      showToast('Failed to submit patching request', 'error');
    }
  };

  return (
    <div className="space-y-8 pb-20 px-4 md:px-6 lg:px-8">
      {/* Target Reduction Modal */}
      <AnimatePresence>
        {isRequestingTarget && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-bg-secondary border border-border-primary rounded-3xl shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="p-6 border-b border-border-primary flex items-center justify-between">
                <h3 className="text-xl font-bold text-text-primary">Request Target Reduction</h3>
                <button onClick={() => setIsRequestingTarget(false)} className="text-text-muted hover:text-text-primary">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-text-muted uppercase tracking-widest">Requested Daily Target</label>
                  <input 
                    type="number"
                    value={targetForm.requested_target || 40}
                    onChange={(e) => setTargetForm({ ...targetForm, requested_target: parseInt(e.target.value) })}
                    className="w-full bg-bg-tertiary border border-border-primary rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors"
                  />
                  <p className="text-[10px] text-text-muted italic">Default is 40 applications per profile.</p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-text-muted uppercase tracking-widest">Reason for Reduction</label>
                  <textarea 
                    value={targetForm.reason || ''}
                    onChange={(e) => setTargetForm({ ...targetForm, reason: e.target.value })}
                    placeholder="Why is it impossible to meet 40 applications?"
                    className="w-full bg-bg-tertiary border border-border-primary rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors min-h-[100px]"
                  />
                </div>
                <button 
                  onClick={handleRequestTargetReduction}
                  className="w-full py-4 bg-accent-blue text-white font-bold rounded-xl hover:bg-accent-blue/90 transition-all shadow-lg shadow-accent-blue/20"
                >
                  Submit Request
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Resume Patching Modal */}
      <AnimatePresence>
        {isResumePatchingModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-bg-secondary border border-border-primary rounded-3xl shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="p-6 border-b border-border-primary flex items-center justify-between font-bold text-text-primary">
                <h3 className="text-xl">Request Resume Patching</h3>
                <button onClick={() => setIsResumePatchingModalOpen(false)} className="text-text-muted hover:text-text-primary">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-2 text-text-primary">
                  <label className="text-xs font-bold text-text-muted uppercase tracking-widest">Change Details</label>
                  <textarea 
                    value={patchingDetails}
                    onChange={(e) => setPatchingDetails(e.target.value)}
                    placeholder="Describe exactly what needs to be changed or improved in the resume..."
                    className="w-full bg-bg-tertiary border border-border-primary rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent-purple transition-all min-h-[200px]"
                  />
                </div>
                <button 
                  onClick={handleSubmitResumePatching}
                  className="w-full py-4 bg-accent-purple text-white font-bold rounded-xl hover:bg-accent-purple/90 transition-all shadow-lg shadow-accent-purple/20"
                >
                  Submit Patching Request
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Resume Upload & Phrases Modal */}
      <AnimatePresence>
        {isResumeUploadModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-bg-secondary border border-border-primary rounded-3xl shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="p-6 border-b border-border-primary flex items-center justify-between font-bold text-text-primary">
                <h3 className="text-xl">Upload Resume</h3>
                <button onClick={() => setIsResumeUploadModalOpen(false)} className="text-text-muted hover:text-text-primary">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-text-muted uppercase tracking-widest">Select Resume File</label>
                  {!resumeFile ? (
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border-primary rounded-2xl cursor-pointer hover:border-accent-purple hover:bg-accent-purple/5 transition-all">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Upload className="w-8 h-8 text-text-muted mb-2" />
                        <p className="text-sm text-text-secondary">Click or drag to select file</p>
                        <p className="text-[10px] text-text-muted mt-1 uppercase font-bold">PDF, DOC, DOCX up to 10MB</p>
                      </div>
                      <input 
                        type="file" 
                        className="hidden" 
                        accept=".pdf,.doc,.docx" 
                        onChange={(e) => setResumeFile(e.target.files?.[0] || null)} 
                      />
                    </label>
                  ) : (
                    <div className="flex items-center justify-between p-4 bg-bg-tertiary rounded-2xl border border-border-primary">
                      <div className="flex items-center gap-3">
                        <FileText className="w-6 h-6 text-accent-purple" />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-text-primary truncate">{resumeFile.name}</p>
                          <p className="text-[10px] text-text-muted font-bold uppercase">{(resumeFile.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                      </div>
                      <button onClick={() => setResumeFile(null)} className="p-2 text-text-muted hover:text-accent-red rounded-lg transition-all">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-text-muted uppercase tracking-widest">Resume Phrases / Patching Notes</label>
                  <textarea 
                    value={resumePhrases}
                    onChange={(e) => setResumePhrases(e.target.value)}
                    placeholder="Enter key skills, project highlights, or specific phrases added to the resume..."
                    className="w-full bg-bg-tertiary border border-border-primary rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-purple transition-all min-h-[120px]"
                  />
                  <p className="text-[10px] text-text-muted italic">These phrases will be saved with the resume for recruiter reference.</p>
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setIsResumeUploadModalOpen(false)}
                    className="flex-1 py-3 bg-bg-tertiary text-text-primary font-bold rounded-xl hover:bg-bg-tertiary/80 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleResumeUpload}
                    disabled={!resumeFile || isUploadingResume}
                    className="flex-1 py-3 bg-accent-purple text-white font-bold rounded-xl hover:bg-accent-purple/90 transition-all shadow-lg shadow-accent-purple/20 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
                  >
                    {isUploadingResume && <RotateCcw className="w-4 h-4 animate-spin" />}
                    Upload & Save
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Password Modal */}
      <AnimatePresence>
        {generatedPassword && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-bg-secondary border border-border-primary rounded-3xl shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-accent-green/10 rounded-full flex items-center justify-center mx-auto mb-6">
                  <ShieldCheck className="w-8 h-8 text-accent-green" />
                </div>
                <h3 className="text-2xl font-bold text-text-primary mb-2">Access Generated!</h3>
                <p className="text-text-secondary mb-8">Copy these credentials and share them with the candidate. They can now log in directly.</p>
                
                <div className="space-y-4 mb-8">
                  <div className="p-4 bg-bg-tertiary rounded-2xl border border-border-primary text-left">
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-1">Email Address</p>
                    <p className="text-sm font-mono text-text-primary">{candidate.email}</p>
                  </div>
                  <div className="p-4 bg-bg-tertiary rounded-2xl border border-border-primary text-left relative group">
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-1">Generated Password</p>
                    <p className="text-sm font-mono text-text-primary">{generatedPassword}</p>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(generatedPassword);
                        showToast('Password copied!', 'success');
                      }}
                      className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-text-muted hover:text-accent-blue transition-colors"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <button 
                    onClick={() => {
                      const message = `Hello ${candidate.full_name}, your portal is ready!\n\nLogin at: ${window.location.origin}\nEmail: ${candidate.email}\nPassword: ${generatedPassword}\n\nPlease change your password after logging in.`;
                      navigator.clipboard.writeText(message);
                      showToast('Full message copied to clipboard!', 'success');
                    }}
                    className="w-full py-4 bg-accent-blue text-white font-bold rounded-2xl hover:bg-accent-blue/90 transition-all shadow-lg shadow-accent-blue/20 flex items-center justify-center gap-2"
                  >
                    <Copy className="w-5 h-5" />
                    Copy Full Invite
                  </button>
                  <button 
                    onClick={() => setGeneratedPassword(null)}
                    className="w-full py-4 bg-bg-tertiary text-text-primary font-bold rounded-2xl hover:bg-bg-tertiary/80 transition-all"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isMarketingInactiveModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-bg-secondary border border-border-primary rounded-3xl shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="p-8">
                <h3 className="text-xl font-bold text-text-primary mb-4">Mark as Marketing Inactive</h3>
                <p className="text-sm text-text-secondary mb-6">Please provide the reason why this candidate is being marked as inactive in marketing.</p>
                
                <textarea
                  value={inactiveReason}
                  onChange={(e) => setInactiveReason(e.target.value)}
                  className="w-full h-32 p-4 bg-bg-tertiary border border-border-primary rounded-2xl text-text-primary resize-none mb-6 focus:outline-none focus:border-accent-blue"
                  placeholder="Enter reason here..."
                />

                <div className="flex gap-3">
                  <button 
                    onClick={() => setIsMarketingInactiveModalOpen(false)}
                    className="flex-1 py-3 bg-bg-tertiary text-text-primary font-bold rounded-xl hover:bg-bg-tertiary/80 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleMoveToMarketingInactive}
                    className="flex-1 py-3 bg-rose-500 text-white font-bold rounded-xl hover:bg-rose-500/90 transition-all shadow-lg shadow-rose-500/20"
                  >
                    Confirm Move
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isBackoutModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-bg-secondary border border-border-primary rounded-3xl shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="p-8">
                <h3 className="text-xl font-bold text-text-primary mb-4">Candidate Backout</h3>
                <p className="text-sm text-text-secondary mb-6">Please provide the reason for backout.</p>
                
                <textarea
                  value={backoutReason}
                  onChange={(e) => setBackoutReason(e.target.value)}
                  className="w-full h-32 p-4 bg-bg-tertiary border border-border-primary rounded-2xl text-text-primary resize-none mb-6 focus:outline-none focus:border-accent-blue"
                  placeholder="Enter reason here..."
                />

                <div className="flex gap-3">
                  <button 
                    onClick={() => setIsBackoutModalOpen(false)}
                    className="flex-1 py-3 bg-bg-tertiary text-text-primary font-bold rounded-xl hover:bg-bg-tertiary/80 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleMoveToBackout}
                    className="flex-1 py-3 bg-slate-500 text-white font-bold rounded-xl hover:bg-slate-500/90 transition-all shadow-lg shadow-slate-500/20"
                  >
                    Confirm Backout
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOfferModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-bg-secondary border border-border-primary rounded-3xl shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="p-8">
                <h3 className="text-xl font-bold text-text-primary mb-4">Offer Received</h3>
                <p className="text-sm text-text-secondary mb-6">Enter details about the offer (Company, Package, Join Date, etc.)</p>
                
                <textarea
                  value={offerDetails}
                  onChange={(e) => setOfferDetails(e.target.value)}
                  className="w-full h-32 p-4 bg-bg-tertiary border border-border-primary rounded-2xl text-text-primary resize-none mb-6 focus:outline-none focus:border-accent-blue"
                  placeholder="Enter offer details here..."
                />

                <div className="flex gap-3">
                  <button 
                    onClick={() => setIsOfferModalOpen(false)}
                    className="flex-1 py-3 bg-bg-tertiary text-text-primary font-bold rounded-xl hover:bg-bg-tertiary/80 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleMoveToOffer}
                    className="flex-1 py-3 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-500/90 transition-all shadow-lg shadow-emerald-500/20"
                  >
                    Log Offer
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <a href="#candidates" className="p-2 bg-bg-secondary border border-border-primary rounded-xl text-text-secondary hover:text-text-primary transition-all">
            <ArrowLeft className="w-5 h-5" />
          </a>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold text-text-primary">{candidate.full_name}</h1>
              {candidate.is_free_trial && (
                <FreeTrialBadge 
                  startDate={candidate.free_trial_start_date}
                  endDate={candidate.free_trial_end_date}
                  size="lg"
                  showDaysRemaining={true}
                />
              )}
            </div>
            <div className="flex flex-col gap-2 mt-1">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-sm text-text-secondary">
                  <Phone className="w-4 h-4" /> {candidate.phone}
                </span>
                <span className="w-1 h-1 bg-text-muted rounded-full" />
                <span className="flex items-center gap-1.5 text-sm text-text-secondary">
                  <Mail className="w-4 h-4" /> {candidate.email || 'No email'}
                </span>
              </div>
              {followUps.filter(f => !f.done).sort((a, b) => new Date(a.followup_date).getTime() - new Date(b.followup_date).getTime()).slice(0, 1).map(upcomingCall => (
                <span key={upcomingCall.id} className="flex items-center gap-1.5 text-sm font-bold text-accent-amber bg-accent-amber/10 px-3 py-1 rounded-lg w-max">
                  <Calendar className="w-4 h-4" /> 
                  Upcoming Call: {new Date(upcomingCall.followup_date).toLocaleDateString()} - {upcomingCall.note}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {canDelete && (
            <button 
              onClick={async () => {
                if (window.confirm("WARNING: This will permanently delete this candidate. Are you absolutely sure?")) {
                  try {
                    await deleteCandidate(candidate.id);
                    showToast('Candidate completely deleted', 'success');
                    window.location.hash = '#candidates';
                  } catch (err) {
                    showToast('Error deleting candidate', 'error');
                  }
                }
              }}
              className="px-4 py-2 rounded-xl border border-accent-red/20 bg-accent-red/5 flex items-center gap-2 text-accent-red hover:bg-accent-red/10 transition-all shadow-sm"
              title="Delete candidate completely"
            >
              <Trash2 className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Delete</span>
            </button>
          )}
          {(user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager') && (
            <button 
              onClick={async () => {
                const updated = { 
                  ...candidate,
                  updated_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
                  flags: {
                    ...candidate.flags,
                    sla_timeout_notified: false
                  }
                };
                await saveCandidate(updated, user?.id ? String(user.id) : null);
                showToast('Time limit simulated! SLA Monitor will trigger within 60 seconds.', 'success');
              }}
              className="px-4 py-2 rounded-xl border border-accent-purple/20 bg-accent-purple/5 flex items-center gap-2 text-accent-purple hover:bg-accent-purple/10 transition-all shadow-sm"
              title="Test the 2.5 hour SLA Warning system"
            >
              <Clock className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Test SLA Timeout</span>
            </button>
          )}
          {hasPortal ? (
            <div className="px-4 py-2 rounded-xl border border-accent-green/20 bg-accent-green/5 flex items-center gap-2 text-accent-green">
              <ShieldCheck className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Portal Active</span>
            </div>
          ) : (
            !isCandidate && !isLeadGen && (
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleGenerateAccess}
                  disabled={isGeneratingAccess}
                  className="px-4 py-2 rounded-xl border border-accent-amber/20 bg-accent-amber/5 flex items-center gap-2 text-accent-amber hover:bg-accent-amber/10 transition-all disabled:opacity-50"
                >
                  {isGeneratingAccess ? (
                    <div className="w-4 h-4 border-2 border-accent-amber/30 border-t-accent-amber rounded-full animate-spin" />
                  ) : (
                    <Key className="w-4 h-4" />
                  )}
                  <span className="text-xs font-bold uppercase tracking-wider">Generate Access</span>
                </button>
                {(user?.role !== 'administrator' && user?.role !== 'jpc_sysadmin') && (
                  <button 
                    onClick={async () => {
                      try {
                        const sysadmins = allUsers.filter(u => u.role === 'jpc_sysadmin' || u.role === 'administrator');
                        if (sysadmins.length === 0) {
                          showToast('No System Admin found to receive request', 'error');
                          return;
                        }

                        for (const admin of sysadmins) {
                          await addNotification({
                            recipient_id: admin.id,
                            sender_id: user?.id || null,
                            type: 'system_alert',
                            message: `ACCESS REQUEST: Generate portal access for candidate ${candidate.full_name} (${candidate.id})`
                          });
                        }
                        showToast('Access request sent to System Admin', 'success');
                      } catch (error) {
                        showToast('Failed to send request', 'error');
                      }
                    }}
                    className="px-4 py-2 rounded-xl border border-accent-amber/20 bg-accent-amber/5 flex items-center gap-2 text-accent-amber hover:bg-accent-amber/10 transition-all"
                  >
                    <Lock className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Request Access</span>
                  </button>
                )}
                <button 
                  onClick={() => {
                    const signupUrl = window.location.origin;
                    const message = `Hello ${candidate.full_name}, your portal is ready. Please log in at ${signupUrl} using your email: ${candidate.email}`;
                    navigator.clipboard.writeText(message);
                    showToast('Invite message copied to clipboard!', 'success');
                  }}
                  className="px-4 py-2 rounded-xl border border-border-primary bg-bg-secondary flex items-center gap-2 text-text-secondary hover:text-accent-blue hover:border-accent-blue transition-all"
                >
                  <Share2 className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">Invite</span>
                </button>
              </div>
            )
          )}
          <div className="px-4 py-2 rounded-xl border border-border-primary bg-bg-secondary flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STAGES[candidate.current_stage].color }} />
            <span className="text-sm font-bold text-text-primary uppercase tracking-wider">
              {STAGES[candidate.current_stage].label}
            </span>
          </div>
        </div>
      </div>

      {/* Next Payment Alert */}
      {nextPayment && (
        <div className="bg-accent-amber/10 border border-accent-amber/20 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 bg-accent-amber/20 rounded-full flex items-center justify-center text-accent-amber">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <p className="font-bold text-accent-amber">Next Payment Due</p>
            <p className="text-sm text-accent-amber/80">
              ${nextPayment.amount.toLocaleString()} is due on {new Date(nextPayment.due_date).toLocaleDateString()}
            </p>
          </div>
        </div>
      )}

      {/* Stage Move Bar */}
      {canMoveStage && (
        <div className="bg-bg-secondary border border-border-primary rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold text-text-muted uppercase tracking-widest mr-2">Move to Stage:</span>
            {PREVIOUS_STAGES[candidate.current_stage] && (
              <button
                onClick={async () => {
                  try {
                    if (window.confirm(`Are you sure you want to revert this candidate back to ${STAGES[PREVIOUS_STAGES[candidate.current_stage]!].label}?`)) {
                      await handleStageMove(PREVIOUS_STAGES[candidate.current_stage]!, true);
                    }
                  } catch (e) {
                    showToast('Failed to revert', 'error');
                  }
                }}
                className="px-3 py-2 bg-bg-tertiary border border-border-primary rounded-xl text-sm font-bold text-text-muted hover:border-text-primary hover:text-text-primary transition-all flex items-center gap-2"
                title="Revert to previous stage"
              >
                <ArrowLeft className="w-4 h-4" />
                Undo
              </button>
            )}
            
            {TRANSITIONS[candidate.current_stage].map(stageKey => {
              const isDisabled = false; // CS now has admin-like access
              return (
                <button
                  key={stageKey}
                  onClick={() => handleStageMove(stageKey as Stage)}
                  disabled={isDisabled}
                  className={cn(
                    "px-4 py-2 bg-bg-tertiary border border-border-primary rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                    isDisabled ? "opacity-50 cursor-not-allowed text-text-muted" : "text-text-primary hover:border-accent-blue hover:text-accent-blue"
                  )}
                >
                  {STAGES[stageKey as Stage].icon} {STAGES[stageKey as Stage].label.split('. ')[1] || STAGES[stageKey as Stage].label}
                  <ArrowRight className="w-4 h-4" />
                </button>
              );
            })}
            {candidate.current_stage !== 'not_interested' && (
              <button
                onClick={() => handleStageMove('not_interested')}
                className="px-4 py-2 bg-rose-500/10 border border-rose-500/20 rounded-xl text-sm font-bold text-rose-500 hover:bg-rose-500 hover:text-white transition-all ml-auto"
              >
                Not Interested
              </button>
            )}
            {candidate.current_stage !== 'not_eligible' && (
              <button
                onClick={() => handleStageMove('not_eligible')}
                className="px-4 py-2 bg-rose-500/10 border border-rose-500/20 rounded-xl text-sm font-bold text-rose-500 hover:bg-rose-500 hover:text-white transition-all ml-2"
              >
                Not Eligible
              </button>
            )}
          </div>

        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-8">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-7 space-y-8">
          {/* Resume Section */}
          <section className="bg-bg-secondary border border-border-primary rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-border-primary flex items-center justify-between">
              <h3 className="font-bold text-text-primary flex items-center gap-2">
                <FileText className="w-5 h-5 text-accent-purple" />
                Candidate Resume
              </h3>
              <div className="flex items-center gap-2">
                {candidate.resume_url || candidate.resume_base64 ? (
                  <button 
                    onClick={handleDownloadResume}
                    className="flex items-center gap-2 px-4 py-2 bg-accent-purple/10 text-accent-purple font-bold rounded-xl hover:bg-accent-purple hover:text-white transition-all text-xs"
                  >
                    <Download className="w-4 h-4" />
                    Download Resume
                  </button>
                ) : null}
                {(canEditResume || isSalesperson) && (
                  <div className="flex items-center gap-2">
                    {(user?.role === 'jpc_recruiter' || user?.role === 'jpc_marketing' || user?.role === 'jpc_cs' || user?.role === 'jpc_compliance_person' || user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager' || user?.role === 'jpc_resume') && (
                      <button 
                        onClick={() => setIsResumePatchingModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-accent-purple text-white font-bold rounded-xl hover:bg-accent-purple/90 transition-all text-xs shadow-md shadow-accent-purple/10"
                      >
                        <FileEdit className="w-4 h-4" />
                        Request Patching
                      </button>
                    )}
                    <button 
                      onClick={() => {
                        setResumePhrases(candidate.resume_phrases || '');
                        setIsResumeUploadModalOpen(true);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-bg-tertiary border border-border-primary text-text-primary font-bold rounded-xl hover:border-accent-purple hover:text-accent-purple transition-all text-xs cursor-pointer"
                    >
                      <Upload className="w-4 h-4" />
                      {candidate.resume_url || candidate.resume_base64 ? 'Upload New Resume' : 'Upload Resume'}
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="p-6">
              {candidate.resume_url || candidate.resume_base64 ? (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-4 p-4 bg-bg-tertiary rounded-2xl border border-border-primary">
                    <div className="w-12 h-12 bg-accent-purple/10 rounded-xl flex items-center justify-center text-accent-purple">
                      <FileText className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-text-primary truncate">{candidate.resume_filename || 'resume.pdf'}</p>
                      <p className="text-xs text-text-muted font-bold uppercase">Uploaded on {new Date(candidate.updated_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={handleDownloadResume}
                        className="p-2 text-text-secondary hover:text-accent-purple hover:bg-accent-purple/10 rounded-lg transition-all"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      {(candidate.resume_url || candidate.resume_base64) && (
                        <button 
                          onClick={() => handleViewFile(candidate.resume_url || candidate.resume_base64 || '', candidate.resume_filename || 'resume.pdf')}
                          className="p-2 text-text-secondary hover:text-accent-blue hover:bg-accent-blue/10 rounded-lg transition-all"
                          title="View"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Resume Phrases Display */}
                  {candidate.resume_phrases && (
                    <div className="p-4 bg-accent-purple/5 border border-accent-purple/10 rounded-2xl">
                      <div className="flex items-center gap-2 mb-2">
                        <MessageSquare className="w-4 h-4 text-accent-purple" />
                        <span className="text-xs font-bold text-accent-purple uppercase tracking-widest">Resume Phrases / Notes</span>
                      </div>
                      <p className="text-sm text-text-primary whitespace-pre-wrap">{candidate.resume_phrases}</p>
                    </div>
                  )}

                  {/* Pending Patching Requests */}
                  {resumeRequests.filter(r => r.status !== 'completed' && r.status !== 'rejected').map(request => (
                    <div key={request.id} className="p-4 bg-accent-amber/5 border border-accent-amber/20 rounded-2xl flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-accent-amber/20 rounded-full flex items-center justify-center text-accent-amber">
                          <RotateCcw className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-text-primary">Resume Patching in Progress</p>
                          <p className="text-[10px] text-text-muted font-bold uppercase">Status: {request.status.replace('_', ' ').toUpperCase()}</p>
                        </div>
                      </div>
                      <div className="px-3 py-1 bg-accent-amber/20 text-accent-amber text-[10px] font-bold rounded-full uppercase tracking-widest">
                        Pending
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 border-2 border-dashed border-border-primary rounded-2xl">
                  <FileText className="w-12 h-12 text-text-muted mx-auto mb-2" />
                  <p className="text-sm text-text-secondary">No resume uploaded yet</p>
                </div>
              )}
            </div>
            {((candidate.resume_versions && candidate.resume_versions.length > 0) || resumeRequests.filter(r => r.status === 'completed' && (r.new_resume_url || r.resume_base64)).length > 0) && (
              <div className="px-6 py-4 bg-bg-tertiary/30 border-t border-border-primary">
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-3">Resume Version History</p>
                <div className="space-y-2">
                  {candidate.resume_versions && candidate.resume_versions.length > 0 ? (
                    candidate.resume_versions.map((ver, idx) => (
                      <div key={ver.id || idx} className="flex items-center justify-between text-xs p-2 bg-bg-secondary/60 rounded-xl border border-border-primary/50">
                        <div className="flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5 text-accent-purple" />
                          <span className="font-bold text-text-primary">v{ver.version_number || idx + 1}</span>
                          <span className="text-text-secondary truncate max-w-[200px]">{ver.filename}</span>
                          {ver.is_current && (
                            <span className="px-1.5 py-0.5 rounded bg-accent-purple/15 text-accent-purple text-[9px] font-black uppercase">Current</span>
                          )}
                          <span className="text-text-muted text-[11px]">({new Date(ver.uploaded_at).toLocaleDateString()})</span>
                        </div>
                        {ver.url && (
                          <button 
                            onClick={() => handleViewFile(ver.url, ver.filename)}
                            className="text-accent-purple hover:underline font-bold"
                          >
                            View / Download
                          </button>
                        )}
                      </div>
                    ))
                  ) : (
                    resumeRequests.filter(r => r.status === 'completed' && (r.new_resume_url || r.resume_base64)).map((req, idx) => (
                      <div key={req.id} className="flex items-center justify-between text-xs p-2 bg-bg-secondary/60 rounded-xl border border-border-primary/50">
                        <div className="flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5 text-text-muted" />
                          <span className="text-text-secondary">Patch Version {idx + 1} ({new Date(req.updated_at).toLocaleDateString()})</span>
                        </div>
                        <button 
                          onClick={() => handleViewFile(req.new_resume_url || req.resume_base64!, req.resume_filename || 'resume.pdf')}
                          className="text-accent-purple hover:underline font-medium"
                        >
                          View / Download
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Agreement Section */}
          {canManageAgreement && (
            <section className="bg-bg-secondary border border-border-primary rounded-2xl overflow-hidden shadow-sm mt-8">
              <div className="px-6 py-4 border-b border-border-primary flex items-center justify-between">
                <h3 className="font-bold text-text-primary flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-accent-blue" />
                  Candidate Agreement
                </h3>
                <div className="flex items-center gap-2">
                  {candidate.agreement_url || candidate.agreement_base64 ? (
                    <button 
                      onClick={handleDownloadAgreement}
                      className="flex items-center gap-2 px-4 py-2 bg-accent-blue/10 text-accent-blue font-bold rounded-xl hover:bg-accent-blue hover:text-white transition-all text-xs"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </button>
                  ) : null}
                  <label className="flex items-center gap-2 px-4 py-2 bg-bg-tertiary border border-border-primary text-text-primary font-bold rounded-xl hover:border-accent-blue hover:text-accent-blue transition-all text-xs cursor-pointer">
                    <Upload className="w-4 h-4" />
                    {candidate.agreement_url || candidate.agreement_base64 ? 'Update Agreement' : 'Upload Agreement'}
                    <input type="file" className="hidden" accept=".pdf,.doc,.docx" onChange={handleAgreementUpload} />
                  </label>
                </div>
              </div>
              <div className="p-6">
                {candidate.agreement_url || candidate.agreement_base64 ? (
                  <div className="flex items-center gap-4 p-4 bg-bg-tertiary rounded-2xl border border-border-primary">
                    <div className="w-12 h-12 bg-accent-blue/10 rounded-xl flex items-center justify-center text-accent-blue">
                      <FileText className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-text-primary truncate">{candidate.agreement_filename || 'agreement.pdf'}</p>
                      <p className="text-xs text-text-muted font-bold uppercase">Uploaded securely</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={handleDownloadAgreement}
                        className="p-2 text-text-secondary hover:text-accent-blue hover:bg-accent-blue/10 rounded-lg transition-all"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleViewFile(candidate.agreement_url || candidate.agreement_base64 || '', candidate.agreement_filename || 'agreement.pdf')}
                        className="p-2 text-text-secondary hover:text-accent-blue hover:bg-accent-blue/10 rounded-lg transition-all"
                        title="View"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 border-2 border-dashed border-border-primary rounded-2xl">
                    <ShieldCheck className="w-12 h-12 text-text-muted mx-auto mb-2" />
                    <p className="text-sm text-text-secondary">No agreement uploaded yet</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* 15-Day Free Trial Management Section */}
          <section className="bg-bg-secondary border border-border-primary rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-border-primary flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-text-primary">15-Day Free Trial</h3>
                    {candidate.is_free_trial && (
                      <FreeTrialBadge 
                        startDate={candidate.free_trial_start_date}
                        endDate={candidate.free_trial_end_date}
                        size="sm"
                        showDaysRemaining={true}
                      />
                    )}
                  </div>
                  <p className="text-xs text-text-muted">Managed by CS (Compliance Team Head), Manager, Sales & Admin</p>
                </div>
              </div>

              {canEditFreeTrial && (
                <div className="flex items-center gap-2">
                  {candidate.is_free_trial ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setIsEditingTrialDates(!isEditingTrialDates)}
                        className="px-3 py-1.5 rounded-xl border border-border-primary bg-bg-tertiary text-text-secondary hover:text-text-primary font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        {isEditingTrialDates ? 'Cancel Edit' : 'Edit Dates'}
                      </button>
                      <button
                        type="button"
                        onClick={handleDisableFreeTrial}
                        disabled={isUpdatingTrial}
                        className="px-3.5 py-1.5 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white font-bold text-xs transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        End Free Trial
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={handleEnableFreeTrial}
                      disabled={isUpdatingTrial}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-xs shadow-md shadow-amber-500/20 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Start 15-Day Free Trial
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="p-6">
              {candidate.is_free_trial ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-bg-tertiary rounded-xl border border-border-primary">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">Status</span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                        <span className="text-sm font-bold text-emerald-500">Active Free Trial</span>
                      </div>
                    </div>

                    <div className="p-4 bg-bg-tertiary rounded-xl border border-border-primary">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">Trial Period</span>
                      <p className="text-sm font-bold text-text-primary mt-1">
                        {candidate.free_trial_start_date ? new Date(candidate.free_trial_start_date).toLocaleDateString() : 'Today'}
                        {' → '}
                        {candidate.free_trial_end_date ? new Date(candidate.free_trial_end_date).toLocaleDateString() : '15 Days'}
                      </p>
                    </div>

                    <div className="p-4 bg-bg-tertiary rounded-xl border border-border-primary">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">Days Remaining</span>
                      <p className="text-sm font-bold text-amber-500 mt-1 flex items-center gap-1">
                        <Clock className="w-4 h-4 text-amber-500" />
                        {(() => {
                          if (!candidate.free_trial_end_date) return '15 Days';
                          const end = new Date(candidate.free_trial_end_date);
                          end.setHours(23, 59, 59, 999);
                          const diff = end.getTime() - Date.now();
                          const days = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
                          return days === 0 ? 'Expired Today' : `${days} Day${days === 1 ? '' : 's'} Left`;
                        })()}
                      </p>
                    </div>
                  </div>

                  {isEditingTrialDates && canEditFreeTrial && (
                    <div className="p-4 bg-bg-tertiary/60 border border-amber-500/30 rounded-xl space-y-3">
                      <p className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-accent-blue" />
                        Adjust Free Trial Date Window
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-text-muted uppercase">Start Date</label>
                          <input 
                            type="date"
                            value={trialDatesForm.start_date}
                            onChange={e => setTrialDatesForm({ ...trialDatesForm, start_date: e.target.value })}
                            className="w-full bg-bg-secondary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-text-muted uppercase">End Date</label>
                          <input 
                            type="date"
                            value={trialDatesForm.end_date}
                            onChange={e => setTrialDatesForm({ ...trialDatesForm, end_date: e.target.value })}
                            className="w-full bg-bg-secondary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setIsEditingTrialDates(false)}
                          className="px-3 py-1.5 bg-bg-secondary border border-border-primary text-text-secondary rounded-lg text-xs font-bold cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveTrialDates}
                          disabled={isUpdatingTrial}
                          className="px-4 py-1.5 bg-accent-blue text-white rounded-lg text-xs font-bold hover:bg-accent-blue/90 disabled:opacity-50 cursor-pointer"
                        >
                          Save Dates
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-bg-tertiary/40 rounded-xl border border-dashed border-border-primary">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-bg-tertiary flex items-center justify-center text-text-muted">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-text-primary">Standard Enrollment</p>
                      <p className="text-xs text-text-muted">This candidate is currently not enrolled in a 15-day Free Trial.</p>
                    </div>
                  </div>
                  {canEditFreeTrial && (
                    <button
                      type="button"
                      onClick={handleEnableFreeTrial}
                      disabled={isUpdatingTrial}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-1.5 shrink-0 disabled:opacity-50 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Enable 15-Day Free Trial
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Personal Info */}
          <section className="bg-bg-secondary border border-border-primary rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-border-primary flex items-center justify-between">
              <h3 className="font-bold text-text-primary flex items-center gap-2">
                <UserIcon className="w-5 h-5 text-accent-blue" />
                Personal Information
              </h3>
              {canEditPersonal && (
                <button 
                  onClick={() => isEditingPersonal ? handleSavePersonal() : setIsEditingPersonal(true)}
                  className="p-2 text-text-secondary hover:text-accent-blue transition-colors"
                >
                  {isEditingPersonal ? <Save className="w-5 h-5" /> : <Edit2 className="w-5 h-5" />}
                </button>
              )}
            </div>
            <div className="p-6">
              {isEditingPersonal ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-text-muted uppercase">Phone</label>
                    <input type="text" value={personalForm.phone || ''} onChange={e => setPersonalForm({...personalForm, phone: e.target.value})} className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-text-muted uppercase">WhatsApp</label>
                    <input type="text" value={personalForm.whatsapp || ''} onChange={e => setPersonalForm({...personalForm, whatsapp: e.target.value})} className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-text-muted uppercase">Email</label>
                    <input type="email" value={personalForm.email || ''} onChange={e => setPersonalForm({...personalForm, email: e.target.value})} className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-text-muted uppercase">Location</label>
                    <input type="text" value={personalForm.location || ''} onChange={e => setPersonalForm({...personalForm, location: e.target.value})} className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-text-muted uppercase">LinkedIn URL</label>
                    <input type="text" value={personalForm.linkedin_url || ''} onChange={e => setPersonalForm({...personalForm, linkedin_url: e.target.value})} className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-text-muted uppercase">Lead Source</label>
                    <select value={personalForm.lead_source || ''} onChange={e => setPersonalForm({...personalForm, lead_source: e.target.value})} className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary">
                      {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-text-muted uppercase">Generated By (Lead Person)</label>
                    <select 
                      value={personalForm.lead_generated_by ? String(personalForm.lead_generated_by) : ''} 
                      onChange={e => setPersonalForm({...personalForm, lead_generated_by: e.target.value || null})} 
                      className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary"
                    >
                      <option value="">-- Unassigned / Auto --</option>
                      {allUsers
                        .filter(u => u.role === 'jpc_lead_gen')
                        .sort((a, b) => a.display_name.localeCompare(b.display_name))
                        .map(u => (
                          <option key={u.id} value={String(u.id)}>
                            {u.display_name}{u.is_on_leave ? ' [On Leave]' : ''}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-text-muted uppercase">Updated On Behalf Of (If Person On Leave)</label>
                    <select 
                      value={personalForm.updated_behalf_of ? String(personalForm.updated_behalf_of) : ''} 
                      onChange={e => setPersonalForm({...personalForm, updated_behalf_of: e.target.value || null})} 
                      className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary"
                    >
                      <option value="">-- None (Self) --</option>
                      {allUsers
                        .filter(u => u.role !== 'candidate' && u.role !== 'jpc_candidate')
                        .sort((a, b) => a.display_name.localeCompare(b.display_name))
                        .map(u => (
                          <option key={u.id} value={String(u.id)}>
                            {u.display_name} ({u.role.replace('jpc_', '').replace('_', ' ')}){u.is_on_leave ? ' [On Leave]' : ''}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-[10px] font-bold text-text-muted uppercase">Email Portal Link</label>
                    <input type="url" value={personalForm.portal_link || ''} onChange={e => setPersonalForm({...personalForm, portal_link: e.target.value})} placeholder="https://portal.example.com" className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary" />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-[10px] font-bold text-text-muted uppercase">Marketing Entity</label>
                    <div className="flex gap-4 mt-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={personalForm.marketing_entity?.includes('sivium')} 
                          onChange={e => {
                            const current = [...(personalForm.marketing_entity || [])];
                            if (e.target.checked) {
                              if (!current.includes('sivium')) current.push('sivium');
                            } else {
                              const idx = current.indexOf('sivium');
                              if (idx > -1) current.splice(idx, 1);
                            }
                            setPersonalForm({ ...personalForm, marketing_entity: current });
                          }}
                          className="w-4 h-4 rounded border-border-primary text-accent-blue focus:ring-accent-blue"
                        />
                        <span className="text-sm font-bold text-text-primary">SIVIUM</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={personalForm.marketing_entity?.includes('recruiter')} 
                          onChange={e => {
                            const current = [...(personalForm.marketing_entity || [])];
                            if (e.target.checked) {
                              if (!current.includes('recruiter')) current.push('recruiter');
                            } else {
                              const idx = current.indexOf('recruiter');
                              if (idx > -1) current.splice(idx, 1);
                            }
                            setPersonalForm({ ...personalForm, marketing_entity: current });
                          }}
                          className="w-4 h-4 rounded border-border-primary text-accent-blue focus:ring-accent-blue"
                        />
                        <span className="text-sm font-bold text-text-primary">Recruiter</span>
                      </label>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-12">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Phone / WhatsApp</p>
                    <p className="text-text-primary font-medium">{candidate.phone} / {candidate.whatsapp || '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Email Address</p>
                    <p className="text-text-primary font-medium">{candidate.email || '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Location</p>
                    <p className="text-text-primary font-medium">{candidate.location || '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">LinkedIn Profile</p>
                    {candidate.linkedin_url ? (
                      <a href={candidate.linkedin_url} target="_blank" rel="noreferrer" className="text-accent-blue hover:underline flex items-center gap-1">
                        View Profile <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : <p className="text-text-muted italic">Not provided</p>}
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Lead Source</p>
                    <p className="text-text-primary font-medium">{candidate.lead_source}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Generated By</p>
                    <p className="text-text-primary font-medium">{allUsers.find(u => String(u.id) === String(candidate.lead_generated_by))?.display_name || '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Updated On Behalf Of</p>
                    {candidate.updated_behalf_of ? (
                      <div className="flex items-center gap-2">
                        <span className="text-text-primary font-medium">
                          {allUsers.find(u => String(u.id) === String(candidate.updated_behalf_of))?.display_name || candidate.updated_behalf_of}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                          Leave Cover
                        </span>
                      </div>
                    ) : (
                      <p className="text-text-muted italic">None (Self)</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Marketing Entity</p>
                    <p className="text-text-primary font-medium">
                      {candidate.marketing_entity && candidate.marketing_entity.length > 0 
                        ? candidate.marketing_entity.map(e => e.toUpperCase()).join(', ')
                        : 'Normal'}
                    </p>
                  </div>
                  {candidate.portal_link && (
                    <div className="space-y-1 md:col-span-2">
                      <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Email Portal Link</p>
                      <div className="flex items-center gap-2">
                        <a href={candidate.portal_link} target="_blank" rel="noreferrer" className="text-accent-blue hover:underline flex items-center gap-1 font-medium truncate">
                          {candidate.portal_link} <ExternalLink className="w-3 h-3" />
                        </a>
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(candidate.portal_link!);
                            showToast('Link copied!', 'success');
                          }}
                          className="p-1 hover:bg-bg-tertiary rounded transition-colors text-text-muted"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Education & Experience */}
          {!isSalesperson && (
            <section className="bg-bg-secondary border border-border-primary rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-border-primary flex items-center justify-between">
              <h3 className="font-bold text-text-primary flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-accent-purple" />
                Education & Experience
              </h3>
              {canEdit && (
                <button 
                  onClick={() => isEditingEducation ? handleSaveEducation() : setIsEditingEducation(true)}
                  className="p-2 text-text-secondary hover:text-accent-blue transition-colors"
                >
                  {isEditingEducation ? <Save className="w-5 h-5" /> : <Edit2 className="w-5 h-5" />}
                </button>
              )}
            </div>
            <div className="p-6">
              {isEditingEducation ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-text-muted uppercase">Education Level</label>
                    <input type="text" value={educationForm.education || ''} onChange={e => setEducationForm({...educationForm, education: e.target.value})} className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-text-muted uppercase">Degree</label>
                    <input type="text" value={educationForm.degree || ''} onChange={e => setEducationForm({...educationForm, degree: e.target.value})} className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-text-muted uppercase">University</label>
                    <input type="text" value={educationForm.university || ''} onChange={e => setEducationForm({...educationForm, university: e.target.value})} className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-text-muted uppercase">Graduation Year</label>
                    <input type="text" value={educationForm.graduation_year || ''} onChange={e => setEducationForm({...educationForm, graduation_year: e.target.value})} className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Experience Years</label>
                    <input type="text" value={educationForm.experience_years || ''} onChange={e => setEducationForm({...educationForm, experience_years: e.target.value})} className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-[10px] font-bold text-text-muted uppercase">Skills</label>
                    <textarea value={educationForm.skills || ''} onChange={e => setEducationForm({...educationForm, skills: e.target.value})} className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm min-h-[80px]" />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-12">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Education</p>
                    <p className="text-text-primary font-medium">{candidate.education || '—'} {candidate.degree ? `(${candidate.degree})` : ''}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">University</p>
                    <p className="text-text-primary font-medium">{candidate.university || '—'} {candidate.graduation_year ? `[${candidate.graduation_year}]` : ''}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Experience</p>
                    <p className="text-text-primary font-medium">{candidate.experience_years ? `${candidate.experience_years} Years` : 'Fresher'}</p>
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Skills</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {candidate.skills ? candidate.skills.split(',').map(s => (
                        <span key={s} className="px-2 py-1 bg-bg-tertiary border border-border-primary rounded text-xs text-text-secondary">
                          {s.trim()}
                        </span>
                      )) : <p className="text-text-muted italic text-sm">No skills listed</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
          )}

          {/* Package & Team */}
          <section className="bg-bg-secondary border border-border-primary rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-border-primary flex items-center justify-between">
              <h3 className="font-bold text-text-primary flex items-center gap-2">
                <Package className="w-5 h-5 text-accent-teal" />
                Package & Team Assignment
              </h3>
              {canEditPackage && (
                <button 
                  onClick={() => isEditingPackage ? handleSavePackage() : setIsEditingPackage(true)}
                  className="p-2 text-text-secondary hover:text-accent-blue transition-colors"
                >
                  {isEditingPackage ? <Save className="w-5 h-5" /> : <Edit2 className="w-5 h-5" />}
                </button>
              )}
            </div>
            <div className="p-6">
              {isEditingPackage ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(!isLeadGen || isSalesperson) && (
                    <>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-text-muted uppercase">Package Name</label>
                        <input type="text" value={packageForm.package_name || ''} onChange={e => setPackageForm({...packageForm, package_name: e.target.value})} className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-text-muted uppercase">Package Amount ($)</label>
                        <input type="number" value={packageForm.package_amount || 0} onChange={e => setPackageForm({...packageForm, package_amount: Number(e.target.value)})} className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm" />
                      </div>
                    </>
                  )}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-text-muted uppercase">Assigned Sales</label>
                    <select value={packageForm.assigned_sales || ''} onChange={e => setPackageForm({...packageForm, assigned_sales: e.target.value})} className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm">
                      <option value="">Select Sales</option>
                      {salesUsers.map(u => <option key={u.id} value={u.id}>{u.display_name}</option>)}
                    </select>
                  </div>
                  {(!isLeadGen || isSalesperson) && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-text-muted uppercase">Assigned Compliance</label>
                      <select value={packageForm.assigned_cs || ''} onChange={e => setPackageForm({...packageForm, assigned_cs: e.target.value})} className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm">
                        <option value="">Select Compliance</option>
                        {csUsers.map(u => <option key={u.id} value={u.id}>{u.display_name} ({u.role === 'jpc_cs' ? 'Compliance Head' : 'Compliance Person'})</option>)}
                      </select>
                    </div>
                  )}
                  {!isLeadGen && !isSalesperson && (
                    <>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-text-muted uppercase">Assigned Resume</label>
                        <select value={packageForm.assigned_resume || ''} onChange={e => setPackageForm({...packageForm, assigned_resume: e.target.value})} className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm">
                          <option value="">Select Resume Team</option>
                          {resumeUsers.map(u => <option key={u.id} value={u.id}>{u.display_name}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-text-muted uppercase">Marketing Leader (TL)</label>
                        <select 
                          value={packageForm.assigned_marketing_leader || ''} 
                          onChange={e => setPackageForm({...packageForm, assigned_marketing_leader: e.target.value, assigned_recruiter: null})} 
                          className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm"
                        >
                          <option value="">Select Marketing Leader</option>
                          {marketingLeaders.map(u => <option key={u.id} value={u.id}>{u.display_name}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-text-muted uppercase">Assigned Recruiter</label>
                        <select 
                          value={packageForm.assigned_recruiter || ''} 
                          onChange={e => setPackageForm({...packageForm, assigned_recruiter: e.target.value})} 
                          className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm"
                          disabled={!packageForm.assigned_marketing_leader}
                        >
                          <option value="">Select Recruiter</option>
                          {packageForm.assigned_marketing_leader && (
                            (() => {
                              const tlUser = allUsers.find(u => String(u.id) === String(packageForm.assigned_marketing_leader));
                              return tlUser ? (
                                <option value={String(tlUser.id)}>
                                  {tlUser.display_name} (TL - Doing Marketing Directly)
                                </option>
                              ) : null;
                            })()
                          )}
                          {filteredRecruiters.length > 0 && (
                            <optgroup label="Team Recruiters">
                              {filteredRecruiters.map(u => <option key={u.id} value={u.id}>{u.display_name}</option>)}
                            </optgroup>
                          )}
                        </select>
                        {packageForm.assigned_marketing_leader && (
                          <div className="pt-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                const isAlreadyTL = String(packageForm.assigned_recruiter) === String(packageForm.assigned_marketing_leader);
                                setPackageForm({
                                  ...packageForm,
                                  assigned_recruiter: isAlreadyTL ? '' : String(packageForm.assigned_marketing_leader)
                                });
                              }}
                              className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                                String(packageForm.assigned_recruiter) === String(packageForm.assigned_marketing_leader)
                                  ? "bg-accent-blue/10 border-accent-blue text-accent-blue"
                                  : "bg-bg-tertiary border-border-primary text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/80"
                              }`}
                            >
                              <span>💼</span>
                              {String(packageForm.assigned_recruiter) === String(packageForm.assigned_marketing_leader)
                                ? "TL is Doing Marketing Directly (Active)"
                                : "Assign TL to do Marketing Directly"
                              }
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-text-muted uppercase">Assigned Marketing</label>
                        <select value={packageForm.assigned_marketing || ''} onChange={e => setPackageForm({...packageForm, assigned_marketing: e.target.value})} className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm">
                          <option value="">Select Marketing</option>
                          {marketingUsers.map(u => <option key={u.id} value={u.id}>{u.display_name}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-text-muted uppercase">Profiles Count (Target Multiplier)</label>
                        <input type="number" value={packageForm.profiles_count || 1} onChange={e => setPackageForm({...packageForm, profiles_count: Number(e.target.value)})} className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm" />
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-12">
                  {(!isLeadGen || isSalesperson) && (
                    <>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Package Name</p>
                        <p className="text-text-primary font-bold">{candidate.package_name || '—'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Total Amount</p>
                        <p className="text-text-primary font-bold text-lg">${candidate.package_amount.toLocaleString()}</p>
                      </div>
                    </>
                  )}
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Assigned Sales</p>
                    <p className="text-text-primary font-medium">{allUsers.find(u => u.id === candidate.assigned_sales)?.display_name || '—'}</p>
                  </div>
                  {(!isLeadGen || isSalesperson) && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Compliance</p>
                      <p className="text-text-primary font-medium">{allUsers.find(u => u.id === candidate.assigned_cs)?.display_name || '—'}</p>
                    </div>
                  )}
                  {!isLeadGen && !isSalesperson && (
                    <>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Resume Specialist</p>
                        <p className="text-text-primary font-medium">{allUsers.find(u => u.id === candidate.assigned_resume)?.display_name || '—'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Marketing Leader (TL)</p>
                        <p className="text-text-primary font-medium">{allUsers.find(u => String(u.id) === String(candidate.assigned_marketing_leader))?.display_name || '—'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Assigned Recruiter</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-text-primary font-medium">
                            {allUsers.find(u => String(u.id) === String(candidate.assigned_recruiter))?.display_name || '—'}
                          </p>
                          {candidate.assigned_marketing_leader && String(candidate.assigned_recruiter) === String(candidate.assigned_marketing_leader) && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-accent-blue/10 text-accent-blue border border-accent-blue/20">
                              💼 TL Doing Marketing
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Marketing Support</p>
                        <p className="text-text-primary font-medium">{allUsers.find(u => String(u.id) === String(candidate.assigned_marketing))?.display_name || '—'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Profiles Count</p>
                        <p className="text-text-primary font-bold">{candidate.profiles_count || 1}</p>
                      </div>
                    </>
                  )}
                </div>
              )}

              {candidate.package_name && candidate.package_name.toLowerCase().includes('support') && (user?.role === 'jpc_cs' || user?.role === 'jpc_compliance_person' || user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager') && (
                <div className="mt-6 p-4 bg-accent-blue/5 border border-accent-blue/20 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-xs font-black text-accent-blue uppercase tracking-wider">
                    <span>⚡</span> Live Interview Support Package
                  </div>
                  <p className="text-xs text-text-secondary font-medium">
                    This candidate has an **Interview Support** plan. Provide them with this single booking link so they can fill in candidate info and job details directly, locking their chosen proxy slot automatically to avoid conflicts.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      readOnly
                      value={`${window.location.origin}/#book-interview/interview-support-only`}
                      className="flex-1 px-3 py-1.5 bg-bg-secondary border border-border-primary rounded-lg text-[10px] font-mono font-bold text-text-primary"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/#book-interview/interview-support-only`);
                        showToast('Interview support booking link copied!', 'success');
                      }}
                      className="px-3 py-1.5 bg-accent-blue text-white text-[10px] font-bold rounded-lg hover:bg-accent-blue/90"
                    >
                      Copy Link
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Payments */}
          {(user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager' || user?.role === 'jpc_cs' || user?.role === 'jpc_compliance_person' || user?.role === 'jpc_recruiter' || isSalesperson) && (
            <section className="bg-bg-secondary border border-border-primary rounded-2xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-border-primary flex items-center justify-between">
                <h3 className="font-bold text-text-primary flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-accent-green" />
                  Payments
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-text-secondary">${totalPaid} / ${candidate.package_amount}</span>
                  <div className="w-24 h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                    <div className="h-full bg-accent-green" style={{ width: `${Math.min(paymentProgress, 100)}%` }} />
                  </div>
                </div>
              </div>
              <div className="p-6 space-y-6">
                {/* Payment List */}
                <div className="space-y-3">
                  {payments.map(p => (
                    <div key={p.id} className="flex items-center justify-between p-4 bg-bg-tertiary/50 border border-border-primary rounded-xl">
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center font-bold text-xs">
                          #{p.part_number}
                        </div>
                        <div>
                          <p className="font-bold text-text-primary">${p.amount.toLocaleString()}</p>
                          <p className="text-[10px] text-text-muted uppercase font-bold">Due: {new Date(p.due_date).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {p.status === 'paid' ? (
                          <>
                            <span className="text-[10px] px-2 py-1 bg-accent-green/10 text-accent-green font-bold rounded-full uppercase">Paid</span>
                            <div className="flex items-center gap-2">
                              <a 
                                href={`#receipt?pay_id=${p.id}&cand_id=${candidate.id}`}
                                className="p-2 text-text-secondary hover:text-accent-blue hover:bg-accent-blue/10 rounded-lg transition-all"
                                title="View Receipt"
                              >
                                <FileText className="w-4 h-4" />
                              </a>
                              {p.proof_url || p.proof_base64 ? (
                                <button 
                                  onClick={() => handleViewFile(p.proof_url || p.proof_base64 || '', 'proof.png')}
                                  className="p-2 text-text-secondary hover:text-accent-purple hover:bg-accent-purple/10 rounded-lg transition-all"
                                  title="View Proof"
                                >
                                  <Image className="w-4 h-4" />
                                </button>
                              ) : null}
                              {canManagePayments && (
                                <label className="p-2 text-text-secondary hover:text-accent-purple hover:bg-accent-purple/10 rounded-lg transition-all cursor-pointer" title="Upload Proof">
                                  <Upload className="w-4 h-4" />
                                  <input type="file" className="hidden" accept="image/*" onChange={(e) => handlePaymentProofUpload(p, e)} />
                                </label>
                              )}
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="text-[10px] px-2 py-1 bg-accent-amber/10 text-accent-amber font-bold rounded-full uppercase">Pending</span>
                            <div className="flex items-center gap-2">
                              {canManagePayments && (
                                <button 
                                  onClick={() => handleMarkPaid(p)}
                                  className="px-3 py-1 bg-accent-green text-white text-xs font-bold rounded-lg hover:bg-accent-green/90 transition-all"
                                >
                                  Mark Paid
                                </button>
                              )}
                              {canManagePayments && (
                                <label className="p-2 text-text-secondary hover:text-accent-purple hover:bg-accent-purple/10 rounded-lg transition-all cursor-pointer" title="Upload Proof">
                                  <Upload className="w-4 h-4" />
                                  <input type="file" className="hidden" accept="image/*" onChange={(e) => handlePaymentProofUpload(p, e)} />
                                </label>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add Payment Form */}
                {canManagePayments && (
                  <form onSubmit={handleAddPayment} className="pt-6 border-t border-border-primary">
                    <p className="text-xs font-bold text-text-muted uppercase tracking-widest mb-4">Add Payment Plan</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-text-muted uppercase">Part #</label>
                        <select value={paymentForm.part_number || 1} onChange={e => setPaymentForm({...paymentForm, part_number: Number(e.target.value)})} className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm">
                          {[1,2].map(n => <option key={n} value={n}>Part {n}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-text-muted uppercase">Amount</label>
                        <input type="number" value={paymentForm.amount || 0} onChange={e => setPaymentForm({...paymentForm, amount: Number(e.target.value)})} className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-text-muted uppercase">Due Date</label>
                        <input type="date" value={paymentForm.due_date || ''} onChange={e => setPaymentForm({...paymentForm, due_date: e.target.value})} className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div className="flex items-end">
                        <button type="submit" className="w-full h-[38px] bg-bg-tertiary border border-border-primary rounded-lg text-text-primary hover:bg-accent-blue hover:text-white hover:border-accent-blue transition-all font-bold text-xs">
                          Add Plan
                        </button>
                      </div>
                    </div>
                  </form>
                )}
              </div>
            </section>
          )}

          {/* Promises */}
          {(user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager' || user?.role === 'jpc_cs' || user?.role === 'jpc_recruiter' || isSalesperson) && (
            <section className="bg-bg-secondary border border-border-primary rounded-2xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-border-primary flex items-center justify-between">
                <h3 className="font-bold text-text-primary flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-accent-amber" />
                  Promises Made
                </h3>
              </div>
              <div className="p-6 space-y-6">
                <div className="space-y-3">
                  {promises.map(p => (
                    <div key={p.id} className="p-4 bg-bg-tertiary/50 border border-border-primary rounded-xl">
                      <p className="text-sm text-text-primary font-medium">"{p.promise_text}"</p>
                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-text-muted">By {allUsers.find(u => u.id === p.made_by)?.display_name}</span>
                          <span className="w-1 h-1 bg-text-muted rounded-full" />
                          <span className="text-[10px] text-text-muted uppercase font-bold">{STAGES[p.stage as Stage]?.label.split('. ')[1]}</span>
                        </div>
                        {!isCandidate && !isLeadGen ? (
                          <select 
                            value={p.status} 
                            onChange={async (e) => {
                              await updatePromise({...p, status: e.target.value as any});
                              await logActivity(candidate.id, 'Promise status updated', `Promise status changed to ${e.target.value}`, user?.id || null);
                            }}
                            className={cn(
                              "text-[10px] font-bold uppercase px-2 py-1 rounded-lg bg-bg-secondary border border-border-primary focus:outline-none",
                              p.status === 'fulfilled' ? "text-accent-green" : p.status === 'broken' ? "text-accent-red" : "text-accent-amber"
                            )}
                          >
                            <option value="active">Active</option>
                            <option value="fulfilled">Fulfilled</option>
                            <option value="broken">Broken</option>
                          </select>
                        ) : (
                          <span className={cn(
                            "text-[10px] font-bold uppercase px-2 py-1 rounded-lg",
                            p.status === 'fulfilled' ? "text-accent-green bg-accent-green/10" : p.status === 'broken' ? "text-accent-red bg-accent-red/10" : "text-accent-amber bg-accent-amber/10"
                          )}>
                            {p.status}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={promiseText}
                      onChange={e => setPromiseText(e.target.value)}
                      placeholder="Type a promise made to the candidate..."
                      className="flex-1 bg-bg-tertiary border border-border-primary rounded-xl px-4 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-amber transition-colors"
                    />
                    <button 
                      onClick={handleAddPromise}
                      className="px-4 py-2 bg-accent-amber text-white font-bold rounded-xl hover:bg-accent-amber/90 transition-all shadow-lg shadow-accent-amber/20"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div className="lg:col-span-5 space-y-8">
          {/* Quick Pipeline Actions */}
          {canMoveStage && (
            <section className="bg-bg-secondary border border-border-primary rounded-2xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-border-primary">
                <h3 className="font-bold text-text-primary flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-accent-blue" />
                  Management Actions
                </h3>
              </div>
              <div className="p-6 grid grid-cols-1 gap-3">
                <button
                  onClick={() => setIsMarketingInactiveModalOpen(true)}
                  className="w-full py-3 px-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-sm font-bold text-rose-500 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <X className="w-4 h-4" /> Marketing Inactive
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsOfferModalOpen(true)}
                  className="w-full py-3 px-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-sm font-bold text-emerald-500 hover:bg-emerald-500 hover:text-white transition-all flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4" /> Offer Received
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsBackoutModalOpen(true)}
                  className="w-full py-3 px-4 bg-slate-500/10 border border-slate-500/20 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-500 hover:text-white transition-all flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <RotateCcw className="w-4 h-4" /> Backout
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </section>
          )}

          {/* Status Flags */}
          <section className="bg-bg-secondary border border-border-primary rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-border-primary">
              <h3 className="font-bold text-text-primary flex items-center gap-2">
                <Flag className="w-5 h-5 text-accent-red" />
                Status Flags
              </h3>
            </div>
            <div className="p-6 space-y-6">
              {[
                {
                  title: 'CS Team',
                  flags: [
                    { key: 'agreement_sent', label: 'Agreement Sent' },
                    { key: 'agreement_signed', label: 'Agreement Signed' },
                    { key: 'qc_checklist_done', label: 'QC Checklist Done' },
                  ]
                },
                {
                  title: 'Marketing Leader',
                  flags: [
                    { key: 'marketing_strategy_done', label: 'Marketing Strategy Done' },
                  ]
                },
                {
                  title: 'Resume Team',
                  flags: [
                    { key: 'resume_briefing_call_done', label: 'Resume Briefing Call Done' },
                    { key: 'resume_approved', label: 'Team Leader Approved Resume' },
                    { key: 'candidate_resume_approved', label: 'Candidate Approved Resume' },
                  ]
                },
                {
                  title: 'System Admin',
                  flags: [
                    { key: 'marketing_email_created', label: 'Marketing Email Created' },
                    { key: 'two_step_verification', label: 'Added Two Step Verification' },
                  ]
                },
                {
                  title: 'Marketing Team',
                  flags: [
                    { key: 'linkedin_optimized', label: 'LinkedIn Profile Optimization' },
                  ]
                }
              ].map((group) => (
                <div key={group.title} className="space-y-3">
                  <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-widest border-b border-border-primary pb-1">
                    {group.title}
                  </h4>
                  <div className="grid grid-cols-1 gap-3">
                    {group.flags.map((flag) => (
                      <label key={flag.key} className="flex items-center justify-between group cursor-pointer">
                        <span className="text-sm font-medium text-text-secondary group-hover:text-text-primary transition-colors">
                          {flag.label}
                        </span>
                        <div 
                          onClick={() => canEdit && handleToggleFlag(flag.key as keyof Candidate['flags'])}
                          className={cn(
                            "w-10 h-5 rounded-full relative transition-all duration-300",
                            isCandidate ? "cursor-default" : "cursor-pointer",
                            candidate.flags[flag.key as keyof Candidate['flags']] ? "bg-accent-green" : "bg-bg-tertiary border border-border-primary"
                          )}
                        >
                          <div className={cn(
                            "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-300 shadow-sm",
                            candidate.flags[flag.key as keyof Candidate['flags']] ? "left-5.5" : "left-0.5"
                          )} />
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}

              {/* Onboarding Success Message */}
              {[
                'agreement_sent',
                'agreement_signed',
                'qc_checklist_done',
                'marketing_strategy_done',
                'resume_briefing_call_done',
                'resume_approved',
                'candidate_resume_approved',
                'marketing_email_created',
                'two_step_verification',
                'linkedin_optimized'
              ].every(key => candidate.flags[key as keyof Candidate['flags']] === true) && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mt-4 p-4 bg-accent-green/10 border border-accent-green/20 rounded-xl flex items-center gap-3 text-accent-green"
                >
                  <CheckCircle2 className="w-6 h-6 shrink-0" />
                  <p className="font-bold">Candidate onboarded successfully!</p>
                </motion.div>
              )}
            </div>
          </section>

          {/* QC Checklist */}
          {(user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager' || user?.role === 'jpc_cs' || user?.role === 'jpc_compliance_person') && !isSalesperson && (
            <section className="bg-bg-secondary border border-border-primary rounded-2xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-border-primary flex items-center justify-between">
                <h3 className="font-bold text-text-primary flex items-center gap-2">
                  <CheckSquare className="w-5 h-5 text-accent-blue" />
                  QC Call Checklist
                </h3>
              </div>
              <div className="p-6 space-y-4">
                {checklist.map(item => (
                  <div key={item.id} className="space-y-2">
                    <label className="flex items-center gap-3 group cursor-pointer">
                      <div 
                        onClick={() => canEdit && handleCheckQC(item)}
                        className={cn(
                          "w-5 h-5 rounded border flex items-center justify-center transition-all",
                          item.checked ? "bg-accent-blue border-accent-blue" : "bg-bg-tertiary border-border-primary group-hover:border-accent-blue",
                          isCandidate && "cursor-default"
                        )}
                      >
                        {item.checked && <CheckCircle2 className="w-4 h-4 text-white" />}
                      </div>
                      <span className={cn(
                        "text-sm transition-colors",
                        item.checked ? "text-text-primary font-medium" : "text-text-secondary"
                      )}>
                        {item.item_label}
                      </span>
                    </label>
                    {item.has_text_box && (
                      <div className="ml-8">
                        <input
                          type="text"
                          value={item.value || ''}
                          onChange={(e) => canEdit && handleUpdateQCValue(item, e.target.value)}
                          readOnly={isCandidate}
                          placeholder={isCandidate ? '' : `Enter ${item.item_label.toLowerCase()} details...`}
                          className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Follow-Ups */}
          {(user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager' || user?.role === 'jpc_cs' || user?.role === 'jpc_compliance_person' || user?.role === 'jpc_recruiter' || isSalesperson) && (
            <section className="bg-bg-secondary border border-border-primary rounded-2xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-border-primary">
                <h3 className="font-bold text-text-primary flex items-center gap-2">
                  <Clock className="w-5 h-5 text-accent-amber" />
                  Follow-Ups
                </h3>
              </div>
              <div className="p-6 space-y-6">
                <div className="space-y-3">
                  {followUps.filter(f => !f.done).map(f => (
                    <div key={f.id} className="p-4 bg-bg-tertiary/50 border border-border-primary rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-accent-amber flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" /> {f.followup_date}
                        </span>
                        {canManageFollowUps && (
                          <button 
                            onClick={async () => {
                              await updateFollowUp({...f, done: true});
                              await logActivity(candidate.id, 'Follow-up completed', `Note: ${f.note}`, user?.id || null);
                            }}
                            className="text-[10px] font-bold text-text-muted hover:text-accent-green uppercase transition-colors"
                          >
                            Mark Done
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-text-primary">{f.note}</p>
                    </div>
                  ))}
                </div>
                {canManageFollowUps && (
                  <div className="space-y-3 pt-4 border-t border-border-primary">
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Schedule New</p>
                    <input 
                      type="date" 
                      value={followUpForm.date || ''}
                      onChange={e => setFollowUpForm({...followUpForm, date: e.target.value})}
                      className="w-full bg-bg-tertiary border border-border-primary rounded-xl px-4 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-amber transition-colors"
                    />
                    <textarea 
                      value={followUpForm.note || ''}
                      onChange={e => setFollowUpForm({...followUpForm, note: e.target.value})}
                      placeholder="Follow-up note..."
                      className="w-full bg-bg-tertiary border border-border-primary rounded-xl px-4 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-amber transition-colors min-h-[80px]"
                    />
                    <button 
                      onClick={handleAddFollowUp}
                      className="w-full py-2 bg-accent-amber text-white font-bold rounded-xl hover:bg-accent-amber/90 transition-all shadow-lg shadow-accent-amber/20"
                    >
                      Schedule Follow-Up
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Remarks Section */}
          {(user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager' || user?.role === 'jpc_cs' || user?.role === 'jpc_compliance_person' || user?.role === 'jpc_recruiter' || isSalesperson) && (
            <section className="bg-bg-secondary border border-border-primary rounded-2xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-border-primary flex items-center justify-between">
                <h3 className="font-bold text-text-primary flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-accent-purple" />
                  Remarks
                </h3>
                {canManageRemarks && (
                  <button 
                    onClick={() => isEditingRemarks ? handleSaveRemarks() : setIsEditingRemarks(true)}
                    className="p-2 text-text-secondary hover:text-accent-blue transition-colors"
                  >
                    {isEditingRemarks ? <Save className="w-5 h-5" /> : <Edit2 className="w-5 h-5" />}
                  </button>
                )}
              </div>
              <div className="p-6">
                {isEditingRemarks ? (
                  <div className="space-y-4">
                    <textarea 
                      value={remarksForm || ''}
                      onChange={e => setRemarksForm(e.target.value)}
                      placeholder="Add candidate remarks..."
                      className="w-full bg-bg-tertiary border border-border-primary rounded-xl px-4 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-purple transition-colors min-h-[120px]"
                    />
                    <button 
                      onClick={handleSaveRemarks}
                      className="w-full py-2 bg-accent-purple text-white font-bold rounded-xl hover:bg-accent-purple/90 transition-all shadow-lg shadow-accent-purple/20"
                    >
                      Save Remarks
                    </button>
                  </div>
                ) : (
                  <div className="bg-bg-tertiary/50 border border-border-primary rounded-xl p-4">
                    <p className="text-sm text-text-primary whitespace-pre-wrap">{candidate.remarks || 'No remarks added yet.'}</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Interview History */}
          {!isSalesperson && (
            <section className="bg-bg-secondary border border-border-primary rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-border-primary flex items-center justify-between">
              <h3 className="font-bold text-text-primary flex items-center gap-2">
                <Video className="w-5 h-5 text-accent-red" />
                Interview History
              </h3>
              <a href="#interviews" className="text-xs font-bold text-accent-blue hover:underline">View All</a>
            </div>
            <div className="p-6 space-y-4">
              {interviews.length > 0 ? (
                interviews.map(int => (
                  <div key={int.id} className="p-4 bg-bg-tertiary/50 border border-border-primary rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                          int.overall_status === 'live' ? "bg-accent-red/10 text-accent-red border-accent-red/20" : "bg-bg-tertiary text-text-muted border-border-primary"
                        )}>
                          {int.overall_status.replace('_', ' ')}
                        </span>
                        {(
                          user?.role === 'administrator' || 
                          user?.role === 'jpc_sysadmin' || 
                          user?.role === 'jpc_manager' || 
                          user?.role === 'jpc_cs' || 
                          user?.role === 'jpc_compliance_person' ||
                          String(int.recruiter_id) === String(user?.id) || 
                          String(int.created_by) === String(user?.id)
                        ) && (
                          <button 
                            onClick={() => handleDeleteInterview(int.id)}
                            className="p-1 text-rose-500 hover:bg-rose-500/10 rounded-md transition-all"
                            title="Delete Interview Request"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <span className="text-[10px] text-text-muted font-medium">
                        {new Date(int.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-text-primary flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-accent-blue" />
                      {int.company_name} - {int.job_title}
                    </p>
                    {int.notes && (
                      <p className="text-xs text-text-secondary italic line-clamp-2">"{int.notes}"</p>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-text-muted italic">No interviews recorded</p>
                </div>
              )}
            </div>
          </section>
          )}

          {/* Application Performance */}
          {!isSalesperson && (
            <section className="bg-bg-secondary border border-border-primary rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-border-primary flex items-center justify-between">
              <h3 className="font-bold text-text-primary flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-accent-blue" />
                Application Performance
              </h3>
              <a href="#app-tracker" className="text-xs font-bold text-accent-blue hover:underline">Tracker</a>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-bg-tertiary/50 border border-border-primary rounded-xl">
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Today</p>
                  <p className="text-2xl font-bold text-text-primary mt-1">{appStats.day}</p>
                </div>
                <div className="p-4 bg-bg-tertiary/50 border border-border-primary rounded-xl">
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">This Week</p>
                  <p className="text-2xl font-bold text-text-primary mt-1">{appStats.week}</p>
                </div>
                <div className="p-4 bg-bg-tertiary/50 border border-border-primary rounded-xl">
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">This Month</p>
                  <p className="text-2xl font-bold text-text-primary mt-1">{appStats.month}</p>
                </div>
                <div className="p-4 bg-bg-tertiary/50 border border-border-primary rounded-xl">
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Lifetime</p>
                  <p className="text-2xl font-bold text-text-primary mt-1">{appStats.lifetime}</p>
                </div>
              </div>
              
              {/* Daily Target Progress */}
              <div className="mt-6 space-y-2">
                <div className="flex justify-between items-end">
                  <p className="text-xs font-bold text-text-muted uppercase tracking-widest">Daily Target Progress</p>
                  <p className="text-xs font-bold text-text-primary">
                    {appStats.day} / {(candidate.profiles_count || 1) * (candidate.custom_daily_target || 40)}
                  </p>
                </div>
                <div className="h-2 bg-bg-tertiary rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min((appStats.day / ((candidate.profiles_count || 1) * (candidate.custom_daily_target || 40))) * 100, 100)}%` }}
                    className={cn(
                      "h-full rounded-full transition-all",
                      appStats.day >= (candidate.profiles_count || 1) * (candidate.custom_daily_target || 40) ? "bg-accent-green" : "bg-accent-blue"
                    )}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-text-muted italic">Target: {candidate.custom_daily_target || 40} applications per profile per day.</p>
                  {(user?.role === 'jpc_recruiter' || user?.role === 'jpc_marketing' || user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager') && (
                    <button 
                      onClick={() => setIsRequestingTarget(true)}
                      className="text-[10px] font-bold text-accent-blue hover:underline uppercase tracking-wider"
                    >
                      Request Target Change
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>
          )}

          {/* Activity Log */}
          <section className="bg-bg-secondary border border-border-primary rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-border-primary">
              <h3 className="font-bold text-text-primary flex items-center gap-2">
                <History className="w-5 h-5 text-accent-gray" />
                Activity Log
              </h3>
            </div>
            <div className="p-6 max-h-[400px] overflow-y-auto space-y-6 relative">
              <div className="absolute left-8 top-6 bottom-6 w-px bg-border-primary" />
              {combinedLogs.map((log) => (
                <div key={log.id} className="relative pl-8">
                  <div className={cn(
                    "absolute left-[-4px] top-1.5 w-2 h-2 rounded-full border-2 border-bg-secondary",
                    log.type === 'resume' ? "bg-accent-purple" : 
                    log.type === 'application' ? "bg-accent-blue" : 
                    log.type === 'interview' ? "bg-accent-red" : "bg-accent-gray"
                  )} />
                  <p className="text-sm font-bold text-text-primary">{log.action}</p>
                  <p className="text-xs text-text-secondary mt-0.5">{log.details}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-text-primary font-bold">{log.user_name}</span>
                      {log.user_role && (
                        <span className="text-[8px] px-1 py-0.5 bg-accent-gray/10 text-accent-gray rounded uppercase font-black tracking-tighter">
                          {log.user_role.replace('jpc', '').replace('_', '')}
                        </span>
                      )}
                    </div>
                    <span className="w-1 h-1 bg-text-muted rounded-full opacity-30" />
                    <span className="text-[10px] text-text-muted">{new Date(log.created_at).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
