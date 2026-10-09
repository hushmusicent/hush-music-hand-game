import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'url';
import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  Firestore,
} from 'firebase/firestore';
import {
  getDatabase,
  ref as rtdbRef,
  set as rtdbSet,
  get as rtdbGet,
  remove as rtdbRemove,
  Database,
} from 'firebase/database';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '2mb' }));

// Initialize Firebase Firestore & Realtime Database for cross-device shared persistence
let firestoreDb: Firestore | null = null;
let rtdb: Database | null = null;
try {
  const configFile = path.resolve(__dirname, 'firebase-applet-config.json');
  if (fs.existsSync(configFile)) {
    const firebaseConfig = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    const fbApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    firestoreDb = getFirestore(fbApp, firebaseConfig.firestoreDatabaseId);
    rtdb = getDatabase(
      fbApp,
      firebaseConfig.databaseURL || 'https://project-556676b3-bbce-4e02-8ce-default-rtdb.firebaseio.com/'
    );
    console.log('Firebase Realtime Database & Firestore successfully initialized on backend server!');
  }
} catch (err) {
  console.warn('Could not initialize Firebase in server:', err);
}

// Data storage with file persistence (user accounts, friends, chat)
const DATA_DIR = path.resolve(__dirname, 'data');
const DATA_FILE = path.resolve(DATA_DIR, 'gamestore.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface RoomData {
  code: string;
  game: string;
  seatsNeeded: number;
  seats: string[];
  names: Record<string, string>;
  avatars?: Record<string, string>;
  state: any;
  turn: number;
  status: 'waiting' | 'playing' | 'done';
  host: string;
  created: number;
  lastUpdated: number;
}

interface ChatMessageData {
  id: string;
  who: string;
  uid: string;
  text: string;
  at: number;
  avatar?: string;
}

interface FriendRequestData {
  uid: string;         // sender's uid
  from: string;        // sender's username
  at: number;
  avatar?: string;
  targetUid?: string;  // recipient's uid
}

interface StoredData {
  rooms?: Record<string, RoomData>;
  users: Record<string, any>;
  chat: Record<string, ChatMessageData[]>;
  friends: Record<string, string[]>;
  requests: Record<string, FriendRequestData[]>;
  pendingInvites?: Record<string, any[]>;
}

// Initial memory state
const rooms = new Map<string, RoomData>();
const users = new Map<string, any>();
const chatChannels = new Map<string, ChatMessageData[]>();
const friendsMap = new Map<string, Set<string>>();
const requestsMap = new Map<string, FriendRequestData[]>(); // recipient uid -> incoming requests
const pendingInvites = new Map<string, any[]>();            // clean username/email -> pending requests

