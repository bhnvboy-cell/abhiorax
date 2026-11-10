# ABHIORAX — UAT Test Plan

## 1. Objective

Verify that the ABHIORAX platform meets the acceptance criteria for the release through two complementary suites:

1. **API UAT** (`uat-api.js`) — acceptance scenarios US-01…US-10 exercised at the HTTP API level (`http://localhost:8080/v1`).
2. **Browser UAT** (`apps/web/tests/uat/journeys.spec.ts`) — end-user journeys driven through the real web application (`http://localhost:3000`) with Playwright.

Both suites run against the live local stack and their results are recorded in `docs/uat/reports/`.

## 2. Scope

### In scope

- Account registration and authentication lifecycle (incl. rotating refresh tokens, logout, MFA).
- Profile management, privacy, posting, liking, reacting, commenting.
- Feed, trending, search, suggestions.
- Social graph (follow/unfollow), messaging, notifications.
- Trust and safety (reports), role-based access control.
- Browser journeys covering the core UI flows: register, login, logout, publish, settings, follow, search, like, chat.

### Out of scope

- Performance / load testing.
- Cross-device / native push delivery (requires external services).
- Real AI ranking quality (AI service unavailable in this environment; deterministic fallback applies).

## 3. Environment

| Component | Endpoint | Status in this environment |
|---|---|---|
| API (`services/api`, NestJS) | `http://localhost:8080/v1` | Running (built from `dist/main.js`) |
| Web (`apps/web`, Next.js 14.2.3) | `http://localhost:3000` | Running |
| Postgres (pgvector) | `localhost:5432` | Running |
| Redis | `localhost:6379` | **Down** — rate limiting is disabled and caches fail soft |
| Kafka | `localhost:9092` | **Down** — event fan-out unavailable |
| OpenSearch | `localhost:9200` | **Down** — search runs in degraded keyword mode |
| AI service | — | **Down** — deterministic feed ranking fallback |

Prerequisites to run the suites: API and web running locally, Chromium browser binaries installed (`npx playwright install chromium`).

## 4. Test data and rate-limit handling

- The API rate-limits `register`/`login`/`mfa/verify` at 10/minute/IP. When Redis is up the suites stay under budget and retry on 429 (15s backoff, up to 4 attempts).
- API suite (`uat-api.js`) generates unique usernames per scenario (`userSeq` counter) to avoid 409 collisions and sleeps through the per-minute gate.
- Browser suite registers ~7 users and issues ~9 logins per full run; seeds are cached in a module-level map to minimise registrations.
- **Token lifecycle:** logout revokes the device. Any refresh token captured before a logout is dead afterwards, and a rotated token is single-use. Browser seeding therefore performs a fresh `login` (not a refresh) bound to the exact device id the page presents.

## 5. Execution

### 5.1 API suite

```powershell
# repo root
node uat-api.js
```

Report: `docs/uat/reports/api-uat-report.md`.

### 5.2 Browser suite

```powershell
# apps/web
npx playwright test --config=playwright.uat.config.ts
# or: npm run test:uat --workspace=@abhiorax/web
```

Configuration: serial execution (1 worker), no retries, 60s action timeout, 15s assertion timeout, trace on failure. Results land in `apps/web/test-results/`.

## 6. Acceptance criteria

### API suite (43 scenarios)

| Story | Area | Scenarios | Status |
|---|---|---|---|
| US-01 | Registration | UAT-01-01 … 01-04 | PASS |
| US-02 | Authentication & session lifecycle | UAT-02-01 … 02-08 | PASS |
| US-03 | Profile management | UAT-03-01 … 03-06 | PASS |
| US-04 | Posting and engagement | UAT-04-01 … 04-05 | PASS |
| US-05 | Feed and discovery | UAT-05-01 … 05-05 | PASS |
| US-06 | Social graph | UAT-06-01 … 06-03 | PASS |
| US-07 | Messaging | UAT-07-01 … 07-04 | PASS |
| US-08 | Notifications | UAT-08-01 … 08-03 | PASS |
| US-09 | Trust and safety | UAT-09-01 | PASS |
| US-10 | Role-based access control | UAT-10-01 … 10-04 | PASS |

### Browser suite (11 journeys)

| Id | Journey | Verifies |
|---|---|---|
| B1 | Visitor registers through the UI; session survives a reload | US-01/US-02 |
| B2 | Logging out revokes the session and re-gates the feed | US-02 |
| B3 | An existing user logs in through the UI | US-02 |
| B4 | Login with a wrong password shows an error | US-02 |
| B5 | An authenticated user publishes a post from the feed | US-04 |
| B6 | The feed is gated for anonymous visitors | US-02 |
| B7 | Profile settings are updated and confirmed | US-03 |
| B8 | A user follows and then unfollows another user | US-06 |
| B9 | Search resolves for a user | US-05 |
| B10 | A user likes a post from the detail page | US-04 |
| B11 | Chat is gated for anonymous visitors and renders for users | US-02/US-07 |

## 7. Known environment limitations

These are infrastructure gaps in the local environment, not product defects:

1. **Search (US-05-04, B9)** — OpenSearch is not running; the API returns the intentional degraded-search banner (`Search degraded — indexed results unavailable…`). The browser journey asserts the search page completes and renders either a user hit or the degradation banner. Full-text search acceptance requires OpenSearch up.
2. **Rate limiting** — Redis is down, so the `RateLimitGuard` disables itself (`Rate limiting disabled`). Throttle behaviour must be re-verified with Redis running.
3. **Kafka** — broker unavailable; event-driven fan-out is bypassed (feed is computed on read).

## 8. Defects found and fixed during browser UAT

1. **Pre-hydration 401 on post detail (`apps/web/app/posts/[id]/page.tsx`)** — the page fetched the (auth-required) comments list together with the public post immediately on mount, before the session hydrated, leaving the whole page stuck on an error. Fixed: load the post immediately (public) and load comments only once authenticated.
2. **Session hydration race (`apps/web/hooks/AuthProvider.tsx`, `apps/web/lib/api.ts`)** — with `reactStrictMode: true`, the hydration effect runs twice, firing two concurrent `/auth/refresh` calls with the same token. The first rotates it (revoking the old one) and the second 401s; the 401 path cleared the fresh session, leaving the user unauthenticated on reload (seen as the gated feed after a successful login/register). Fixed: single-flight refresh — concurrent callers share one rotation request.
3. **Search fired before hydration (`apps/web/app/search/page.tsx`)** — the URL-driven search request went out while the session was still `loading`, 401'd, and never retried. Fixed: the query only runs once the session is `authenticated`.

## 9. Sign-off gate

The release is ready when:

- API suite: 43/43 scenarios pass.
- Browser suite: 11/11 journeys pass (with search accepting the documented degraded state).
- No open severity-1 or severity-2 defects remain in scope.

| Role | Name | Date | Decision |
|---|---|---|---|
| Product owner | | |  |
| QA lead | | |  |
| Engineering | | |  |
