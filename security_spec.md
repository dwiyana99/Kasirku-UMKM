# KasirAkun UMKM — Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Default Deny**: All unmatched paths are denied (`allow read, write: if false`).
2. **PII & Owner Isolation**: `/users/{userId}` and `/users/{userId}/tenants/{tenantId}` can ONLY be read, listed, created, updated, or deleted by the authenticated, email-verified user whose `request.auth.uid == userId`.
3. **Master Gate**: Every subcollection write under `/users/{userId}/tenants/{tenantId}` verifies the parent user document exists (`exists(/databases/$(database)/documents/users/$(userId))`) and `ownerId == request.auth.uid`.
4. **Immutable Ownership & Timestamps**: `ownerId` and `createdAt` cannot change after creation; timestamps must equal `request.time`.
5. **Strict Key Allowlists**: Both `create` and `update` reject ghost/shadow fields using `hasAll` + `hasOnly` and `affectedKeys().hasOnly()`.

## 2. The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. Unauthenticated read on `/users/uid1/tenants/t1`
2. Unverified email user writing `/users/uid1`
3. Cross-tenant ID spoofing (`userA` reading `/users/userB/tenants/t1`)
4. Setting `ownerId` to another user's UID on create
5. Injecting shadow/ghost field (`isAdmin: true`) on `/users/{uid}` create
6. Injecting shadow field (`isVerified: true`) on `/users/{uid}/tenants/{tid}` update
7. Poisoning document ID with >128 chars or invalid regex characters (`../../etc`)
8. Mutating immutable `ownerId` during tenant update
9. Mutating immutable `createdAt` during tenant update
10. Spoofing client-side `createdAt` instead of `request.time`
11. Passing invalid `vertical` enum value (`CRYPTO_SCAM`)
12. Passing oversized `displayName` (>150 chars) or non-map `workspacePayload`
