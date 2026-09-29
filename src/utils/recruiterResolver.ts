import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Candidate, User, UserRole } from '../types';

export interface DeletedUserInfo {
  id: string;
  display_name: string;
  username: string;
  email?: string;
  role: UserRole;
  deleted_at?: string;
}

/**
 * Recovered deleted recruiter / staff accounts from historical notifications,
 * activity logs, and Firebase Authentication records in production-placify.
 */
export const KNOWN_DELETED_USERS: Record<string, DeletedUserInfo> = {
  PWoGAADbB6dVe44h5qUeIPoAFvw1: {
    id: 'PWoGAADbB6dVe44h5qUeIPoAFvw1',
    display_name: 'Deep Kansara',
    username: 'deep.kansara',
    email: 'deep.kansara@auriic.co',
    role: 'jpc_recruiter',
  },
  cwHGDcjZ2dcBtGv1W6862Vs8Ums2: {
    id: 'cwHGDcjZ2dcBtGv1W6862Vs8Ums2',
    display_name: 'Vansh Patel',
    username: 'vansh.patel',
    email: 'vansh.patel@auriic.co',
    role: 'jpc_recruiter',
  },
  MPq2NPNbsse7BhKmqA50WRQywWj1: {
    id: 'MPq2NPNbsse7BhKmqA50WRQywWj1',
    display_name: 'Avantika Gidhavani',
    username: 'avantika.gidhavani',
    email: 'avantika.gidhavani@auriic.co',
    role: 'jpc_recruiter',
  },
  ybkmt69oaWSTWomgsPsugyq7hfm1: {
    id: 'ybkmt69oaWSTWomgsPsugyq7hfm1',
    display_name: 'Juned Khan',
    username: 'juned.khan@auriic.co',
    email: 'juned.khan@auriic.co',
    role: 'jpc_recruiter',
  },
  LRmwQVJ9I0el2aaJqtbIHW9f5Ig2: {
    id: 'LRmwQVJ9I0el2aaJqtbIHW9f5Ig2',
    display_name: 'Manav Nagar',
    username: 'manav.nagar',
    email: 'manav.nagar@auriic.co',
    role: 'jpc_recruiter',
  },
  tEb4PWkuhFQvs3WqBhlUFAYVx5S2: {
    id: 'tEb4PWkuhFQvs3WqBhlUFAYVx5S2',
    display_name: 'Siddharth Kamdar',
    username: 'siddharth.kamdar',
    email: 'siddharth.kamdar@auriic.co',
    role: 'jpc_recruiter',
  },
  FD7Zrqu2uTMOiHgvT9wTLXirO1t1: {
    id: 'FD7Zrqu2uTMOiHgvT9wTLXirO1t1',
    display_name: 'Snohi Vairagi',
    username: 'snohi.vairagi',
    email: 'snohi.vairagi@auriic.co',
    role: 'jpc_recruiter',
  },
  E7i4sMzmp4ddhA2BOmDDExmP4wF2: {
    id: 'E7i4sMzmp4ddhA2BOmDDExmP4wF2',
    display_name: 'Snohi Vairagi',
    username: 'snohi.vairagi@auriic.co',
    email: 'snohi.vairagi@auriic.co',
    role: 'jpc_recruiter',
  },
  m5q7iWgp6ZZ5hhxaFStXarkOUS42: {
    id: 'm5q7iWgp6ZZ5hhxaFStXarkOUS42',
    display_name: 'Mohit Panchal',
    username: 'mohit.panchal',
    email: 'mohit.panchal@auriic.co',
    role: 'jpc_recruiter',
  },
};

// Runtime cache of dynamically resolved deleted users (from jpc_settings/deleted_users or /api/users/resolve-deleted)
const dynamicDeletedUsers: Record<string, DeletedUserInfo> = { ...KNOWN_DELETED_USERS };
let settingsLoaded = false;
let loadingPromise: Promise<void> | null = null;
const pendingUids = new Set<string>();
let resolveTimer: any = null;

export function isPlaceholderRecruiterName(name?: string | null): boolean {
  if (!name) return true;
  const trimmed = name.trim();
  if (!trimmed) return true;
  if (trimmed === 'Previous Recruiter' || trimmed === 'Unknown Recruiter' || trimmed === 'Unassigned') return true;
  if (/^Recruiter\s*\(/i.test(trimmed)) return true;
  return false;
}

export async function ensureDeletedUsersLoaded(): Promise<void> {
  if (settingsLoaded) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      const snap = await getDoc(doc(db, 'jpc_settings', 'deleted_users'));
      if (snap.exists()) {
        const data = snap.data();
        const map = data?.users || data || {};
        Object.entries(map).forEach(([uid, info]: [string, any]) => {
          if (info && typeof info === 'object' && info.display_name && !isPlaceholderRecruiterName(info.display_name)) {
            dynamicDeletedUsers[uid] = {
              id: uid,
              display_name: info.display_name,
              username: info.username || info.email || uid,
              email: info.email,
              role: info.role || 'jpc_recruiter',
              deleted_at: info.deleted_at,
            };
          }
        });
      }
      settingsLoaded = true;
    } catch {
      // Ignore offline/permission errors; KNOWN_DELETED_USERS still works
    } finally {
      loadingPromise = null;
    }
  })();

  return loadingPromise;
}

