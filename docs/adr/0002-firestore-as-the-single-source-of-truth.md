# ADR-0002: Firestore as the single source of truth

<!-- nav -->

<sub><a href="../../README.md">Project README</a> · <a href="../README.md">Documentation index</a></sub>

| Status   | Date       |
| -------- | ---------- |
| Accepted | 2026-11-17 |

## Decision

Cloud Firestore holds every business record. Screens subscribe with live listeners, writes go straight from the browser through Firestore security rules, and the server uses `firebase-admin` only for what the browser must never do: verifying PINs, minting sign-in tokens, receiving website leads and running scheduled jobs. Records are stored in typed, per-entity collections (`customers`, `jobs`, `payments`, ...) rather than one catch-all `orders` collection.

## Alternatives considered

A relational database behind a server API; keeping the legacy single `orders` collection.

## Rationale

The business already runs on Firebase, the field team needs changes to appear instantly on every phone, and the offline cache in the Firebase SDK lets technicians keep working with a weak signal. Splitting entities lets security rules grant precise access (a technician can update a job's checklist without reading the ledger) and keeps listener payloads small, which matters on mobile data.
