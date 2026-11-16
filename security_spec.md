# Kora Ledger Security Specification (Phase 0)

## 1. Data Invariants
1. **PII & Financial Isolation**: Every document in `/users/{userId}` and all subcollections (`settings`, `statements`, `cycles`, `transactions`, `backups`) is strictly readable and writable ONLY by the verified owner (`request.auth.uid == userId` and `request.auth.token.email_verified == true`).
2. **Master Gate Parent Existence**: No subcollection document (`settings`, `statements`, `cycles`, `transactions`, `backups`) can be created or updated unless the parent `/users/{userId}` document exists.
3. **Strict Key Allowlists**: Every document creation and update enforces `hasAll` and `hasOnly` (on create) and `affectedKeys().hasOnly(...)` (on update) to prevent shadow/ghost fields.
4. **Temporal & Ownership Integrity**: `ownerId` / `uid` and `createdAt` are immutable after creation. `createdAt == request.time` on create; `updatedAt == request.time` on create and update.
5. **Domain Bounds**: Monetary numbers must be finite non-negative numbers (`>= 0`, `amount > 0` for transactions), currencies restricted to `['KES', 'USD', 'EUR', 'GBP']`, month keys restricted to `^\\d{4}-\\d{2}$`, and strings bounded by explicit `.size()` limits.

## 2. Adversarial "Dirty Dozen" Attack Payloads (Expected: PERMISSION_DENIED)
1. **Cross-Tenant Read**: User B attempts `get` or `list` on `/users/{userA}/transactions`.
2. **Unverified Email Write**: User A with `email_verified: false` attempts to create a transaction.
3. **Owner Spoofing**: User A creates a transaction under `/users/{userA}/transactions/tx1` with `ownerId: "userB"`.
4. **Shadow Field Injection**: User A creates a statement with an undocumented extra field `isAdmin: true`.
5. **Immutable `createdAt` Tampering**: User A updates a `BudgetCycle` and attempts to rewrite `createdAt`.
6. **Client Timestamp Forgery**: User A creates a `LedgerTransaction` with a hardcoded past `createdAt` instead of `request.time`.
7. **Negative Revenue/Expense Poisoning**: User A creates a `LedgerTransaction` with `amount: -5000`.
8. **Invalid Currency Injection**: User A sets `baseCurrency: "XYZ"` in `WorkspaceSettings`.
9. **Path ID Poisoning**: User A writes to `/users/{userA}/transactions/{150-char-invalid-id!@#}`.
10. **Invalid Month Key**: User A writes a statement with `monthKey: "November-2026"` instead of `"2026-11"`.
11. **Oversized String DoS**: User A submits a `description` of 5,000 characters on a transaction (limit 240).
12. **Orphan Subcollection Write**: User A attempts to write a `LedgerTransaction` before `/users/{userA}` parent exists.
