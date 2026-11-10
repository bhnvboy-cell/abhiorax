<p align="center">
  <img src="apps/web/public/logo.svg" alt="ABHIORAX Logo" width="84" height="84" />
</p>

<h1 align="center">ABHIORAX</h1>

<p align="center">
  <strong>A fearless, forward, next-generation social, communication, and creator platform — engineered with WCAG AAA accessibility at its core.</strong>
</p>

## Brand & Etymology

- **Abhi** — fearless, forward
- **Ora** — Latin: *horizon*
- **X** — next-generation innovation

> The **ABHIORAX** name and logo mark (`apps/web/public/logo.svg`) identify this project; please retain attribution when forking or building upon the codebase.

---

## Highlights

- **Horizon Glass 3-Column Cockpit:** Slim global command header with quick search, sticky workspace navigation + live Accessibility Dock (`High Contrast`, `Large Text`, `Dyslexia Spacing`), and a Discovery Pulse rail (`Trending`, `Creators`, `Communities`).
- **Feed, Stories & Rich Media:**
  - Ranked (`For you`), Chronological (`Following`), `Groups`, and `Saved` feed tabs with keyword muting and transparent `"Why you see this"` ranking badges.
  - Photo, video, and audio uploads (up to 25 MB) with live previews and AI-generated alt text.
  - Interactive polls, 7 Facebook-style reactions (`👍 ❤️ 😂 😮 😢 😡 🤗`), 24-hour Stories (text, photo, video), post editing, bookmarks, sharing, and `#hashtag` / `@mention` linking.
- **mIRC-Style Live Rooms (`#Channels`) at `/rooms`:**
  - Real-time topic channels (`#lobby`, `#tech`, `#accessibility`, `#creators`, or `/join #any-room`) with live online nick list, IRC Log / Card view toggle, media attachments, and slash commands (`/join`, `/topic`, `/me`, `/msg`, `/clear`, `/help`).
- **2-Pane Messenger (`/chat`):**
  - Real-time Socket.IO `/chat` messaging with REST fallback, DM launcher by `@username`, typing indicators, read receipts, and photo/video/audio attachments.
- **Communities & Social Graph:**
  - Category-filtered **Groups** (`/groups`) with pinned posts, inline polls, and group chat links.
  - Public **Explore** (`/`), **Search** (`/search`), and **Profiles** (`/u/[username]`) with OpenGraph previews, follow/unfollow, block/unblock, and follower/following lists.
- **Creator Ownership & Moderation:**
  - **Creator Studio** (`/creator/dashboard`): reach analytics, scheduled posts, memberships/tips, and **portable CSV subscriber export**.
  - **Admin Console** (`/admin/dashboard`): platform metrics, AI-flagged & user-submitted moderation queue, and role management (`user`, `creator`, `moderator`, `admin`).
- **PWA & Mobile-First:** Installable Web App Manifest (`manifest.webmanifest`), service worker (`sw.js`), and mobile bottom navigation bar.

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
│       ├── public/           # PWA manifest & service worker
│       └── tests/            # Playwright WCAG AAA structural checks & UAT journeys
├── services/
│   └── api/                  # Local Node.js API & Socket.IO /chat server (:8080)
├── database/                 # Canonical PostgreSQL 16 + pgvector schema & dev seed
├── docs/                     # Architecture, ADRs, OpenAPI 3.1 spec, UAT plans/reports
└── infra/                    # Docker Compose local infra stack
```

---

## License

Licensed under the [MIT License](LICENSE). Copyright © 2026 ABHIORAX (`bhnvboy-cell`).
