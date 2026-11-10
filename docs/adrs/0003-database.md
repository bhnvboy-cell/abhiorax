# ADR-0003: Primary Database — PostgreSQL (Citus) + Redis + OpenSearch

**Status:** Accepted · **Date:** 2026-08-09

## Context
Global social platform requires relational integrity (users, posts, follows), high-velocity
reads, full-text + semantic search, and horizontal scaling.

## Decision
- **PostgreSQL 16 + Citus** for transactional data (distributed by `user_id`).
- **Redis (Cluster)** for cache, sessions, rate-limit counters, presence, dedup.
- **OpenSearch 2.x** for keyword + vector (k-NN, HNSW) search.

## Sharding
Distributed tables: `users`, `posts`, `comments`, `likes`, `follows`, `messages`,
`notifications`, `analytics_events` — all sharded by `user_id`.
Reference tables (replicated to all shards): `countries`, `content_policies`,
`moderation_classifiers`, `payout_regions`.

## Multi-region
- `us-east-1` primary for writes of reference data; per-region read replicas.
- Multi-master (Citus MX) for user-sharded tables across `eu-west-1`, `ap-south-1`.
- WAL archival → cross-region PITR backups (RPO ≤ 15 min).
