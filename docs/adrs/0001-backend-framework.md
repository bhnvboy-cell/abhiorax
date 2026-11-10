# ADR-0001: Backend Framework — NestJS

**Status:** Accepted · **Date:** 2026-08-09

## Context
ABHIORAX needs a modular, DI-first, opinionated backend for ~12 bounded contexts with
WebSockets, GraphQL, background jobs, and a shared TypeScript stack with the frontend.

## Decision
Adopt **NestJS (Node.js + TypeScript)** instead of ASP.NET Core.

## Rationale
- Single language/type system across gateway, services, and Next.js frontend.
- First-class DI, modularity, guards/interceptors, WebSocket + gRPC + GraphQL support.
- Strong ecosystem for PostgreSQL (TypeORM/Prisma), Redis, Kafka.
- Fast startup/iteration velocity for a growing product org.

## Consequences
- GC pauses under extreme CPU-bound load must be mitigated (worker pools / Node clusters).
- Heavy AI workloads intentionally excluded → moved to Python service (see ADR-0005).
- .NET would have offered lower-latency numeric work; mitigated via FFI/worker-threads where needed.
