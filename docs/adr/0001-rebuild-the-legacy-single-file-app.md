# ADR-0001: Rebuild the legacy single-file app

<!-- nav -->

<sub><a href="../../README.md">Project README</a> · <a href="../README.md">Documentation index</a></sub>

| Status   | Date       |
| -------- | ---------- |
| Accepted | 2026-11-17 |

## Decision

Replace the legacy Tank Sudda operations app, a single HTML file that compiled React in the browser with Babel and talked to Firestore directly, with a TanStack Start application built the same way as the other STTPS systems. The rebuild ships in phases, each released on its own; the feature set of the legacy app is the baseline every phase is checked against.

## Alternatives considered

Keep extending the single file; port it to a Vite single-page app without a server; adopt an off-the-shelf field-service product.

## Rationale

The legacy app worked, but it had no build step, no tests and no server. Its Firebase configuration and a shared four-digit passcode lived in the page source, every visitor signed in anonymously, and Firestore was effectively open to anyone holding the page. Prices, staff and terms were stored next to orders in one loosely shaped document set, and every report re-parsed free-text service descriptions. A server is needed for staff sign-in, the website intake API and scheduled reminders, and sharing the Polish Station POS stack means one way of building, reviewing and deploying across the group.