// Helper to sanitize nested arrays for Firestore (Firestore rejects arrays inside arrays and undefined values)
function sanitizeForFirestore(val: any, insideArray = false): any {
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

function restoreFromFirestore(val: any): any {
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

// Sync room directly to Firebase Realtime Database & Firestore
async function syncRoomToFirestore(room: RoomData) {
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

  // 1. Primary write to Realtime Database
  if (rtdb) {
    try {
      await rtdbSet(rtdbRef(rtdb, `rooms/${cleanCode}`), payload);
    } catch (err) {
      console.warn('Error saving room to Realtime Database:', err);
    }
  }

  // 2. Dual-write to Firestore for redundancy (sanitizes nested arrays)
  if (firestoreDb) {
    try {
      const firestorePayload = sanitizeForFirestore(payload);
      await setDoc(doc(firestoreDb, 'rooms', cleanCode), firestorePayload);
    } catch (err) {
      console.warn('Error saving room to Firestore:', err);
    }
  }
}

async function deleteRoomFromFirestore(code: string) {
  const cleanCode = String(code).trim().replace(/^[@#]/, '');
  if (rtdb) {
    try {
      await rtdbRemove(rtdbRef(rtdb, `rooms/${cleanCode}`));
    } catch (err) {
      console.warn('Error deleting room from Realtime Database:', err);
    }
  }
  if (firestoreDb) {
    try {
      await deleteDoc(doc(firestoreDb, 'rooms', cleanCode));
    } catch (err) {
      console.warn('Error deleting room from Firestore:', err);
    }
  }
}

// Player / User Realtime Database Sync
async function syncPlayerToRTDB(player: any) {
  if (!rtdb || !player || !player.uid) return;
  // Guard against recreating permanently erased KingVeno account
  const cleanName = (player.username || '').toLowerCase().trim();
  if (player.uid === 'u_zbs0jd0' || cleanName === 'kingveno') {
    return;
  }
  try {
    const safe = sanitizeUser(player);
    await Promise.all([
      rtdbSet(rtdbRef(rtdb, `players/${player.uid}`), safe),
      rtdbSet(rtdbRef(rtdb, `users/${player.uid}`), safe),
    ]);
  } catch (err) {
    console.warn('Error syncing player to RTDB:', err);
  }
}

async function deletePlayerFromRTDB(uid: string) {
  if (!rtdb || !uid) return;
  try {
    await Promise.all([
      rtdbRemove(rtdbRef(rtdb, `players/${uid}`)),
      rtdbRemove(rtdbRef(rtdb, `users/${uid}`)),
      rtdbRemove(rtdbRef(rtdb, `friendRequests/${uid}`)),
      rtdbRemove(rtdbRef(rtdb, `sentRequests/${uid}`)),
      rtdbRemove(rtdbRef(rtdb, `friends/${uid}`)),
    ]);
  } catch (err) {
    console.warn('Error deleting player from RTDB:', err);
  }
}

// Friend Requests Realtime Database Sync
async function syncFriendRequestToRTDB(targetUid: string, req: FriendRequestData) {
  if (!rtdb || !targetUid || !req || !req.uid) return;
  try {
    await rtdbSet(rtdbRef(rtdb, `friendRequests/${targetUid}/${req.uid}`), req);
  } catch (err) {
    console.warn('Error syncing friend request to RTDB:', err);
  }
}

async function removeFriendRequestFromRTDB(targetUid: string, reqUid: string) {
  if (!rtdb || !targetUid || !reqUid) return;
  try {
    await rtdbRemove(rtdbRef(rtdb, `friendRequests/${targetUid}/${reqUid}`));
  } catch (err) {
    console.warn('Error removing friend request from RTDB:', err);
  }
}

async function syncFriendsToRTDB(uid: string, friends: string[]) {
  if (!rtdb || !uid) return;
  try {
    await rtdbSet(rtdbRef(rtdb, `friends/${uid}`), friends);
  } catch (err) {
    console.warn('Error syncing friends to RTDB:', err);
  }
}

async function syncChatToRTDB(channel: string, msg: ChatMessageData) {
  if (!rtdb || !channel || !msg || !msg.id) return;
  try {
    await rtdbSet(rtdbRef(rtdb, `chats/${channel}/${msg.id}`), msg);
  } catch (err) {
    console.warn('Error syncing chat to RTDB:', err);
  }
}

async function loadRoomsFromFirestore() {
  // Load from RTDB first
  if (rtdb) {
    try {
      const snap = await rtdbGet(rtdbRef(rtdb, 'rooms'));
      if (snap.exists()) {
        const val = snap.val() as Record<string, RoomData>;
        for (const [code, r] of Object.entries(val || {})) {
          if (r && r.code && r.status !== 'done') {
            rooms.set(code, {
              ...r,
              lastUpdated: r.lastUpdated || (r as any).updatedAt || r.created || Date.now(),
            });
          }
        }
        console.log(`Loaded ${rooms.size} rooms directly from Firebase Realtime Database.`);
      }
    } catch (err) {
      console.warn('Failed to load rooms from RTDB:', err);
    }
  }

  // Fallback / supplement with Firestore
  if (!firestoreDb) return;
  try {
    const snap = await getDocs(collection(firestoreDb, 'rooms'));
    snap.forEach((d) => {
      const raw = d.data();
      const r = restoreFromFirestore(raw) as RoomData;
      if (r && r.code && !rooms.has(r.code)) {
        rooms.set(r.code, {
          ...r,
          lastUpdated: (r as any).updatedAt || r.created || Date.now(),
        });
      }
    });
    console.log(`Rooms in server after Firebase check: ${rooms.size}`);
  } catch (err) {
    console.warn('Failed to load rooms from Firestore:', err);
  }
}

// Load from disk on startup
function loadStore() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const data: StoredData = JSON.parse(raw);
      if (data.users) {
        for (const [k, v] of Object.entries(data.users)) {
          if (v) {
            users.set(k, {
              ...v,
              points: typeof v.points === 'number' ? v.points : 1000,
              wins: v.wins || {},
              avatar: v.avatar || '🎧',
            });
          }
        }
      }
      if (data.chat) {
        for (const [k, v] of Object.entries(data.chat)) chatChannels.set(k, v);
      }
      if (data.friends) {
        for (const [k, v] of Object.entries(data.friends)) friendsMap.set(k, new Set(v));
      }
      if (data.requests) {
        for (const [k, v] of Object.entries(data.requests)) requestsMap.set(k, v);
      }
      if (data.pendingInvites) {
        for (const [k, v] of Object.entries(data.pendingInvites)) pendingInvites.set(k, v);
      }

      // Guarantee permanently erased KingVeno account is never retained in server memory
      users.delete('u_zbs0jd0');
      for (const [uid, u] of Array.from(users.entries())) {
        if (u.username?.toLowerCase().trim() === 'kingveno') {
          users.delete(uid);
        }
      }
      friendsMap.delete('u_zbs0jd0');
      requestsMap.delete('u_zbs0jd0');
      for (const [chan] of Array.from(chatChannels.entries())) {
        if (chan.includes('u_zbs0jd0')) chatChannels.delete(chan);
      }

      console.log(`Loaded ${users.size} users from gamestore.json`);
    }
  } catch (err) {
    console.warn('Could not load gamestore.json:', err);
  }

  // Load rooms from shared Firebase database
  loadRoomsFromFirestore().catch(() => {});

  // Load existing players from Firebase Realtime Database
  if (rtdb) {
    rtdbGet(rtdbRef(rtdb, 'players'))
      .then((snap) => {
        if (snap.exists()) {
          const val = snap.val();
          let added = 0;
          for (const [uid, p] of Object.entries(val || {})) {
            if (p && typeof p === 'object' && (p as any).uid) {
              const player = p as any;
              if (player.uid === 'u_zbs0jd0' || (player.username || '').toLowerCase().trim() === 'kingveno') continue;
              if (!users.has(player.uid)) {
                users.set(player.uid, {
                  ...player,
                  points: typeof player.points === 'number' ? player.points : 1000,
                  wins: player.wins || {},
                  avatar: player.avatar || '🎧',
                });
                added++;
              }
            }
          }
          if (added > 0) {
            console.log(`Loaded ${added} additional players from RTDB into memory`);
            persistStore(false);
          }
        }
      })
      .catch((err) => {
        console.warn('Could not read players from RTDB on startup:', err);
      });
  }

  // Sync initial state (players, friends, requests) to Firebase Realtime Database
  setTimeout(() => {
    if (rtdb) {
      for (const u of users.values()) syncPlayerToRTDB(u).catch(() => {});
      for (const [uid, fset] of friendsMap.entries()) syncFriendsToRTDB(uid, Array.from(fset)).catch(() => {});
      for (const [targetUid, reqs] of requestsMap.entries()) {
        for (const r of reqs) syncFriendRequestToRTDB(targetUid, r).catch(() => {});
      }
      for (const r of rooms.values()) syncRoomToFirestore(r).catch(() => {});
      console.log('Synchronized players and rooms to Firebase Realtime Database.');
    }
  }, 1000);
}

loadStore();

// Debounced or immediate save to disk (rooms stored in Firestore)
let saveTimeout: NodeJS.Timeout | null = null;
function persistStore(immediate = true) {
  const doSave = () => {
    try {
      const data: StoredData = {
        users: Object.fromEntries(users.entries()),
        chat: Object.fromEntries(chatChannels.entries()),
        friends: Object.fromEntries(
          Array.from(friendsMap.entries()).map(([k, set]) => [k, Array.from(set)])
        ),
        requests: Object.fromEntries(requestsMap.entries()),
        pendingInvites: Object.fromEntries(pendingInvites.entries()),
      };
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.warn('Failed to persist gamestore.json:', err);
    }
  };

  if (immediate) {
    if (saveTimeout) clearTimeout(saveTimeout);
    doSave();
  } else {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(doSave, 200);
  }
}

function findRoom(rawCode: string): RoomData | undefined {
  if (!rawCode) return undefined;
  const str = String(rawCode).trim();

  // 1. Direct clean code (strip # or @ or spaces)
  const clean = str.replace(/^[@#]/, '').trim();
  if (rooms.has(clean)) return rooms.get(clean);
  for (const [k, r] of rooms.entries()) {
    if (k.toLowerCase() === clean.toLowerCase()) return r;
  }

  // 2. If rawCode contains URL query like ?room=9925 or #room=9925 or join=9925 or code: #9925
  const paramMatch = str.match(/(?:room|join|code)[=:\s#]+([a-zA-Z0-9]+)/i);
  let extracted: string | null = null;
  if (paramMatch) {
    extracted = paramMatch[1].trim();
    if (rooms.has(extracted)) return rooms.get(extracted);
    for (const [k, r] of rooms.entries()) {
      if (k.toLowerCase() === extracted.toLowerCase()) return r;
    }
  }

  // 3. Extract any 4 to 6 digit sequence (e.g. from chat invites like "Room code: #8463" or "join 8463")
  const digitsMatch = str.match(/\b\d{4,6}\b/) || str.match(/\d{4,6}/);
  let dCode: string | null = null;
  if (digitsMatch) {
    dCode = digitsMatch[0];
    if (rooms.has(dCode)) return rooms.get(dCode);
    for (const [k, r] of rooms.entries()) {
      if (k === dCode) return r;
    }
  }

  // 4. Number match
  const num = parseInt(clean, 10);
  if (!isNaN(num)) {
    for (const [k, r] of rooms.entries()) {
      if (parseInt(k, 10) === num) return r;
    }
  }

  // 5. Fallback: check gamestore.json from disk
  try {
    if (fs.existsSync(DATA_FILE)) {
      const diskData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      if (diskData.rooms) {
        if (clean && diskData.rooms[clean]) {
          rooms.set(clean, diskData.rooms[clean]);
          return diskData.rooms[clean];
        }
        if (extracted && diskData.rooms[extracted]) {
          rooms.set(extracted, diskData.rooms[extracted]);
          return diskData.rooms[extracted];
        }
        if (dCode && diskData.rooms[dCode]) {
          rooms.set(dCode, diskData.rooms[dCode]);
          return diskData.rooms[dCode];
        }
      }
    }
  } catch {}

  return undefined;
}

// Cleanup stale rooms older than 6 hours
setInterval(() => {
  const cutoff = Date.now() - 6 * 60 * 60 * 1000;
  let deleted = false;
  for (const [code, r] of rooms.entries()) {
    if (r.lastUpdated < cutoff) {
      rooms.delete(code);
      deleted = true;
    }
  }
  if (deleted) persistStore();
}, 15 * 60 * 1000);

// =================== API ROUTES ===================

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    time: Date.now(),
    activeRooms: rooms.size,
    registeredUsers: users.size,
  });
});

// Helper functions for secure password hashing and user sanitization
function hashPassword(password: string, salt = crypto.randomBytes(16).toString('hex')): { salt: string; hash: string } {
  const hash = crypto.createHash('sha256').update(`${salt}:${password}`).digest('hex');
  return { salt, hash };
}

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const hash = crypto.createHash('sha256').update(`${salt}:${password}`).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expectedHash, 'hex'));
  } catch {
    return hash === expectedHash;
  }
}

