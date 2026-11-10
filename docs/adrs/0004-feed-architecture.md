# ADR-0004: Feed Architecture — Hybrid Fanout

**Status:** Accepted · **Date:** 2026-08-09

## Context
TikTok-level personalization with watch-time optimization while keeping tail-latency p99 < 200 ms.

## Decision
**Hybrid: fanout-on-write for small/medium audiences + fanout-on-read for celebrities.**

- Authors with `follower_count <= 50k` → push `post.id` into follower timelines (Redis sorted sets, 1000-cap per user, TTL 7d).
- Authors with `follower_count > 50k` → feed is assembled on read from follows + signals.
- Re-ranking every fetch: candidate pool → features → AI ranker (ai-svc) → top N.

## Consequences
- Fanout worker consumes `post.created`, uses batching + cursor paging.
- Read path caches ranked feed per-user in regional Redis (L2) with 60 s TTL.
- Cold-start users get bootstrap signals from onboarding funnels (growth-svc).
