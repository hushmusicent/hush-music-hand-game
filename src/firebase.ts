import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
} from 'firebase/firestore';
import {
  getDatabase,
  ref as rtdbRef,
  set as rtdbSet,
  get as rtdbGet,
  remove as rtdbRemove,
  onValue as rtdbOnValue,
  Database,
} from 'firebase/database';
import bcrypt from 'bcryptjs';
import firebaseConfig from '../firebase-applet-config.json';
import { Room, GameId, User, FriendRequest, ChatMessage } from './types';

// Initialize Firebase App & Services
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId); /* CRITICAL: The app will break without this line */

// Only initialize Realtime Database if a valid databaseURL is explicitly configured in firebase-applet-config.json
const rawRtdbUrl = (firebaseConfig as any).databaseURL;
export const rtdb: Database | null =
  typeof rawRtdbUrl === 'string' && rawRtdbUrl.trim().length > 0 && !rawRtdbUrl.includes('default-rtdb')
    ? getDatabase(app, rawRtdbUrl.trim())
    : null;

export const auth = getAuth(app);

// Error handling types & helpers per specification
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Connection validation on initial boot per Firebase integration skill
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log('Firebase Firestore connected successfully!');
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
    return false;
  }
}

// Run boot check
testConnection().catch(() => {});

// ==========================================
// 1. PLAYERS / USERS (Firestore Primary)
// ==========================================
export async function savePlayerToFirestore(player: User): Promise<void> {
  if (!player || !player.uid) return;
  // Guard against recreating permanently erased KingVeno account
  const cleanName = (player.username || '').toLowerCase().trim();
  if (player.uid === 'u_zbs0jd0' || cleanName === 'kingveno') {
    return;
  }

  const payload: Record<string, any> = {
    uid: player.uid,
    username: player.username,
    email: player.email || '',
    points: typeof player.points === 'number' ? player.points : 1000,
    wins: player.wins || {},
    lastDaily: player.lastDaily || 0,
    avatar: player.avatar || '🎧',
    lastSeen: Date.now(),
  };

  // Hash password with bcrypt before saving if provided
  const rawPass = (player as any).password;
  if (rawPass && typeof rawPass === 'string') {
    payload.passwordHash = rawPass.startsWith('$2')
      ? rawPass
      : bcrypt.hashSync(rawPass, 10);
  } else if ((player as any).passwordHash) {
    payload.passwordHash = (player as any).passwordHash;
  }
  delete payload.password;
  delete payload.passwordSalt;

  try {
    await setDoc(doc(db, 'users', player.uid), payload);
  } catch (err) {
    // Non-blocking fallback
  }

  if (rtdb) {
    try {
      await Promise.all([
        rtdbSet(rtdbRef(rtdb, `players/${player.uid}`), payload),
        rtdbSet(rtdbRef(rtdb, `users/${player.uid}`), payload),
      ]);
    } catch {
      // Non-blocking fallback
    }
  }
}
export const savePlayerToRTDB = savePlayerToFirestore;

export async function getPlayerFromFirestore(uid: string): Promise<User | null> {
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      const raw = snap.data();
      const { password, passwordHash, passwordSalt, ...safeUser } = raw as any;
      return safeUser as User;
    }
  } catch {
    // Non-blocking
  }
  if (rtdb) {
    try {
      const snap = await rtdbGet(rtdbRef(rtdb, `users/${uid}`));
      if (snap.exists()) {
        const raw = snap.val();
        const { password, passwordHash, passwordSalt, ...safeUser } = raw as any;
        return safeUser as User;
      }
    } catch {
      // Non-blocking
    }
  }
  return null;
}
export const getPlayerFromRTDB = getPlayerFromFirestore;

export async function getAllPlayersFromFirestore(): Promise<User[]> {
  try {
    const snap = await getDocs(collection(db, 'users'));
    return snap.docs
      .map((d) => d.data())
      .filter((u: any) => u && u.uid !== 'u_zbs0jd0' && u.username?.toLowerCase() !== 'kingveno')
      .map((u: any) => {
        const { password, passwordHash, passwordSalt, ...safeUser } = u;
        return safeUser as User;
      });
  } catch {
    return [];
  }
}
export const getAllPlayersFromRTDB = getAllPlayersFromFirestore;

