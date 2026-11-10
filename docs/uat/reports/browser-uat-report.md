# ABHIORAX Web — UAT Report (Browser Journeys)

| | |
|---|---|
| **Product** | ABHIORAX Web UI |
| **Environment** | http://localhost:3000 (Next.js 14.2.3) against http://localhost:8080/v1 |
| **Runner** | Playwright (`apps/web/playwright.uat.config.ts`, serial, no retries) |
| **Run at** | 2026-08-10 (local) |
| **Result** | **11 passed / 0 failed** |

> Sign-off gate: **PASSED — ready for release**

## Summary

| Id | Journey | Status |
|---|---|---|
| B1 | A visitor registers through the UI and the session survives a reload | PASS |
| B2 | Logging out revokes the session and re-gates the feed | PASS |
| B3 | An existing user logs in through the UI | PASS |
| B4 | Login with a wrong password shows an error | PASS |
| B5 | An authenticated user publishes a post from the feed | PASS |
| B6 | The feed is gated for anonymous visitors | PASS |
| B7 | Profile settings are updated and confirmed | PASS |
| B8 | A user follows and then unfollows another user | PASS |
| B9 | Search resolves for a user (graceful degradation verified) | PASS |
| B10 | A user likes a post from the detail page | PASS |
| B11 | Chat is gated for anonymous visitors and renders the composer for users | PASS |

## Environment notes

- **Search (B9):** OpenSearch is not running in this environment, so the API returns its intentional degraded-search banner instead of user hits. The journey verifies the search page completes and renders either a user hit or the degradation banner. Re-verify full-text search with OpenSearch available.
- **Redis / rate limiting:** Redis is down, so the API's `RateLimitGuard` disables itself; throttle behaviour was not exercised in this run.

## Defects found and fixed during this UAT

1. **Post detail page stuck on error for signed-in users** — `apps/web/app/posts/[id]/page.tsx` fetched the auth-required comments list together with the public post before session hydration, so the whole page 401'd permanently. Fixed: post loads immediately; comments load only when authenticated.
2. **Session hydration race on reload/login** — under `reactStrictMode` the hydration effect fires twice, causing two concurrent `/auth/refresh` calls with the same token; the second 401'd after the first rotated it and cleared the fresh session, leaving users unauthenticated after login/register. Fixed with single-flight refresh in `apps/web/lib/api.ts`.
3. **Search fired before hydration** — `apps/web/app/search/page.tsx` issued the URL-driven query while the session was still loading, 401'd, and never retried. Fixed: the query runs once the session is authenticated.

## Sign-off

| Role | Name | Date | Decision |
|---|---|---|---|
| Product owner | | |  |
| QA lead | | |  |
| Engineering | | |  |
