# Configuration

<!-- nav -->

<sub><a href="../README.md">Project README</a> · <a href="README.md">Documentation index</a></sub>

> Environment variables and configuration files. Part of the [project documentation](README.md).

## Environment variables

Copy [`.env.example`](../.env.example) to `.env` for local work. In CI and production the same names are GitHub Environment secrets, passed to the Worker by [`deploy.yml`](../.github/workflows/deploy.yml).

| Variable                                                               | Used by      | Secret | Purpose                                                          |
| ---------------------------------------------------------------------- | ------------ | :----: | ---------------------------------------------------------------- |
| `VITE_FIREBASE_*`                                                      | Client build |   No   | Firebase web app config, compiled into the browser bundle        |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Server       |  Yes   | Service account for `firebase-admin`                             |
| `SUPERADMIN_NAME`, `SUPERADMIN_USERNAME`, `SUPERADMIN_PIN`             | `seed:admin` |  Yes   | First SuperAdmin, created once; must choose a new PIN at sign-in |
| `VITE_USE_FIREBASE_EMULATOR`                                           | Client build |   No   | `true` to use the local Firebase emulators                       |
| `VITE_SENTRY_DSN`                                                      | Client build |   No   | Optional error reporting                                         |

> [!NOTE]
> Firebase web config values are public identifiers, not secrets: Firestore rules, not the API key, protect the data. The service account private key is a secret and must never be committed.

## Configuration files

| File                                    | Purpose                                           |
| --------------------------------------- | ------------------------------------------------- |
| [`vite.config.ts`](../vite.config.ts)   | Build, chunking and the build id                  |
| [`wrangler.jsonc`](../wrangler.jsonc)   | Cloudflare Worker, container and environments     |
| [`Dockerfile`](../Dockerfile)           | Production container image                        |
| [`.nvmrc`](../.nvmrc)                   | Node.js version (22)                              |
| [`components.json`](../components.json) | UI primitive aliases                              |
| [`firestore.rules`](../firestore.rules) | Data access rules, tested by `npm run test:rules` |
| [`storage.rules`](../storage.rules)     | File access rules                                 |
| [`firebase.json`](../firebase.json)     | Rules, indexes and emulator ports                 |

## Business settings

Prices, locations, staff, equipment, terms and conditions, bank details and targets are managed in the app under **Settings** and stored in Firestore, not in environment variables.
