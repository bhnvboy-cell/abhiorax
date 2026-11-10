# ABHIORAX — System Architecture

**Version:** 1.0 · **Status:** Baseline · **Owner:** Platform Architecture

> Abhi (fearless, forward) + Ora (Latin: horizon) + X (next-gen innovation).
> A global, AI-powered social + communication + creator platform.

---

## 1. Architectural Principles

| Principle | Commitment |
|---|---|
| **Microservices** | Domain-aligned, independently deployable services (DDD bounded contexts) |
| **Event-driven** | Asynchronous, decoupled via Kafka; outbox pattern for reliability |
| **API-first** | REST + GraphQL behind a single gateway; OpenAPI 3.1 contract |
| **Active-active multi-region** | Latency-based routing, local writes, CRDT/LWW conflict handling |
| **AI at the core** | Ranking, moderation, bot & spam detection as first-class pipelines |
| **Accessibility** | WCAG AAA is a release gate, not a bolt-on |
| **Zero-downtime** | Blue/green + canary deploys; immutable images; health-gated traffic |
| **Privacy by design** | GDPR/CCPA/COPPA/DSA; data residency, right-to-erasure pipelines |

---

## 2. C4 — Level 1 (System Context)

```text
                       +-------------------------------------------------+
                       |                    CDN / Edge                    |
                       |     (CloudFront · WAF · DDoS · HTTP/3 · i18n)    |
                       +-------------------------------------------------+
                                     | HTTPS
                                     v
+----------------+    +----------------------------+    +----------------+
|                |    |                            |    |                |
|   Web Client   |--> |      ABHIORAX EDGE          | <--|   Mobile App   |
|  (Next.js)     |    |  Gateway · LB · AuthZ ·     |    |   (future)     |
|                |    |  Rate-limit · Cache         |    |                |
+----------------+    +----------------------------+    +----------------+
                       |        |         |        |
                       v        v         v        v
              +-------+--+  +--+------+  +---------+  +-----------+
              | Users &  |  |  Feed   |  |  Chat   |  |  Content  |
              | Social   |  |  Engine |  |  Realtime|  |  Graph    |
              +----------+  +---------+  +---------+  +-----------+
                       |        |         |        |
                       +--------+---------+--------+
                                |
                                v
                     +----------------------------+
                     |   AI & Trust Platform       |
                     |  (Ranking · Moderation ·    |
                     |   Bot/Spam · Trending)      |
                     +----------------------------+
```

---

## 3. C4 — Level 2 (Container Diagram)

```text
                       +--------------------------------------------------+
                       |                  Edge Tier (region A/B)          |
                       |   CloudFront/CDN ── WAF ── Global LB (Anycast)    |
                       +--------------------------------------------------+
                                        |
                            +-----------+------------+
                            v                        v
                   +------------------+     +------------------+
                   |   Web Tier       |     |   Mobile/3rd      |
                   |  Next.js (Edge   |     |  Party Gateway    |
                   |  + ISR + i18n)   |     |   (GraphQL)       |
                   +------------------+     +------------------+
                            |                      |
                            +----------+-----------+
                                       v
                       +---------------------------------------+
                       |  API GATEWAY (NestJS BFF / Kong)       |
                       |  Auth · TLS · Rate Limit · Routing ·   |
                       |  Response cache · Request validation   |
                       +---------------------------------------+
        |           |            |            |            |           |
        v           v            v            v            v           v
+----------+  +----------+  +----------+  +----------+  +---------+  +---------+
| auth-svc |  | user-svc |  | post-svc |  | feed-svc |  | chat-svc|  | notify-  |
| (NestJS) |  | (NestJS) |  | (NestJS) |  | (NestJS) |  | (NestJS)|  | svc     |
+----------+  +----------+  +----------+  +----------+  +----+----+  +---------+
   ...more services: moderation · search · analytics · monetization · growth ...
                                  |             |
        +---------+  +---------+  +---------+   |  +-----------------+
        |         |  |         |  |         |   |  |                 |
+-------+--+  +---+----+  +---+----+  +---+--+   |  |  AI Platform     |
| Postgres |  | Redis  |  |OpenSearch| | S3/  |   |  | (FastAPI)       |
| (Citus)  |  | (cache)|  | (search) | | Media|   |  +-----------------+
+----------+  +--------+  +----------+ +------+   |  |  · embeddings   |
                                                  |  |  · ranking model |
+-----------+                                    |  |  · moderation    |
|  Kafka    |<-- all services publish events ----+  |  · bot scoring   |
+-----------+                                       +-----------------+
```

---

## 4. C4 — Level 3 (Component: feed-svc)

```text
                      +------------------- feed-svc -------------------+
                      |  GraphQL/REST Controller                       |
                      |        |                                       |
                      |  RankingOrchestratorService                    |
                      |   (candidate fetch → feature store → AI rank)  |
                      |        |                     |                 |
                      |  CandidateProvider        RankerClient          |
                      |  (follows · interests ·   (gRPC → ai-svc)      |
                      |   trending · geo · ads)                        |
                      |        |                                       |
                      |  FeedCache (Redis, per-user L2 shard)          |
                      |  FeedEventConsumer (Kafka: like/follow/post)   |
                      +-------------------------------------------------+
```

---

## 5. Data Flow Highlights

- **Write path (post create):** gateway → post-svc → txn (PostgreSQL) → outbox row → Debezium → Kafka `post.created` → feed-svc precomputes fanout → notifications, moderation pipeline (async), search indexing (async).
- **Read path (feed):** gateway → feed-svc → cached feed (Redis) → miss → candidate fetch + AI rank (ai-svc) → hydrate (posts, media, users via user-svc) → write-back cache.
- **Realtime:** chat-svc WebSocket gateway (Socket.IO, Redis adapter) with presence + typing indicators; messages persisted then ACKed (at-least-once, idempotent by clientMsgId).

---

## 6. C4 — Level 4 (Code) 

Code is delivered per-service in `services/*`. Each service follows:

```
services/<svc>/
├── src/
│   ├── main.ts                 # bootstrap
│   ├── app.module.ts           # root DI module
│   ├── common/                 # interceptors, guards, filters, decorators
│   ├── config/                 # env validation (zod/joi)
│   ├── domain/                 # entities, value objects, domain services
│   ├── application/            # use-cases / application services
│   ├── infrastructure/         # repositories, clients, outbox, kafka
│   └── presentation/           # controllers, dto, ws-gateways
└── test/
```

---

## 7. Region & Replication Strategy

- **Regions:** `us-east-1` (primary), `eu-west-1`, `ap-south-1` (active-active).
- **PostgreSQL (Citus):** distributed tables keyed by `user_id` (tenant sharding); synchronous cross-region for critical tables, asynchronous for others.
- **Conflict resolution:** LWW (last-write-wins with `updated_at`) + application-level merge for follows (idempotent).
- **Redis:** regional caches; global read-through fallback to PG.
- **Failover:** route53 health-based; DR RPO ≤ 15 min (WAL archiving + PITR), RTO ≤ 10 min (cross-region standby warm pool).

---

## 8. Cross-cutting Concerns

- **Observability:** OpenTelemetry → Prometheus (metrics) → Tempo (traces) → Loki/ELK (logs). `X-Request-Id` propagated end-to-end.
- **Security:** Zero-trust mTLS between services (Istio), JWT short-lived access + rotating refresh, per-route rate limits, WAF, secrets via Vault.
- **Config:** GitOps (ArgoCD), env injected from sealed secrets.