function queueServerResolve(uid: string) {
  if (!uid || uid === 'unknown' || uid === 'unassigned' || dynamicDeletedUsers[uid]) return;
  pendingUids.add(uid);
  if (resolveTimer) return;
  resolveTimer = setTimeout(async () => {
    resolveTimer = null;
    const uidsToResolve = Array.from(pendingUids);
    pendingUids.clear();
    if (uidsToResolve.length === 0) return;

    await ensureDeletedUsersLoaded();
    const stillMissing = uidsToResolve.filter(id => !dynamicDeletedUsers[id]);
    if (stillMissing.length === 0) return;

    try {
      const res = await fetch('/api/users/resolve-deleted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uids: stillMissing }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.resolved && typeof data.resolved === 'object') {
          Object.entries(data.resolved).forEach(([id, info]: [string, any]) => {
            if (info?.display_name && !isPlaceholderRecruiterName(info.display_name)) {
              dynamicDeletedUsers[id] = {
                id,
                display_name: info.display_name,
                username: info.username || info.email || id,
                email: info.email,
                role: info.role || 'jpc_recruiter',
              };
            }
          });
        }
      }
    } catch {
      // Ignore network errors
    }
  }, 300);
}

/**
 * Archive a user's display_name into jpc_settings/deleted_users before deleting from jpc_users
 * so their name is never lost on historical applications or candidate assignments.
 */
export async function archiveDeletedUser(user: User): Promise<void> {
  if (!user?.id) return;
  const uid = String(user.id);
  const entry: DeletedUserInfo = {
    id: uid,
    display_name: user.display_name || user.username || uid,
    username: user.username || uid,
    email: user.email,
    role: user.role || 'jpc_recruiter',
    deleted_at: new Date().toISOString(),
  };
  dynamicDeletedUsers[uid] = entry;

  try {
    const ref = doc(db, 'jpc_settings', 'deleted_users');
    const snap = await getDoc(ref);
    const existing = snap.exists() ? (snap.data()?.users || {}) : {};
    await setDoc(
      ref,
      {
        users: {
          ...existing,
          ...KNOWN_DELETED_USERS,
          [uid]: entry,
        },
        updated_at: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('[recruiterResolver] Failed to archive deleted user in jpc_settings/deleted_users:', err);
  }
}

/**
 * Resolves a recruiter ID to their real display name across:
 * 1. Active jpc_users (team)
 * 2. Archived / known deleted users (KNOWN_DELETED_USERS + jpc_settings/deleted_users)
 * 3. Candidate's previous_recruiters history
 * 4. All candidates' previous_recruiters history
 */
export function resolveRecruiterName(
  recId: string | number | null | undefined,
  users?: User[] | null,
  candidateObj?: Candidate | null,
  allCandidates?: Candidate[] | null,
  fallbackLabel: string = 'Previous Recruiter'
): string {
  if (!recId || recId === 'unassigned' || recId === 'unknown') return 'Unassigned';
  const idStr = String(recId).trim();
  if (!idStr) return 'Unassigned';

  // Trigger background load of jpc_settings/deleted_users once
  if (!settingsLoaded && !loadingPromise) {
    ensureDeletedUsersLoaded();
  }

  // 1. Active team members
  if (Array.isArray(users) && users.length > 0) {
    const matchedUser = users.find(u => String(u.id) === idStr);
    if (matchedUser) {
      const name = matchedUser.display_name || matchedUser.username;
      if (name) return name;
    }
  }

  // 2. Known / dynamically resolved deleted users
  const deletedInfo = dynamicDeletedUsers[idStr] || KNOWN_DELETED_USERS[idStr];
  if (deletedInfo?.display_name && !isPlaceholderRecruiterName(deletedInfo.display_name)) {
    return deletedInfo.display_name;
  }

  // 3. Candidate's own previous_recruiters array
  if (Array.isArray(candidateObj?.previous_recruiters)) {
    const matchedPrev = candidateObj.previous_recruiters.find(p => String(p.recruiter_id) === idStr);
    if (matchedPrev?.recruiter_name && !isPlaceholderRecruiterName(matchedPrev.recruiter_name)) {
      return matchedPrev.recruiter_name;
    }
  }

  // 4. Search across all candidates' previous_recruiters arrays if provided
  if (Array.isArray(allCandidates)) {
    for (const c of allCandidates) {
      if (Array.isArray(c.previous_recruiters)) {
        const matchedPrev = c.previous_recruiters.find(p => String(p.recruiter_id) === idStr);
        if (matchedPrev?.recruiter_name && !isPlaceholderRecruiterName(matchedPrev.recruiter_name)) {
          return matchedPrev.recruiter_name;
        }
      }
    }
  }

  // 5. Queue server lookup via Firebase Admin Auth / Notifications for unknown UIDs
  queueServerResolve(idStr);

  return fallbackLabel;
}

/**
 * Returns a User object for a recruiter ID (either from active users or a synthetic User for deleted recruiters).
 */
export function resolveRecruiterUser(
  recId: string | number | null | undefined,
  users?: User[] | null,
  candidateObj?: Candidate | null,
  allCandidates?: Candidate[] | null
): User | undefined {
  if (!recId || recId === 'unassigned' || recId === 'unknown') return undefined;
  const idStr = String(recId).trim();
  if (!idStr) return undefined;

  if (Array.isArray(users)) {
    const active = users.find(u => String(u.id) === idStr);
    if (active) return active;
  }

  const deletedInfo = dynamicDeletedUsers[idStr] || KNOWN_DELETED_USERS[idStr];
  if (deletedInfo) {
    return {
      id: deletedInfo.id,
      display_name: deletedInfo.display_name,
      username: deletedInfo.username,
      email: deletedInfo.email,
      role: deletedInfo.role,
      created_at: deletedInfo.deleted_at || '',
    };
  }

  const resolvedName = resolveRecruiterName(idStr, users, candidateObj, allCandidates, '');
  if (resolvedName && !isPlaceholderRecruiterName(resolvedName)) {
    return {
      id: idStr,
      display_name: resolvedName,
      username: resolvedName.toLowerCase().replace(/\s+/g, '.'),
      role: 'jpc_recruiter',
      created_at: '',
    };
  }

  return undefined;
}
