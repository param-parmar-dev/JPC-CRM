import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

export const app = initializeApp(firebaseConfig);

const customDbId = (firebaseConfig as any).firestoreDatabaseId;

let firestoreInstance;
try {
  if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
    firestoreInstance = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    }, customDbId);
  } else {
    firestoreInstance = customDbId ? getFirestore(app, customDbId) : getFirestore(app);
  }
} catch (e) {
  // If already initialized or unsupported environment, fallback safely
  firestoreInstance = customDbId ? getFirestore(app, customDbId) : getFirestore(app);
}

export const db = firestoreInstance;
export const auth = getAuth(app);

export { firebaseConfig };

