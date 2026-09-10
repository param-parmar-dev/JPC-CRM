import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { subscribeToCollection, saveUser, generateId } from '../services/storage';
import { Users, UserPlus, Shield, Mail, Phone, MoreVertical, Edit2, Trash2, X, Save, AlertCircle, ShieldCheck, UserCheck, Lock, Copy, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { User, UserRole, Candidate } from '../types';
import { Modal } from '../components/Modal';
import { SMTPConfigModal } from '../components/SMTPConfigModal';
import { MarketingProfileDashboard } from '../components/MarketingProfileDashboard';
import { LeadRoundRobinDashboard } from '../components/LeadRoundRobinDashboard';
import { useToast } from '../contexts/ToastContext';
import { deleteDoc, doc, setDoc, getDocs, collection, writeBatch, query, where, updateDoc } from 'firebase/firestore';
import { db, firebaseConfig } from '../firebase';
import { initializeApp } from 'firebase/app';
import { getAuth, signOut as secondarySignOut, updateProfile, createUserWithEmailAndPassword } from 'firebase/auth';
import { RotateCw } from 'lucide-react';

const ROLES: { value: UserRole; label: string; icon: any; color: string }[] = [
  { value: 'administrator', label: 'Administrator', icon: ShieldCheck, color: 'text-accent-red' },
  { value: 'jpc_sysadmin', label: 'System Admin', icon: ShieldCheck, color: 'text-accent-red' },
  { value: 'jpc_manager', label: 'Auriic Manager', icon: Shield, color: 'text-accent-purple' },
  { value: 'jpc_lead_gen', label: 'Lead Generation', icon: UserPlus, color: 'text-accent-amber' },
  { value: 'jpc_sales', label: 'Sales Team', icon: UserCheck, color: 'text-accent-blue' },
  { value: 'jpc_cs', label: 'Compliance Head', icon: ShieldCheck, color: 'text-accent-teal' },
  { value: 'jpc_compliance_person', label: 'Compliance Person', icon: UserCheck, color: 'text-accent-teal' },
  { value: 'jpc_resume', label: 'Resume Team', icon: UserCheck, color: 'text-accent-amber' },
  { value: 'jpc_recruiter', label: 'Recruiter', icon: UserCheck, color: 'text-accent-green' },
  { value: 'jpc_marketing', label: 'Marketing Leader (TL)', icon: Shield, color: 'text-accent-gray' },
  { value: 'jpc_marketing_support', label: 'Marketing Support', icon: UserCheck, color: 'text-accent-gray' },
  { value: 'jpc_proxy', label: 'Proxy Team', icon: UserCheck, color: 'text-accent-blue' },
  { value: 'jpc_candidate', label: 'Candidate User', icon: UserCheck, color: 'text-accent-teal' },
];

export const Team: React.FC = () => {
  const { user, isAuthReady } = useAuth();
  const { showToast } = useToast();
  const [team, setTeam] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [reassigningFrom, setReassigningFrom] = useState<User | null>(null);
  const [reassigningToId, setReassigningToId] = useState<string>('');
  const [isReassigning, setIsReassigning] = useState(false);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [isSMTPModalOpen, setIsSMTPModalOpen] = useState(false);
  const [leaveReturnDate, setLeaveReturnDate] = useState('');
  const [userTakingLeave, setUserTakingLeave] = useState<User | null>(null);
  const [userToResetPassword, setUserToResetPassword] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  const [formData, setFormData] = useState({
    username: '',
    display_name: '',
    role: 'jpc_sales' as UserRole,
    password: '',
    leader_id: '' as string | number | null,
    candidate_id: '',
    portal_link: '',
    is_on_leave: false,
  });

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [activeTab, setActiveTab] = useState<'members' | 'marketing_profiles' | 'round_robin'>('members');

  useEffect(() => {
    if (!isAuthReady) return;
    const unsub = subscribeToCollection<User>('jpc_users', (data) => {
      setTeam(data);
      setIsLoading(false);
    });
    const unsubCandidates = subscribeToCollection<Candidate>('jpc_candidates', (data) => {
      setCandidates(data);
    });
    return () => {
      unsub();
      unsubCandidates();
    };
  }, [isAuthReady]);

  const visibleTeam = useMemo(() => {
    if (!user) return [];
    if (user.role === 'administrator' || user.role === 'jpc_sysadmin' || user.role === 'jpc_manager' || user.role === 'jpc_cs') {
      return team;
    }
    
    if (user.role === 'jpc_compliance_person') {
      return team.filter(u => 
        u.id === user.id || 
        (user.leader_id && (String(u.id) === String(user.leader_id) || String(u.leader_id) === String(user.leader_id)))
      );
    }
    
    const mohitUser = team.find(u => u.username === 'mohit.panchal' || u.email === 'mohit.panchal@auriic.co');
    const isFaiz = (user.role as string) === 'jpc_cs' && (user.username === 'care' || String(user.display_name).toLowerCase().includes('faiz'));
    if (isFaiz && mohitUser) {
      return team.filter(u => String(u.leader_id) === String(mohitUser.id) || String(u.leader_id) === String(user.id) || u.id === mohitUser.id || u.id === user.id);
    }

    if (user.role === 'jpc_marketing') {
      return team.filter(u => String(u.leader_id) === String(user.id) || u.id === user.id);
    }
    return team.filter(u => u.id === user.id);
  }, [team, user]);

  const canManage = (targetRole: UserRole, targetUser?: User) => {
    if (user?.role === 'administrator' || user?.role === 'jpc_sysadmin') return true;
    if (user?.role === 'jpc_manager' && targetRole !== 'administrator' && targetRole !== 'jpc_sysadmin') return true;
    
    // Compliance Head (jpc_cs) can manage their junior Compliance Persons
    if (user?.role === 'jpc_cs') {
      if (targetRole === 'jpc_compliance_person') {
        if (!targetUser || !targetUser.leader_id || String(targetUser.leader_id) === String(user.id)) return true;
      }
    }

    // Faiz (jpc_cs) can manage Mohit's team members and Mohit himself
    const isFaiz = user?.role === 'jpc_cs' && (user.username === 'care' || String(user.display_name).toLowerCase().includes('faiz'));
    if (isFaiz && targetUser) {
      const mohitUser = team.find(u => u.username === 'mohit.panchal' || u.email === 'mohit.panchal@auriic.co');
      if (mohitUser && (String(targetUser.leader_id) === String(mohitUser.id) || String(targetUser.leader_id) === String(user.id) || targetUser.id === mohitUser.id)) {
        return true;
      }
    }
    return false;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.username || !formData.display_name) return;
    if (!editingUser && !formData.password) {
      showToast('Password is required for new users', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const email = formData.username.includes('@') ? formData.username : `${formData.username}@placify-crm.com`;
      
      // Local validation for duplicate username in Firestore
      const isDuplicate = team.some(u => 
        u.username.toLowerCase() === formData.username.toLowerCase() && 
        (!editingUser || u.id !== editingUser.id)
      );

      if (isDuplicate) {
        showToast('A team member with this username already exists.', 'error');
        setIsLoading(false);
        return;
      }

      let userId = editingUser?.id;

      if (!editingUser) {
        // Create Firebase Auth user using a secondary app instance
        // This allows creating a user without logging out the current admin
        const secondaryApp = initializeApp(firebaseConfig, 'SecondaryTeam');
        const secondaryAuth = getAuth(secondaryApp);
        
        try {
          const { user: fUser } = await createUserWithEmailAndPassword(
            secondaryAuth, 
            email, 
            formData.password
          );
          await updateProfile(fUser, { displayName: formData.display_name });
          
            userId = fUser.uid;
          
          const newUser: User = {
            id: userId,
            username: formData.username,
            display_name: formData.display_name,
            email: email,
            role: formData.role,
            leader_id: (formData.role === 'jpc_recruiter' || formData.role === 'jpc_compliance_person') ? formData.leader_id : null,
            candidate_id: formData.role === 'jpc_candidate' ? formData.candidate_id : null,
            is_on_leave: formData.is_on_leave || false,
            created_at: new Date().toISOString(),
          };

          if (formData.role === 'jpc_candidate' && formData.candidate_id) {
            await setDoc(doc(db, 'jpc_candidates', formData.candidate_id), { 
              portal_link: formData.portal_link || null 
            }, { merge: true });
          }

          await setDoc(doc(db, 'jpc_users', String(newUser.id)), newUser);
          await secondarySignOut(secondaryAuth);
          
          setGeneratedPassword(formData.password);
          showToast('Team member account created successfully!', 'success');
        } catch (authError: any) {
          console.error('Auth creation error:', authError);
          let message = 'Failed to create team member account';
          
          if (authError.code === 'auth/email-already-in-use') {
            // Try to find if this user already exists in Firestore
            const usersSnap = await getDocs(query(collection(db, 'jpc_users'), where('email', '==', email)));
            
            if (!usersSnap.empty) {
              const existingUser = usersSnap.docs[0].data() as User;
              
              // Update their role and details
              const updatedUser: User = {
                ...existingUser,
                username: formData.username,
                display_name: formData.display_name,
                role: formData.role,
                leader_id: (formData.role === 'jpc_recruiter' || formData.role === 'jpc_compliance_person') ? formData.leader_id : null,
                candidate_id: formData.role === 'jpc_candidate' ? formData.candidate_id : null,
              };

              if (formData.role === 'jpc_candidate' && formData.candidate_id) {
                await setDoc(doc(db, 'jpc_candidates', formData.candidate_id), { 
                  portal_link: formData.portal_link || null 
                }, { merge: true });
              }

              await setDoc(doc(db, 'jpc_users', String(existingUser.id)), updatedUser);
              showToast('Existing account updated with new role!', 'success');
              setIsLoading(false);
              setIsModalOpen(false);
              setEditingUser(null);
              setFormData({ username: '', display_name: '', role: 'jpc_sales', password: '', leader_id: null, candidate_id: '', portal_link: '', is_on_leave: false });
              return;
            } else {
              message = 'This email is already registered. Please use a different email or contact support.';
            }
          } else if (authError.code === 'auth/weak-password') {
            message = 'Password should be at least 6 characters.';
          }
          showToast(message, 'error');
          setIsLoading(false);
          return;
        }
      } else {
        const updatedUser: User = {
          ...editingUser,
          username: formData.username,
          display_name: formData.display_name,
          email: email,
          role: formData.role,
          leader_id: (formData.role === 'jpc_recruiter' || formData.role === 'jpc_compliance_person') ? formData.leader_id : null,
          candidate_id: formData.role === 'jpc_candidate' ? formData.candidate_id : null,
          is_on_leave: formData.is_on_leave || false,
        };

        if (formData.role === 'jpc_candidate' && formData.candidate_id) {
          await setDoc(doc(db, 'jpc_candidates', formData.candidate_id), { 
            portal_link: formData.portal_link || null 
          }, { merge: true });
        }

        await setDoc(doc(db, 'jpc_users', String(updatedUser.id)), updatedUser);
        showToast('User updated', 'success');
      }

      setIsModalOpen(false);
      setEditingUser(null);
      setFormData({ username: '', display_name: '', role: 'jpc_sales', password: '', leader_id: null, candidate_id: '', portal_link: '', is_on_leave: false });
    } catch (error) {
      console.error('Save user error:', error);
      showToast('Failed to save user', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdminResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userToResetPassword || !newPassword) return;
    if (newPassword.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }

    setIsResettingPassword(true);
    try {
      const { getAuth } = await import('firebase/auth');
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      
      const response = await fetch('/api/admin/reset-user-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          targetUid: userToResetPassword.id,
          newPassword: newPassword
        })
      });

      const data = await response.json();
      if (response.ok) {
        showToast(`Password reset successfully for ${userToResetPassword.display_name}`, 'success');
        setUserToResetPassword(null);
        setNewPassword('');
      } else {
        showToast(data.error || 'Failed to reset password', 'error');
      }
    } catch (error) {
      console.error('Reset password error:', error);
      showToast('Failed to reset password', 'error');
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingUser) return;
    setIsLoading(true);
    try {
      await deleteDoc(doc(db, 'jpc_users', String(deletingUser.id)));
      showToast('User removed', 'success');
      setDeletingUser(null);
    } catch (error) {
      console.error('Delete user error:', error);
      showToast('Failed to remove user', 'error');
    } finally {
      setIsLoading(false);
    }
  };

   const toggleLeaveStatus = async (targetUser: User) => {
    const isAdmin = user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager';
    const mohitUser = team.find(u => u.username === 'mohit.panchal' || u.email === 'mohit.panchal@auriic.co');
    const isFaiz = user?.role === 'jpc_cs' && (user.username === 'care' || String(user.display_name).toLowerCase().includes('faiz'));
    const isTL = (user?.role === 'jpc_marketing' && String(targetUser.leader_id) === String(user.id)) ||
                 (user?.role === 'jpc_cs' && String(targetUser.leader_id) === String(user.id)) ||
                 (isFaiz && mohitUser && (String(targetUser.leader_id) === String(mohitUser.id) || String(targetUser.leader_id) === String(user.id) || targetUser.id === mohitUser.id));

    if (!isAdmin && !isTL) {
      showToast('You do not have permission to manage leave for this user', 'error');
      return;
    }

    try {
      const newStatus = !targetUser.is_on_leave;
      
      if (newStatus) {
        // Marking as on leave - ask for return date first
        setUserTakingLeave(targetUser);
        setLeaveReturnDate('');
        setIsLeaveModalOpen(true);
        return;
      }

      // Marking as back from leave
      await updateDoc(doc(db, 'jpc_users', String(targetUser.id)), {
        is_on_leave: false,
        leave_return_date: null
      });
      showToast(`${targetUser.display_name} is now back from leave`, 'success');
    } catch (error) {
      console.error('Toggle leave error:', error);
      showToast('Failed to update leave status', 'error');
    }
  };

  const confirmLeaveStatus = async () => {
    if (!userTakingLeave || !leaveReturnDate) {
      showToast('Please select a return date', 'error');
      return;
    }

    try {
      await updateDoc(doc(db, 'jpc_users', String(userTakingLeave.id)), {
        is_on_leave: true,
        leave_return_date: leaveReturnDate
      });
      
      showToast(`${userTakingLeave.display_name} is now on leave until ${new Date(leaveReturnDate).toLocaleDateString()}`, 'success');
      setIsLeaveModalOpen(false);
      setReassigningFrom(userTakingLeave);
    } catch (error) {
      console.error('Confirm leave error:', error);
      showToast('Failed to update leave status', 'error');
    }
  };

  const handleReassign = async () => {
    if (!reassigningFrom || !reassigningToId) return;
    
    setIsReassigning(true);
    try {
      const candidatesRef = collection(db, 'jpc_candidates');
      const q = query(candidatesRef, where('assigned_recruiter', '==', reassigningFrom.id));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        showToast('No candidates found assigned to this recruiter', 'info');
        setReassigningFrom(null);
        setReassigningToId('');
        return;
      }

      const batch = writeBatch(db);
      snapshot.docs.forEach((doc) => {
        batch.update(doc.ref, {
          assigned_recruiter: reassigningToId,
          updated_at: new Date().toISOString()
        });
      });
      
      await batch.commit();
      
      showToast(`Successfully reassigned ${snapshot.size} candidates to ${team.find(u => u.id === reassigningToId)?.display_name}`, 'success');
      setReassigningFrom(null);
      setReassigningToId('');
    } catch (error) {
      console.error('Reassign error:', error);
      showToast('Failed to reassign candidates', 'error');
    } finally {
      setIsReassigning(false);
    }
  };

  const resetDatabase = async () => {
    if (user?.role !== 'administrator') return;
    
    setIsLoading(true);
    try {
      const collectionsToClear = [
        'jpc_candidates',
        'jpc_payments',
        'jpc_promises',
        'jpc_qc_checklist',
        'jpc_followups',
        'jpc_activity_logs',
        'jpc_applications',
        'jpc_notifications',
        'jpc_report_logs',
        'jpc_resume_requests',
        'jpc_interviews'
      ];

      for (const collName of collectionsToClear) {
        const snapshot = await getDocs(collection(db, collName));
        
        // Process in batches of 500 to avoid Firestore limits
        const docs = snapshot.docs;
        for (let i = 0; i < docs.length; i += 500) {
          const batch = writeBatch(db);
          const chunk = docs.slice(i, i + 500);
          chunk.forEach((doc) => {
            batch.delete(doc.ref);
          });
          await batch.commit();
        }
        console.log(`Cleared collection: ${collName}`);
      }

      showToast('Database reset successfully. All data except team members has been removed.', 'success');
      setIsResetModalOpen(false);
    } catch (error) {
      console.error('Reset database error:', error);
      showToast('Failed to reset database. Check console for details.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const seedAllUsers = async () => {
    if (user?.role !== 'administrator') return;
    setIsLoading(true);

    const USERS_TO_CREATE = [
      { display_name: "Yash Pandya", email: "yash.pandya@auriic.co", password: "Auriic@1031", role: "jpc_sysadmin", username: "yash.pandya" },
      { display_name: "Faiz Ahmadi", email: "care@auriic.co", password: "Auriic@1031", role: "jpc_cs", username: "care" },
      { display_name: "Pritesh chauhan", email: "pritesh.chauhan@auriic.co", password: "Auriic@1031", role: "jpc_manager", username: "pritesh.chauhan" },
      { display_name: "Khushi Patel", email: "khushi.patel@auriic.co", password: "Kp@Auriic1301", role: "jpc_lead_gen", username: "khushi.patel" },
      { display_name: "Bharat Dhrangiya", email: "bharat.dhrangiya@auriic.co", password: "Bd@Auriic1301", role: "jpc_lead_gen", username: "bharat.dhrangiya" },
      { display_name: "Vakas Panja", email: "vakas.panja@auriic.co", password: "Vp@Auriic1301", role: "jpc_sales", username: "vakas.panja" },
      { display_name: "Tirth Bhatt", email: "tirth.bhatt@auriic.co", password: "Tb@Auriic1301", role: "jpc_sales", username: "tirth.bhatt" },
      { display_name: "Pratik Shah", email: "pratik.shah@auriic.co", password: "Ps@Auriic1301", role: "jpc_sales", username: "pratik.shah" },
      { display_name: "Tanya Bhalla", email: "tanyabhalla@auriic.co", password: "Tb@Auriic1301", role: "jpc_sales", username: "tanyabhalla" },
      { display_name: "Hemant Gokhale", email: "hemant.gokhale@auriic.co", password: "Hg@Auriic1301", role: "jpc_resume", username: "hemant.gokhale" },
      { display_name: "Nihal Khalyani", email: "nihal.khalyani@auriic.co", password: "Nk@Auriic1301", role: "jpc_resume", username: "nihal.khalyani" },
      { display_name: "Mohit Panchal", email: "mohit.panchal@auriic.co", password: "Mp@Auriic1301", role: "jpc_recruiter", username: "mohit.panchal" },
      { display_name: "Nikhil Sevak", email: "nikhil.sevak@auriic.co", password: "Ns@Auriic1301", role: "jpc_marketing", username: "nikhil.sevak" },
      { display_name: "Vansh Patel", email: "vansh.patel@auriic.co", password: "Vp@Auriic1301", role: "jpc_recruiter", username: "vansh.patel" },
      { display_name: "Siddharth Kamdar", email: "siddharth.kamdar@auriic.co", password: "Sk@Auriic1301", role: "jpc_recruiter", username: "siddharth.kamdar" },
      { display_name: "Deep Kansara", email: "deep.kansara@auriic.co", password: "Dk@Auriic1301", role: "jpc_recruiter", username: "deep.kansara" },
      { display_name: "Jay Unnarkar", email: "jay.unnarkar@auriic.co", password: "Ju@Auriic1301", role: "jpc_recruiter", username: "jay.unnarkar" },
      { display_name: "Aamin Padharshi", email: "aamin.padharshi@auriic.co", password: "Ap@Auriic1301", role: "jpc_recruiter", username: "aamin.padharshi" },
      { display_name: "Amir Khalyani", email: "amir.khalyani@auriic.co", password: "Ak@Auriic1301", role: "jpc_recruiter", username: "amir.khalyani" },
      { display_name: "Arman Parmar", email: "arman.parmar@auriic.co", password: "Ap@Auriic1301", role: "jpc_recruiter", username: "arman.parmar" },
      { display_name: "Romil Vadiya", email: "romil.vadiya@auriic.co", password: "Rv@Auriic1301", role: "jpc_recruiter", username: "romil.vadiya" },
      { display_name: "Manav Nagar", email: "manav.nagar@auriic.co", password: "Mn@Auriic1301", role: "jpc_recruiter", username: "manav.nagar" },
      { display_name: "Snohi Vairagi", email: "snohi.vairagi@auriic.co", password: "Sv@Auriic1301", role: "jpc_recruiter", username: "snohi.vairagi" },
      { display_name: "Janvi Mistry", email: "janvi.mistry@auriic.co", password: "Jm@Auriic1301", role: "jpc_recruiter", username: "janvi.mistry" },
      { display_name: "Payal Tiwari", email: "payal.tiwari@auriic.co", password: "Pt@Auriic1301", role: "jpc_recruiter", username: "payal.tiwari" },
      { display_name: "Aayushi Fichadiya", email: "aayushi.fichadiya@auriic.co", password: "Af@Auriic1301", role: "jpc_recruiter", username: "aayushi.fichadiya" },
      { display_name: "Madhavi Paneliya", email: "madhavi.paneliya@auriic.co", password: "Mp@Auriic1301", role: "jpc_recruiter", username: "madhavi.paneliya" },
      { display_name: "Disha Shrimali", email: "disha.shrimali@auriic.co", password: "Ds@Auriic1301", role: "jpc_recruiter", username: "disha.shrimali" },
      { display_name: "Avantika Gidhavani", email: "avantika.gidhavani@auriic.co", password: "Ag@Auriic1301", role: "jpc_recruiter", username: "avantika.gidhavani" },
      { display_name: "Rudra Rawal", email: "rudraksh.rawal@auriic.co", password: "Rr@Auriic1301", role: "jpc_proxy", username: "rudraksh.rawal" },
      { display_name: "Apoorva Indrekar", email: "apoorva.indrekar@auriic.co", password: "Ai@Auriic130", role: "jpc_sales", username: "apoorva.indrekar" }
    ];

    let createdCount = 0;
    const secondaryApp = initializeApp(firebaseConfig, 'SecondaryBatch' + Date.now());
    const secondaryAuth = getAuth(secondaryApp);

    for (const u of USERS_TO_CREATE) {
      if (team.some(t => t.email === u.email)) continue; // skip existing

      try {
        const { user: fUser } = await createUserWithEmailAndPassword(secondaryAuth, u.email, u.password);
        await updateProfile(fUser, { displayName: u.display_name });
        const newUser: User = {
          id: fUser.uid,
          username: u.username,
          display_name: u.display_name,
          email: u.email,
          role: u.role as UserRole,
          leader_id: null,
          candidate_id: null,
          created_at: new Date().toISOString(),
        };
        await setDoc(doc(db, 'jpc_users', String(newUser.id)), newUser);
        createdCount++;
        await secondarySignOut(secondaryAuth);
      } catch (e: any) {
        console.log(`Error creating ${u.email}:`, e.message);
      }
    }
    
    showToast(`Batch operation complete. Added ${createdCount} new users.`, 'success');
    setIsLoading(false);
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Password Modal */}
      <AnimatePresence>
        {generatedPassword && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-bg-secondary border border-border-primary rounded-2xl sm:rounded-3xl shadow-2xl max-w-md w-full max-h-[94vh] overflow-y-auto touch-scroll"
            >
              <div className="p-5 sm:p-8 text-center">
                <div className="w-16 h-16 bg-accent-green/10 rounded-full flex items-center justify-center mx-auto mb-6">
                  <ShieldCheck className="w-8 h-8 text-accent-green" />
                </div>
                <h3 className="text-2xl font-bold text-text-primary mb-2">Account Created!</h3>
                <p className="text-text-secondary mb-8">Share these credentials with the new team member. They can now log in directly.</p>
                
                <div className="space-y-4 mb-8">
                  <div className="p-4 bg-bg-tertiary rounded-2xl border border-border-primary text-left">
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-1">Login Email</p>
                    <p className="text-sm font-mono text-text-primary">{formData.username.includes('@') ? formData.username : `${formData.username}@placify-crm.com`}</p>
                  </div>
                  <div className="p-4 bg-bg-tertiary rounded-2xl border border-border-primary text-left relative group">
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-1">Password</p>
                    <p className="text-sm font-mono text-text-primary">{generatedPassword}</p>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(generatedPassword!);
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
                      const signupUrl = window.location.origin;
                      const email = formData.username.includes('@') ? formData.username : `${formData.username}@auriic.co`;
                      const message = `Hello, your Auriic account is ready!\n\nLogin at: ${signupUrl}\nEmail: ${email}\nPassword: ${generatedPassword}\n\nPlease change your password after logging in.`;
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

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-text-primary tracking-tight">Team Management</h1>
          <p className="text-text-secondary mt-1">Manage your team members and their access levels.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {(user?.role === 'administrator' || user?.role === 'jpc_sysadmin') && (
            <button 
              onClick={() => setIsSMTPModalOpen(true)}
              className="flex items-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-accent-amber/10 text-accent-amber border border-accent-amber/20 text-sm sm:text-base font-bold rounded-2xl hover:bg-accent-amber/20 transition-all"
            >
              <Mail className="w-4 h-4 sm:w-5 sm:h-5" />
              SMTP Settings
            </button>
          )}
          {(user?.role === 'administrator' || user?.role === 'jpc_sysadmin') && (
            <button 
              onClick={seedAllUsers}
              className="flex items-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-accent-green/10 text-accent-green border border-accent-green/20 text-sm sm:text-base font-bold rounded-2xl hover:bg-accent-green/20 transition-all"
            >
              <Users className="w-4 h-4 sm:w-5 sm:h-5" />
              Sync CRM Users
            </button>
          )}
          {(user?.role === 'administrator' || user?.role === 'jpc_sysadmin') && (
            <button 
              onClick={() => setIsResetModalOpen(true)}
              className="flex items-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-accent-red/10 text-accent-red border border-accent-red/20 text-sm sm:text-base font-bold rounded-2xl hover:bg-accent-red/20 transition-all"
            >
              <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
              Reset Database
            </button>
          )}
          {(user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager') && (
            <button 
              onClick={() => {
                setEditingUser(null);
                setFormData({ username: '', display_name: '', role: 'jpc_sales', password: '', leader_id: null, candidate_id: '', portal_link: '', is_on_leave: false });
                setIsModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-accent-blue text-white text-sm sm:text-base font-bold rounded-2xl hover:bg-accent-blue/90 transition-all shadow-lg shadow-accent-blue/20"
            >
              <UserPlus className="w-4 h-4 sm:w-5 sm:h-5" />
              Add Team Member
            </button>
          )}
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-border-primary mb-8 gap-6 overflow-x-auto touch-scroll scrollbar-hide">
        <button
          onClick={() => setActiveTab('members')}
          className={cn(
            "pb-4 px-1 text-sm font-bold tracking-tight border-b-2 transition-all flex items-center gap-2 whitespace-nowrap",
            activeTab === 'members'
              ? "border-accent-blue text-accent-blue"
              : "border-transparent text-text-secondary hover:text-text-primary"
          )}
        >
          <Users className="w-4 h-4" />
          <span>Team Members ({team.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('round_robin')}
          className={cn(
            "pb-4 px-1 text-sm font-bold tracking-tight border-b-2 transition-all flex items-center gap-2 whitespace-nowrap",
            activeTab === 'round_robin'
              ? "border-accent-teal text-accent-teal"
              : "border-transparent text-text-secondary hover:text-text-primary"
          )}
        >
          <RotateCw className="w-4 h-4" />
          <span>Lead Round-Robin Rotation</span>
          <span className="px-1.5 py-0.5 bg-accent-teal/10 text-accent-teal rounded-md text-[10px] font-extrabold uppercase">
            Auto Sales
          </span>
        </button>
        <button
          onClick={() => setActiveTab('marketing_profiles')}
          className={cn(
            "pb-4 px-1 text-sm font-bold tracking-tight border-b-2 transition-all flex items-center gap-2 whitespace-nowrap",
            activeTab === 'marketing_profiles'
              ? "border-accent-blue text-accent-blue"
              : "border-transparent text-text-secondary hover:text-text-primary"
          )}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Marketing Load Distribution</span>
          <span className="px-1.5 py-0.5 bg-accent-blue/10 text-accent-blue rounded-md text-[10px] font-extrabold uppercase">
            Live Stats
          </span>
        </button>
      </div>

      {activeTab === 'members' ? (
        /* Role Groups */
        <div className="space-y-10">
          {ROLES.map((role) => {
            const roleMembers = visibleTeam.filter(u => u.role === role.value);
            if (roleMembers.length === 0) return null;

            return (
              <section key={role.value} className="space-y-4">
                <div className="flex items-center gap-3 px-2">
                  <role.icon className={cn("w-5 h-5", role.color)} />
                  <h2 className="text-lg font-bold text-text-primary tracking-tight">{role.label}</h2>
                  <span className="px-2 py-0.5 bg-bg-secondary border border-border-primary rounded-lg text-[10px] font-bold text-text-muted uppercase">
                    {roleMembers.length}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {roleMembers.map((member) => (
                    <motion.div
                      key={member.id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-bg-secondary rounded-3xl border border-border-primary p-6 shadow-sm hover:shadow-md transition-all group relative"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="w-12 h-12 rounded-2xl bg-bg-tertiary flex items-center justify-center text-text-secondary font-bold text-sm">
                          {member.display_name.split(' ').map(n => n[0]).join('')}
                        </div>
                        {canManage(member.role, member) && member.id !== user?.id && (
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={() => {
                                setEditingUser(member);
                                setFormData({
                                  username: member.username,
                                  display_name: member.display_name,
                                  role: member.role,
                                  password: '',
                                  leader_id: member.leader_id || null,
                                  candidate_id: member.candidate_id || '',
                                  portal_link: '', 
                                  is_on_leave: member.is_on_leave || false,
                                });
                                setIsModalOpen(true);
                              }}
                              className="p-2 text-text-muted hover:text-accent-blue transition-colors"
                              title="Edit User"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => {
                                setUserToResetPassword(member);
                                setNewPassword('');
                              }}
                              className="p-2 text-text-muted hover:text-accent-amber transition-colors"
                              title="Reset Password"
                            >
                              <Lock className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => setDeletingUser(member)}
                              className="p-2 text-text-muted hover:text-accent-red transition-colors"
                              title="Delete User"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      <div>
                        <h3 className="font-bold text-text-primary">{member.display_name}</h3>
                        <p className="text-xs text-text-muted mt-1">@{member.username}</p>
                        {member.is_on_leave && member.leave_return_date && (
                          <div className="mt-2 px-3 py-1.5 bg-accent-red/5 border border-accent-red/10 rounded-xl">
                            <p className="text-[10px] font-bold text-accent-red uppercase tracking-widest">
                              On Leave Until: {new Date(member.leave_return_date).toLocaleDateString()}
                            </p>
                          </div>
                        )}
                        {member.role === 'jpc_recruiter' && member.leader_id && (
                          <p className="text-[10px] font-bold text-accent-blue uppercase mt-2">
                            TL: {team.find(u => String(u.id) === String(member.leader_id))?.display_name || 'Unknown'}
                          </p>
                        )}
                        {member.role === 'jpc_compliance_person' && member.leader_id && (
                          <p className="text-[10px] font-bold text-accent-teal uppercase mt-2">
                            Compliance Head: {team.find(u => String(u.id) === String(member.leader_id))?.display_name || 'Unknown'}
                          </p>
                        )}
                        {member.role === 'jpc_cs' && (
                          <p className="text-[10px] font-bold text-accent-teal uppercase mt-2">
                            Compliance Team: {team.filter(u => String(u.leader_id) === String(member.id)).length} Compliance Person{team.filter(u => String(u.leader_id) === String(member.id)).length === 1 ? '' : 's'}
                          </p>
                        )}
                        {member.role === 'jpc_marketing' && (
                          <p className="text-[10px] font-bold text-accent-green uppercase mt-2">
                            Cluster: {team.filter(u => String(u.leader_id) === String(member.id)).length} Recruiters
                          </p>
                        )}
                      </div>

                      <div className="mt-6 pt-6 border-t border-border-primary flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={cn("w-2 h-2 rounded-full", member.is_on_leave ? "bg-accent-red" : "bg-accent-green")} />
                          <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                            {member.is_on_leave ? "On Leave" : "Active"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {(() => {
                            const mohitUser = team.find(u => u.username === 'mohit.panchal' || u.email === 'mohit.panchal@auriic.co');
                            const isFaiz = user?.role === 'jpc_cs' && (user.username === 'care' || String(user.display_name).toLowerCase().includes('faiz'));
                            const isTL = (user?.role === 'jpc_marketing' && String(member.leader_id) === String(user.id)) ||
                                         (user?.role === 'jpc_cs' && String(member.leader_id) === String(user.id)) ||
                                         (isFaiz && mohitUser && (String(member.leader_id) === String(mohitUser.id) || String(member.leader_id) === String(user.id) || member.id === mohitUser.id));
                            const canToggle = user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || isTL;
                            return canToggle && member.id !== user?.id && (
                              <button
                                onClick={() => toggleLeaveStatus(member)}
                                className={cn(
                                  "px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
                                  member.is_on_leave 
                                    ? "bg-accent-green/10 text-accent-green hover:bg-accent-green/20" 
                                    : "bg-accent-red/10 text-accent-red hover:bg-accent-red/20"
                                )}
                              >
                                {member.is_on_leave ? "Mark Active" : "Mark Leave"}
                              </button>
                            );
                          })()}
                          <p className="text-[10px] text-text-muted">
                            Joined {new Date(member.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : activeTab === 'round_robin' ? (
        <LeadRoundRobinDashboard
          allUsers={team}
          isAdminOrManager={user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager'}
        />
      ) : (
        <MarketingProfileDashboard
          team={team}
          candidates={candidates}
          onReassignClick={(recruiter) => {
            setReassigningFrom(recruiter);
          }}
          currentUser={user}
        />
      )}

      {/* Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title={editingUser ? 'Edit Team Member' : 'Add Team Member'}
      >
        <form onSubmit={handleSave} className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-text-muted uppercase tracking-widest">Display Name</label>
              <input 
                type="text" 
                required
                value={formData.display_name}
                onChange={e => setFormData({...formData, display_name: e.target.value})}
                placeholder="e.g. John Doe"
                className="w-full bg-bg-tertiary border border-border-primary rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-text-muted uppercase tracking-widest">Username / Email</label>
              <input 
                type="text" 
                required
                value={formData.username}
                onChange={e => setFormData({...formData, username: e.target.value})}
                placeholder="e.g. johndoe@example.com"
                className="w-full bg-bg-tertiary border border-border-primary rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors"
              />
            </div>
            {!editingUser && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-text-muted uppercase tracking-widest">Password</label>
                <input 
                  type="password" 
                  required
                  value={formData.password}
                  onChange={e => setFormData({...formData, password: e.target.value})}
                  placeholder="••••••••"
                  className="w-full bg-bg-tertiary border border-border-primary rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-text-muted uppercase tracking-widest">Role</label>
              <select 
                value={formData.role}
                onChange={e => setFormData({...formData, role: e.target.value as UserRole, leader_id: null})}
                className="w-full bg-bg-tertiary border border-border-primary rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors appearance-none"
              >
                {ROLES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            {formData.role === 'jpc_candidate' && (
              <div className="space-y-4 pt-2 border-t border-border-primary">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-text-muted uppercase tracking-widest">Candidate ID (Optional)</label>
                  <input 
                    type="text" 
                    value={formData.candidate_id}
                    onChange={e => setFormData({...formData, candidate_id: e.target.value})}
                    placeholder="e.g. CAND-123"
                    className="w-full bg-bg-tertiary border border-border-primary rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors"
                  />
                  <p className="text-[10px] text-text-muted italic px-1">Link this user to a specific candidate profile.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-text-muted uppercase tracking-widest">Email Portal Link</label>
                  <div className="flex gap-2">
                    <input 
                      type="url" 
                      value={formData.portal_link}
                      onChange={e => setFormData({...formData, portal_link: e.target.value})}
                      placeholder="https://portal.example.com"
                      className="flex-1 bg-bg-tertiary border border-border-primary rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    if (!formData.display_name) {
                      showToast('Please enter candidate name first', 'error');
                      return;
                    }
                    try {
                      // Find sysadmin
                      const sysadmins = team.filter(u => u.role === 'jpc_sysadmin' || u.role === 'administrator');
                      if (sysadmins.length === 0) {
                        showToast('No System Admin found to receive request', 'error');
                        return;
                      }

                      for (const admin of sysadmins) {
                        const notifId = generateId();
                        await setDoc(doc(db, 'jpc_notifications', notifId), {
                          id: notifId,
                          recipient_id: admin.id,
                          sender_id: user?.id || null,
                          type: 'system_alert',
                          message: `ACCESS REQUEST: Generate portal access for candidate ${formData.display_name}`,
                          read: false,
                          created_at: new Date().toISOString()
                        });
                      }
                      showToast('Access request sent to System Admin', 'success');
                    } catch (error) {
                      console.error('Request error:', error);
                      showToast('Failed to send request', 'error');
                    }
                  }}
                  className="w-full py-2 px-4 bg-accent-amber/10 text-accent-amber border border-accent-amber/20 rounded-xl font-bold text-xs hover:bg-accent-amber/20 transition-all flex items-center justify-center gap-2"
                >
                  <Lock className="w-4 h-4" />
                  Generate Access Request
                </button>
              </div>
            )}
            {formData.role === 'jpc_recruiter' && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-text-muted uppercase tracking-widest">Marketing Leader (TL)</label>
                <select 
                  value={formData.leader_id || ''}
                  onChange={e => setFormData({...formData, leader_id: e.target.value})}
                  className="w-full bg-bg-tertiary border border-border-primary rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors appearance-none"
                  required
                >
                  <option value="">Select Marketing Leader</option>
                  {team.filter(u => u.role === 'jpc_marketing').map(u => (
                    <option key={u.id} value={u.id}>{u.display_name}</option>
                  ))}
                </select>
              </div>
            )}
            {formData.role === 'jpc_compliance_person' && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-text-muted uppercase tracking-widest">Compliance Head (Leader)</label>
                <select 
                  value={formData.leader_id || ''}
                  onChange={e => setFormData({...formData, leader_id: e.target.value})}
                  className="w-full bg-bg-tertiary border border-border-primary rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors appearance-none"
                  required
                >
                  <option value="">Select Compliance Head</option>
                  {team.filter(u => u.role === 'jpc_cs').map(u => (
                    <option key={u.id} value={u.id}>{u.display_name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button 
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="flex-1 py-3 bg-bg-tertiary text-text-primary font-bold rounded-xl hover:bg-bg-tertiary/80 transition-all"
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="flex-1 py-3 bg-accent-blue text-white font-bold rounded-xl hover:bg-accent-blue/90 transition-all shadow-lg shadow-accent-blue/20"
            >
              {editingUser ? 'Save Changes' : 'Add Member'}
            </button>
          </div>
        </form>
      </Modal>

      <SMTPConfigModal 
        isOpen={isSMTPModalOpen} 
        onClose={() => setIsSMTPModalOpen(false)}
      />

      {/* Password Reset Modal */}
      <Modal
        isOpen={!!userToResetPassword}
        onClose={() => {
          if (!isResettingPassword) {
            setUserToResetPassword(null);
            setNewPassword('');
          }
        }}
        title={`Reset Password: ${userToResetPassword?.display_name}`}
      >
        <form onSubmit={handleAdminResetPassword} className="space-y-6">
          <div className="p-4 bg-accent-amber/10 border border-accent-amber/20 rounded-2xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-accent-amber shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-accent-amber">Security Action</p>
              <p className="text-xs text-accent-amber/80 mt-1">
                This will immediately change the password for <strong>{userToResetPassword?.username}</strong>. 
                They will need to use this new password for their next login.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-text-muted uppercase tracking-widest">New Password</label>
            <div className="relative">
              <input 
                type="text" 
                required
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Enter new 6+ digit password"
                className="w-full bg-bg-tertiary border border-border-primary rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors pr-12"
                minLength={6}
              />
              <button
                type="button"
                onClick={() => {
                  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
                  let retVal = "";
                  for (let i = 0; i < 10; ++i) {
                    retVal += charset.charAt(Math.floor(Math.random() * charset.length));
                  }
                  setNewPassword(retVal);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-text-muted hover:text-accent-blue transition-colors"
                title="Generate Password"
              >
                <TrendingUp className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setUserToResetPassword(null)}
              className="flex-1 py-3 bg-bg-tertiary text-text-primary font-bold rounded-xl hover:bg-bg-tertiary/80 transition-all"
              disabled={isResettingPassword}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isResettingPassword || !newPassword || newPassword.length < 6}
              className="flex-1 py-3 bg-accent-amber text-white font-bold rounded-xl hover:bg-accent-amber/90 transition-all shadow-lg shadow-accent-amber/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isResettingPassword ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Lock className="w-4 h-4" />
              )}
              Update Password
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deletingUser}
        onClose={() => setDeletingUser(null)}
        title="Confirm Deletion"
      >
        <div className="space-y-6">
          <div className="flex items-center gap-4 p-4 bg-accent-red/10 border border-accent-red/20 rounded-2xl">
            <div className="w-12 h-12 bg-accent-red/20 rounded-full flex items-center justify-center text-accent-red">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="font-bold text-text-primary text-lg">Remove Team Member?</p>
              <p className="text-sm text-text-secondary">
                Are you sure you want to remove <span className="font-bold text-text-primary">{deletingUser?.display_name}</span>? This action cannot be undone.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <button 
              onClick={() => setDeletingUser(null)}
              className="flex-1 py-3 bg-bg-tertiary text-text-primary font-bold rounded-xl hover:bg-bg-tertiary/80 transition-all"
            >
              Cancel
            </button>
            <button 
              onClick={handleDelete}
              className="flex-1 py-3 bg-accent-red text-white font-bold rounded-xl hover:bg-accent-red/90 transition-all shadow-lg shadow-accent-red/20"
            >
              Remove Member
            </button>
          </div>
        </div>
      </Modal>

      {/* Leave Return Date Modal */}
      <Modal
        isOpen={isLeaveModalOpen}
        onClose={() => setIsLeaveModalOpen(false)}
        title="Mark Leave Duration"
      >
        <div className="space-y-6">
          <div className="p-4 bg-accent-amber/10 border border-accent-amber/20 rounded-2xl">
            <p className="text-sm text-text-primary">
              When is <span className="font-bold">{userTakingLeave?.display_name}</span> expected to return?
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-text-muted uppercase tracking-widest">Return Date</label>
            <input 
              type="date"
              value={leaveReturnDate}
              onChange={e => setLeaveReturnDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full bg-bg-tertiary border border-border-primary rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors"
            />
          </div>

          <div className="flex gap-3">
            <button 
              onClick={() => setIsLeaveModalOpen(false)}
              className="flex-1 py-3 bg-bg-tertiary text-text-primary font-bold rounded-xl hover:bg-bg-tertiary/80 transition-all"
            >
              Cancel
            </button>
            <button 
              onClick={confirmLeaveStatus}
              disabled={!leaveReturnDate}
              className="flex-1 py-3 bg-accent-blue text-white font-bold rounded-xl hover:bg-accent-blue/90 transition-all shadow-lg shadow-accent-blue/20 disabled:opacity-50 disabled:shadow-none"
            >
              Confirm Leave
            </button>
          </div>
        </div>
      </Modal>

      {/* Reassign Candidates Modal */}
      <Modal
        isOpen={!!reassigningFrom}
        onClose={() => setReassigningFrom(null)}
        title="Reassign Candidates"
      >
        <div className="space-y-6">
          <div className="p-4 bg-accent-blue/10 border border-accent-blue/20 rounded-2xl">
            <p className="text-sm text-text-primary">
              <span className="font-bold">{reassigningFrom?.display_name}</span> is now on leave. 
              Would you like to reassign their currently assigned candidates to another team member?
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-text-muted uppercase tracking-widest">Target Recruiter</label>
            <select 
              value={reassigningToId}
              onChange={e => setReassigningToId(e.target.value)}
              className="w-full bg-bg-tertiary border border-border-primary rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors appearance-none"
            >
              <option value="">Select Target Recruiter</option>
              {team
                .filter(u => 
                  u.role === 'jpc_recruiter' && 
                  u.id !== reassigningFrom?.id && 
                  !u.is_on_leave &&
                  (() => {
                    const mohitUser = team.find(l => l.username === 'mohit.panchal' || l.email === 'mohit.panchal@auriic.co');
                    const isFaiz = user?.role === 'jpc_cs' && (user.username === 'care' || String(user.display_name).toLowerCase().includes('faiz'));
                    if (isFaiz && mohitUser) {
                      return String(u.leader_id) === String(mohitUser.id) || String(u.leader_id) === String(user.id);
                    }
                    return user?.role !== 'jpc_marketing' || String(u.leader_id) === String(user.id);
                  })()
                )
                .map(u => (
                  <option key={u.id} value={u.id}>{u.display_name}</option>
                ))
              }
            </select>
            <p className="text-[10px] text-text-muted italic px-1">Candidates will be transferred immediately.</p>
          </div>

          <div className="flex gap-3">
            <button 
              onClick={() => {
                setReassigningFrom(null);
                setReassigningToId('');
              }}
              className="flex-1 py-3 bg-bg-tertiary text-text-primary font-bold rounded-xl hover:bg-bg-tertiary/80 transition-all"
              disabled={isReassigning}
            >
              Skip
            </button>
            <button 
              onClick={handleReassign}
              disabled={!reassigningToId || isReassigning}
              className="flex-1 py-3 bg-accent-blue text-white font-bold rounded-xl hover:bg-accent-blue/90 transition-all shadow-lg shadow-accent-blue/20 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
            >
              {isReassigning && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Reassign Now
            </button>
          </div>
        </div>
      </Modal>

      {/* Database Reset Confirmation Modal */}
      <Modal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        title="CRITICAL: Reset Database"
      >
        <div className="space-y-6">
          <div className="flex items-center gap-4 p-4 bg-accent-red/10 border border-accent-red/20 rounded-2xl">
            <div className="w-12 h-12 bg-accent-red/20 rounded-full flex items-center justify-center text-accent-red">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="font-bold text-text-primary text-lg">Wipe All Data?</p>
              <p className="text-sm text-text-secondary">
                This will delete <span className="font-bold text-text-primary">ALL</span> candidates, interviews, logs, and payments. 
                Only team members will be kept. This action is <span className="font-bold text-accent-red underline">IRREVERSIBLE</span>.
              </p>
            </div>
          </div>

          <div className="p-4 bg-bg-tertiary rounded-2xl border border-border-primary">
            <p className="text-xs text-text-muted font-medium">The following will be deleted:</p>
            <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
              {['Candidates', 'Interviews', 'Activity Logs', 'Payments', 'Promises', 'Follow-ups', 'Notifications', 'Applications', 'Resume Requests'].map(item => (
                <li key={item} className="text-[10px] text-text-secondary flex items-center gap-1.5">
                  <div className="w-1 h-1 rounded-full bg-text-muted" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex gap-3">
            <button 
              onClick={() => setIsResetModalOpen(false)}
              className="flex-1 py-3 bg-bg-tertiary text-text-primary font-bold rounded-xl hover:bg-bg-tertiary/80 transition-all"
            >
              Cancel
            </button>
            <button 
              onClick={resetDatabase}
              className="flex-1 py-3 bg-accent-red text-white font-bold rounded-xl hover:bg-accent-red/90 transition-all shadow-lg shadow-accent-red/20"
            >
              Yes, Reset Everything
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
