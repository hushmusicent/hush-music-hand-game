import bcrypt from 'bcryptjs';
import { User, Room, ChatMessage, Friend, FriendRequest, GameId } from '../types';
import { Storage, STARTING_POINTS, CPU_PAYOUTS, DAILY_BONUS, DAILY_INTERVAL_MS } from './storage';
import { Sound } from './sound';
import {
  auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  signOut,
  updateProfile,
  deleteUser,
  saveRoomToRTDB,
  getRoomFromRTDB,
  getOpenRoomsFromRTDB,
  deleteRoomFromRTDB,
  saveRoomToFirestore,
  getRoomFromFirestore,
  getOpenRoomsFromFirestore,
  deleteRoomFromFirestore,
  subscribeToRoom,
  savePlayerToFirestore,
  getPlayerFromFirestore,
  getAllPlayersFromFirestore,
  findLegacyPlayerDocForMigration,
  deletePlayerFromFirestore,
  savePlayerToRTDB,
  getPlayerFromRTDB,
  getAllPlayersFromRTDB,
  deletePlayerFromRTDB,
  saveFriendRequestToRTDB,
  getFriendRequestsFromRTDB,
  removeFriendRequestFromRTDB,
  saveSentRequestToRTDB,
  getSentRequestsFromRTDB,
  removeSentRequestFromRTDB,
  saveFriendsToRTDB,
  getFriendsFromRTDB,
  saveChatMessageToRTDB,
  getChatMessagesFromRTDB,
  subscribeToChat,
} from '../firebase';

let authFlowActive = false;

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    } catch {}
  }
  return headers;
}

function formatFirebaseAuthError(err: any, fallback: string): string {
  const code = err?.code || '';
  if (code === 'auth/email-already-in-use') return 'This email address is already registered. Please log in instead.';
  if (code === 'auth/invalid-email') return 'Please enter a valid email address.';
  if (code === 'auth/weak-password') return 'Password must be at least 6 characters long.';
  if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
    return 'Incorrect email or password. Please try again.';
  }
  if (code === 'auth/too-many-requests') return 'Too many login attempts. Please wait a moment and try again.';
  if (code === 'auth/admin-restricted-operation' || code === 'auth/operation-not-allowed') {
    return 'Guest anonymous sign-in is disabled in Firebase Console. Enable the Anonymous provider under Authentication → Sign-in method, or sign in with Email/Google.';
  }
  return err?.message || fallback;
}

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  appId: string;
}

export interface SystemConfig {
  firebase: FirebaseConfig;
}

const DEFAULT_CONFIG: SystemConfig = {
  firebase: {
    apiKey: 'AIzaSyAhT_oPTtMTlUvHaSOf7zWvnUwTGyJf4sk',
    authDomain: 'project-556676b3-bbce-4e02-8ce.firebaseapp.com',
    databaseURL: '',
    projectId: 'project-556676b3-bbce-4e02-8ce',
    appId: '1:1043689485585:web:a96258740de6856c5f88b0',
  },
};

