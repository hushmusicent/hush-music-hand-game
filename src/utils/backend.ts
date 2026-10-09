import { User, Room, ChatMessage, Friend, FriendRequest, GameId } from '../types';
import { Storage, STARTING_POINTS, CPU_PAYOUTS, DAILY_BONUS, DAILY_INTERVAL_MS } from './storage';
import { Sound } from './sound';
import {
  saveRoomToRTDB,
  getRoomFromRTDB,
  getOpenRoomsFromRTDB,
  deleteRoomFromRTDB,
  saveRoomToFirestore,
  getRoomFromFirestore,
  getOpenRoomsFromFirestore,
  deleteRoomFromFirestore,
  subscribeToRoom,
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

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  appId: string;
}

export interface LiveKitConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
}

export interface SystemConfig {
  firebase: FirebaseConfig;
  livekit: LiveKitConfig;
}

const DEFAULT_CONFIG: SystemConfig = {
  firebase: {
    apiKey: 'AIzaSyAhT_oPTtMTlUvHaSOf7zWvnUwTGyJf4sk',
    authDomain: 'project-556676b3-bbce-4e02-8ce.firebaseapp.com',
    databaseURL: 'https://project-556676b3-bbce-4e02-8ce-default-rtdb.firebaseio.com/',
    projectId: 'project-556676b3-bbce-4e02-8ce',
    appId: '1:1043689485585:web:a96258740de6856c5f88b0',
  },
  livekit: {
    url: '',
    apiKey: '',
    apiSecret: '',
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
            databaseURL: parsed.firebase?.databaseURL?.trim() || DEFAULT_CONFIG.firebase.databaseURL,
            projectId: parsed.firebase?.projectId?.trim() || DEFAULT_CONFIG.firebase.projectId,
            appId: parsed.firebase?.appId?.trim() || DEFAULT_CONFIG.firebase.appId,
          },
          livekit: {
            url: parsed.livekit?.url || DEFAULT_CONFIG.livekit.url,
            apiKey: parsed.livekit?.apiKey || DEFAULT_CONFIG.livekit.apiKey,
            apiSecret: parsed.livekit?.apiSecret || DEFAULT_CONFIG.livekit.apiSecret,
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
    return !!(cfg.apiKey && cfg.databaseURL && cfg.projectId);
  },

  isLiveKitConfigured(): boolean {
    const cfg = this.getConfig().livekit;
    return !!(cfg.url && cfg.apiKey && cfg.apiSecret);
  },

  // Auth Operations
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
    if (!cleanPassword || cleanPassword.length < 4) {
      throw new Error('Password must be at least 4 characters long');
    }

    try {
      const res = await fetch('/api/users/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUser, email: cleanEmail, password: cleanPassword, avatar }),
      });
      if (res.ok) {
        const data = await res.json();
        const user: User = data.user;
        Storage.saveUser(user);
        Storage.setSession(user);
        savePlayerToRTDB(user).catch(() => {});
        return user;
      }
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Signup failed');
    } catch (err: unknown) {
      const msg = (err as Error).message || '';
      if (!msg.includes('Failed to fetch') && !msg.includes('NetworkError') && !msg.includes('fetch')) {
        throw err;
      }

      // Offline fallback
      if (Storage.getUserByUsername(cleanUser)) {
        throw new Error('Username already taken');
      }
      if (Storage.getUserByEmail(cleanEmail)) {
        throw new Error('Email is already registered');
      }

      const newUser: User = {
        uid: 'u_' + Math.random().toString(36).substring(2, 9),
        username: cleanUser,
        email: cleanEmail,
        points: STARTING_POINTS,
        wins: {},
        lastDaily: 0,
        avatar,
        password: cleanPassword,
      };

      Storage.saveUser(newUser);
      Storage.setSession(newUser);
      this.syncUser(newUser);
      return newUser;
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

    try {
      const res = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: clean, password: cleanPassword }),
      });
      if (res.ok) {
        const data = await res.json();
        const user: User = data.user;
        Storage.saveUser(user);
        Storage.setSession(user);
        savePlayerToRTDB(user).catch(() => {});
        return user;
      }
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Account not found or password incorrect');
    } catch (err: unknown) {
      const msg = (err as Error).message || '';
      if (!msg.includes('Failed to fetch') && !msg.includes('NetworkError') && !msg.includes('fetch')) {
        throw err;
      }

      // Offline fallback
      const cleanLower = clean.toLowerCase();
      const byEmail = Storage.getUserByEmail(cleanLower);
      if (byEmail) {
        if (byEmail.password && byEmail.password !== cleanPassword) {
          throw new Error('Incorrect password. Please try again.');
        }
        Storage.setSession(byEmail);
        this.syncUser(byEmail);
        return byEmail;
      }
      const byUser = Storage.getUserByUsername(cleanLower);
      if (byUser) {
        if (byUser.password && byUser.password !== cleanPassword) {
          throw new Error('Incorrect password. Please try again.');
        }
        Storage.setSession(byUser);
        this.syncUser(byUser);
        return byUser;
      }
      throw new Error('Account not found. Please check your credentials or create an account.');
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

    try {
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
    } catch (err: unknown) {
      const msg = (err as Error).message || '';
      if (!msg.includes('Failed to fetch') && !msg.includes('NetworkError') && !msg.includes('fetch')) {
        throw err;
      }
      // Offline fallback
      const cleanLower = clean.toLowerCase();
      const byEmail = Storage.getUserByEmail(cleanLower);
      const byUser = Storage.getUserByUsername(cleanLower);
      const target = byEmail || byUser;
      if (!target) {
        throw new Error(`No account found for "${identifier}".`);
      }
      const code = '123456';
      return {
        username: target.username,
        email: target.email,
        maskedEmail: target.email ? `${target.email.slice(0, 2)}***@${target.email.split('@')[1]}` : undefined,
        recoveryCode: code,
        expiresInSeconds: 900,
        message: 'Recovery session initiated.',
      };
    }
  },

  async resetPassword(identifier: string, code: string, newPassword: string): Promise<User> {
    const clean = identifier.trim();
    const cleanCode = code.trim();
    const cleanPass = newPassword.trim();

    if (!cleanPass || cleanPass.length < 4) {
      throw new Error('New password must be at least 4 characters long.');
    }

    try {
      const res = await fetch('/api/users/recover/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: clean, code: cleanCode, newPassword: cleanPass }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reset password.');
      }
      const user: User = data.user;
      Storage.saveUser(user);
      Storage.setSession(user);
      this.syncUser(user);
      return user;
    } catch (err: unknown) {
      const msg = (err as Error).message || '';
      if (!msg.includes('Failed to fetch') && !msg.includes('NetworkError') && !msg.includes('fetch')) {
        throw err;
      }
      // Offline fallback
      const cleanLower = clean.toLowerCase();
      const user = Storage.getUserByEmail(cleanLower) || Storage.getUserByUsername(cleanLower);
      if (!user) throw new Error('Account not found.');
      const updated: User = { ...user, password: cleanPass };
      Storage.saveUser(updated);
      Storage.setSession(updated);
      this.syncUser(updated);
      return updated;
    }
  },

  async googleAuth(displayName: string, email: string, avatar?: string): Promise<User> {
    const cleanEmail = email.trim().toLowerCase();
    try {
      const res = await fetch('/api/users/google-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, email: cleanEmail, avatar }),
      });
      if (res.ok) {
        const data = await res.json();
        const user: User = data.user;
        Storage.saveUser(user);
        Storage.setSession(user);
        savePlayerToRTDB(user).catch(() => {});
        return user;
      }
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Google sign-in failed');
    } catch (err: unknown) {
      const msg = (err as Error).message || '';
      if (!msg.includes('Failed to fetch') && !msg.includes('NetworkError') && !msg.includes('fetch')) {
        throw err;
      }

      // Offline fallback
      const existing = Storage.getUserByEmail(cleanEmail);
      if (existing) {
        Storage.setSession(existing);
        savePlayerToRTDB(existing).catch(() => {});
        return existing;
      }
      const newUser: User = {
        uid: 'u_' + Math.random().toString(36).substring(2, 9),
        username: (displayName || cleanEmail.split('@')[0] || 'Player').trim(),
        email: cleanEmail,
        points: STARTING_POINTS,
        wins: {},
        lastDaily: 0,
        avatar,
      };
      Storage.saveUser(newUser);
      Storage.setSession(newUser);
      savePlayerToRTDB(newUser).catch(() => {});
      return newUser;
    }
  },

  async loginGuest(avatar?: string): Promise<User> {
    try {
      const res = await fetch('/api/users/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar }),
      });
      if (res.ok) {
        const data = await res.json();
        const guestUser: User = data.user;
        Storage.saveUser(guestUser);
        Storage.setSession(guestUser);
        savePlayerToRTDB(guestUser).catch(() => {});
        return guestUser;
      }
    } catch {}

    const randNum = Math.floor(1000 + Math.random() * 9000);
    const guestUser: User = {
      uid: 'guest_' + Math.random().toString(36).substring(2, 9),
      username: `HushPlayer_${randNum}`,
      email: `player_${randNum}@hushmusic.internal`,
      points: STARTING_POINTS,
      wins: {},
      lastDaily: 0,
      avatar,
    };
    Storage.saveUser(guestUser);
    Storage.setSession(guestUser);
    this.syncUser(guestUser);
    savePlayerToRTDB(guestUser).catch(() => {});
    return guestUser;
  },

  updateUser(user: User): User {
    Storage.saveUser(user);
    this.syncUser(user);
    return user;
  },

  async logout(): Promise<void> {
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
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const serverUsers: User[] = await res.json();
        const local = Storage.getUsers();
        const map = new Map<string, User>();
        for (const u of Object.values(local)) {
          if (u) {
            map.set(u.uid, {
              ...u,
              points: typeof u.points === 'number' ? u.points : 1000,
              wins: u.wins || {},
            });
          }
        }
        for (const u of serverUsers) {
          if (u) {
            map.set(u.uid, {
              ...u,
              points: typeof u.points === 'number' ? u.points : 1000,
              wins: u.wins || {},
            });
          }
        }
        return Array.from(map.values())
          .sort((a, b) => (b.points || 0) - (a.points || 0))
          .slice(0, 50);
      }
    } catch {}
    return this.getLeaderboard();
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
    savePlayerToRTDB(user).catch(() => {});
    try {
      fetch('/api/users/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user }),
      }).catch(() => {});
    } catch {}
  },

  async deleteUserAccount(identifier: string): Promise<boolean> {
    deletePlayerFromRTDB(identifier).catch(() => {});
    try {
      Storage.deleteUser(identifier);
      const res = await fetch('/api/users/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier }),
      });
      const data = await res.json().catch(() => ({}));
      return !!data.ok;
    } catch {
      Storage.deleteUser(identifier);
      return false;
    }
  },
};
