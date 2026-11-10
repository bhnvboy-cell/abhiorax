# ADR-0009: Authentication — JWT + Refresh Rotation + MFA

**Status:** Accepted · **Date:** 2026-08-09

## Decision
- **Access token:** short-lived JWT (15 min, `alg HS256` signed with per-service HMAC secret)
  carrying `sub`, `roles`, `scopes`, `iat/exp`, `kid`.
- **Refresh token:** opaque random 256-bit, stored hashed (SHA-256) server-side, **rotation
  on every use** (old token invalidated), device-bound, 90-day TTL.
- **MFA:** TOTP (authenticator) primary; SMS/e-mail fallback; backup codes; passkeys (WebAuthn) roadmap.
- **OAuth2:** Google, GitHub as external IdPs; PKCE flow for the SPA.
- Logins feed **bot/risk scoring** (ai-svc) — impossible-travel & velocity checks.

## Consequence
- Token revocation on device change; refresh-token reuse detection auto-signs-out.
