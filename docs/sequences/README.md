# Sequence Diagrams — Critical Flows

## 1. Post Creation (with async fanout, moderation, search indexing)

```text
Client    Gateway     post-svc        PG(Citus)     Outbox/Debezium    Kafka         feed-svc   moderation    search-svc
  |          |            |              |              |                |              |           |            |
  | POST /posts           |              |              |                |              |           |            |
  |--------->|            |              |              |                |              |           |            |
  |          | validate+auth, media signed URLs           |              |              |           |            |
  |          |--------->|               |              |                |              |           |            |
  |          |            | BEGIN TX     |              |                |              |           |            |
  |          |            | insert post + outbox row      |              |              |           |            |
  |          |            |------------->|              |                |              |           |            |
  |          |            | COMMIT        |              |                |              |           |            |
  |          |            |<-------------|              |                |              |           |            |
  |<---------| return 201 {post}         |              |                |              |           |            |
  |          |            |              | CDC -> post.created          |              |           |            |
  |          |            |              |----------------------------->|              |           |            |
  |          |            |              |              |                | fanout if followers<=50k  |           |
  |          |            |              |              |                |------------->|           |            |
  |          |            |              |              |                | moderate(text/media, ai) |           |
  |          |            |              |              |                |-------------->|           |            |
  |          |            |              |              |                |              |           | index(post) |
  |          |            |              |              |                |              |           |--------->|
```

## 2. Feed Fetch (cached + AI re-ranked)

```text
Client  Gateway     feed-svc      Redis(L2)      feature-store     ai-svc       user-svc
  |        |           |              |              |               |            |
  | GET /feed?cursor   |              |              |               |            |
  |------->|           |              |              |               |            |
  |        |           | try cache    |              |               |            |
  |        |           |------------->|              |               |            |
  |        |           |  hit -> hydrate (media, authors, likes)     |            |
  |        |           |-------------------------------------------->|            |
  |        |           |<------------ 200 {items,next_cursor}        |            |
  |<-------| 200       |              |              |               |            |
  |        |           |  miss -> candidate pool (follows, signals)  |            |
  |        |           |---------------------------->|               |            |
  |        |           | features -> rank (gRPC)     |               |            |
  |        |           |-------------------------------------------->|            |
  |        |           |<--------------------------- ranked ids      |            |
  |        |           | hydrate & write-back cache                  |            |
```

## 3. Realtime Chat

```text
UserA     WS-Gateway(chat-svc)     Redis(Pub/Sub + presence)    PG(Citus)     UserB
  |  connect (JWT handshake)            |                           |            |
  |--------->|                          |                           |            |
  |  send_message {clientMsgId}         |                           |            |
  |--------->|  dedupe(clientMsgId)     |                           |            |
  |          |  BEGIN: persist message  |                           |            |
  |          |--------------------------|-------------------------->|            |
  |          |  publish msg.created     |                           |            |
  |          |--------->|  fanout to other region gateway           |            |
  |<--------- ack {msgId, ts}           |                           |            |
  |          |                          |<--- deliver to UserB's WS  |           |
  |          |                          |                           |<----------|
  |          |  typing_indicator (throttled 2s)                     |            |
```

## 4. Auth Flow (email/password + MFA challenge)

```text
Client  Gateway   auth-svc   Redis    PG        otp-svc   ai-svc(risk)
  |  POST /auth/login          |        |          |          |
  |------->|  verify bcrypt     |        |          |          |
  |        |------------------->|------->|          |          |
  |        |  risk-score(device, ip, velocity)      |          |
  |        |--------------------------------------->|          |
  |        |  if MFA enabled -> challenge            |          |
  |<-------| 202 {mfaChallengeId, hint}              |          |
  |  POST /auth/mfa/verify      |        |          |          |
  |------->|  verify TOTP/otp    |        |          |          |
  |        |------------------->|------->|          |          |
  |        |  issue access+refresh, rotate previous |          |
  |<-------| 200 {accessToken, refreshToken, user}  |          |
```

## 5. Creator Payout (idempotent, dual-write safe)

```text
Client  Gateway  monetization-svc    PG        Outbox    Kafka    ledger-svc
  |  POST /creator/payouts {key}      |          |          |        |
  |------->|  validate balances       |          |          |        |
  |        |  BEGIN: insert payout (status=pending) + outbox |        |
  |        |------------------------->|          |          |        |
  |        |  COMMIT                  |          |          |        |
  |<-------| 202 {payoutId}           |          |          |        |
  |        |  CDC -> payout.created   |          |          |        |
  |        |                          |------------------->|        |
  |        |                          |          |          |  move funds (idempotent on key)
```
