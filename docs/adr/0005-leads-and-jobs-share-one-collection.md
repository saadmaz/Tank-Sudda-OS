# ADR-0005: Leads and jobs share one collection

<!-- nav -->

<sub><a href="../../README.md">Project README</a> · <a href="../README.md">Documentation index</a></sub>

| Status   | Date       |
| -------- | ---------- |
| Accepted | 2026-11-18 |

## Decision

A lead and the job it becomes are one document in `jobs`, identified by a reference such as `TS-261118-K7Q2`. Its `status` moves through `new`, `quoted`, `scheduled`, `in_progress` and `completed`, or to `cancelled`. The Leads screen shows `new` and `quoted`; the Jobs screen shows the rest. Legal moves are defined once in `src/lib/job.ts` and mirrored in `firestore.rules`.

## Alternatives considered

Separate `leads` and `jobs` collections with a conversion step; the legacy single `orders` collection with free-text service descriptions.

## Rationale

In this business almost every lead becomes exactly one job with the same customer, site and priced work, so a conversion step would only copy data and split its history. One document keeps the reference, price and timeline continuous from first call to final payment, and lets reports measure conversion directly. Unlike the legacy app, the work is stored as typed tanks, sumps and add-ons with captured prices, so nothing is parsed back out of text. References are generated on the device, so they work offline and never collide in practice.