export const Backend = {
  getConfig(): SystemConfig {
    try {
      const stored = localStorage.getItem('hm_sys_config');
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          firebase: {
            apiKey: parsed.firebase?.apiKey?.trim() || DEFAULT_CONFIG.firebase.apiKey,
            authDomain: parsed.firebase?.authDomain?.trim() || DEFAULT_CONFIG.firebase.authDomain,
            databaseURL: parsed.firebase?.databaseURL?.trim() || '',
            projectId: parsed.firebase?.projectId?.trim() || DEFAULT_CONFIG.firebase.projectId,
            appId: parsed.firebase?.appId?.trim() || DEFAULT_CONFIG.firebase.appId,
          },
        };
      }
      return DEFAULT_CONFIG;
    } catch {
      return DEFAULT_CONFIG;
    }
  },

  saveConfig(cfg: SystemConfig) {
    localStorage.setItem('hm_sys_config', JSON.stringify(cfg));
  },

  isFirebaseConfigured(): boolean {
    const cfg = this.getConfig().firebase;
    return !!(cfg.apiKey && cfg.projectId);
  },

  isAuthFlowActive(): boolean {
    return authFlowActive;
  },

  // Auth Operations (Firebase Auth primary)
  async signup(username: string, email: string, password: string, avatar?: string): Promise<User> {
    const cleanUser = username.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password ? password.trim() : '';

    if (!cleanUser || cleanUser.length < 2) {
      throw new Error('Username must be at least 2 characters');
    }
    if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      throw new Error('Please enter a valid email address');
    }
    if (!cleanPassword || cleanPassword.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }

    authFlowActive = true;
    try {
      // Check username/email availability on server before creating Firebase Auth account
      try {
        const availRes = await fetch('/api/users/check-availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: cleanUser, email: cleanEmail }),
        });
        if (availRes.status === 409) {
          const availData = await availRes.json().catch(() => ({}));
          throw new Error(availData.error || 'Username or email is already registered');
        }
      } catch (availErr: any) {
        if (availErr?.message && (availErr.message.includes('taken') || availErr.message.includes('registered'))) {
          throw availErr;
        }
      }

      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPassword);
      await updateProfile(cred.user, { displayName: cleanUser }).catch(() => {});

      const newUser: User = {
        uid: cred.user.uid,
        username: cleanUser,
        email: cleanEmail,
        points: STARTING_POINTS,
        wins: {},
        lastDaily: 0,
        avatar: avatar || '🎧',
        lastSeen: Date.now(),
      };

      // Write ONLY public-safe fields to Firestore under /users/{uid}
      await savePlayerToFirestore(newUser);

      // Register non-password metadata with Express server
      try {
        const headers = await getAuthHeaders();
        await fetch('/api/users/signup', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            uid: cred.user.uid,
            username: cleanUser,
            email: cleanEmail,
            avatar: newUser.avatar,
          }),
        });
      } catch {}

      Storage.saveUser(newUser);
      Storage.setSession(newUser);
      return newUser;
    } catch (err: any) {
      throw new Error(formatFirebaseAuthError(err, 'Signup failed'));
    } finally {
      authFlowActive = false;
    }
  },

  async login(emailOrUser: string, password?: string): Promise<User> {
    const clean = emailOrUser.trim();
    const cleanPassword = password ? password.trim() : '';
    if (!clean) {
      throw new Error('Please enter your username or email');
    }
    if (!cleanPassword) {
      throw new Error('Please enter your password');
    }

    authFlowActive = true;
    try {
      let resolvedEmail = clean.includes('@') ? clean.toLowerCase() : '';
      let needsMigration = false;
      let legacyUid: string | null = null;
      let serverUser: Partial<User> | null = null;

      // 1. Check server store for username lookup & legacy bcrypt verification (untouched when /api server responds)
      let serverResponded = false;
      let serverFailed = false;
      try {
        const res = await fetch('/api/users/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: clean, password: cleanPassword }),
        });
        const data = await res.json().catch(() => null);
        const isValidServerJson =
          data && typeof data === 'object' && ('ok' in data || 'error' in data || 'notFound' in data);

        if (res.ok && data?.ok) {
          serverResponded = true;
          resolvedEmail = data.email || resolvedEmail;
          needsMigration = !!data.needsMigration;
          legacyUid = data.legacyUid || data.user?.uid || null;
          serverUser = data.user || null;
        } else if ((res.status === 401 || res.status === 400) && isValidServerJson) {
          // Legacy bcrypt password check failed on server -> reject immediately
          throw new Error(data.error || 'Incorrect password. Please try again.');
        } else if (res.status === 404 && data?.notFound) {
          if (!clean.includes('@')) {
            throw new Error(data.error || 'Account not found. Please check your credentials or sign up.');
          }
          serverResponded = true;
        } else {
          // No /api server (static HTML fallback, 404/405/5xx without Express JSON)
          serverFailed = true;
        }
      } catch (fetchErr: any) {
        if (
          fetchErr?.message &&
          !fetchErr.message.includes('Failed to fetch') &&
          !fetchErr.message.includes('NetworkError') &&
          !fetchErr.message.includes('Network request failed') &&
          !fetchErr.message.includes('Load failed') &&
          !fetchErr.message.includes('ERR_') &&
          !fetchErr.message.toLowerCase().includes('fetch') &&
          !fetchErr.message.toLowerCase().includes('abort')
        ) {
          throw fetchErr;
        }
        serverFailed = true;
      }

      // Helper for no-server / phone-app client-side legacy lookup & bcrypt verification
      let signedInAnonForLookup = false;
      const cleanupTempAnon = async () => {
        if (signedInAnonForLookup && auth.currentUser?.isAnonymous) {
          const anonUser = auth.currentUser;
          signedInAnonForLookup = false;
          await deleteUser(anonUser).catch(async () => {
            await signOut(auth).catch(() => {});
          });
        }
      };

      const lookupAndVerifyLegacyFromFirestore = async (requireHash: boolean): Promise<boolean> => {
        if (!auth.currentUser) {
          try {
            await signInAnonymously(auth);
            signedInAnonForLookup = true;
          } catch (anonErr: any) {
            throw new Error(
              formatFirebaseAuthError(anonErr, 'Unable to sign in anonymously for account lookup.')
            );
          }
        }

        const legacyDoc = await findLegacyPlayerDocForMigration(clean);
        if (!legacyDoc) {
          return false;
        }

        if (legacyDoc.passwordHash) {
          let passwordMatches = false;
          try {
            passwordMatches = bcrypt.compareSync(cleanPassword, legacyDoc.passwordHash);
          } catch {
            passwordMatches = false;
          }
          if (!passwordMatches) {
            await cleanupTempAnon();
            throw new Error('Incorrect email or password');
          }

          const handle =
            (legacyDoc.username || 'player').toLowerCase().replace(/[^a-z0-9]/g, '') || 'player';
          const docEmail =
            legacyDoc.email && legacyDoc.email.includes('@')
              ? legacyDoc.email.trim().toLowerCase()
              : `${handle}@hushmusic.internal`;

          resolvedEmail = docEmail;
          needsMigration = true;
          legacyUid = legacyDoc.uid;
          serverUser = {
            uid: legacyDoc.uid,
            username: legacyDoc.username,
            email: docEmail,
            points: legacyDoc.points,
            wins: legacyDoc.wins,
            lastDaily: legacyDoc.lastDaily,
            avatar: legacyDoc.avatar,
          };
          return true;
        }

        if (requireHash) {
          return false;
        }

        if (!legacyDoc.email) {
          await cleanupTempAnon();
          throw new Error(
            'This account has already been migrated. Please log in with your email address.'
          );
        }

        resolvedEmail = legacyDoc.email.trim().toLowerCase();
        legacyUid = legacyDoc.uid;
        serverUser = {
          uid: legacyDoc.uid,
          username: legacyDoc.username,
          email: resolvedEmail,
          points: legacyDoc.points,
          wins: legacyDoc.wins,
          lastDaily: legacyDoc.lastDaily,
          avatar: legacyDoc.avatar,
        };
        return true;
      };

      // Client-side username lookup fallback when /api/users/login is unavailable
      if (serverFailed && !clean.includes('@')) {
        const matched = await lookupAndVerifyLegacyFromFirestore(false);
        if (!matched) {
          await cleanupTempAnon();
          throw new Error('Account not found. Please check your credentials or sign up.');
        }
      }

      if (!resolvedEmail) {
        await cleanupTempAnon();
        throw new Error('Account not found. Please enter your registered email address or sign up.');
      }

      // Clean up temporary anonymous lookup user before permanent Email/Password auth
      await cleanupTempAnon();

      // 2. Authenticate with Firebase Auth (or migrate verified legacy account into Firebase Auth)
      let credUser = auth.currentUser && !auth.currentUser.isAnonymous ? auth.currentUser : null;
      const createMigratedFirebaseUser = async () => {
        try {
          const created = await createUserWithEmailAndPassword(auth, resolvedEmail, cleanPassword);
          credUser = created.user;
          if (serverUser?.username) {
            await updateProfile(credUser, { displayName: serverUser.username }).catch(() => {});
          }
        } catch (createErr: any) {
          await cleanupTempAnon();
          if (createErr?.code === 'auth/email-already-in-use') {
            throw new Error(
              'An account with this email already exists in Firebase Auth with a different password.'
            );
          }
          if (createErr?.code === 'auth/weak-password') {
            throw new Error(
              'Password must be at least 6 characters for Firebase Auth migration. Please use Forgot Password or contact support.'
            );
          }
          throw new Error(formatFirebaseAuthError(createErr, 'Failed to migrate account'));
        }
      };

      if (needsMigration) {
        try {
          const cred = await signInWithEmailAndPassword(auth, resolvedEmail, cleanPassword);
          credUser = cred.user;
          if (serverUser?.username && !credUser.displayName) {
            await updateProfile(credUser, { displayName: serverUser.username }).catch(() => {});
          }
        } catch (signInErr: any) {
          const code = signInErr?.code || '';
          if (
            code === 'auth/user-not-found' ||
            code === 'auth/invalid-credential' ||
            code === 'auth/invalid-login-credentials'
          ) {
            await createMigratedFirebaseUser();
          } else {
            await cleanupTempAnon();
            throw new Error(formatFirebaseAuthError(signInErr, 'Sign-in failed'));
          }
        }
      } else {
        try {
          const cred = await signInWithEmailAndPassword(auth, resolvedEmail, cleanPassword);
          credUser = cred.user;
        } catch (signInErr: any) {
          const code = signInErr?.code || '';
          const canTryClientEmailMigration =
            serverFailed &&
            (code === 'auth/user-not-found' ||
              code === 'auth/invalid-credential' ||
              code === 'auth/invalid-login-credentials');

          if (canTryClientEmailMigration) {
            const matched = await lookupAndVerifyLegacyFromFirestore(true);
            await cleanupTempAnon();
            if (matched && needsMigration) {
              await createMigratedFirebaseUser();
            } else {
              throw new Error('Incorrect email or password');
            }
          } else {
            await cleanupTempAnon();
            throw new Error(
              formatFirebaseAuthError(signInErr, 'Incorrect email or password. Please try again.')
            );
          }
        }
      }

      if (!credUser || credUser.isAnonymous) {
        await cleanupTempAnon();
        throw new Error('Authentication failed.');
      }

      // 3. Load existing Firestore data (both under new Firebase Auth UID and legacy UID if different)
      const [fsUser, legacyFsUser] = await Promise.all([
        getPlayerFromFirestore(credUser.uid),
        legacyUid && legacyUid !== credUser.uid ? getPlayerFromFirestore(legacyUid) : Promise.resolve(null),
      ]);

      const mergedWins = {
        ...(serverUser?.wins || {}),
        ...(legacyFsUser?.wins || {}),
        ...(fsUser?.wins || {}),
      };
      const mergedPoints =
        typeof fsUser?.points === 'number'
          ? fsUser.points
          : typeof legacyFsUser?.points === 'number'
          ? legacyFsUser.points
          : typeof serverUser?.points === 'number'
          ? serverUser.points
          : STARTING_POINTS;

      const finalUser: User = {
        uid: credUser.uid,
        username:
          fsUser?.username ||
          legacyFsUser?.username ||
          serverUser?.username ||
          credUser.displayName ||
          resolvedEmail.split('@')[0] ||
          'Player',
        email: credUser.email || resolvedEmail,
        points: mergedPoints,
        wins: mergedWins,
        lastDaily: Math.max(fsUser?.lastDaily || 0, legacyFsUser?.lastDaily || 0, serverUser?.lastDaily || 0),
        avatar: fsUser?.avatar || legacyFsUser?.avatar || serverUser?.avatar || '🎧',
        lastSeen: Date.now(),
      };

      // 4. Write clean public-safe doc to Firestore (overwriting & removing any passwordHash/email fields)
      await savePlayerToFirestore(finalUser);

      // 5. Complete migration on server (removes passwordHash & re-keys legacyUid -> credUser.uid)
      if (serverResponded || needsMigration) {
        try {
          const headers = await getAuthHeaders();
          await fetch('/api/users/complete-migration', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              legacyUid,
              username: finalUser.username,
              avatar: finalUser.avatar,
              points: finalUser.points,
              wins: finalUser.wins,
              lastDaily: finalUser.lastDaily,
            }),
          });
        } catch {}
      }

      Storage.saveUser(finalUser);
      Storage.setSession(finalUser);
      return finalUser;
    } finally {
      authFlowActive = false;
    }
  },

  async requestPasswordRecovery(identifier: string): Promise<{
    username: string;
    email?: string;
    maskedEmail?: string;
    recoveryCode: string;
    expiresInSeconds: number;
    message: string;
  }> {
    const clean = identifier.trim();
    if (!clean) {
      throw new Error('Please enter your username or email address.');
    }

    const res = await fetch('/api/users/recover/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: clean }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to request password recovery.');
    }
    return data;
  },

  async resetPassword(identifier: string, code: string, newPassword: string): Promise<User> {
    const clean = identifier.trim();
    const cleanCode = code.trim();
    const cleanPass = newPassword.trim();

    if (!cleanPass || cleanPass.length < 6) {
      throw new Error('New password must be at least 6 characters long.');
    }

    const res = await fetch('/api/users/recover/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: clean, code: cleanCode, newPassword: cleanPass }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to reset password.');
    }
    const emailToUse = data.user?.email || (clean.includes('@') ? clean : '');
    if (emailToUse) {
      return this.login(emailToUse, cleanPass);
    }
    const user: User = data.user;
    Storage.saveUser(user);
    Storage.setSession(user);
    return user;
  },

  async googleAuth(uid: string, displayName: string, email: string, avatar?: string): Promise<User> {
    const cleanEmail = email.trim().toLowerCase();
    authFlowActive = true;
    try {
      const existingFs = await getPlayerFromFirestore(uid);
      let serverUser: Partial<User> | null = null;
      try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/users/google-auth', {
          method: 'POST',
          headers,
          body: JSON.stringify({ uid, displayName, email: cleanEmail, avatar }),
        });
        if (res.ok) {
          const data = await res.json();
          serverUser = data.user;
        }
      } catch {}

      const finalUser: User = {
        uid,
        username: existingFs?.username || serverUser?.username || (displayName || cleanEmail.split('@')[0] || 'Player').trim(),
        email: cleanEmail,
        points: typeof existingFs?.points === 'number'
          ? existingFs.points
          : (typeof serverUser?.points === 'number' ? serverUser.points : STARTING_POINTS),
        wins: existingFs?.wins || serverUser?.wins || {},
        lastDaily: existingFs?.lastDaily || serverUser?.lastDaily || 0,
        avatar: existingFs?.avatar || serverUser?.avatar || avatar || '🎧',
        lastSeen: Date.now(),
      };

      await savePlayerToFirestore(finalUser);
      Storage.saveUser(finalUser);
      Storage.setSession(finalUser);
      return finalUser;
    } finally {
      authFlowActive = false;
    }
  },

  async loginGuest(avatar?: string): Promise<User> {
    authFlowActive = true;
    try {
      const cred = await signInAnonymously(auth);
      const randNum = Math.floor(1000 + Math.random() * 9000);
      const existingFs = await getPlayerFromFirestore(cred.user.uid);

      const guestUser: User = existingFs
        ? { ...existingFs, email: '' }
        : {
            uid: cred.user.uid,
            username: `HushPlayer_${randNum}`,
            email: '',
            points: STARTING_POINTS,
            wins: {},
            lastDaily: 0,
            avatar: avatar || '🎧',
            lastSeen: Date.now(),
          };

      await savePlayerToFirestore(guestUser);

      try {
        const headers = await getAuthHeaders();
        await fetch('/api/users/guest', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            uid: guestUser.uid,
            username: guestUser.username,
            avatar: guestUser.avatar,
          }),
        });
      } catch {}

      Storage.saveUser(guestUser);
      Storage.setSession(guestUser);
      return guestUser;
    } catch (err: any) {
      throw new Error(formatFirebaseAuthError(err, 'Guest sign-in failed'));
    } finally {
      authFlowActive = false;
    }
  },

  updateUser(user: User): User {
    Storage.saveUser(user);
    this.syncUser(user);
    return user;
  },

  async logout(): Promise<void> {
    await signOut(auth).catch(() => {});
    Storage.setSession(null);
  },

  // Points / Wallet
  updatePoints(user: User, delta: number, reason?: string): User {
    const newPoints = Math.max(0, user.points + delta);
    const updated: User = {
      ...user,
      points: newPoints,
    };
    Storage.saveUser(updated);

    if (delta > 0) {
      Sound.win();
    } else if (delta < 0) {
      Sound.lose();
    }
    return updated;
  },

  recordWin(user: User, gameId: GameId): { user: User; payout: number } {
    const payout = CPU_PAYOUTS[gameId] || 30;
    const wins = { ...user.wins, [gameId]: (user.wins[gameId] || 0) + 1 };
    const updated: User = {
      ...user,
      points: user.points + payout,
      wins,
    };
    Storage.saveUser(updated);
    Sound.win();
    return { user: updated, payout };
  },

  canClaimDaily(user: User): boolean {
    return Date.now() - (user.lastDaily || 0) >= DAILY_INTERVAL_MS;
  },

  getDailyResetRemainingMs(user: User): number {
    if (!user.lastDaily) return 0;
    const elapsed = Date.now() - user.lastDaily;
    return Math.max(0, DAILY_INTERVAL_MS - elapsed);
  },

  formatResetCountdown(remainingMs: number): string {
    if (remainingMs <= 0) return 'Ready to claim!';
    const totalSecs = Math.floor(remainingMs / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const seconds = totalSecs % 60;
    return `${hours}h ${minutes}m ${seconds}s`;
  },

  claimDailyBonus(user: User): User {
    if (!this.canClaimDaily(user)) {
      throw new Error('Daily bonus already claimed. Please check back later!');
    }
    const updated: User = {
      ...user,
      points: user.points + DAILY_BONUS,
      lastDaily: Date.now(),
    };
    Storage.saveUser(updated);
    Sound.jackpot();
    return updated;
  },

  // Leaderboard
  getLeaderboard(): User[] {
    const users = Object.values(Storage.getUsers());
    return users
      .filter(Boolean)
      .map((u) => ({
        ...u,
        points: typeof u.points === 'number' ? u.points : 1000,
        wins: u.wins || {},
      }))
      .sort((a, b) => (b.points || 0) - (a.points || 0))
      .slice(0, 50);
  },

  async getLeaderboardAsync(): Promise<User[]> {
    const map = new Map<string, User>();
    const local = Storage.getUsers();
    for (const u of Object.values(local)) {
      if (u) {
        map.set(u.uid, {
          ...u,
          points: typeof u.points === 'number' ? u.points : 1000,
          wins: u.wins || {},
        });
      }
    }

    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const serverUsers: User[] = await res.json();
        for (const u of serverUsers) {
          if (u) {
            map.set(u.uid, {
              ...u,
              points: typeof u.points === 'number' ? u.points : 1000,
              wins: u.wins || {},
            });
          }
        }
      }
    } catch {}

    if (auth.currentUser) {
      try {
        const fsUsers = await getAllPlayersFromFirestore();
        for (const u of fsUsers) {
          if (u) {
            map.set(u.uid, {
              ...u,
              points: typeof u.points === 'number' ? u.points : 1000,
              wins: u.wins || {},
            });
          }
        }
      } catch {}
    }

    return Array.from(map.values())
      .sort((a, b) => (b.points || 0) - (a.points || 0))
      .slice(0, 50);
  },

  // Multiplayer Rooms with Firebase Firestore
  async createRoom(hostUser: User, game: GameId, seatsNeeded: number): Promise<Room> {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const room: Room = {
      code,
      game,
      seatsNeeded: seatsNeeded || 2,
      seats: [hostUser.uid],
      names: { [hostUser.uid]: hostUser.username },
      avatars: { [hostUser.uid]: hostUser.avatar || '🎧' },
      state: null,
      turn: 0,
      status: 'waiting',
      host: hostUser.uid,
      created: Date.now(),
      updatedAt: Date.now(),
    };

    // 1. Persist directly to Firebase Firestore for shared cross-device access
    try {
      await saveRoomToFirestore(room);
    } catch (fsErr) {
      console.warn('Could not write room directly to Firestore, using server proxy:', fsErr);
    }

    // 2. Notify server for state alignment
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostUser, game, seatsNeeded, code }),
      });
      if (res.ok) {
        const serverRoom: Room = await res.json();
        Storage.saveRoom(serverRoom);
        return serverRoom;
      }
    } catch {
      // server offline fallback
    }

    Storage.saveRoom(room);
    return room;
  },

  async getRoom(code: string): Promise<Room | null> {
    const cleanCode = code.trim().replace(/^[@#]/, '');

    // 1. Read directly from Firebase Firestore (shared realtime database)
    try {
      const fsRoom = await getRoomFromFirestore(cleanCode);
      if (fsRoom) {
        Storage.saveRoom(fsRoom);
        return fsRoom;
      }
    } catch (fsErr) {
      console.warn('Firestore room fetch warning:', fsErr);
    }

    // 2. Fallback to server endpoint
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(cleanCode)}`);
      if (res.ok) {
        const room: Room = await res.json();
        Storage.saveRoom(room);
        return room;
      }
    } catch {
      // fallback
    }

    return Storage.getRoom(cleanCode);
  },

  async getOpenRooms(game?: GameId): Promise<Room[]> {
    // 1. Fetch directly from Firebase Firestore
    try {
      const fsRooms = await getOpenRoomsFromFirestore(game);
      if (fsRooms && fsRooms.length > 0) {
        return fsRooms;
      }
    } catch (fsErr) {
      console.warn('Firestore open rooms warning:', fsErr);
    }

    // 2. Fallback to server endpoint
    try {
      const url = game ? `/api/rooms?game=${encodeURIComponent(game)}` : '/api/rooms';
      const res = await fetch(url);
      if (res.ok) {
        const list: Room[] = await res.json();
        return list;
      }
    } catch {
      // fallback
    }

    const local = Object.values(Storage.getRooms());
    return local.filter((r) => (!game || r.game === game) && r.status !== 'done');
  },

  async joinRoom(user: User, rawCode: string, asTestPlayer?: boolean): Promise<Room> {
    const raw = String(rawCode || '').trim();
    let code = raw;

    // Check if input is a link like ?room=9925 or join=9925
    const urlMatch = raw.match(/(?:room|join)[=:]\s*([a-zA-Z0-9]+)/i);
    if (urlMatch) {
      code = urlMatch[1].trim();
    } else {
      const clean = raw.replace(/^[@#]/, '').trim();
      const digitMatch = clean.match(/\b\d{4,6}\b/) || clean.match(/\d{4,6}/);
      if (digitMatch) {
        code = digitMatch[0];
      } else {
        code = clean;
      }
    }

    if (!code) {
      throw new Error('Please enter a valid room code.');
    }

    // 1. Try to read and update room directly in Firebase Firestore
    try {
      let room = await getRoomFromFirestore(code);
      if (!room) {
        const res = await fetch(`/api/rooms/${encodeURIComponent(code)}`);
        if (res.ok) {
          room = await res.json();
        }
      }

      if (room) {
        if (room.status === 'done') {
          throw new Error('This match has already completed.');
        }

        if (!room.avatars) room.avatars = {};
        if (!room.names) room.names = {};

        const isHost = room.host === user.uid;
        const effectiveUid =
          isHost && (asTestPlayer || room.seats.includes(user.uid)) && room.seats.length === 1
            ? `${user.uid}_p2`
            : user.uid;
        const effectiveUsername =
          effectiveUid !== user.uid ? `${user.username} (P2)` : user.username;

        if (!room.seats.includes(effectiveUid)) {
          if (room.seats.length >= room.seatsNeeded) {
            // Replace a test/bot player if possible
            const botIdx = room.seats.findIndex((s: string) => s.startsWith('bot_') || s.includes('test') || s.includes('_p2'));
            if (botIdx !== -1) {
              const oldUid = room.seats[botIdx];
              delete room.names[oldUid];
              if (room.avatars) delete room.avatars[oldUid];
              room.seats.splice(botIdx, 1);
            } else {
              throw new Error(`Room #${code} is full (${room.seats.length}/${room.seatsNeeded} players).`);
            }
          }

          room.seats.push(effectiveUid);
          room.names[effectiveUid] = effectiveUsername;
          room.avatars[effectiveUid] = user.avatar || '🎧';

          if (room.seats.length >= 2) {
            room.status = 'playing';
          }
        }

        room.updatedAt = Date.now();
        await saveRoomToFirestore(room);
        Storage.saveRoom(room);

        // Keep server synced in background
        fetch(`/api/rooms/${encodeURIComponent(code)}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user, asTestPlayer }),
        }).catch(() => {});

        return room;
      }
    } catch (fsJoinErr: unknown) {
      const msg = (fsJoinErr as Error).message || '';
      if (msg.includes('full') || msg.includes('completed')) {
        throw fsJoinErr;
      }
    }

    // 2. Server join fallback
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(code)}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, asTestPlayer }),
      });

      if (res.ok) {
        const room: Room = await res.json();
        saveRoomToFirestore(room).catch(() => {});
        Storage.saveRoom(room);
        return room;
      } else {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Could not join room #${code}`);
      }
    } catch (err: unknown) {
      const errorMsg = (err as Error).message || '';
      if (
        errorMsg &&
        !errorMsg.includes('Failed to fetch') &&
        !errorMsg.includes('NetworkError') &&
        !errorMsg.includes('fetch')
      ) {
        throw err;
      }

      // Offline / Local storage fallback
      const room = Storage.getRoom(code);
      if (!room) {
        throw new Error(`Room #${code} not found. Verify the code and try again.`);
      }
      if (room.status === 'done') {
        throw new Error(`This match has already completed.`);
      }
      if (!room.avatars) {
        room.avatars = {};
      }
      if (!room.seats.includes(user.uid)) {
        if (room.seats.length >= room.seatsNeeded) {
          throw new Error(`Room #${code} is full (${room.seats.length}/${room.seatsNeeded} players).`);
        }
        room.seats.push(user.uid);
        room.names[user.uid] = user.username;
        room.avatars[user.uid] = user.avatar || '🎧';
        if (room.seats.length >= 2) {
          room.status = 'playing';
        }
        saveRoomToFirestore(room).catch(() => {});
        Storage.saveRoom(room);
      }
      return room;
    }
  },

  async addTestBotToRoom(code: string): Promise<Room> {
    const clean = code.trim().replace(/^#/, '').trim();
    const res = await fetch(`/api/rooms/${encodeURIComponent(clean)}/add-bot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.ok) {
      const room: Room = await res.json();
      saveRoomToFirestore(room).catch(() => {});
      Storage.saveRoom(room);
      return room;
    }
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to add test opponent');
  },

  updateRoom(room: Room): void {
    room.updatedAt = Date.now();
    Storage.saveRoom(room);

    // 1. Realtime write directly to Firebase Firestore
    saveRoomToFirestore(room).catch((err: unknown) => {
      console.warn('Firestore room update warning:', err);
    });

    // 2. Notify server proxy
    try {
      fetch(`/api/rooms/${encodeURIComponent(room.code)}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room }),
      }).catch(() => {});
    } catch {
      // offline
    }
  },

  leaveRoom(room: Room, uid: string, cancel = false): void {
    if (room.host === uid && cancel) {
      room.status = 'done';
      deleteRoomFromFirestore(room.code).catch(() => {});
      Storage.deleteRoom(room.code);
    } else {
      room.seats = room.seats.filter((s) => s !== uid);
      delete room.names[uid];
      if (room.avatars) delete room.avatars[uid];
      room.updatedAt = Date.now();
      saveRoomToFirestore(room).catch(() => {});
      Storage.saveRoom(room);
    }
    try {
      fetch(`/api/rooms/${encodeURIComponent(room.code)}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, cancel }),
      }).catch(() => {});
    } catch {
      // offline
    }
  },

  async deleteRoom(code: string): Promise<boolean> {
    const cleanCode = String(code).trim().replace(/^[@#]/, '');
    try {
      await deleteRoomFromFirestore(cleanCode);
    } catch (err) {
      console.warn('Backend deleteRoom warning:', err);
    }
    Storage.deleteRoom(cleanCode);
    try {
      await fetch(`/api/rooms/${encodeURIComponent(cleanCode)}/delete`, {
        method: 'POST',
      });
    } catch {
      // offline
    }
    return true;
  },

  subscribeToRoom(
    code: string,
    onUpdate: (room: Room | null) => void,
    onError?: (err: Error) => void
  ): () => void {
    return subscribeToRoom(code, onUpdate, onError);
  },

  // Friends & Messaging
  getFriendsList(uid: string): Friend[] {
    const ids = Storage.getFriends(uid);
    const users = Storage.getUsers();
    return ids.map((id) => {
      const u = users[id];
      return {
        uid: id,
        username: u ? u.username : 'Unknown',
        online: true,
        avatar: u?.avatar,
      };
    });
  },

  async getFriendsListAsync(uid: string): Promise<Friend[]> {
    try {
      const rtdbFriends = await getFriendsFromRTDB(uid);
      const rtdbPlayers = await getAllPlayersFromRTDB();
      if (rtdbFriends && rtdbFriends.length > 0) {
        const playerMap = new Map(rtdbPlayers.map((p) => [p.uid, p]));
        const localUsers = Storage.getUsers();
        return rtdbFriends.map((fUid) => {
          const p = playerMap.get(fUid) || localUsers[fUid];
          return {
            uid: fUid,
            username: p ? p.username : 'Player',
            online: true,
            avatar: p?.avatar || '🎧',
          };
        });
      }
    } catch {}
    try {
      const res = await fetch(`/api/friends/${encodeURIComponent(uid)}`);
      if (res.ok) {
        const list: Friend[] = await res.json();
        return list;
      }
    } catch {}
    return this.getFriendsList(uid);
  },

  getFriendRequests(uid: string): FriendRequest[] {
    return Storage.getRequests(uid);
  },

  async getFriendRequestsAsync(uid: string, username?: string): Promise<FriendRequest[]> {
    try {
      const rtdbReqs = await getFriendRequestsFromRTDB(uid);
      if (rtdbReqs && rtdbReqs.length > 0) {
        return rtdbReqs;
      }
    } catch {}
    try {
      const q = username ? `?username=${encodeURIComponent(username)}` : '';
      const res = await fetch(`/api/friends/requests/${encodeURIComponent(uid)}${q}`);
      if (res.ok) {
        const list: FriendRequest[] = await res.json();
        return list;
      }
    } catch {}
    return this.getFriendRequests(uid);
  },

  async sendFriendRequest(
    fromUser: User,
    targetUsername: string
  ): Promise<{ ok: boolean; message: string; autoAccepted?: boolean }> {
    const clean = targetUsername.trim();
    if (!clean) throw new Error('Please enter a username or player code.');

    // Write to Realtime Database target if found
    let targetPlayer: User | null = null;
    try {
      const allRTDB = await getAllPlayersFromRTDB();
      const cleanInput = clean.replace(/^[@#]/, '').trim().toLowerCase();
      targetPlayer =
        allRTDB.find(
          (u) =>
            u &&
            ((u.username && u.username.toLowerCase() === cleanInput) ||
              (u.email && u.email.toLowerCase() === cleanInput) ||
              (u.uid && u.uid.toLowerCase() === cleanInput))
        ) || null;
      if (targetPlayer) {
        const reqItem: FriendRequest = {
          uid: fromUser.uid,
          from: fromUser.username,
          at: Date.now(),
          avatar: fromUser.avatar || '🎧',
        };
        saveFriendRequestToRTDB(targetPlayer.uid, reqItem).catch(() => {});
        saveSentRequestToRTDB(fromUser.uid, {
          targetUid: targetPlayer.uid,
          targetUsername: targetPlayer.username,
          targetAvatar: targetPlayer.avatar || '🎧',
          at: Date.now(),
        }).catch(() => {});
      }
    } catch {}

    try {
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromUser, targetUsername: clean }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        return {
          ok: true,
          message: data.message || `Friend request sent to ${clean}!`,
          autoAccepted: data.autoAccepted,
        };
      }
      throw new Error(data.error || `Could not send friend request to "${clean}".`);
    } catch (err: unknown) {
      const msg = (err as Error).message || '';
      if (
        msg &&
        !msg.includes('Failed to fetch') &&
        !msg.includes('NetworkError') &&
        !msg.includes('fetch')
      ) {
        throw err;
      }

      // Offline fallback
      const target = targetPlayer || Storage.getUserByUsername(clean);
      if (!target) {
        throw new Error(`User "${clean}" not found. Verify the exact username.`);
      }
      if (target.uid === fromUser.uid) {
        throw new Error(`You cannot add yourself as a friend.`);
      }
      Storage.addRequest(target.uid, {
        uid: fromUser.uid,
        from: fromUser.username,
        at: Date.now(),
      });
      return { ok: true, message: `Friend request sent to ${target.username}!` };
    }
  },

  async getSentFriendRequestsAsync(
    uid: string
  ): Promise<{ targetUid: string; targetUsername: string; targetAvatar?: string; at: number }[]> {
    try {
      const rtdbSent = await getSentRequestsFromRTDB(uid);
      if (rtdbSent && rtdbSent.length > 0) {
        return rtdbSent;
      }
    } catch {}
    try {
      const res = await fetch(`/api/friends/sent/${encodeURIComponent(uid)}`);
      if (res.ok) {
        return await res.json();
      }
    } catch {}
    return [];
  },

  async cancelFriendRequest(currentUid: string, targetUid: string): Promise<void> {
    removeFriendRequestFromRTDB(targetUid, currentUid).catch(() => {});
    removeSentRequestFromRTDB(currentUid, targetUid).catch(() => {});
    try {
      await fetch('/api/friends/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentUid, targetUid }),
      });
    } catch {}
  },

  async acceptFriendRequest(currentUid: string, reqUid: string): Promise<void> {
    Storage.addFriend(currentUid, reqUid);
    Storage.removeRequest(currentUid, reqUid);
    try {
      const currentFriends = await getFriendsFromRTDB(currentUid);
      const theirFriends = await getFriendsFromRTDB(reqUid);
      if (!currentFriends.includes(reqUid)) currentFriends.push(reqUid);
      if (!theirFriends.includes(currentUid)) theirFriends.push(currentUid);
      saveFriendsToRTDB(currentUid, currentFriends).catch(() => {});
      saveFriendsToRTDB(reqUid, theirFriends).catch(() => {});
      removeFriendRequestFromRTDB(currentUid, reqUid).catch(() => {});
      removeSentRequestFromRTDB(reqUid, currentUid).catch(() => {});
    } catch {}
    try {
      await fetch('/api/friends/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentUid, reqUid }),
      });
    } catch {}
  },

  async declineFriendRequest(currentUid: string, reqUid: string): Promise<void> {
    Storage.removeRequest(currentUid, reqUid);
    removeFriendRequestFromRTDB(currentUid, reqUid).catch(() => {});
    removeSentRequestFromRTDB(reqUid, currentUid).catch(() => {});
    try {
      await fetch('/api/friends/decline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentUid, reqUid }),
      });
    } catch {}
  },

  async removeFriend(currentUid: string, friendUid: string): Promise<void> {
    // Update Realtime Database
    try {
      const f1 = (await getFriendsFromRTDB(currentUid)).filter((id) => id !== friendUid);
      saveFriendsToRTDB(currentUid, f1).catch(() => {});
      const f2 = (await getFriendsFromRTDB(friendUid)).filter((id) => id !== currentUid);
      saveFriendsToRTDB(friendUid, f2).catch(() => {});
    } catch {}

    // Update local storage
    try {
      const f1 = Storage.getFriends(currentUid).filter((id) => id !== friendUid);
      localStorage.setItem('hm_friends_' + currentUid, JSON.stringify(f1));
      const f2 = Storage.getFriends(friendUid).filter((id) => id !== currentUid);
      localStorage.setItem('hm_friends_' + friendUid, JSON.stringify(f2));
    } catch {}

    try {
      await fetch('/api/friends/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentUid, friendUid }),
      });
    } catch {}
  },

  async getDiscoverableUsers(currentUid: string): Promise<User[]> {
    try {
      const rtdbUsers = await getAllPlayersFromRTDB();
      if (rtdbUsers && rtdbUsers.length > 0) {
        const friends = await getFriendsFromRTDB(currentUid);
        return rtdbUsers.filter((u) => u.uid !== currentUid && !friends.includes(u.uid));
      }
    } catch {}
    try {
      const res = await fetch(`/api/users/discover?currentUid=${encodeURIComponent(currentUid)}`);
      if (res.ok) {
        return await res.json();
      }
    } catch {}
    const all = Object.values(Storage.getUsers());
    const friends = Storage.getFriends(currentUid);
    return all.filter((u) => u.uid !== currentUid && !friends.includes(u.uid));
  },

  // Live Chat
  getMessages(channel: string): ChatMessage[] {
    return Storage.getChat(channel);
  },

  async fetchMessages(channel: string): Promise<ChatMessage[]> {
    try {
      const rtdbMsgs = await getChatMessagesFromRTDB(channel);
      if (rtdbMsgs && rtdbMsgs.length > 0) {
        const key = 'hm_chat_' + channel;
        try {
          localStorage.setItem(key, JSON.stringify(rtdbMsgs));
        } catch {}
        return rtdbMsgs;
      }
    } catch {}
    try {
      const res = await fetch(`/api/chat/${encodeURIComponent(channel)}`);
      if (res.ok) {
        const list: ChatMessage[] = await res.json();
        const key = 'hm_chat_' + channel;
        try {
          localStorage.setItem(key, JSON.stringify(list));
        } catch {}
        return list;
      }
    } catch {}
    return Storage.getChat(channel);
  },

  sendMessage(channel: string, user: User, text: string): ChatMessage {
    const cleanText = text.trim();
    if (!cleanText) throw new Error('Message cannot be empty');
    const msg: ChatMessage = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      who: user.username,
      uid: user.uid,
      text: cleanText,
      at: Date.now(),
      avatar: user.avatar,
    };
    Storage.addChatMessage(channel, msg);
    saveChatMessageToRTDB(channel, msg).catch(() => {});

    try {
      fetch(`/api/chat/${encodeURIComponent(channel)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msg }),
      }).catch(() => {});
    } catch {}

    return msg;
  },

  syncUser(user: User): void {
    const { password: _p, passwordHash: _ph, passwordSalt: _ps, ...safeUser } = user as any;
    if (auth.currentUser && auth.currentUser.uid === user.uid) {
      savePlayerToFirestore(safeUser as User).catch(() => {});
      getAuthHeaders()
        .then((headers) =>
          fetch('/api/users/sync', {
            method: 'POST',
            headers,
            body: JSON.stringify({ user: safeUser }),
          })
        )
        .catch(() => {});
    }
  },

  async deleteUserAccount(identifier: string): Promise<boolean> {
    if (auth.currentUser && auth.currentUser.uid === identifier) {
      await deletePlayerFromFirestore(identifier).catch(() => {});
    }
    try {
      const headers = await getAuthHeaders();
      Storage.deleteUser(identifier);
      const res = await fetch('/api/users/delete', {
        method: 'POST',
        headers,
        body: JSON.stringify({ identifier }),
      });
      const data = await res.json().catch(() => ({}));
      if (auth.currentUser && auth.currentUser.uid === identifier) {
        await deleteUser(auth.currentUser).catch(async () => {
          await signOut(auth).catch(() => {});
        });
      }
      return !!data.ok;
    } catch {
      Storage.deleteUser(identifier);
      return false;
    }
  },
};
