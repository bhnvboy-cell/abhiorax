# Architecture Decision Records

| ADR | Decision | Status |
|-----|----------|--------|
| [ADR-0001](adr/0001-backend-framework.md) | NestJS (Node.js) over ASP.NET Core | Accepted |
| [ADR-0002](adr/0002-event-bus.md) | Apache Kafka as backbone event bus | Accepted |
| [ADR-0003](adr/0003-database.md) | PostgreSQL (Citus) primary + Redis cache + OpenSearch | Accepted |
| [ADR-0004](adr/0004-feed-architecture.md) | Hybrid fanout-on-write + on-read feed | Accepted |
| [ADR-0005](adr/0005-ai-deployment.md) | AI as separate Python microservice (FastAPI + ONNX) | Accepted |
| [ADR-0006](adr/0006-idempotency.md) | Outbox + idempotency keys for event reliability | Accepted |
| [ADR-0007](adr/0007-accessibility.md) | WCAG AAA as release gate with runtime compliance tracker | Accepted |
| [ADR-0008](adr/0008-deploy.md) | Active-active multi-region with canary + chaos gate | Accepted |
| [ADR-0009](adr/0009-authn.md) | JWT + rotating refresh tokens + passkeys/MFA | Accepted |
