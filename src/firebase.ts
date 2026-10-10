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
export const rtdb: Database = getDatabase(
  app,
  firebaseConfig.databaseURL || 'https://project-556676b3-bbce-4e02-8ce-default-rtdb.firebaseio.com/'
);
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

// Connection validation on initial boot
export async function testConnection(): Promise<boolean> {
  try {
    const testRef = rtdbRef(rtdb, '_test_boot');
    await rtdbSet(testRef, { bootTime: Date.now(), status: 'online' });
    console.log('Firebase Realtime Database connected successfully!');
    return true;
  } catch (rtdbErr) {
    console.warn('Firebase RTDB boot notice:', rtdbErr);
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
      return true;
    } catch (error) {
      console.warn('Firestore test connection notice:', error);
      return false;
    }
  }
}

// Run boot check
testConnection().catch(() => {});

// ==========================================
// 1. PLAYERS / USERS (Realtime Database)
// ==========================================
export async function savePlayerToRTDB(player: User): Promise<void> {
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
    // Write to both /players and /users so it's prominent in Firebase Data console
    await Promise.all([
      rtdbSet(rtdbRef(rtdb, `players/${player.uid}`), payload),
      rtdbSet(rtdbRef(rtdb, `users/${player.uid}`), payload),
    ]);
  } catch (err) {
    console.error('Error writing player to Realtime Database:', err);
  }
}

export async function getPlayerFromRTDB(uid: string): Promise<User | null> {
  if (!uid) return null;
  try {
    let raw: any = null;
    const snap = await rtdbGet(rtdbRef(rtdb, `players/${uid}`));
    if (snap.exists()) {
      raw = snap.val();
    } else {
      const userSnap = await rtdbGet(rtdbRef(rtdb, `users/${uid}`));
      if (userSnap.exists()) {
        raw = userSnap.val();
      }
    }
    if (!raw) return null;
    // Never return the password, passwordHash, or passwordSalt field when reading player data
    const { password, passwordHash, passwordSalt, ...safeUser } = raw;
    return safeUser as User;
  } catch (err) {
    console.warn('Error reading player from Realtime Database:', err);
    return null;
  }
}

export async function getAllPlayersFromRTDB(): Promise<User[]> {
  try {
    const snap = await rtdbGet(rtdbRef(rtdb, 'players'));
    let rawList: any[] = [];
    if (!snap.exists()) {
      const uSnap = await rtdbGet(rtdbRef(rtdb, 'users'));
      if (uSnap.exists()) {
        rawList = Object.values((uSnap.val() || {}) as Record<string, any>);
      }
    } else {
      rawList = Object.values((snap.val() || {}) as Record<string, any>);
    }
    return rawList
      .filter(
        (u) =>
          u &&
          u.uid !== 'u_zbs0jd0' &&
          u.username?.toLowerCase() !== 'kingveno'
      )
      .map((u) => {
        // Never return password fields when reading player data
        const { password, passwordHash, passwordSalt, ...safeUser } = u;
        return safeUser as User;
      });
  } catch (err) {
    console.warn('Error fetching all players from Realtime Database:', err);
    return [];
  }
}

export async function deletePlayerFromRTDB(uid: string): Promise<void> {
  if (!uid) return;
  try {
    await Promise.all([
      rtdbRemove(rtdbRef(rtdb, `players/${uid}`)),
      rtdbRemove(rtdbRef(rtdb, `users/${uid}`)),
      rtdbRemove(rtdbRef(rtdb, `friendRequests/${uid}`)),
      rtdbRemove(rtdbRef(rtdb, `sentRequests/${uid}`)),
      rtdbRemove(rtdbRef(rtdb, `friends/${uid}`)),
    ]);
  } catch (err) {
    console.warn('Error deleting player from Realtime Database:', err);
  }
}

export function subscribeToPlayers(onUpdate: (players: User[]) => void): () => void {
  const pRef = rtdbRef(rtdb, 'players');
  return rtdbOnValue(pRef, (snap) => {
    if (!snap.exists()) {
      onUpdate([]);
    } else {
      const list = Object.values((snap.val() || {}) as Record<string, any>)
        .filter(
          (u) =>
            u &&
            u.uid !== 'u_zbs0jd0' &&
            u.username?.toLowerCase() !== 'kingveno'
        )
        .map((u) => {
          // Never return password fields when reading player data
          const { password, passwordHash, passwordSalt, ...safeUser } = u;
          return safeUser as User;
        });
      onUpdate(list);
    }
  });
}

