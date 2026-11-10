# ADR-0006: Reliability — Outbox + Idempotency

**Status:** Accepted · **Date:** 2026-08-09

## Decision
Every service that must emit events does so through a **transactional outbox**:

1. Business write + outbox row inserted in the **same local transaction**.
2. **Debezium CDC** streams outbox rows to Kafka.
3. Consumers dedupe on `event_id` (Redis set, 24 h TTL).

Mutating endpoints accept an **Idempotency-Key** header; responses cached 24 h so retries
are safe (critical for payouts, follows, message send).

## Consequences
- No dual-write consistency bugs between DB and Kafka.
- Dead-letter queue (DLQ) + replay tooling for poisoned messages.