function sanitizeUser(u: any) {
  if (!u) return null;
  const { passwordHash, passwordSalt, ...safe } = u;
  return {
    ...safe,
    points: typeof safe.points === 'number' ? safe.points : 1000,
    wins: safe.wins || {},
    avatar: safe.avatar || '🎧',
  };
}

// Password recovery state and helper
interface RecoveryCodeData {
  code: string;
  expiresAt: number;
  uid: string;
  email: string;
  username: string;
}
const recoveryCodes = new Map<string, RecoveryCodeData>();

function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(1, local.length - 3))}${local.slice(-1)}@${domain}`;
}

// ---------- USERS ----------
app.post('/api/users/recover/request', (req, res) => {
  const { identifier } = req.body;
  if (!identifier || !identifier.trim()) {
    return res.status(400).json({ error: 'Please enter your username or registered email.' });
  }

  const clean = identifier.trim().toLowerCase();
  const allUsers = Array.from(users.values());
  const found = allUsers.find((u) => {
    if (!u) return false;
    const nameMatch = u.username && u.username.trim().toLowerCase() === clean;
    const emailMatch = u.email && u.email.trim().toLowerCase() === clean;
    const uidMatch = u.uid && u.uid.trim().toLowerCase() === clean;
    return nameMatch || emailMatch || uidMatch;
  });

  if (!found) {
    return res.status(404).json({
      error: `No account found for "${identifier}". Please check your spelling or sign up.`,
    });
  }

  // Generate 6-digit recovery code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const recoveryData: RecoveryCodeData = {
    code,
    expiresAt: Date.now() + 15 * 60 * 1000, // 15 minutes
    uid: found.uid,
    email: found.email || '',
    username: found.username,
  };

  if (found.email) recoveryCodes.set(found.email.toLowerCase(), recoveryData);
  recoveryCodes.set(found.uid.toLowerCase(), recoveryData);
  recoveryCodes.set(found.username.toLowerCase(), recoveryData);

  res.json({
    ok: true,
    username: found.username,
    email: found.email,
    maskedEmail: found.email ? maskEmail(found.email) : undefined,
    recoveryCode: code,
    expiresInSeconds: 900,
    message: 'Recovery code generated successfully.',
  });
});

app.post('/api/users/recover/reset', (req, res) => {
  const { identifier, code, newPassword } = req.body;
  if (!identifier || !identifier.trim()) {
    return res.status(400).json({ error: 'Username or email is required.' });
  }
  if (!code || !code.trim()) {
    return res.status(400).json({ error: 'Please enter the 6-digit recovery code.' });
  }
  if (!newPassword || newPassword.trim().length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters long.' });
  }

  const clean = identifier.trim().toLowerCase();
  const cleanCode = code.trim();

  const record = recoveryCodes.get(clean);
  if (!record) {
    return res.status(400).json({
      error: 'No active recovery session found or session has expired. Please request a new recovery code.',
    });
  }

  if (Date.now() > record.expiresAt) {
    recoveryCodes.delete(clean);
    return res.status(400).json({
      error: 'Recovery code has expired. Please request a new recovery code.',
    });
  }

  if (record.code !== cleanCode) {
    return res.status(400).json({
      error: 'Invalid recovery code. Please check the 6-digit code and try again.',
    });
  }

  const user = users.get(record.uid);
  if (!user) {
    return res.status(404).json({ error: 'Account not found.' });
  }

  // Hash new password and save
  const { salt, hash } = hashPassword(newPassword.trim());
  user.passwordSalt = salt;
  user.passwordHash = hash;
  user.lastSeen = Date.now();
  users.set(user.uid, user);

  // Clear recovery codes
  if (user.email) recoveryCodes.delete(user.email.toLowerCase());
  recoveryCodes.delete(user.uid.toLowerCase());
  recoveryCodes.delete(user.username.toLowerCase());

  deliverPendingInvites(user);
  persistStore(true);

  res.json({
    ok: true,
    message: 'Your password has been successfully reset!',
    user: sanitizeUser(user),
  });
});

app.post('/api/users/login', (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !identifier.trim()) {
    return res.status(400).json({ error: 'Please enter your username or email.' });
  }

  const clean = identifier.trim().toLowerCase();
  const allUsers = Array.from(users.values());
  const found = allUsers.find((u) => {
    if (!u) return false;
    const nameMatch = u.username && u.username.trim().toLowerCase() === clean;
    const emailMatch = u.email && u.email.trim().toLowerCase() === clean;
    const uidMatch = u.uid && u.uid.trim().toLowerCase() === clean;
    return nameMatch || emailMatch || uidMatch;
  });

  if (!found) {
    return res.status(404).json({
      error: `Account "${identifier}" not found. Please check your spelling or sign up.`,
    });
  }

  if (!password || !password.trim()) {
    return res.status(400).json({ error: 'Please enter your password.' });
  }

  // If user already has a password set, verify it
  if (found.passwordHash) {
    const salt = found.passwordSalt || 'hush_music_default_salt';
    const isCorrect = verifyPassword(password, salt, found.passwordHash);
    if (!isCorrect) {
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }
  } else {
    // If existing account was created prior to password requirement, set their password now on login
    const { salt, hash } = hashPassword(password);
    found.passwordSalt = salt;
    found.passwordHash = hash;
    users.set(found.uid, found);
    persistStore();
  }

  // Check and deliver any pending invites for this user
  deliverPendingInvites(found);
  persistStore();
  syncPlayerToRTDB(found).catch(() => {});

  res.json({ ok: true, user: sanitizeUser(found) });
});

app.post('/api/users/signup', (req, res) => {
  const { username, email, password, avatar } = req.body;
  if (!username || !username.trim() || !email || !email.trim()) {
    return res.status(400).json({ error: 'Username and email are required.' });
  }

  if (!password || password.trim().length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters long.' });
  }

  const cleanUser = username.trim();
  const cleanEmail = email.trim().toLowerCase();

  // Check if username or email already exists
  const allUsers = Array.from(users.values());
  let existing = allUsers.find((u) => {
    if (!u) return false;
    return (
      (u.username && u.username.trim().toLowerCase() === cleanUser.toLowerCase()) ||
      (u.email && u.email.trim().toLowerCase() === cleanEmail)
    );
  });

  if (existing) {
    // If account exists, verify password before allowing login
    if (existing.passwordHash) {
      const salt = existing.passwordSalt || 'hush_music_default_salt';
      if (!verifyPassword(password, salt, existing.passwordHash)) {
        return res.status(400).json({
          error: 'An account with this username or email already exists with a different password.',
        });
      }
    } else {
      // Set password for existing legacy account
      const { salt, hash } = hashPassword(password);
      existing.passwordSalt = salt;
      existing.passwordHash = hash;
    }

    if (avatar) existing.avatar = avatar;
    existing.lastSeen = Date.now();
    users.set(existing.uid, existing);
    deliverPendingInvites(existing);
    persistStore();
    syncPlayerToRTDB(existing).catch(() => {});
    return res.json({ ok: true, user: sanitizeUser(existing), isExisting: true });
  }

  const { salt, hash } = hashPassword(password);
  const newUid = `u_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const newUser = {
    uid: newUid,
    username: cleanUser,
    email: cleanEmail,
    passwordSalt: salt,
    passwordHash: hash,
    points: 1000,
    wins: {},
    lastDaily: 0,
    avatar: avatar || '🎧',
    lastSeen: Date.now(),
  };

  users.set(newUid, newUser);
  deliverPendingInvites(newUser);
  persistStore(true);
  syncPlayerToRTDB(newUser).catch(() => {});

  res.json({ ok: true, user: sanitizeUser(newUser) });
});

