import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  getFirestore 
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

const firestoreDbId = (firebaseConfig as any).firestoreDatabaseId;

let firestoreInstance;
try {
  firestoreInstance = initializeFirestore(
    app,
    {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    },
    firestoreDbId
  );
} catch (e) {
  // Fallback if initializeFirestore was already called or in environments lacking IndexedDB
  firestoreInstance = firestoreDbId ? getFirestore(app, firestoreDbId) : getFirestore(app);
}

export const db = firestoreInstance;
export const auth = getAuth(app);

export { firebaseConfig };