export async function deletePlayerFromFirestore(uid: string): Promise<void> {
  if (!uid) return;
  try {
    await deleteDoc(doc(db, 'users', uid));
  } catch {}
  if (rtdb) {
    try {
      await Promise.all([
        rtdbRemove(rtdbRef(rtdb, `players/${uid}`)),
        rtdbRemove(rtdbRef(rtdb, `users/${uid}`)),
        rtdbRemove(rtdbRef(rtdb, `friendRequests/${uid}`)),
        rtdbRemove(rtdbRef(rtdb, `sentRequests/${uid}`)),
        rtdbRemove(rtdbRef(rtdb, `friends/${uid}`)),
      ]);
    } catch {}
  }
}
export const deletePlayerFromRTDB = deletePlayerFromFirestore;

export function subscribeToPlayers(onUpdate: (players: User[]) => void): () => void {
  try {
    return onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data())
          .filter((u: any) => u && u.uid !== 'u_zbs0jd0' && u.username?.toLowerCase() !== 'kingveno')
          .map((u: any) => {
            const { password, passwordHash, passwordSalt, ...safeUser } = u;
            return safeUser as User;
          });
        onUpdate(list);
      },
      () => {
        onUpdate([]);
      }
    );
  } catch {
    return () => {};
  }
}

// ==========================================
// 2. FRIEND REQUESTS & FRIENDS
// ==========================================
export async function saveFriendRequestToRTDB(targetUid: string, req: FriendRequest): Promise<void> {
  if (!rtdb || !targetUid || !req || !req.uid) return;
  try {
    await rtdbSet(rtdbRef(rtdb, `friendRequests/${targetUid}/${req.uid}`), req);
  } catch {}
}

export async function getFriendRequestsFromRTDB(targetUid: string): Promise<FriendRequest[]> {
  if (!rtdb || !targetUid) return [];
  try {
    const snap = await rtdbGet(rtdbRef(rtdb, `friendRequests/${targetUid}`));
    if (!snap.exists()) return [];
    const val = snap.val() as Record<string, FriendRequest>;
    return Object.values(val || {});
  } catch {
    return [];
  }
}

export async function removeFriendRequestFromRTDB(targetUid: string, reqUid: string): Promise<void> {
  if (!rtdb || !targetUid || !reqUid) return;
  try {
    await rtdbRemove(rtdbRef(rtdb, `friendRequests/${targetUid}/${reqUid}`));
  } catch {}
}

export async function saveSentRequestToRTDB(
  fromUid: string,
  sentData: { targetUid: string; targetUsername: string; targetAvatar?: string; at: number }
): Promise<void> {
  if (!rtdb || !fromUid || !sentData || !sentData.targetUid) return;
  try {
    await rtdbSet(rtdbRef(rtdb, `sentRequests/${fromUid}/${sentData.targetUid}`), sentData);
  } catch {}
}

export async function getSentRequestsFromRTDB(fromUid: string): Promise<any[]> {
  if (!rtdb || !fromUid) return [];
  try {
    const snap = await rtdbGet(rtdbRef(rtdb, `sentRequests/${fromUid}`));
    if (!snap.exists()) return [];
    const val = snap.val() as Record<string, any>;
    return Object.values(val || {});
  } catch {
    return [];
  }
}

export async function removeSentRequestFromRTDB(fromUid: string, targetUid: string): Promise<void> {
  if (!rtdb || !fromUid || !targetUid) return;
  try {
    await rtdbRemove(rtdbRef(rtdb, `sentRequests/${fromUid}/${targetUid}`));
  } catch {}
}

export function subscribeToFriendRequests(
  targetUid: string,
  onUpdate: (reqs: FriendRequest[]) => void
): () => void {
  if (!rtdb) return () => {};
  const reqRef = rtdbRef(rtdb, `friendRequests/${targetUid}`);
  return rtdbOnValue(reqRef, (snap) => {
    if (!snap.exists()) {
      onUpdate([]);
    } else {
      const val = snap.val() as Record<string, FriendRequest>;
      onUpdate(Object.values(val || {}));
    }
  });
}

