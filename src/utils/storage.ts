import { User, Room, ChatMessage, FriendRequest } from '../types';

export const STARTING_POINTS = 1000;
export const DAILY_BONUS = 500;
export const DAILY_INTERVAL_MS = 20 * 60 * 60 * 1000; // 20 hours

export const CPU_PAYOUTS: Record<string, number> = {
  checkers: 50,
  chess: 100,
  dominoes: 40,
  spades: 60,
  rummy: 60,
  backgammon: 80,
  mahjong: 40,
};

const STORAGE_KEYS = {
  USERS: 'hm_users',
  SESSION: 'hm_session',
  ROOMS: 'hm_rooms',
  CHAT: 'hm_chat_',
  FRIENDS: 'hm_friends_',
  REQUESTS: 'hm_requests_',
  CONFIG: 'hm_config',
};

export const getStored = <T>(key: string, defaultVal: T): T => {
  try {
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : defaultVal;
  } catch {
    return defaultVal;
  }
};

export const setStored = <T>(key: string, value: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota exceeded or private mode
  }
};

export const Storage = {
  getUsers(): Record<string, User> {
    const users = getStored<Record<string, User>>(STORAGE_KEYS.USERS, {});
    for (const [uid, u] of Object.entries(users)) {
      if (
        u.username?.toLowerCase().trim() === 'kingveno' ||
        uid === 'u_zbs0jd0'
      ) {
        delete users[uid];
      }
    }
    return users;
  },

  deleteUser(uidOrEmail: string) {
    const users = this.getUsers();
    const clean = uidOrEmail.toLowerCase().trim();
    for (const [uid, u] of Object.entries(users)) {
      if (
        uid.toLowerCase() === clean ||
        u.email.toLowerCase() === clean ||
        u.username.toLowerCase() === clean
      ) {
        delete users[uid];
      }
    }
    setStored(STORAGE_KEYS.USERS, users);
    const session = this.getSession();
    if (
      session &&
      (session.uid.toLowerCase() === clean ||
        session.email.toLowerCase() === clean ||
        session.username.toLowerCase() === clean)
    ) {
      this.setSession(null);
    }
  },

  saveUser(user: User) {
    const users = this.getUsers();
    users[user.uid] = user;
    setStored(STORAGE_KEYS.USERS, users);
    if (this.getSession()?.uid === user.uid) {
      this.setSession(user);
    }
  },

  getUserByEmail(email: string): User | undefined {
    const users = this.getUsers();
    return Object.values(users).find((u) => u.email.toLowerCase() === email.toLowerCase());
  },

  getUserByUsername(username: string): User | undefined {
    const users = this.getUsers();
    return Object.values(users).find((u) => u.username.toLowerCase() === username.toLowerCase());
  },

  getSession(): User | null {
    return getStored<User | null>(STORAGE_KEYS.SESSION, null);
  },

  setSession(user: User | null) {
    setStored(STORAGE_KEYS.SESSION, user);
  },

  // Rooms
  getRooms(): Record<string, Room> {
    return getStored<Record<string, Room>>(STORAGE_KEYS.ROOMS, {});
  },

  getRoom(code: string): Room | null {
    const rooms = this.getRooms();
    return rooms[code] || null;
  },

  saveRoom(room: Room) {
    const rooms = this.getRooms();
    rooms[room.code] = room;
    setStored(STORAGE_KEYS.ROOMS, rooms);
    // Broadcast for multi-tab support
    window.dispatchEvent(new CustomEvent('hm_room_update', { detail: room }));
  },

  deleteRoom(code: string) {
    const rooms = this.getRooms();
    delete rooms[code];
    setStored(STORAGE_KEYS.ROOMS, rooms);
  },

  // Chat
  getChat(channel: string): ChatMessage[] {
    return getStored<ChatMessage[]>(STORAGE_KEYS.CHAT + channel, []);
  },

  addChatMessage(channel: string, msg: ChatMessage) {
    const messages = this.getChat(channel);
    messages.push(msg);
    if (messages.length > 50) messages.shift();
    setStored(STORAGE_KEYS.CHAT + channel, messages);
    window.dispatchEvent(new CustomEvent('hm_chat_update', { detail: { channel, msg } }));
  },

  // Friends & Requests
  getFriends(uid: string): string[] {
    return getStored<string[]>(STORAGE_KEYS.FRIENDS + uid, []);
  },

  addFriend(uid1: string, uid2: string) {
    const f1 = this.getFriends(uid1);
    if (!f1.includes(uid2)) f1.push(uid2);
    setStored(STORAGE_KEYS.FRIENDS + uid1, f1);

    const f2 = this.getFriends(uid2);
    if (!f2.includes(uid1)) f2.push(uid1);
    setStored(STORAGE_KEYS.FRIENDS + uid2, f2);
  },

  getRequests(uid: string): FriendRequest[] {
    return getStored<FriendRequest[]>(STORAGE_KEYS.REQUESTS + uid, []);
  },

  addRequest(toUid: string, req: FriendRequest) {
    const list = this.getRequests(toUid);
    if (!list.some((r) => r.uid === req.uid)) {
      list.push(req);
      setStored(STORAGE_KEYS.REQUESTS + toUid, list);
    }
  },

  removeRequest(toUid: string, fromUid: string) {
    const list = this.getRequests(toUid).filter((r) => r.uid !== fromUid);
    setStored(STORAGE_KEYS.REQUESTS + toUid, list);
  },
};
