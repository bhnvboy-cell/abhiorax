# ADR-0002: Event Bus — Apache Kafka

**Status:** Accepted · **Date:** 2026-08-09

## Context
Services must decouple write/read paths and fan out to feed, notifications, search,
moderation, and analytics without blocking user requests.

## Decision
Use **Apache Kafka** (Confluent-managed, 3 brokers minimum, `acks=all` for critical topics)
as the backbone event bus. RabbitMQ reserved for job queues with per-consumer workloads.

## Events (topics)
`auth.*`, `user.*`, `post.*`, `feed.*`, `chat.*`, `notification.*`, `moderation.*`,
`analytics.*`, `monetization.*`, `growth.*`, `search.*`

## Reliability
- **Outbox pattern** (ADT-0006): DB row + Debezium CDC → Kafka, guaranteeing no loss.
- Consumer idempotency via natural keys / event IDs in a dedup store (Redis).
