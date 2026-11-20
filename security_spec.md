# Security Specification for Firestore Rules

## 1. Data Invariants
- All user, room, and voice operations require an authenticated Firebase Auth user (`request.auth != null`).
- User documents `/users/{uid}` contain only public-safe fields (`uid`, `username`, `points`, `wins`, `lastDaily`, `avatar`, `lastSeen`) — never `email` or `passwordHash`.
- User `points` are bounded (`0 <= points <= 10,000,000`), and only `request.auth.uid == userId` may create, update, or delete their own user document.
- A room must have a valid alphanumeric code conforming to `^[a-zA-Z0-9_\\-]+$` of max length 32, valid `game` type, `seatsNeeded` (1..8), and `host`.
- Only the room `host` or a seated player may update a room (with joining restricted to adding only `request.auth.uid` to open seats), and only the `host` may delete the room.
- `/rooms/{roomId}/voice_signals` and `/rooms/{roomId}/voice_presence` are readable/writable only by players in the parent room.
- `/test/{docId}` is read-only (`get` only) with no public writes.

## 2. Dirty Dozen Attack Payloads
1. **Unauthenticated Access**: Any read/write on `/users` or `/rooms` without Firebase Auth -> REJECTED by `isSignedIn()`.
2. **Cross-User Profile Overwrite**: Signed-in User B writing to `/users/userA` -> REJECTED by `request.auth.uid == userId`.
3. **Private Field Injection**: User document containing `email` or `passwordHash` -> REJECTED by `hasOnly`.
4. **Points Overflow Attack**: Setting `points: 999999999` or negative points -> REJECTED by `0 <= points <= 10000000`.
5. **Cross-User Deletion**: User B attempting to delete `/users/userA` -> REJECTED by `request.auth.uid == userId`.
6. **Non-Host Room Deletion**: Non-host player attempting to delete `/rooms/{roomId}` -> REJECTED by `resource.data.host == request.auth.uid`.
7. **Room Hijack on Join**: Outsider attempting to change `host` or `state` while joining -> REJECTED by `isValidRoomJoin()`.
8. **Outsider Voice Snooping**: Non-room player reading or writing `voice_signals` or `voice_presence` -> REJECTED by `isRoomPlayer(roomId)`.
9. **Public Test Write**: Writing to `/test/connection` -> REJECTED (`allow create, update, delete: if false`).
10. **Invalid ID Injection**: Document ID with special characters or >128 chars -> REJECTED by `isValidId`.
11. **Seats Overfill Attack**: Array of >8 seats in `seats` -> REJECTED by `seats.size() <= 8`.
12. **Catch-All Default Access**: Access to arbitrary paths -> REJECTED by catch-all default-deny.
