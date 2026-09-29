import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  Sparkles,
  Edit2,
  Trash2,
  Lock,
  Copy,
  Mail,
  CheckCircle2,
  TrendingUp,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { deleteDoc, doc, setDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  signOut as secondarySignOut,
  updateProfile,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { db, firebaseConfig } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { subscribeToCollection, generateId } from '../../services/storage';
import { User, UserRole, isAurrumRole } from '../../types';
import { Modal } from '../../components/Modal';
import { cn } from '../../lib/utils';
import { AurrumFlowHeader } from './AurrumFlowHeader';

const cleanUserForFirestore = (userObj: Record<string, any>): User => {
  const cleaned: Record<string, any> = {};
  Object.entries(userObj).forEach(([key, value]) => {
    if (value !== undefined) {
      cleaned[key] = value;
    }
  });
  return cleaned as User;
};

const AURRUM_ROLES: {
  value: 'aurrum_admin' | 'aurrum_sales' | 'aurrum_team';
  label: string;
  badge: string;
  description: string;
  modules: string[];
}[] = [
  {
    value: 'aurrum_admin',
    label: 'Aurrum Admin',
    badge: 'Full Aurrum Admin',
    description:
      'Full administrative access to the Aurrum Careers workspace, including managing Aurrum Team members, candidates, sales, and 15-Day Free Trials.',
    modules: [
      'Aurrum Dashboard',
      'Aurrum Candidates & Candidate Journey Dashboard',
      'Aurrum Sales & 15-Day Free Trial Management',
      'Aurrum Interview Support',
      'Aurrum Team & Role Management',
    ],
  },
  {
    value: 'aurrum_sales',
    label: 'Aurrum Sales',
    badge: 'Sales & Conversions',
    description:
      'Access to the Aurrum Careers sales pipeline, candidate intake, 15-Day Free Trial management, follow-ups, and conversions.',
    modules: [
      'Aurrum Dashboard',
      'Aurrum Candidates & Candidate Journey Dashboard',
      'Aurrum Sales & 15-Day Free Trial Management',
      'Aurrum Interview Support',
    ],
  },
  {
    value: 'aurrum_team',
    label: 'Aurrum Team',
    badge: 'Operations & Support',
    description:
      'Access to Aurrum Careers candidate journey tracking, activities, updates, and Interview Support coordination.',
    modules: [
      'Aurrum Dashboard',
      'Aurrum Candidates & Candidate Journey Dashboard',
      'Aurrum Sales',
      'Aurrum Interview Support',
    ],
  },
];

export const AurrumTeam: React.FC = () => {
  const { user, isAuthReady } = useAuth();
  const { showToast } = useToast();

  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);


  // Create / Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);

  // Credentials Modal after creation
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [generatedEmail, setGeneratedEmail] = useState<string | null>(null);

  // Password Reset Modal
  const [userToResetPassword, setUserToResetPassword] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  const [formData, setFormData] = useState<{
    username: string;
    display_name: string;
    role: 'aurrum_admin' | 'aurrum_sales' | 'aurrum_team';
    password: string;
  }>({
    username: '',
    display_name: '',
    role: 'aurrum_sales',
    password: '',
  });

  useEffect(() => {
    if (!isAuthReady) return;
    const unsub = subscribeToCollection<User>('jpc_users', data => {
      setAllUsers(data);
      setIsLoading(false);
    });
    return () => unsub();
  }, [isAuthReady]);

  // Strictly show ONLY Aurrum Careers users (never mix with Auriic CRM users)
  const aurrumMembers = useMemo(() => {
    return allUsers.filter(u => !u.deleted_at && isAurrumRole(u.role));
  }, [allUsers]);

  const canManageAurrumUsers =
    user?.role === 'aurrum_admin' ||
    user?.role === 'administrator' ||
    user?.role === 'jpc_sysadmin' ||
    user?.role === 'jpc_manager';

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.username.trim() || !formData.display_name.trim()) return;
    if (!editingUser && !formData.password) {
      showToast('Password is required for new Aurrum team members', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const cleanUsername = formData.username.trim();
      const email = cleanUsername.includes('@')
        ? cleanUsername
        : `${cleanUsername}@aurrumcareers.com`;

      const isDuplicate = allUsers.some(
        u =>
          !u.deleted_at &&
          u.username.toLowerCase() === cleanUsername.toLowerCase() &&
          (!editingUser || u.id !== editingUser.id)
      );

      if (isDuplicate) {
        showToast('A user with this username/email already exists.', 'error');
        setIsLoading(false);
        return;
      }

      if (!editingUser) {
        const secondaryApp =
          getApps().find(a => a.name === 'SecondaryAurrumTeam') ||
          initializeApp(firebaseConfig, 'SecondaryAurrumTeam');
        const secondaryAuth = getAuth(secondaryApp);

        try {
          const { user: fUser } = await createUserWithEmailAndPassword(
            secondaryAuth,
            email,
            formData.password
          );
          await updateProfile(fUser, { displayName: formData.display_name.trim() });

          const newUser = cleanUserForFirestore({
            id: fUser.uid,
            username: cleanUsername,
            display_name: formData.display_name.trim(),
            email,
            role: formData.role as UserRole,
            leader_id: null,
            candidate_id: null,
            is_on_leave: false,
            created_at: new Date().toISOString(),
          });

          await setDoc(doc(db, 'jpc_users', String(newUser.id)), newUser);
          await secondarySignOut(secondaryAuth);

          setGeneratedEmail(email);
          setGeneratedPassword(formData.password);
          showToast('Aurrum team member account created successfully!', 'success');
        } catch (authError: any) {
          console.error('Aurrum Auth creation error:', authError);
          let message = 'Failed to create Aurrum team member account';

          if (authError.code === 'auth/email-already-in-use') {
            const usersSnap = await getDocs(
              query(collection(db, 'jpc_users'), where('email', '==', email))
            );

            if (!usersSnap.empty) {
              const existingUser = usersSnap.docs[0].data() as User;
              const updatedUser = cleanUserForFirestore({
                ...existingUser,
                username: cleanUsername,
                display_name: formData.display_name.trim(),
                email,
                role: formData.role as UserRole,
                leader_id: null,
                candidate_id: null,
              });
              delete (updatedUser as any).sales_availability_status;

              await setDoc(doc(db, 'jpc_users', String(existingUser.id)), updatedUser);
              showToast('Existing account updated with Aurrum role!', 'success');
              setIsLoading(false);
              setIsModalOpen(false);
              setEditingUser(null);
              setFormData({
                username: '',
                display_name: '',
                role: 'aurrum_sales',
                password: '',
              });
              return;
            } else {
              // Recover orphaned Firebase Auth account if password matches or link by email
              let recoveredUid: string | null = null;
              try {
                const signInResult = await signInWithEmailAndPassword(
                  secondaryAuth,
                  email,
                  formData.password
                );
                recoveredUid = signInResult.user.uid;
                await updateProfile(signInResult.user, {
                  displayName: formData.display_name.trim(),
                });
                await secondarySignOut(secondaryAuth);
              } catch (recoverErr) {
                console.warn('Could not sign in during Auth recovery, creating Firestore profile:', recoverErr);
              }

              const targetUid = recoveredUid || generateId('aur_usr_');
              const recoveredUser = cleanUserForFirestore({
                id: targetUid,
                username: cleanUsername,
                display_name: formData.display_name.trim(),
                email,
                role: formData.role as UserRole,
                leader_id: null,
                candidate_id: null,
                is_on_leave: false,
                created_at: new Date().toISOString(),
              });

              await setDoc(doc(db, 'jpc_users', String(recoveredUser.id)), recoveredUser);
              setGeneratedEmail(email);
              setGeneratedPassword(formData.password);
              showToast('Aurrum team member account linked & created!', 'success');
              setIsLoading(false);
              setIsModalOpen(false);
              setEditingUser(null);
              setFormData({
                username: '',
                display_name: '',
                role: 'aurrum_sales',
                password: '',
              });
              return;
            }
          } else if (authError.code === 'auth/weak-password') {
            message = 'Password should be at least 6 characters.';
          }

          showToast(message, 'error');
          setIsLoading(false);
          return;
        }
      } else {
        const baseEdit: Record<string, any> = {
          ...editingUser,
          username: cleanUsername,
          display_name: formData.display_name.trim(),
          email,
          role: formData.role as UserRole,
          leader_id: null,
          candidate_id: null,
        };
        delete baseEdit.sales_availability_status;
        const updatedUser = cleanUserForFirestore(baseEdit);

        await setDoc(doc(db, 'jpc_users', String(updatedUser.id)), updatedUser);
        showToast('Aurrum team member updated!', 'success');
      }

      setIsModalOpen(false);
      setEditingUser(null);
      setFormData({
        username: '',
        display_name: '',
        role: 'aurrum_sales',
        password: '',
      });
    } catch (err) {
      console.error('Save Aurrum user error:', err);
      showToast('Failed to save Aurrum team member', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingUser) return;
    setIsLoading(true);
    try {
      await deleteDoc(doc(db, 'jpc_users', String(deletingUser.id)));
      showToast('Aurrum team member removed', 'success');
      setDeletingUser(null);
    } catch (err) {
      console.error('Delete Aurrum user error:', err);
      showToast('Failed to remove Aurrum team member', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userToResetPassword || !newPassword) return;
    if (newPassword.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }

    setIsResettingPassword(true);
    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/admin/reset-user-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          targetUid: userToResetPassword.id,
          newPassword,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        showToast(`Password reset for ${userToResetPassword.display_name}`, 'success');
        setUserToResetPassword(null);
        setNewPassword('');
      } else {
        showToast(data.error || 'Failed to reset password', 'error');
      }
    } catch (err) {
      console.error('Reset password error:', err);
      showToast('Failed to reset password', 'error');
    } finally {
      setIsResettingPassword(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16">
      {/* Credentials Modal after creating a new Aurrum user */}
      <AnimatePresence>
        {generatedPassword && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-bg-secondary border border-amber-500/30 rounded-3xl shadow-2xl max-w-md w-full p-6 sm:p-8 text-center space-y-6"
            >
              <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center mx-auto">
                <Sparkles className="w-8 h-8 text-amber-500" />
              </div>
              <div>
                <h3 className="text-2xl font-black text-text-primary">
                  Aurrum Account Created!
                </h3>
                <p className="text-xs text-text-secondary mt-1">
                  Share these login credentials with the new Aurrum Careers team member.
                </p>
              </div>

              <div className="space-y-3 text-left">
                <div className="p-4 bg-bg-tertiary rounded-2xl border border-border-primary">
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-1">
                    Login Email
                  </p>
                  <p className="text-sm font-mono text-text-primary break-all">
                    {generatedEmail}
                  </p>
                </div>
                <div className="p-4 bg-bg-tertiary rounded-2xl border border-border-primary relative">
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-1">
                    Password
                  </p>
                  <p className="text-sm font-mono text-text-primary">{generatedPassword}</p>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedPassword);
                      showToast('Password copied!', 'success');
                    }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-text-muted hover:text-amber-500 transition-colors cursor-pointer"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    const signupUrl = window.location.origin;
                    const message = `Welcome to Aurrum Careers!\n\nLogin at: ${signupUrl}\nEmail: ${generatedEmail}\nPassword: ${generatedPassword}`;
                    navigator.clipboard.writeText(message);
                    showToast('Full Aurrum invite copied!', 'success');
                  }}
                  className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-2xl hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Copy className="w-4 h-4" />
                  Copy Aurrum Invite
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGeneratedPassword(null);
                    setGeneratedEmail(null);
                  }}
                  className="w-full py-3 bg-bg-tertiary text-text-primary font-bold rounded-2xl hover:bg-bg-tertiary/80 transition-all cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="mt-8">
        <AurrumFlowHeader
          activeStep="dashboard"
          title="Aurrum Team Directory"
          subtitle="Manage your Aurrum Careers dedicated team members."
          actions={
            canManageAurrumUsers ? (
              <button
                type="button"
                onClick={() => {
                  setEditingUser(null);
                  setFormData({
                    username: '',
                    display_name: '',
                    role: 'aurrum_sales',
                    password: '',
                  });
                  setIsModalOpen(true);
                }}
                className="px-5 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-black shadow-lg shadow-amber-500/20 hover:bg-amber-600 transition-all flex items-center gap-2 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                New Member
              </button>
            ) : undefined
          }
        />

        {/* Unified Table View */}
        <div className="bg-bg-secondary border border-border-primary rounded-3xl overflow-hidden shadow-sm mt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-bg-tertiary border-b border-border-primary">
                  <th className="p-4 text-xs font-black text-text-muted uppercase tracking-widest">Member</th>
                  <th className="p-4 text-xs font-black text-text-muted uppercase tracking-widest">Role</th>
                  <th className="p-4 text-xs font-black text-text-muted uppercase tracking-widest">Contact</th>
                  <th className="p-4 text-xs font-black text-text-muted uppercase tracking-widest">Status</th>
                  {canManageAurrumUsers && (
                    <th className="p-4 text-xs font-black text-text-muted uppercase tracking-widest text-right">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-primary">
                {aurrumMembers.map(member => {
                  const roleDef = AURRUM_ROLES.find(r => r.value === member.role) || AURRUM_ROLES[2];
                  return (
                    <tr key={member.id} className="hover:bg-bg-tertiary/50 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center font-black text-sm shrink-0">
                            {(member.display_name || 'A')
                              .split(' ')
                              .filter(Boolean)
                              .map(n => n[0])
                              .join('')
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>
                          <div>
                            <p className="font-black text-text-primary">{member.display_name}</p>
                            <p className="text-xs text-text-secondary">@{member.username.split('@')[0]}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] font-black uppercase tracking-wider">
                          <ShieldCheck className="w-3 h-3" />
                          {roleDef.label}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2 text-text-secondary text-sm">
                          <Mail className="w-3.5 h-3.5" />
                          {member.email || member.username}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase tracking-wider">
                          <CheckCircle2 className="w-3 h-3" />
                          Active
                        </span>
                      </td>
                      {canManageAurrumUsers && (
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingUser(member);
                                setFormData({
                                  username: member.username,
                                  display_name: member.display_name,
                                  role: (member.role as
                                    | 'aurrum_admin'
                                    | 'aurrum_sales'
                                    | 'aurrum_team') || 'aurrum_sales',
                                  password: '',
                                });
                                setIsModalOpen(true);
                              }}
                              className="p-2 text-text-muted hover:text-amber-500 transition-colors cursor-pointer bg-bg-tertiary rounded-xl border border-transparent hover:border-amber-500/30"
                              title="Edit Member"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setUserToResetPassword(member);
                                setNewPassword('');
                              }}
                              className="p-2 text-text-muted hover:text-amber-500 transition-colors cursor-pointer bg-bg-tertiary rounded-xl border border-transparent hover:border-amber-500/30"
                              title="Reset Password"
                            >
                              <Lock className="w-4 h-4" />
                            </button>
                            {member.id !== user?.id && (
                              <button
                                type="button"
                                onClick={() => setDeletingUser(member)}
                                className="p-2 text-text-muted hover:text-rose-500 transition-colors cursor-pointer bg-bg-tertiary rounded-xl border border-transparent hover:border-rose-500/30"
                                title="Remove Member"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {aurrumMembers.length === 0 && (
              <div className="p-12 text-center text-text-secondary">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>No Aurrum team members found.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}

      <Modal
        isOpen={!!deletingUser}
        onClose={() => setDeletingUser(null)}
        title="Remove Aurrum Team Member"
      >
        <div className="space-y-5">
          <p className="text-sm text-text-secondary">
            Are you sure you want to remove{' '}
            <strong className="text-text-primary">{deletingUser?.display_name}</strong> from the
            Aurrum Careers team?
          </p>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setDeletingUser(null)}
              className="px-4 py-2 rounded-xl bg-bg-tertiary text-text-secondary text-xs font-bold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="px-5 py-2 rounded-xl bg-rose-500 text-white text-xs font-bold hover:bg-rose-600 transition-all cursor-pointer"
            >
              Remove Member
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