// ==========================================
// 2. FRIEND REQUESTS & FRIENDS (Realtime Database)
// ==========================================
export async function saveFriendRequestToRTDB(targetUid: string, req: FriendRequest): Promise<void> {
  if (!targetUid || !req || !req.uid) return;
  try {
    await rtdbSet(rtdbRef(rtdb, `friendRequests/${targetUid}/${req.uid}`), req);
  } catch (err) {
    console.error('Error writing friend request to Realtime Database:', err);
  }
}

export async function getFriendRequestsFromRTDB(targetUid: string): Promise<FriendRequest[]> {
  if (!targetUid) return [];
  try {
    const snap = await rtdbGet(rtdbRef(rtdb, `friendRequests/${targetUid}`));
    if (!snap.exists()) return [];
    const val = snap.val() as Record<string, FriendRequest>;
    return Object.values(val || {});
  } catch (err) {
    console.warn('Error reading friend requests from Realtime Database:', err);
    return [];
  }
}

export async function removeFriendRequestFromRTDB(targetUid: string, reqUid: string): Promise<void> {
  if (!targetUid || !reqUid) return;
  try {
    await rtdbRemove(rtdbRef(rtdb, `friendRequests/${targetUid}/${reqUid}`));
  } catch (err) {
    console.warn('Error removing friend request from Realtime Database:', err);
  }
}

export async function saveSentRequestToRTDB(
  fromUid: string,
  sentData: { targetUid: string; targetUsername: string; targetAvatar?: string; at: number }
): Promise<void> {
  if (!fromUid || !sentData || !sentData.targetUid) return;
  try {
    await rtdbSet(rtdbRef(rtdb, `sentRequests/${fromUid}/${sentData.targetUid}`), sentData);
  } catch (err) {
    console.error('Error saving sent request to Realtime Database:', err);
  }
}

export async function getSentRequestsFromRTDB(fromUid: string): Promise<any[]> {
  if (!fromUid) return [];
  try {
    const snap = await rtdbGet(rtdbRef(rtdb, `sentRequests/${fromUid}`));
    if (!snap.exists()) return [];
    const val = snap.val() as Record<string, any>;
    return Object.values(val || {});
  } catch (err) {
    console.warn('Error reading sent requests from Realtime Database:', err);
    return [];
  }
}

export async function removeSentRequestFromRTDB(fromUid: string, targetUid: string): Promise<void> {
  if (!fromUid || !targetUid) return;
  try {
    await rtdbRemove(rtdbRef(rtdb, `sentRequests/${fromUid}/${targetUid}`));
  } catch (err) {
    console.warn('Error removing sent request from Realtime Database:', err);
  }
}

export function subscribeToFriendRequests(
  targetUid: string,
  onUpdate: (reqs: FriendRequest[]) => void
): () => void {
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
  if (!uid) return;
  try {
    await rtdbSet(rtdbRef(rtdb, `friends/${uid}`), friends);
  } catch (err) {
    console.error('Error writing friends to Realtime Database:', err);
  }
}

export async function getFriendsFromRTDB(uid: string): Promise<string[]> {
  if (!uid) return [];
  try {
    const snap = await rtdbGet(rtdbRef(rtdb, `friends/${uid}`));
    if (!snap.exists()) return [];
    const val = snap.val();
    return Array.isArray(val) ? val : Object.values(val || {});
  } catch (err) {
    console.warn('Error reading friends from Realtime Database:', err);
    return [];
  }
}

// ==========================================
// 3. ROOMS (Realtime Database & Dual-Write)
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

export async function saveRoomToRTDB(room: Room): Promise<void> {
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

  // 1. Primary write directly to Realtime Database
  try {
    await rtdbSet(rtdbRef(rtdb, `rooms/${cleanCode}`), payload);
  } catch (rtdbErr) {
    console.error('Realtime Database Room Write Error:', rtdbErr);
  }

  // 2. Dual-write to Firestore for redundancy (sanitizes nested arrays)
  try {
    const firestorePayload = sanitizeForFirestore(payload);
    await setDoc(doc(db, 'rooms', cleanCode), firestorePayload);
  } catch {
    // Non-blocking fallback
  }
}

