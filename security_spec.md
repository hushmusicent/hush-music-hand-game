# Security Specification for Firestore Rules

## 1. Data Invariants
- A room must have a valid alphanumeric code conforming to `^[a-zA-Z0-9_\\-]+$` of max length 32.
- A room must define valid `game` type, `seatsNeeded` (1..8), and `host`.
- Room seats array cannot exceed maximum player cap of 8.
- Room status must be one of `waiting`, `playing`, or `done`.
- Arbitrary junk fields or schema injection outside defined allowed keys are forbidden.

## 2. Dirty Dozen Attack Payloads
1. **Invalid ID Injection**: Document ID with 2KB special characters payload or directory traversal attempt -> REJECTED by `isValidId`.
2. **Missing Required Fields**: Room creation missing `host` or `seatsNeeded` -> REJECTED by `hasAll`.
3. **Ghost Field Poisoning**: Room payload containing arbitrary injected keys like `isAdmin: true` -> REJECTED by `hasOnly`.
4. **Invalid Status Injection**: Room payload with `status: 'superuser'` -> REJECTED by `status in ['waiting', 'playing', 'done']`.
5. **Seats Overfill Attack**: Array of 100 seats injected into `seats` -> REJECTED by `seats.size() <= 8`.
6. **Code Mismatch Attack**: Room document `/rooms/1234` created with `{ code: "9999" }` -> REJECTED by `request.resource.data.code == roomId`.
7. **Type Mismatch in Seats Needed**: `seatsNeeded: "two"` instead of number -> REJECTED by `data.seatsNeeded is number`.
8. **Negative Seats Needed**: `seatsNeeded: -5` -> REJECTED by `data.seatsNeeded >= 1`.
9. **Corrupted State Field**: `state: 12345` -> REJECTED by state type validation.
10. **Oversized String in Code**: 500-char string in `code` -> REJECTED by `data.code.size() <= 32`.
11. **Non-map Names Object**: `names: "hacker"` -> REJECTED by `data.names is map`.
12. **Catch-All Default Access**: Direct access to arbitrary non-whitelisted paths like `/admin/config` -> REJECTED by catch-all default-deny.
