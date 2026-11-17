# ADR-0004: Host on Cloudflare

<!-- nav -->

<sub><a href="../../README.md">Project README</a> · <a href="../README.md">Documentation index</a></sub>

| Status   | Date       |
| -------- | ---------- |
| Accepted | 2026-11-17 |

## Decision

Run the Node server in a Cloudflare Container behind a Worker, served at [os.tanksudda.com](https://os.tanksudda.com), with production and development environments deployed by GitHub Actions with Wrangler.

## Alternatives considered

Firebase Hosting with Cloud Functions; Cloudflare Workers alone, which would mean replacing `firebase-admin` with REST calls.

## Rationale

The Tank Sudda website and the other STTPS systems already run on Cloudflare, so one platform, one account and one deploy pattern cover the whole group. A container keeps `firebase-admin` and the server code unchanged, exactly as in Polish Station POS.
