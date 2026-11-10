# ADR-0005: AI Platform as Separate Python Service

**Status:** Accepted · **Date:** 2026-08-09

## Context
Ranking (lightGBM/neural), abuse detection (transformers), bot detection, and embeddings
demand GPU/CPU-bound Python. Mixing with the Node hot path hurts latency.

## Decision
A standalone **FastAPI** microservice (`services/ai`) exposed over **gRPC** (high throughput,
low latency) with REST fallback. Models exported to **ONNX Runtime** for cheap serving.

- `/v1/embed` — `sentence-transformers` all-MiniLM-L6-v2 → 384-d vectors.
- `/v1/rank` — lightGBM ranking model (feature vector → relevance score).
- `/v1/moderate` — zero-shot classifier + rule engine → risk verdict.
- `/v1/bot-score` — behavior features → 0–1 bot probability.

## Consequences
- Models versioned in S3 (`models/{model}/{version}/`), loaded by manifest at boot.
- Cold-start mitigated with warm pools; per-GPU autoscaling (Karpenter).