export async function saveFriendsToRTDB(uid: string, friends: string[]): Promise<void> {
  if (!rtdb || !uid) return;
  try {
    await rtdbSet(rtdbRef(rtdb, `friends/${uid}`), friends);
  } catch {}
}

export async function getFriendsFromRTDB(uid: string): Promise<string[]> {
  if (!rtdb || !uid) return [];
  try {
    const snap = await rtdbGet(rtdbRef(rtdb, `friends/${uid}`));
    if (!snap.exists()) return [];
    const val = snap.val();
    return Array.isArray(val) ? val : Object.values(val || {});
  } catch {
    return [];
  }
}

// ==========================================
// 3. ROOMS (Firestore Primary)
// ==========================================

// Helper to sanitize nested arrays for Firestore (Firestore rejects arrays inside arrays and undefined values)
export function sanitizeForFirestore(val: any, insideArray = false): any {
  if (val === null || val === undefined) return null;
  if (typeof val !== 'object') return val;
  if (Array.isArray(val)) {
    if (insideArray) {
      const map: Record<string, any> = { _arr: true };
      for (let idx = 0; idx < val.length; idx++) {
        const item = val[idx];
        map[String(idx)] = sanitizeForFirestore(item === undefined ? null : item, false);
      }
      return map;
    }
    const cleanArr: any[] = [];
    for (let idx = 0; idx < val.length; idx++) {
      const item = val[idx];
      cleanArr.push(sanitizeForFirestore(item === undefined ? null : item, true));
    }
    return cleanArr;
  }
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(val)) {
    if (v !== undefined) {
      result[k] = sanitizeForFirestore(v, insideArray);
    }
  }
  return result;
}

export function restoreFromFirestore(val: any): any {
  if (val === null || val === undefined) return val;
  if (typeof val !== 'object') return val;
  if (val._arr === true) {
    const keys = Object.keys(val).filter((k) => k !== '_arr').sort((a, b) => Number(a) - Number(b));
    return keys.map((k) => restoreFromFirestore(val[k]));
  }
  if (Array.isArray(val)) {
    return val.map((item) => restoreFromFirestore(item));
  }
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(val)) {
    result[k] = restoreFromFirestore(v);
  }
  return result;
}

