# ADR-0008: Deployment — Active-Active + Canary + Chaos

**Status:** Accepted · **Date:** 2026-08-09

## Decision
- Multi-region **active-active** with latency-based DNS routing (AWS Global Accelerator).
- Deploys via **GitOps** (ArgoCD) with **blue/green** for gateway and **canary** (5% → 25% → 100%)
  for services, gated on SLOs (error budget, p99 latency, crash rate).
- **Chaos engineering** (Litmus) runs weekly in staging: pod kill, network partition,
  Kafka broker loss, PG primary failover — each with a runbook.
- **Backups:** hot (PG HA), warm (PITR 15 min), cold (daily snapshot, 90-day retention).

## Consequence
- Pre-prod `chaos` namespace runs the exact production topology at 1% scale.
