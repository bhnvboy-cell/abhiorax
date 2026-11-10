# ABHIORAX API — UAT Report

| | |
|---|---|
| **Product** | ABHIORAX API |
| **Environment** | http://localhost:8080/v1 |
| **Node** | v24.16.0 |
| **Run at** | 2026-11-10T16:27:10.103Z |
| **Result** | **43 passed / 0 failed** |

> Sign-off gate: **PASSED — ready for release**

## Summary

| Story | Scenarios | Pass | Fail | Status |
|---|---|---|---|---|
| US-01 Account registration | 4 | 4 | 0 | PASS |
| US-02 Authentication and session lifecycle | 8 | 8 | 0 | PASS |
| US-03 Profile management | 6 | 6 | 0 | PASS |
| US-04 Posting and engagement | 5 | 5 | 0 | PASS |
| US-05 Feed and discovery | 5 | 5 | 0 | PASS |
| US-06 Social graph | 3 | 3 | 0 | PASS |
| US-07 Messaging | 4 | 4 | 0 | PASS |
| US-08 Notifications | 3 | 3 | 0 | PASS |
| US-09 Trust and safety | 1 | 1 | 0 | PASS |
| US-10 Role-based access control | 4 | 4 | 0 | PASS |

## Details

### US-01 — Account registration

A new visitor can create an account with a valid username, email and strong password.

**UAT-01-01** — PASS

- AC: Registration with a valid username/email/password returns 201 with an access token and a refresh token, and an account profile is created.

**UAT-01-02** — PASS

- AC: Re-registering with an existing username or email is rejected with 409.

**UAT-01-03** — PASS

- AC: Passwords shorter than 12 characters or lacking an upper-case letter, lower-case letter and digit are rejected with 400.

**UAT-01-04** — PASS

- AC: Usernames with disallowed characters are rejected with 400.

### US-02 — Authentication and session lifecycle

A registered user can log in, keep the session alive via rotating refresh tokens, and revoke it by logging out.

**UAT-02-01** — PASS

- AC: Login with valid credentials returns 200 with a fresh token pair.

**UAT-02-02** — PASS

- AC: Login with an incorrect password is rejected with 401 and no token is issued.

**UAT-02-03** — PASS

- AC: A valid refresh token can be exchanged for a new token pair (rotation).

**UAT-02-04** — PASS

- AC: A refresh token is single-use; replaying it is rejected with 401 and locks the device.

**UAT-02-05** — PASS

- AC: Refresh requires the caller to present a valid device id; a malformed device id is rejected with 400.

**UAT-02-06** — PASS

- AC: Logging out revokes the refresh token; a subsequent refresh attempt returns 401.

**UAT-02-07** — PASS

- AC: Protected endpoints reject requests without a token with 401.

**UAT-02-08** — PASS

- AC: MFA setup issues a TOTP secret and an otpauth URI for an authenticated user.

### US-03 — Profile management

A user can view and update their own profile, control privacy, and be found by others.

**UAT-03-01** — PASS

- AC: GET /users/me returns the authenticated user profile.

**UAT-03-02** — PASS

- AC: PATCH /users/me persists display name, bio and location.

**UAT-03-03** — PASS

- AC: Profile validation rejects an over-length display name with 400.

**UAT-03-04** — PASS

- AC: A public profile is resolvable by username; an unknown username returns 404.

**UAT-03-05** — PASS

- AC: Privacy settings can be read and updated, and the new values persist.

**UAT-03-06** — PASS

- AC: Profile privacy is respected: viewing a profile requires authentication.

### US-04 — Posting and engagement

A user can publish text posts, like, react and comment on posts.

**UAT-04-01** — PASS

- AC: A valid post is created with 201 and is retrievable by id.

**UAT-04-02** — PASS

- AC: Empty and over-length posts are rejected with 400.

**UAT-04-03** — PASS

- AC: A user can like a post and the like persists.

**UAT-04-04** — PASS

- AC: Reactions accept a supported value and reject an unsupported one with 400.

**UAT-04-05** — PASS

- AC: A user can comment on a post, empty comments are rejected, and comments are listed.

### US-05 — Feed and discovery

An authenticated user can browse their feed, trending content, search and suggestions.

**UAT-05-01** — PASS

- AC: The feed returns a ranked list of posts.

**UAT-05-02** — PASS

- AC: The feed supports cursor pagination.

**UAT-05-03** — PASS

- AC: Trending content is available.

**UAT-05-04** — PASS

- AC: Search returns results for a query.

**UAT-05-05** — PASS

- AC: Account suggestions are returned for a user.

### US-06 — Social graph

A user can follow others, see follower lists, and unfollow.

**UAT-06-01** — PASS

- AC: Following another user succeeds and the follower appears in the followee followers list.

**UAT-06-02** — PASS

- AC: Following yourself is rejected.

**UAT-06-03** — PASS

- AC: Unfollowing removes the follower from the followee followers list.

### US-07 — Messaging

Two authenticated users can start a conversation and exchange messages.

**UAT-07-01** — PASS

- AC: A conversation can be created with a second participant.

**UAT-07-02** — PASS

- AC: Conversations can be listed.

**UAT-07-03** — PASS

- AC: A participant can send a message and read the history back.

**UAT-07-04** — PASS

- AC: A message can be marked as read.

### US-08 — Notifications

A user can view notifications, mark them read and register a push token.

**UAT-08-01** — PASS

- AC: Notification list is available.

**UAT-08-02** — PASS

- AC: All notifications can be marked as read.

**UAT-08-03** — PASS

- AC: A push token can be registered for push delivery.

### US-09 — Trust and safety

A user can report content that may violate platform policy.

**UAT-09-01** — PASS

- AC: A report can be submitted against a post and is accepted.

### US-10 — Role-based access control

Privileged capabilities are restricted to the appropriate roles.

**UAT-10-01** — PASS

- AC: Creator-only endpoints return 403 for a regular user.

**UAT-10-02** — PASS

- AC: Admin-only endpoints return 403 for a regular user.

**UAT-10-03** — PASS

- AC: Accessibility reporting is restricted to authorized roles.

**UAT-10-04** — PASS

- AC: Unknown routes return a structured 404.

## Sign-off

| Role | Name | Date | Decision |
|---|---|---|---|
| Product owner | | |  |
| QA lead | | |  |
| Engineering | | |  |