export async function saveRoomToFirestore(room: Room): Promise<void> {
  const cleanCode = String(room.code).trim().replace(/^[@#]/, '');
  const payload: Record<string, any> = {
    code: cleanCode,
    game: String(room.game),
    seatsNeeded: Number(room.seatsNeeded) || 2,
    seats: Array.isArray(room.seats) ? room.seats : [],
    names: room.names || {},
    avatars: room.avatars || {},
    turn: typeof room.turn === 'number' ? room.turn : 0,
    status: room.status || 'waiting',
    host: String(room.host),
    created: Number(room.created) || Date.now(),
    updatedAt: Date.now(),
  };

  if (room.state !== undefined && room.state !== null) {
    payload.state = room.state;
  }

  // 1. Primary write directly to Firestore (sanitizes nested arrays)
  try {
    const firestorePayload = sanitizeForFirestore(payload);
    await setDoc(doc(db, 'rooms', cleanCode), firestorePayload);
  } catch (err) {
    console.warn('Firestore room write notice:', err);
  }

  // 2. RTDB sync if configured
  if (rtdb) {
    try {
      await rtdbSet(rtdbRef(rtdb, `rooms/${cleanCode}`), payload);
    } catch {
      // Non-blocking
    }
  }
}
export const saveRoomToRTDB = saveRoomToFirestore;

export async function getRoomFromFirestore(code: string): Promise<Room | null> {
  const cleanCode = String(code).trim().replace(/^[@#]/, '');
  // 1. Try Firestore first
  try {
    const snap = await getDoc(doc(db, 'rooms', cleanCode));
    if (snap.exists()) return restoreFromFirestore(snap.data()) as Room;
  } catch (err) {
    console.warn('Firestore room get notice:', err);
  }

  // 2. RTDB fallback if configured
  if (rtdb) {
    try {
      const snap = await rtdbGet(rtdbRef(rtdb, `rooms/${cleanCode}`));
      if (snap.exists()) {
        return snap.val() as Room;
      }
    } catch {
      // Non-blocking
    }
  }

  return null;
}
export const getRoomFromRTDB = getRoomFromFirestore;

export async function getOpenRoomsFromFirestore(game?: GameId): Promise<Room[]> {
  try {
    const snap = await getDocs(collection(db, 'rooms'));
    return snap.docs
      .map((d) => restoreFromFirestore(d.data()) as Room)
      .filter((r) => r && r.status === 'waiting' && (!game || r.game === game));
  } catch (err) {
    console.warn('Firestore getOpenRooms notice:', err);
    return [];
  }
}
export const getOpenRoomsFromRTDB = getOpenRoomsFromFirestore;

export async function deleteRoomFromFirestore(code: string): Promise<void> {
  const cleanCode = String(code).trim().replace(/^[@#]/, '');
  try {
    await deleteDoc(doc(db, 'rooms', cleanCode));
  } catch (err) {
    console.warn('Firestore room delete notice:', err);
  }
  if (rtdb) {
    try {
      await rtdbRemove(rtdbRef(rtdb, `rooms/${cleanCode}`));
    } catch {}
  }
}
export const deleteRoomFromRTDB = deleteRoomFromFirestore;

export function subscribeToRoom(
  code: string,
  onUpdate: (room: Room | null) => void,
  onError?: (err: any) => void
): () => void {
  const cleanCode = String(code).trim().replace(/^[@#]/, '');

  let unsubscribeRTDB: (() => void) | null = null;
  if (rtdb) {
    try {
      const roomRef = rtdbRef(rtdb, `rooms/${cleanCode}`);
      unsubscribeRTDB = rtdbOnValue(
        roomRef,
        (snap) => {
          if (snap.exists()) {
            onUpdate(snap.val() as Room);
          }
        },
        () => {}
      );
    } catch {}
  }

  // Firestore primary listener
  let unsubscribeFS: (() => void) | null = null;
  try {
    unsubscribeFS = onSnapshot(
      doc(db, 'rooms', cleanCode),
      (snap) => {
        if (!snap.exists()) {
          if (!rtdb) onUpdate(null);
        } else {
          onUpdate(restoreFromFirestore(snap.data()) as Room);
        }
      },
      (err) => {
        if (onError) onError(err);
      }
    );
  } catch {
    // Non-blocking
  }

  return () => {
    if (unsubscribeRTDB) unsubscribeRTDB();
    if (unsubscribeFS) unsubscribeFS();
  };
}

// ==========================================
// 4. CHAT
// ==========================================
export async function saveChatMessageToRTDB(channel: string, msg: ChatMessage): Promise<void> {
  if (!rtdb || !channel || !msg || !msg.id) return;
  try {
    await rtdbSet(rtdbRef(rtdb, `chats/${channel}/${msg.id}`), msg);
  } catch {}
}

export async function getChatMessagesFromRTDB(channel: string): Promise<ChatMessage[]> {
  if (!rtdb || !channel) return [];
  try {
    const snap = await rtdbGet(rtdbRef(rtdb, `chats/${channel}`));
    if (!snap.exists()) return [];
    const val = snap.val() as Record<string, ChatMessage>;
    return Object.values(val || {}).sort((a, b) => (a.at || 0) - (b.at || 0));
  } catch {
    return [];
  }
}

export function subscribeToChat(
  channel: string,
  onUpdate: (msgs: ChatMessage[]) => void
): () => void {
  if (!rtdb) return () => {};
  const cRef = rtdbRef(rtdb, `chats/${channel}`);
  return rtdbOnValue(cRef, (snap) => {
    if (!snap.exists()) {
      onUpdate([]);
    } else {
      const val = snap.val() as Record<string, ChatMessage>;
      const list = Object.values(val || {}).sort((a, b) => (a.at || 0) - (b.at || 0));
      onUpdate(list);
    }
  });
}
