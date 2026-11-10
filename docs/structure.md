# ABHIORAX — Repository Layout

```text
abhioraX/
├── apps/
│   └── web/                        # Next.js 14 (App Router) frontend
│       ├── app/                    # routes: (auth), (main)/feed, chat, profile, settings, creator, admin
│       │   ├── (auth)/login/page.tsx
│       │   ├── (auth)/register/page.tsx
│       │   ├── (main)/feed/page.tsx
│       │   ├── (main)/chat/page.tsx
│       │   ├── (main)/search/page.tsx
│       │   ├── (main)/profile/[username]/page.tsx
│       │   ├── (main)/settings/page.tsx
│       │   ├── creator/dashboard/page.tsx
│       │   ├── admin/dashboard/page.tsx
│       │   └── layout.tsx
│       ├── components/             # ui/, feed/, chat/, profile/, creator/, admin/
│       ├── hooks/                  # useFeed, useChat, useAuth, useAccessibility
│       ├── lib/                    # api client, ws client, i18n, a11y
│       └── public/                 # locales
├── services/
│   ├── api/                        # NestJS main service (BFF + REST/GraphQL for all domains)
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── common/             # guards, interceptors, filters, decorators
│   │   │   ├── config/
│   │   │   ├── modules/
│   │   │   │   ├── auth/           # JWT, OAuth2, MFA
│   │   │   │   ├── users/          # profiles, privacy, follows
│   │   │   │   ├── posts/          # posts, comments, likes, stories/reels
│   │   │   │   ├── feed/           # ranked feed (AI client)
│   │   │   │   ├── chat/           # WebSocket gateway, presence, typing
│   │   │   │   ├── notifications/
│   │   │   │   ├── search/
│   │   │   │   ├── moderation/     # reports, content review
│   │   │   │   ├── growth/         # onboarding, suggestions, experiments
│   │   │   │   ├── analytics/      # creator analytics, cohorts
│   │   │   │   ├── monetization/   # payouts, subscriptions, ads
│   │   │   │   └── accessibility/  # WCAG compliance tracking
│   │   │   ├── infrastructure/     # kafka, redis, opensearch, s3, outbox
│   │   │   └── ai/                 # FastAPI client (gRPC/REST)
│   │   └── test/
│   └── ai/                         # FastAPI Python AI platform
│       ├── app/
│       │   ├── main.py
│       │   ├── api/                # /v1/embed, /v1/rank, /v1/moderate, /v1/bot-score
│       │   ├── core/               # config, models manifest
│       │   ├── services/           # embedding, ranking, moderation, bot, trending
│       │   └── schemas/
│       └── tests/
├── database/
│   ├── schema.sql                  # canonical DDL (all domains)
│   ├── migrations/
│   └── seed.sql
├── docs/
│   ├── architecture.md             # C4 levels 1–3
│   ├── adrs/                       # ADR-0001 … 0009
│   ├── sequences/
│   └── api/openapi.yaml            # API contract (all domains)
├── infra/
│   ├── docker/                     # Dockerfiles per service + docker-compose.yml
│   ├── k8s/                        # namespace, deployments, services, HPA, PDB, networkpolicy
│   ├── terraform/                  # region modules (us-east-1, eu-west-1, ap-south-1)
│   ├── monitoring/                 # prometheus, grafana, loki, alerts, chaos
│   └── gitops/                     # argocd app-of-apps
├── tests/
│   ├── load/                       # k6 scenarios (feed, chat, auth, abuse)
│   └── e2e/                        # Playwright (incl. WCAG AAA checks)
└── .github/workflows/              # CI (test/lint/build) + CD (canary/blue-green)
```

## Service naming conventions
- Package scope: `@abhiorax/<svc>` (npm workspaces).
- Modules follow NestJS DDD: `presentation/`, `application/`, `domain/`, `infrastructure/`.
- Events: `<domain>.<action>` (e.g. `post.created`).
- Every service is independently deployable and owns its data (Citus distributed tables).
