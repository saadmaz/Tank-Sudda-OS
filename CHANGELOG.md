<a id="top"></a>

<div align="center">

<img src=".github/assets/changelog.svg" alt="Tank Sudda POS: Changelog" width="100%">

<br/>

<p><strong>Every notable change to this project, newest first.</strong></p>

<a href="README.md"><img alt="README" src="https://img.shields.io/badge/README-374151?style=for-the-badge&labelColor=111827"></a>
<a href="CONTRIBUTING.md"><img alt="Contributing" src="https://img.shields.io/badge/Contributing-374151?style=for-the-badge&labelColor=111827"></a>
<a href="CODE_OF_CONDUCT.md"><img alt="Code of Conduct" src="https://img.shields.io/badge/Code%20of%20Conduct-374151?style=for-the-badge&labelColor=111827"></a>
<a href="SECURITY.md"><img alt="Security" src="https://img.shields.io/badge/Security-374151?style=for-the-badge&labelColor=111827"></a>
<a href="CHANGELOG.md"><img alt="Changelog" src="https://img.shields.io/badge/Changelog-4ba7db?style=for-the-badge&labelColor=111827"></a>
<a href="LICENSE.md"><img alt="License" src="https://img.shields.io/badge/License-374151?style=for-the-badge&labelColor=111827"></a>

</div>

---

<div align="center">

<a href="https://github.com/saadmaz/Tank-Sudda-POS/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/saadmaz/Tank-Sudda-POS?include_prereleases&style=flat-square&label=latest%20release&labelColor=111827&color=4ba7db"></a>
<a href="https://github.com/saadmaz/Tank-Sudda-POS/compare/main...develop"><img alt="Changes waiting for release" src="https://img.shields.io/github/commits-difference/saadmaz/Tank-Sudda-POS?base=main&head=develop&style=flat-square&label=unreleased%20commits&labelColor=111827&color=374151"></a>

</div>

> [!NOTE]
> The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Each version links to its full comparison at the bottom of this page, and to its [release notes](https://github.com/saadmaz/Tank-Sudda-POS/releases).

## [Unreleased]

### Added

- Staff sign-in with a username and 4-digit PIN, checked on the server against a bcrypt hash, with an escalating lockout after five wrong PINs and a forced PIN change after an administrator issues or resets one.
- Roles (Technician, Supervisor, Office, Manager, Admin, SuperAdmin) and per-module permissions carried in the sign-in token, enforced by Firestore rules and mirrored in the UI.
- App shell: sidebar navigation, a mobile menu, an offline indicator and an account menu with change PIN and sign out.
- Staff screen: add and edit people, their field roles (supervisor, technician), colour, active status, sign-in, role and modules, and reset a PIN. Seniority rules stop anyone editing a peer or granting a role above their own.
- Firestore and Storage rules with an emulator test suite (`npm run test:rules`), a rules deploy workflow and `npm run seed:admin` to create the first SuperAdmin.
- Offline cache for Firestore so screens stay readable and changes queue without a signal.

## [0.1.0] - 2026-11-17

### Added

- Repository foundation: TanStack Start app shell on React 19 and Vite, Tailwind CSS v4 design tokens in the Tank Sudda brand, and Radix-based UI primitives.
- Production Node server (`server.mjs`) with the Content Security Policy, security headers and asset caching, a `Dockerfile`, and a Cloudflare Worker and container configuration for production and development.
- `/healthz` endpoint used by the deploy smoke test.
- CI (lint, formatting, type check, unit tests, build), the Cloudflare deploy workflow and Dependabot.
- README, Contributing guide, Code of Conduct, Security Policy, License, Changelog, issue and pull request templates, and the documentation set: architecture, configuration, deployment, features and roadmap, decision records and runbooks.

[Unreleased]: https://github.com/saadmaz/Tank-Sudda-POS/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/saadmaz/Tank-Sudda-POS/releases/tag/v0.1.0
