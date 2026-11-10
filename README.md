<p align="center">
  <img src="apps/web/public/logo.svg" alt="ABHIORAX Logo" width="84" height="84" />
</p>

<h1 align="center">ABHIORAX</h1>

<p align="center">
  <strong>A fearless, forward, next-generation social, communication, and creator platform — engineered with WCAG AAA accessibility at its core.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-7de3ff.svg" /></a>
  <img alt="Next.js 14" src="https://img.shields.io/badge/Next.js-14-0b0b12?logo=nextdotjs" />
  <img alt="Accessibility: WCAG AAA" src="https://img.shields.io/badge/Accessibility-WCAG%20AAA-ffd54a" />
</p>

---

## Brand & Etymology

- **Abhi** — fearless, forward
- **Ora** — Latin: *horizon*
- **X** — next-generation innovation

> The **ABHIORAX** name and logo mark (`apps/web/public/logo.svg`) identify this project; please retain attribution when forking or building upon the codebase.

---

## How ABHIORAX Helps

Most social platforms force users into opaque feeds, lock creators into non-portable audiences, and treat accessibility as an afterthought. **ABHIORAX** solves those problems across four groups:

### 1. For Everyday Users & Readers
- **You control your feed:** Switch instantly between **For you** (AI-ranked with `"Why you see this"` explanations), **Following** (pure chronological), **Groups**, and **Saved** bookmarks—and mute unwanted keywords anytime.
- **No "closed door" friction:** Browse public posts, trending hashtags, and public profiles before creating an account, or sign in quickly via email/password or instant OAuth/Magic Link dev flows.
- **Comfortable reading for everyone:** Toggle **High Contrast**, **Larger Text**, and **Dyslexia-Friendly Spacing** from the persistent Accessibility Dock, or click **TL;DR** on long posts for an instant AI summary.

### 2. For Creators & Educators
- **Own your audience (zero lock-in):** Export your paid/membership subscribers as a portable **CSV** directly from the **Creator Studio** (`/creator/dashboard`).
- **Direct support & planning:** Receive **tips** and **memberships**, **schedule posts** ahead of time, and view transparent reach metrics (views, likes, comments) without hidden throttling.
- **Accessibility Verified badge:** AI automatically drafts alt text on uploaded images so creators publish accessible visual content in seconds and earn an **A11y** badge.

### 3. For Communities & Real-Time Discussions
- **mIRC-inspired Live Rooms (`/rooms`):** Jump into active `#channels` (`#lobby`, `#tech`, `#accessibility`, `#creators`, or `/join #your-topic`) with live online user lists, classic IRC log or modern card views, slash commands (`/join`, `/topic`, `/me`, `/msg`, `/clear`, `/help`), and photo/video sharing.
- **Topic Groups (`/groups`):** Organize deeper discussions with category filters, pinned posts, inline polls, rich media posts, and linked group chat rooms.
- **Private 2-Pane Messenger (`/chat`):** Real-time WebSocket DMs with typing indicators, read receipts, and photo/video/audio attachments.

### 4. For Developers & Organizations
- **Production-minded architecture:** Includes a canonical PostgreSQL 16 + `pgvector` schema ([database/schema.sql](database/schema.sql)), OpenAPI 3.1 contract ([docs/api/openapi.yaml](docs/api/openapi.yaml)), 9 Architecture Decision Records ([docs/adrs](docs/adrs)), and Docker Compose infra ([infra/docker/docker-compose.yml](infra/docker/docker-compose.yml)).
- **Zero-setup local backend:** Runs out-of-the-box with Node.js via `services/api` (including real-time Socket.IO `/chat`, media uploads up to 25 MB, AI moderation/ranking, and JSON persistence).
- **Automated quality gates:** Verified with TypeScript, ESLint, API QC (`58` checks), API UAT (`43` checks), Playwright WCAG AAA structural audits (`7` checks), and Playwright end-to-end browser journeys (`11` journeys).

---

## Core Features Overview

