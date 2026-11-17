# ADR-0003: Staff sign-in with a PIN and custom tokens

<!-- nav -->

<sub><a href="../../README.md">Project README</a> · <a href="../README.md">Documentation index</a></sub>

| Status   | Date       |
| -------- | ---------- |
| Accepted | 2026-11-17 |

## Decision

Each staff member has their own account and four-digit PIN. The server checks the PIN against a bcrypt hash, applies a lockout after repeated failures, and mints a Firebase custom token carrying the staff member's role and module permissions as claims. The browser signs in with that token, and Firestore rules read the same claims to allow or deny every read and write.

## Alternatives considered

The legacy shared passcode with anonymous sign-in; email and password accounts; Google sign-in.

## Rationale

A shared passcode cannot tell people apart, cannot be revoked for one person and gave no protection at the data layer. Field staff work on shared and personal phones and need a quick sign-in, so a PIN fits better than an email and password. Putting role and permissions in the token claims means the UI and the rules enforce exactly the same access, and the audit log can attribute every change to a person.