export async function getRoomFromRTDB(code: string): Promise<Room | null> {
  const cleanCode = String(code).trim().replace(/^[@#]/, '');
  // 1. Try Realtime Database first
  try {
    const snap = await rtdbGet(rtdbRef(rtdb, `rooms/${cleanCode}`));
    if (snap.exists()) {
      return snap.val() as Room;
    }
  } catch (err) {
    console.warn('RTDB room get warning:', err);
  }

  // 2. Firestore fallback
  try {
    const snap = await getDoc(doc(db, 'rooms', cleanCode));
    if (snap.exists()) return restoreFromFirestore(snap.data()) as Room;
  } catch {
    // Non-blocking
  }
  return null;
}

export async function getOpenRoomsFromRTDB(game?: GameId): Promise<Room[]> {
  try {
    const snap = await rtdbGet(rtdbRef(rtdb, 'rooms'));
    if (snap.exists()) {
      const allRooms = snap.val() as Record<string, Room>;
      const rooms: Room[] = [];
      for (const r of Object.values(allRooms || {})) {
        if (!r || !r.code) continue;
        if ((!game || r.game === game) && r.status !== 'done') {
          rooms.push(r);
        }
      }
      return rooms;
    }
  } catch (err) {
    console.warn('RTDB getOpenRooms error:', err);
  }

  // Fallback to Firestore
  try {
    const snap = await getDocs(collection(db, 'rooms'));
    const rooms: Room[] = [];
    snap.forEach((d) => {
      const r = restoreFromFirestore(d.data()) as Room;
      if ((!game || r.game === game) && r.status !== 'done') {
        rooms.push(r);
      }
    });
    return rooms;
  } catch {
    return [];
  }
}

export async function deleteRoomFromRTDB(code: string): Promise<void> {
  const cleanCode = String(code).trim().replace(/^[@#]/, '');
  try {
    await rtdbRemove(rtdbRef(rtdb, `rooms/${cleanCode}`));
  } catch (err) {
    console.warn('RTDB room delete warning:', err);
  }
  try {
    await deleteDoc(doc(db, 'rooms', cleanCode));
  } catch {
    // Non-blocking
  }
}

export function subscribeToRoom(
  code: string,
  onUpdate: (room: Room | null) => void,
  onError?: (err: Error) => void
): () => void {
  const cleanCode = String(code).trim().replace(/^[@#]/, '');
  const roomRef = rtdbRef(rtdb, `rooms/${cleanCode}`);

  const unsubscribeRTDB = rtdbOnValue(
    roomRef,
    (snap) => {
      if (!snap.exists()) {
        onUpdate(null);
      } else {
        onUpdate(snap.val() as Room);
      }
    },
    (err) => {
      console.warn('RTDB room subscribe error:', err);
      if (onError) onError(err);
    }
  );

  // Firestore backup listener
  let unsubscribeFS: (() => void) | null = null;
  try {
    unsubscribeFS = onSnapshot(doc(db, 'rooms', cleanCode), (snap) => {
      if (snap.exists()) {
        onUpdate(restoreFromFirestore(snap.data()) as Room);
      }
    });
  } catch {
    // Non-blocking
  }

  return () => {
    unsubscribeRTDB();
    if (unsubscribeFS) unsubscribeFS();
  };
}

// Aliases for full compatibility
export const saveRoomToFirestore = saveRoomToRTDB;
export const getRoomFromFirestore = getRoomFromRTDB;
export const getOpenRoomsFromFirestore = getOpenRoomsFromRTDB;
export const deleteRoomFromFirestore = deleteRoomFromRTDB;

// ==========================================
// 4. CHAT (Realtime Database)
// ==========================================
export async function saveChatMessageToRTDB(channel: string, msg: ChatMessage): Promise<void> {
  if (!channel || !msg || !msg.id) return;
  try {
    await rtdbSet(rtdbRef(rtdb, `chats/${channel}/${msg.id}`), msg);
  } catch (err) {
    console.error('Error writing chat message to Realtime Database:', err);
  }
}

export async function getChatMessagesFromRTDB(channel: string): Promise<ChatMessage[]> {
  if (!channel) return [];
  try {
    const snap = await rtdbGet(rtdbRef(rtdb, `chats/${channel}`));
    if (!snap.exists()) return [];
    const val = snap.val() as Record<string, ChatMessage>;
    return Object.values(val || {}).sort((a, b) => (a.at || 0) - (b.at || 0));
  } catch (err) {
    console.warn('Error reading chat messages from Realtime Database:', err);
    return [];
  }
}

export function subscribeToChat(
  channel: string,
  onUpdate: (msgs: ChatMessage[]) => void
): () => void {
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