| Capability | Route / Module | Key Features |
|---|---|---|
| **Public Explore** | `/` · `/search` | Unauthenticated explore feed, trending `#hashtags`, public profiles, OpenGraph link previews |
| **Feed & Stories** | `/feed` | `For you` / `Following` / `Groups` / `Saved` tabs, keyword mute, 24h photo/video/text Stories, interest onboarding |
| **Rich Posts** | [`Composer`](apps/web/components/feed/Composer.tsx) · [`PostCard`](apps/web/components/feed/PostCard.tsx) | Multi-image/video/audio uploads (up to 25 MB), live previews, AI alt-text, polls, 7 reactions, edit/delete, share, report, TL;DR |
| **mIRC Live Rooms** | `/rooms` | Real-time `#channels`, online nick list, `/join`, `/topic`, `/me`, `/msg`, `/clear`, `/help`, IRC log/card toggle, media |
| **Messenger** | `/chat` | 2-pane DM cockpit, `@username` launcher, WebSocket + REST fallback, typing indicators, photo/video/audio messages |
| **Communities** | `/groups` | Category filtering, create/join/leave groups, pinned posts, polls, media posts, group chat links |
| **Profiles & Safety** | `/u/[username]` · `/settings` | User posts feed, follow/unfollow, followers/following lists, block/unblock, privacy controls, 2FA/MFA setup |
| **Notifications** | `/notifications` | Unread badge in header, follow/like/reaction/comment/mention/tip alerts, mark all read |
| **Creator Studio** | `/creator/dashboard` | Views/likes/comments/subscribers/tips metrics, scheduled posts, portable CSV subscriber export |
| **Admin Console** | `/admin/dashboard` | Platform stats, AI-flagged & user-submitted moderation queue, user role management |
| **Accessibility & PWA** | [`AccessibilityProvider`](apps/web/components/a11y/AccessibilityProvider.tsx) · `public/` | WCAG AAA contrast, skip links, focus traps, High Contrast, Large Text, Dyslexia mode, installable PWA + mobile nav |

---

## Quick Start (Local Development)

### Prerequisites
- **Node.js** `>= 20`

### 1. Install dependencies
```bash
npm install
```

### 2. Start the API & Web App
Open two terminals at the repository root:

```bash
# Terminal 1 — API & WebSocket server (http://localhost:8080/v1)
npm run dev:api

# Terminal 2 — Next.js 14 Web App (http://localhost:3000)
npm run dev:web
```

Or on Windows, start the API with `start.bat` (or run both npm scripts).

### 3. Local Dev Admin Account
`services/api` pre-seeds a local development admin account on first boot (data stored in `services/api/data/store.json`):
- **Username:** `admin` (or `admin@abhiorax.local`)
- **Password:** `AbhioraxAdmin123!`

> **Note:** Change default credentials and `JWT_SECRET` before deploying outside local development.

---

## Verification & Test Suites

```bash
# TypeScript & ESLint
npm run typecheck --workspace=@abhiorax/web
npm run lint --workspace=@abhiorax/web

# API QC & UAT suites (requires API on :8080)
node qc-api.js
node uat-api.js

# Playwright WCAG AAA & Browser UAT (requires Web on :3000 & API on :8080)
npm run a11y:audit --workspace=@abhiorax/web
npm run test:uat --workspace=@abhiorax/web
```

---

## Repository Structure

```text
abhioraX/
├── apps/
│   └── web/                  # Next.js 14 (App Router, Tailwind CSS, TypeScript)
│       ├── app/              # /, /feed, /rooms, /groups, /chat, /search, /notifications, /settings, /u/[username], /posts/[id], /creator/dashboard, /admin/dashboard
│       ├── components/       # a11y/, auth/, chat/, feed/, layout/, rooms/, ui/
│       ├── hooks/            # AuthProvider & useAuth
│       ├── lib/              # api client, socket client, i18n, types
│       ├── public/           # logo.svg, PWA manifest & service worker
│       └── tests/            # Playwright WCAG AAA structural checks & UAT journeys
├── services/
│   └── api/                  # Local Node.js API, AI helpers & Socket.IO /chat server (:8080)
├── database/                 # Canonical PostgreSQL 16 + pgvector schema & dev seed
├── docs/                     # Architecture, ADRs, OpenAPI 3.1 spec, UAT plans/reports
└── infra/                    # Docker Compose local infra stack
```

---

## License

Licensed under the [MIT License](LICENSE). Copyright © 2026 ABHIORAX (`bhnvboy-cell`).
