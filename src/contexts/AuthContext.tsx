import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  onAuthStateChanged, 
  User as FirebaseUser,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail
} from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc, getDocs, query, collection, where, deleteDoc } from 'firebase/firestore';
import { User, Candidate } from '../types';
import { handleFirestoreError, OperationType } from '../services/storage';

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  isLoading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  signup: (email: string, pass: string, displayName: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthReady: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fUser) => {
      setFirebaseUser(fUser);
      
      if (fUser) {
        let fallbackUser: User = {
          id: fUser.uid,
          username: fUser.email?.split('@')[0] || 'user',
          display_name: fUser.displayName || 'User',
          role: fUser.email === 'paramatwork3076@gmail.com' ? 'jpc_sysadmin' : 'jpc_sales',
          candidate_id: null,
          email: fUser.email || undefined,
          created_at: new Date().toISOString()
        };
        if (fallbackUser.username === 'mohit.panchal' || fallbackUser.email === 'mohit.panchal@auriic.co') {
          fallbackUser.role = 'jpc_recruiter';
        }

        // Try getting cached user first in case of network/offline issues
        try {
          const cachedString = localStorage.getItem(`jpc_user_cache_${fUser.uid}`);
          if (cachedString) {
            const cachedUser = JSON.parse(cachedString) as User;
            setUser(cachedUser);
            fallbackUser = cachedUser;
          }
        } catch (e) {
          console.warn('[AuthContext] Failed to parse cached user', e);
        }

        try {
          // Fetch user data from Firestore
          const userDoc = await getDoc(doc(db, 'jpc_users', fUser.uid));
          
          if (userDoc.exists()) {
            let userData = userDoc.data() as User;
            if (userData.username === 'mohit.panchal' || userData.email === 'mohit.panchal@auriic.co') {
              userData.role = 'jpc_recruiter';
            }
            setUser(userData);
            try {
              localStorage.setItem(`jpc_user_cache_${fUser.uid}`, JSON.stringify(userData));
            } catch (storageErr) {
              console.warn('[AuthContext] LocalStorage quota exceeded or disabled', storageErr);
            }
          } else {
            // Check if this email belongs to a candidate
            let candidateData: Candidate | undefined;
            if (fUser.email) {
              try {
                const candidatesSnap = await getDocs(query(collection(db, 'jpc_candidates'), where('email', '==', fUser.email)));
                candidateData = candidatesSnap.docs[0]?.data() as Candidate | undefined;
              } catch (candidateErrSkin) {
                console.warn('[AuthContext] Offline when searching candidates list:', candidateErrSkin);
              }
            }

            const newUser: User = {
              id: fUser.uid,
              username: fUser.email?.split('@')[0] || 'user',
              display_name: fUser.displayName || candidateData?.full_name || 'User',
              role: fUser.email === 'paramatwork3076@gmail.com' ? 'jpc_sysadmin' : (candidateData ? 'candidate' : 'jpc_sales'),
              candidate_id: candidateData?.id || null,
              email: fUser.email || undefined,
              created_at: new Date().toISOString()
            };

            if (newUser.username === 'mohit.panchal' || newUser.email === 'mohit.panchal@auriic.co') {
              newUser.role = 'jpc_recruiter';
            }

            try {
              await setDoc(doc(db, 'jpc_users', fUser.uid), newUser);
              setUser(newUser);
              localStorage.setItem(`jpc_user_cache_${fUser.uid}`, JSON.stringify(newUser));
            } catch (writeError) {
              console.warn('[AuthContext] Failed to register user document offline, using local profile', writeError);
              setUser(newUser);
            }
          }
        } catch (error) {
          console.warn('[AuthContext] DB is unreachable, using offline profile & cached configurations.', error);
          // Don't crash wait loop or throw uncaught errors on initial boot
          setUser(fallbackUser);
        }
      } else {
        setUser(null);
      }
      
      setIsLoading(false);
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    await signOut(auth);
  };

  const login = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const signup = async (email: string, pass: string, displayName: string) => {
    const { user: fUser } = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(fUser, { displayName });
    
    // Check if a user record already exists (created via Generate Access)
    const userDoc = await getDoc(doc(db, 'jpc_users', fUser.uid));
    
    if (!userDoc.exists()) {
      const newUser: User = {
        id: fUser.uid,
        username: email.split('@')[0],
        display_name: displayName,
        role: email === 'paramatwork3076@gmail.com' ? 'jpc_sysadmin' : 'jpc_sales',
        email: email,
        created_at: new Date().toISOString()
      };
      if (newUser.username === 'mohit.panchal' || newUser.email === 'mohit.panchal@auriic.co') {
        newUser.role = 'jpc_recruiter';
      }
      try {
        await setDoc(doc(db, 'jpc_users', fUser.uid), newUser);
        setUser(newUser);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `jpc_users/${fUser.uid}`);
      }
    } else {
      let userData = userDoc.data() as User;
      if (userData.username === 'mohit.panchal' || userData.email === 'mohit.panchal@auriic.co') {
        userData.role = 'jpc_recruiter';
      }
      setUser(userData);
    }
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const value = React.useMemo(() => ({
    user,
    firebaseUser,
    isLoading,
    login,
    signup,
    resetPassword,
    logout,
    isAuthReady
  }), [user, firebaseUser, isLoading, isAuthReady]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