app.post('/api/users/google-auth', (req, res) => {
  const { displayName, email, avatar } = req.body;
  if (!email || !email.trim()) {
    return res.status(400).json({ error: 'Google email is required.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const allUsers = Array.from(users.values());
  let existing = allUsers.find((u) => u && u.email && u.email.trim().toLowerCase() === cleanEmail);

  if (existing) {
    if (avatar && (!existing.avatar || existing.avatar === '🎧')) {
      existing.avatar = avatar;
    }
    existing.lastSeen = Date.now();
    users.set(existing.uid, existing);
    deliverPendingInvites(existing);
    persistStore();
    syncPlayerToRTDB(existing).catch(() => {});
    return res.json({ ok: true, user: sanitizeUser(existing) });
  }

  const cleanUser = (displayName || cleanEmail.split('@')[0] || 'Player').trim();
  const newUid = `u_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const newUser = {
    uid: newUid,
    username: cleanUser,
    email: cleanEmail,
    points: 1000,
    wins: {},
    lastDaily: 0,
    avatar: avatar || '🎧',
    isGoogleAuth: true,
    lastSeen: Date.now(),
  };

  users.set(newUid, newUser);
  deliverPendingInvites(newUser);
  persistStore(true);
  syncPlayerToRTDB(newUser).catch(() => {});

  res.json({ ok: true, user: sanitizeUser(newUser) });
});

app.post('/api/users/guest', (req, res) => {
  const { avatar } = req.body;
  const randNum = Math.floor(1000 + Math.random() * 9000);
  const guestUid = `guest_${Date.now().toString(36)}_${randNum}`;
  const guestUser = {
    uid: guestUid,
    username: `HushPlayer_${randNum}`,
    email: `player_${randNum}@hushmusic.internal`,
    points: 1000,
    wins: {},
    lastDaily: 0,
    avatar: avatar || '🎧',
    lastSeen: Date.now(),
  };

  users.set(guestUid, guestUser);
  persistStore();
  syncPlayerToRTDB(guestUser).catch(() => {});
  res.json({ ok: true, user: guestUser });
});

function deliverPendingInvites(user: { uid: string; username: string; email?: string }) {
  if (!user || !user.uid) return;
  const cleanUser = (user.username || '').trim().toLowerCase();
  const cleanEmail = (user.email || '').trim().toLowerCase();
  const cleanUid = (user.uid || '').trim().toLowerCase();

  // Ensure user is in users map
  if (!users.has(user.uid)) {
    users.set(user.uid, {
      uid: user.uid,
      username: user.username,
      email: user.email || '',
      avatar: (user as any).avatar || '🎧',
      points: (user as any).points || 1000,
      wins: (user as any).wins || {},
      lastSeen: Date.now(),
    });
  }

  const currentReqs = requestsMap.get(user.uid) || [];
  let changed = false;

  // 1. Iterate over all pending invites and deliver or auto-connect any matching username, email, or uid
  for (const [key, invs] of Array.from(pendingInvites.entries())) {
    const keyLower = key.toLowerCase();
    if (keyLower === cleanUser || (cleanEmail && keyLower === cleanEmail) || keyLower === cleanUid) {
      for (const inv of invs) {
        const senderUid = inv.fromUid;

        // Check if mutual: did current user already send a request to senderUid?
        const senderReqs = requestsMap.get(senderUid) || [];
        const mutualIdx = senderReqs.findIndex((r) => r.uid === user.uid);

        if (mutualIdx !== -1) {
          // Both sent each other requests! Auto-connect as friends!
          senderReqs.splice(mutualIdx, 1);
          requestsMap.set(senderUid, senderReqs);

          if (!friendsMap.has(user.uid)) friendsMap.set(user.uid, new Set());
          if (!friendsMap.has(senderUid)) friendsMap.set(senderUid, new Set());
          friendsMap.get(user.uid)!.add(senderUid);
          friendsMap.get(senderUid)!.add(user.uid);
          changed = true;
        } else if (!currentReqs.some((r) => r.uid === senderUid)) {
          // Deliver as incoming request for user
          currentReqs.push({
            uid: senderUid,
            from: inv.fromUsername,
            at: inv.at,
            avatar: inv.fromAvatar || '🎧',
            targetUid: user.uid,
          });
          changed = true;
        }
      }
      pendingInvites.delete(key);
      changed = true;
    }
  }

  // 2. Reciprocal check: If user sent a pendingInvite to someone who has sent an incoming request to user:
  for (const [key, invs] of Array.from(pendingInvites.entries())) {
    const invIdx = invs.findIndex((i) => i.fromUid === user.uid);
    if (invIdx !== -1) {
      const matchIncomingIdx = currentReqs.findIndex(
        (r) => (r.from || '').trim().toLowerCase() === key.toLowerCase()
      );
      if (matchIncomingIdx !== -1) {
        const otherReq = currentReqs[matchIncomingIdx];
        const otherUid = otherReq.uid;

        if (!friendsMap.has(user.uid)) friendsMap.set(user.uid, new Set());
        if (!friendsMap.has(otherUid)) friendsMap.set(otherUid, new Set());
        friendsMap.get(user.uid)!.add(otherUid);
        friendsMap.get(otherUid)!.add(user.uid);

        currentReqs.splice(matchIncomingIdx, 1);
        invs.splice(invIdx, 1);
        if (invs.length === 0) pendingInvites.delete(key);
        changed = true;
      }
    }
  }

  requestsMap.set(user.uid, currentReqs);

  if (changed) {
    persistStore(true);
  }
}

// Erase a user account and purge all relations, messages, invites, and friendship links
function eraseUserAccount(identifier: string): boolean {
  if (!identifier) return false;
  const clean = identifier.trim().toLowerCase();
  let targetUid = '';

  for (const [uid, u] of users.entries()) {
    if (
      uid.toLowerCase() === clean ||
      (u.username && u.username.toLowerCase() === clean) ||
      (u.email && u.email.toLowerCase() === clean)
    ) {
      targetUid = uid;
      break;
    }
  }

  if (!targetUid && users.has(clean)) {
    targetUid = clean;
  }

  if (!targetUid) {
    return false;
  }

  // 1. Remove from users map
  users.delete(targetUid);

  // 2. Remove user's friendship entries & cleanup other users' friend lists
  friendsMap.delete(targetUid);
  for (const [_uid, flist] of friendsMap.entries()) {
    flist.delete(targetUid);
  }

  // 3. Remove user's incoming requests & cleanup outgoing requests in other users' lists
  requestsMap.delete(targetUid);
  for (const [uid, rlist] of requestsMap.entries()) {
    requestsMap.set(
      uid,
      rlist.filter((r) => r.uid !== targetUid && r.targetUid !== targetUid)
    );
  }

  // 4. Cleanup pending invites
  for (const [key, invs] of Array.from(pendingInvites.entries())) {
    if (key.toLowerCase() === clean || key.toLowerCase() === targetUid.toLowerCase()) {
      pendingInvites.delete(key);
    } else {
      const filtered = invs.filter((inv) => inv.fromUid !== targetUid);
      if (filtered.length === 0) {
        pendingInvites.delete(key);
      } else {
        pendingInvites.set(key, filtered);
      }
    }
  }

  // 5. Cleanup direct chats involving this user
  for (const [chan, msgs] of Array.from(chatChannels.entries())) {
    if (chan.includes(targetUid)) {
      chatChannels.delete(chan);
    } else {
      const remainingMsgs = msgs.filter((m) => m.uid !== targetUid);
      if (remainingMsgs.length !== msgs.length) {
        chatChannels.set(chan, remainingMsgs);
      }
    }
  }

  // 6. Delete from Firebase Realtime Database
  deletePlayerFromRTDB(targetUid).catch(() => {});

  persistStore(true);
  console.log(`User account ${targetUid} (${identifier}) successfully erased from server, RTDB, and store.`);
  return true;
}

app.post('/api/users/delete', (req, res) => {
  const { identifier, uid, email, username } = req.body || {};
  const target = identifier || uid || email || username;
  if (!target) {
    return res.status(400).json({ error: 'Identifier is required to erase user.' });
  }
  const success = eraseUserAccount(target);
  if (success) {
    return res.json({ ok: true, message: `Account "${target}" was permanently erased.` });
  }
  return res.status(404).json({ error: `Account "${target}" not found.` });
});

app.delete('/api/users/:identifier', (req, res) => {
  const { identifier } = req.params;
  const success = eraseUserAccount(identifier);
  if (success) {
    return res.json({ ok: true, message: `Account "${identifier}" was permanently erased.` });
  }
  return res.status(404).json({ error: `Account "${identifier}" not found.` });
});

app.post('/api/users/sync', (req, res) => {
  const { user } = req.body;
  if (user && user.uid) {
    const cleanEmail = (user.email || '').toLowerCase().trim();
    const cleanName = (user.username || '').toLowerCase().trim();
    if (
      user.uid === 'u_zbs0jd0' ||
      cleanName === 'kingveno'
    ) {
      eraseUserAccount(user.uid);
      return res.status(404).json({ error: 'This account has been permanently erased.', erased: true });
    }
    const existing = users.get(user.uid) || {};
    const { passwordHash: _ph, passwordSalt: _ps, ...safeUser } = user;
    const updated = {
      ...existing,
      ...safeUser,
      passwordHash: existing.passwordHash,
      passwordSalt: existing.passwordSalt,
      lastSeen: Date.now(),
    };
    users.set(user.uid, updated);
    deliverPendingInvites(updated);
    persistStore(true);
    syncPlayerToRTDB(updated).catch(() => {});
  }
  res.json({ ok: true });
});

app.get('/api/users', (_req, res) => {
  const sanitized = Array.from(users.values())
    .filter(Boolean)
    .map(sanitizeUser);
  res.json(sanitized);
});

app.get('/api/users/discover', (req, res) => {
  const currentUid = (req.query.currentUid as string) || '';
  const currentFriends = friendsMap.get(currentUid) || new Set<string>();

  const list = Array.from(users.values())
    .filter((u) => u && u.uid !== currentUid && !currentFriends.has(u.uid))
    .map(sanitizeUser)
    .slice(0, 30);

  res.json(list);
});

// ---------- FRIENDS & SOCIAL ----------

// Get user's friend list with enriched profiles
app.get('/api/friends/:uid', (req, res) => {
  const { uid } = req.params;
  const friendUids = friendsMap.get(uid) || new Set<string>();

  const list = Array.from(friendUids).map((fUid) => {
    const u = users.get(fUid);
    return {
      uid: fUid,
      username: u ? u.username : 'Player',
      online: true,
      avatar: u?.avatar || '🎧',
      points: u?.points || 1000,
    };
  });

  res.json(list);
});

// Get incoming requests for user
app.get('/api/friends/requests/:uid', (req, res) => {
  const { uid } = req.params;
  const username = (req.query.username as string) || '';
  const email = (req.query.email as string) || '';

  // Resolve user in data bank
  let targetUid = uid;
  if (!users.has(targetUid) && (username || email)) {
    const cleanU = username.trim().toLowerCase();
    const cleanE = email.trim().toLowerCase();
    const found = Array.from(users.values()).find(
      (u) =>
        u &&
        ((cleanU && u.username && u.username.trim().toLowerCase() === cleanU) ||
          (cleanE && u.email && u.email.trim().toLowerCase() === cleanE))
    );
    if (found) {
      targetUid = found.uid;
    }
  }

  const list = requestsMap.get(targetUid) || [];
  res.json(list);
});

// Get sent requests by user (pending)
app.get('/api/friends/sent/:uid', (req, res) => {
  const { uid } = req.params;
  const sentList: { targetUid: string; targetUsername: string; targetAvatar?: string; at: number }[] = [];

  for (const [targetUid, reqs] of requestsMap.entries()) {
    const matching = reqs.find((r) => r.uid === uid);
    if (matching) {
      const targetUser = users.get(targetUid);
      if (targetUser) {
        sentList.push({
          targetUid,
          targetUsername: targetUser.username,
          targetAvatar: targetUser.avatar || '🎧',
          at: matching.at,
        });
      }
    }
  }

  res.json(sentList);
});

// Send friend request by username, email, or friend code
app.post('/api/friends/request', (req, res) => {
  const { fromUser, targetUsername } = req.body;
  if (!fromUser || !fromUser.uid || !targetUsername) {
    return res.status(400).json({ error: 'Sender user and target username are required.' });
  }

  const cleanRaw = targetUsername.trim();
  // Strip leading '@' or '#' (handles codes like #KINGVENO or @KingVeno)
  const cleanInput = cleanRaw.replace(/^[@#]/, '').trim().toLowerCase();

  if (!cleanInput) {
    return res.status(400).json({ error: 'Please enter a valid player name or code.' });
  }

  // Make sure sender is registered
  if (!users.has(fromUser.uid)) {
    users.set(fromUser.uid, {
      ...fromUser,
      points: typeof fromUser.points === 'number' ? fromUser.points : 1000,
      wins: fromUser.wins || {},
      avatar: fromUser.avatar || '🎧',
    });
  }

  const allUsers = Array.from(users.values());
  // Flexible match: match username, email, uid, or friendCode in the databank
  const target = allUsers.find((u) => {
    if (!u) return false;
    const nameMatch = u.username && u.username.trim().toLowerCase() === cleanInput;
    const emailMatch = u.email && u.email.trim().toLowerCase() === cleanInput;
    const uidMatch = u.uid && u.uid.trim().toLowerCase() === cleanInput;
    const codeMatch = (u as any).friendCode && String((u as any).friendCode).trim().replace(/^[@#]/, '').toLowerCase() === cleanInput;
    return nameMatch || emailMatch || uidMatch || codeMatch;
  });

  // STRICT REQUIREMENT: If the user does not exist in the data bank, DO NOT send or create friend
  if (!target) {
    return res.status(404).json({
      error: `Player "${cleanRaw}" does not exist in the data bank. Friends can only be added if they have an active registered account.`,
    });
  }

  if (target.uid === fromUser.uid) {
    return res.status(400).json({ error: 'You cannot send a friend request to yourself.' });
  }

  // If target exists and is already a friend
  const userFriends = friendsMap.get(fromUser.uid) || new Set<string>();
  if (userFriends.has(target.uid)) {
    return res.json({
      ok: true,
      alreadyFriends: true,
      targetUser: target,
      message: `You are already friends with ${target.username}!`,
    });
  }

  // Check if target previously sent fromUser a request (Mutual connect!)
  const myIncoming = requestsMap.get(fromUser.uid) || [];
  const mutualIdx = myIncoming.findIndex((r) => r.uid === target.uid);
  if (mutualIdx !== -1) {
    // Auto-accept mutual request!
    myIncoming.splice(mutualIdx, 1);
    requestsMap.set(fromUser.uid, myIncoming);

    if (!friendsMap.has(fromUser.uid)) friendsMap.set(fromUser.uid, new Set());
    if (!friendsMap.has(target.uid)) friendsMap.set(target.uid, new Set());
    friendsMap.get(fromUser.uid)!.add(target.uid);
    friendsMap.get(target.uid)!.add(fromUser.uid);

    // Clean target's requests
    const targetReqs = (requestsMap.get(target.uid) || []).filter((r) => r.uid !== fromUser.uid);
    requestsMap.set(target.uid, targetReqs);

    persistStore(true);
    syncFriendsToRTDB(fromUser.uid, Array.from(friendsMap.get(fromUser.uid)!)).catch(() => {});
    syncFriendsToRTDB(target.uid, Array.from(friendsMap.get(target.uid)!)).catch(() => {});
    removeFriendRequestFromRTDB(fromUser.uid, target.uid).catch(() => {});
    removeFriendRequestFromRTDB(target.uid, fromUser.uid).catch(() => {});

    return res.json({
      ok: true,
      autoAccepted: true,
      targetUser: target,
      message: `🎉 Connected! You and ${target.username} are now friends!`,
    });
  }

  // Check if already sent
  const targetReqs = requestsMap.get(target.uid) || [];
  if (targetReqs.some((r) => r.uid === fromUser.uid)) {
    return res.json({
      ok: true,
      alreadyPending: true,
      targetUser: target,
      message: `Friend request is pending for ${target.username}. Waiting for them to accept.`,
    });
  }

  const newReqItem: FriendRequestData = {
    uid: fromUser.uid,
    from: fromUser.username,
    at: Date.now(),
    avatar: fromUser.avatar || '🎧',
    targetUid: target.uid,
  };
  targetReqs.push(newReqItem);
  requestsMap.set(target.uid, targetReqs);

  persistStore(true);
  syncFriendRequestToRTDB(target.uid, newReqItem).catch(() => {});

  return res.json({
    ok: true,
    targetUser: target,
    message: `Friend request sent to ${target.username}! Waiting for them to accept.`,
  });
});

// Accept request
app.post('/api/friends/accept', (req, res) => {
  const { currentUid, reqUid } = req.body;
  if (!currentUid || !reqUid) {
    return res.status(400).json({ error: 'Both user IDs are required.' });
  }

  // Add to friends for both
  if (!friendsMap.has(currentUid)) friendsMap.set(currentUid, new Set());
  if (!friendsMap.has(reqUid)) friendsMap.set(reqUid, new Set());
  friendsMap.get(currentUid)!.add(reqUid);
  friendsMap.get(reqUid)!.add(currentUid);

  // Remove request from current user's incoming
  const reqs = requestsMap.get(currentUid) || [];
  requestsMap.set(
    currentUid,
    reqs.filter((r) => r.uid !== reqUid)
  );

  persistStore();
  syncFriendsToRTDB(currentUid, Array.from(friendsMap.get(currentUid)!)).catch(() => {});
  syncFriendsToRTDB(reqUid, Array.from(friendsMap.get(reqUid)!)).catch(() => {});
  removeFriendRequestFromRTDB(currentUid, reqUid).catch(() => {});

  res.json({ ok: true });
});

// Decline request
app.post('/api/friends/decline', (req, res) => {
  const { currentUid, reqUid } = req.body;
  if (!currentUid || !reqUid) {
    return res.status(400).json({ error: 'Both user IDs are required.' });
  }

  const reqs = requestsMap.get(currentUid) || [];
  requestsMap.set(
    currentUid,
    reqs.filter((r) => r.uid !== reqUid)
  );

  persistStore();
  removeFriendRequestFromRTDB(currentUid, reqUid).catch(() => {});

  res.json({ ok: true });
});

// Cancel sent request
app.post('/api/friends/cancel', (req, res) => {
  const { currentUid, targetUid } = req.body;
  if (!currentUid || !targetUid) {
    return res.status(400).json({ error: 'Both user IDs are required.' });
  }

  if (targetUid.startsWith('invite_')) {
    const key = targetUid.replace('invite_', '').toLowerCase();
    const invs = pendingInvites.get(key) || [];
    pendingInvites.set(
      key,
      invs.filter((i) => i.fromUid !== currentUid)
    );
  } else {
    const reqs = requestsMap.get(targetUid) || [];
    requestsMap.set(
      targetUid,
      reqs.filter((r) => r.uid !== currentUid)
    );
    removeFriendRequestFromRTDB(targetUid, currentUid).catch(() => {});
  }

  persistStore();
  res.json({ ok: true });
});

// Remove / Unfriend
app.post('/api/friends/remove', (req, res) => {
  const { currentUid, friendUid } = req.body;
  if (!currentUid || !friendUid) {
    return res.status(400).json({ error: 'Both user IDs are required.' });
  }

  // Remove from current user's friends
  if (friendsMap.has(currentUid)) {
    friendsMap.get(currentUid)!.delete(friendUid);
  }

  // Remove from friend's friends (mutual unfriend)
  if (friendsMap.has(friendUid)) {
    friendsMap.get(friendUid)!.delete(currentUid);
  }

  // Also clean any pending requests between them
  if (requestsMap.has(currentUid)) {
    requestsMap.set(
      currentUid,
      (requestsMap.get(currentUid) || []).filter((r) => r.uid !== friendUid)
    );
  }
  if (requestsMap.has(friendUid)) {
    requestsMap.set(
      friendUid,
      (requestsMap.get(friendUid) || []).filter((r) => r.uid !== currentUid)
    );
  }

  persistStore(true);
  syncFriendsToRTDB(currentUid, Array.from(friendsMap.get(currentUid) || [])).catch(() => {});
  syncFriendsToRTDB(friendUid, Array.from(friendsMap.get(friendUid) || [])).catch(() => {});
  removeFriendRequestFromRTDB(currentUid, friendUid).catch(() => {});
  removeFriendRequestFromRTDB(friendUid, currentUid).catch(() => {});

  res.json({ ok: true, message: 'Friend removed successfully.' });
});

// ---------- MULTIPLAYER ROOMS ----------

// List active rooms
app.get('/api/rooms', (req, res) => {
  const { game } = req.query;
  const list = Array.from(rooms.values())
    .filter((r) => {
      if (game && r.game !== game) return false;
      return r.status !== 'done';
    })
    .sort((a, b) => b.lastUpdated - a.lastUpdated);

  res.json(list);
});

// Create new room
app.post('/api/rooms', (req, res) => {
  const { hostUser, game, seatsNeeded, code: requestedCode } = req.body;
  if (!hostUser || !hostUser.uid || !game) {
    return res.status(400).json({ error: 'hostUser and game are required' });
  }

  // Generate or use unique 4-digit code
  let code = requestedCode ? String(requestedCode).trim().replace(/^[@#]/, '') : '';
  if (!code || rooms.has(code)) {
    for (let attempts = 0; attempts < 30; attempts++) {
      const candidate = Math.floor(1000 + Math.random() * 9000).toString();
      if (!rooms.has(candidate)) {
        code = candidate;
        break;
      }
    }
  }
  if (!code) {
    code = Math.floor(1000 + Math.random() * 9000).toString();
  }

  const room: RoomData = {
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
    lastUpdated: Date.now(),
  };

  rooms.set(code, room);
  users.set(hostUser.uid, hostUser);
  persistStore();
  syncRoomToFirestore(room).catch(() => {});

  res.json(room);
});

// Get room by code
app.get('/api/rooms/:code', async (req, res) => {
  const code = req.params.code;
  let room = findRoom(code);
  if (!room && firestoreDb) {
    try {
      const clean = code.trim().replace(/^[@#]/, '');
      const snap = await getDoc(doc(firestoreDb, 'rooms', clean));
      if (snap.exists()) {
        room = snap.data() as RoomData;
        rooms.set(room.code, room);
      }
    } catch {}
  }
  if (!room) {
    return res.status(404).json({ error: `Room #${code} not found.` });
  }
  res.json(room);
});

// Join room
app.post('/api/rooms/:code/join', (req, res) => {
  const code = req.params.code;
  const { user, asTestPlayer } = req.body;

  if (!user || !user.uid) {
    return res.status(400).json({ error: 'Valid user profile is required to join.' });
  }

  const room = findRoom(code);
  if (!room) {
    return res.status(404).json({
      error: `Room #${code} not found. Please verify the 4-digit code.`,
    });
  }

  // If room was marked done, re-open it cleanly for a new match
  if (room.status === 'done') {
    room.status = 'waiting';
    room.seats = [room.host];
    room.names = { [room.host]: room.names[room.host] || 'Host' };
    if (room.avatars && room.avatars[room.host]) {
      room.avatars = { [room.host]: room.avatars[room.host] };
    } else {
      room.avatars = {};
    }
    room.state = null;
    room.turn = 0;
  }

  if (!room.avatars) {
    room.avatars = {};
  }

  // Handle same-user testing (e.g. testing across two browser tabs with the same profile)
  const isHost = room.host === user.uid;
  const effectiveUid =
    isHost && (asTestPlayer || room.seats.includes(user.uid)) && room.seats.length === 1
      ? `${user.uid}_p2`
      : user.uid;
  const effectiveUsername =
    effectiveUid !== user.uid ? `${user.username} (P2)` : user.username;

  // If user is already in seats, refresh user metadata and return OK immediately
  if (room.seats.includes(effectiveUid)) {
    room.names[effectiveUid] = effectiveUsername;
    if (user.avatar) room.avatars[effectiveUid] = user.avatar;
    if (room.seats.length >= 2) {
      room.status = 'playing';
    }
    room.lastUpdated = Date.now();
    rooms.set(room.code, room);
    users.set(user.uid, user);
    persistStore(true);
    syncRoomToFirestore(room).catch(() => {});
    return res.json(room);
  }

  // If room is full, replace bot, test player, or allow incoming player to take seat 1
  if (room.seats.length >= room.seatsNeeded) {
    const replaceableIdx = room.seats.findIndex(
      (s) =>
        s !== room.host &&
        (s.startsWith('bot_') ||
          s.includes('test') ||
          s.startsWith('u_test_') ||
          s.startsWith('user_friend') ||
          s.startsWith('friend_') ||
          s.includes('_p2'))
    );
    if (replaceableIdx !== -1) {
      const replacedUid = room.seats[replaceableIdx];
      delete room.names[replacedUid];
      if (room.avatars) delete room.avatars[replacedUid];
      room.seats.splice(replaceableIdx, 1);
    } else if (room.seatsNeeded === 2 && effectiveUid !== room.host) {
      // In a 2-player match, allow the joining player to take the opponent seat (seat 1)
      const seatToReplace = room.seats[1];
      if (seatToReplace) {
        delete room.names[seatToReplace];
        if (room.avatars) delete room.avatars[seatToReplace];
        room.seats.splice(1, 1);
      }
    }
  }

  // Add user to seats if not already in
  if (!room.seats.includes(effectiveUid)) {
    if (room.seats.length >= room.seatsNeeded) {
      return res.status(400).json({
        error: `Room #${room.code} is full (${room.seats.length}/${room.seatsNeeded} players).`,
      });
    }

    room.seats.push(effectiveUid);
    room.names[effectiveUid] = effectiveUsername;
    room.avatars[effectiveUid] = user.avatar || '🎧';

    // When 2 or more players join, game is ready to play
    if (room.seats.length >= 2) {
      room.status = 'playing';
    } else {
      room.status = 'waiting';
    }
  }

  room.lastUpdated = Date.now();
  rooms.set(room.code, room);
  users.set(user.uid, user);
  persistStore(true);
  syncRoomToFirestore(room).catch(() => {});

  res.json(room);
});

// Add a test bot/opponent to room for solo/preview testing
app.post('/api/rooms/:code/add-bot', (req, res) => {
  const code = req.params.code;
  const room = findRoom(code);
  if (!room) {
    return res.status(404).json({ error: `Room #${code} not found.` });
  }

  if (room.seats.length >= room.seatsNeeded) {
    return res.status(400).json({ error: 'Room is already full.' });
  }

  const botUid = `bot_guest_${Date.now().toString(36)}`;
  const botNames = ['ApexPlayer', 'VegasAce', 'ClubCompanion', 'ShadowRival', 'CyberPro'];
  const botName = botNames[Math.floor(Math.random() * botNames.length)];
  const botAvatars = ['🤖', '🎲', '♟️', '👑', '♠️'];
  const botAvatar = botAvatars[Math.floor(Math.random() * botAvatars.length)];

  room.seats.push(botUid);
  room.names[botUid] = botName;
  if (!room.avatars) room.avatars = {};
  room.avatars[botUid] = botAvatar;
  room.status = 'playing';
  room.lastUpdated = Date.now();

  rooms.set(room.code, room);
  persistStore(true);
  syncRoomToFirestore(room).catch(() => {});
  res.json(room);
});

// Update room state
app.post('/api/rooms/:code/update', (req, res) => {
  const code = req.params.code;
  const { room } = req.body;

  if (!room) {
    return res.status(400).json({ error: 'Room data required' });
  }

  const existing = findRoom(code);
  const actualCode = existing ? existing.code : code.trim().replace(/^#/, '');

  // Merge seats, names, avatars so players who joined are never dropped by another player's stale state
  const mergedSeats = existing
    ? Array.from(new Set([...(existing.seats || []), ...(room.seats || [])]))
    : room.seats || [];
  const mergedNames = { ...(existing?.names || {}), ...(room.names || {}) };
  const mergedAvatars = { ...(existing?.avatars || {}), ...(room.avatars || {}) };

  const updatedRoom: RoomData = {
    ...(existing || {}),
    ...room,
    seats: mergedSeats,
    names: mergedNames,
    avatars: mergedAvatars,
    code: actualCode,
    lastUpdated: Date.now(),
  };

  rooms.set(actualCode, updatedRoom);
  persistStore(true);
  syncRoomToFirestore(updatedRoom).catch(() => {});

  res.json({ ok: true, room: updatedRoom });
});

// Leave / Cancel room
app.post('/api/rooms/:code/leave', (req, res) => {
  const code = req.params.code;
  const { uid, cancel } = req.body;

  const room = findRoom(code);
  if (room) {
    if (room.host === uid && cancel) {
      room.status = 'done';
      rooms.set(room.code, room);
      deleteRoomFromFirestore(room.code).catch(() => {});
    } else if (room.host === uid) {
      // Host navigated away temporarily: keep room waiting so friend can still join
      room.lastUpdated = Date.now();
      rooms.set(room.code, room);
      syncRoomToFirestore(room).catch(() => {});
    } else {
      room.seats = room.seats.filter((s) => s !== uid);
      delete room.names[uid];
      if (room.avatars) delete room.avatars[uid];
      if (room.seats.length < 2 && room.status === 'playing') {
        room.status = 'waiting';
      }
      room.lastUpdated = Date.now();
      rooms.set(room.code, room);
      syncRoomToFirestore(room).catch(() => {});
    }
    persistStore(true);
  }

  res.json({ ok: true });
});

// Explicit delete room endpoint
app.post('/api/rooms/:code/delete', async (req, res) => {
  const code = req.params.code;
  const cleanCode = String(code).trim().replace(/^[@#]/, '');
  const r = findRoom(cleanCode);
  if (r) {
    rooms.delete(r.code);
  }
  rooms.delete(cleanCode);
  await deleteRoomFromFirestore(cleanCode);
  persistStore(true);
  res.json({ ok: true });
});

app.delete('/api/rooms/:code', async (req, res) => {
  const code = req.params.code;
  const cleanCode = String(code).trim().replace(/^[@#]/, '');
  const r = findRoom(cleanCode);
  if (r) {
    rooms.delete(r.code);
  }
  rooms.delete(cleanCode);
  await deleteRoomFromFirestore(cleanCode);
  persistStore(true);
  res.json({ ok: true });
});

// ---------- CHAT ----------
app.get('/api/chat/:channel', (req, res) => {
  const { channel } = req.params;
  const messages = chatChannels.get(channel) || [];
  res.json(messages);
});

app.post('/api/chat/:channel', (req, res) => {
  const { channel } = req.params;
  const { msg } = req.body;

  if (!msg || !msg.text) {
    return res.status(400).json({ error: 'Message payload required' });
  }

  const list = chatChannels.get(channel) || [];
  list.push(msg);
  if (list.length > 50) list.shift();
  chatChannels.set(channel, list);
  persistStore();
  syncChatToRTDB(channel, msg).catch(() => {});

  res.json(msg);
});

// Setup dev server with Vite or static production build
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist/index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Hush Music Hand Game server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
