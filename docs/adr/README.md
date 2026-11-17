# Architecture decision records

<!-- nav -->

<sub><a href="../../README.md">Project README</a> · <a href="../README.md">Documentation index</a></sub>

An architecture decision record (ADR) captures one significant technical decision: what was decided, what else was considered, and why. ADRs are never edited after acceptance; a later ADR supersedes an earlier one instead.

## Writing a new ADR

1. Copy [TEMPLATE.md](TEMPLATE.md) to `NNNN-short-title.md`, using the next free number.
2. Fill it in and set the status to `Proposed`.
3. Open it in a pull request with the change it describes. It becomes `Accepted` when merged.
4. If it replaces an earlier decision, set the earlier ADR's status to `Superseded by ADR-NNNN`.

## Index

| ADR                                                        | Decision                                   | Status   |
| ---------------------------------------------------------- | ------------------------------------------ | -------- |
| [0001](0001-rebuild-the-legacy-single-file-app.md)         | Rebuild the legacy single-file app         | Accepted |
| [0002](0002-firestore-as-the-single-source-of-truth.md)    | Firestore as the single source of truth    | Accepted |
| [0003](0003-staff-sign-in-with-a-pin-and-custom-tokens.md) | Staff sign-in with a PIN and custom tokens | Accepted |
| [0004](0004-host-on-cloudflare.md)                         | Host on Cloudflare                         | Accepted |
