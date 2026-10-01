## The economy — Quant Credits

One currency runs the whole ecosystem. **1 credit ≈ US$1.** Credits are how humans pay for AI/compute and boosts, *and* how creators get paid — the same unit on both sides of every transaction, which is what makes the flywheel closed-loop. Full spec: `.kiro/specs/unified-quant-credits-economy/`.

### The ledger (source of truth)
- **Append-only ledger.** A wallet's balance is *always* `SUM(ledger_entries)` — never a mutable counter. Every credit that moves is one immutable, signed, timestamped row. This makes the economy auditable and reconstructable.
- **`CreditWallet`** — per-user (and per-org) balance view over the ledger.
- **Idempotency everywhere.** Every mutating call carries an idempotency key; replays are no-ops, so a retried network call never double-charges or double-pays.

### Metering — the `UsageGate`
Every AI call, render, or metered action passes through a three-phase gate:
1. **Estimate** — predict the credit cost (tokens × model rate, render minutes, etc.).
2. **Reserve** — hold that amount against the wallet *before* doing the work. Reservations expire if unclaimed.
3. **Settle** — on completion, convert the reservation to a real debit at the *actual* cost; release the remainder.

The gate is **fail-closed**: if the ledger is unreachable or the balance is insufficient and overage is off, the action is refused, not run-and-billed-later. This is the honesty guarantee.

### Free allowance & overage
- **Daily free AI allowance** — casual use is genuinely free; the allowance resets daily and is spent before credits are.
- **Overage is opt-in, default OFF.** A user only spends real credits past the free tier if they explicitly turned it on. No surprise bills, ever.
- **`PlanService`** — plan/tier catalog (free, pro, teams, enterprise) with per-plan allowances and limits.

### Money in, money out
- **`PaymentProvider` port** (provider-hosted, we never touch raw card numbers): Stripe (cards), Razorpay/UPI (India), PayPal, and crypto on-ramps. Top-ups convert fiat → credits.
- **`PayoutService`** — creators withdraw earned credits → fiat, on a daily cadence.
- **`MarketplaceLedger` + commission** — in-ecosystem marketplace (templates, games, effects, boosts) settles through the same ledger; the platform takes a tunable commission.
- **Models via OpenRouter** — AI is metered per token/call at the provider's rate plus margin.

### Control-plane
**QuantTrinity** tunes the economy's dials — credit value, free allowance size, commission %, plan catalog, overage defaults — without a code deploy. It reads each app's own telemetry/economy slice; it does not re-implement them.

### The flywheel (earn ⇄ spend)
```
QuantCooks (create) → QuanTube/QuantGram/QuantWave (distribute) → audience
        ↑                                                            ↓
   credits spent on AI/boosts  ← QuantAds (monetize) → creator payouts (credits)
```
Money that enters the ecosystem is designed to circulate inside it: earned as credits, spent as credits.

---

## Shared architecture

The ecosystem is four layers. Apps never talk to infrastructure directly; they compose **shared packages**, which call **services**, which own the **data**.

```
apps/<app>  (web · backend · desktop · mobile · admin · marketing)
     │  compose
shared packages/  (@quant/*)
     │  call
services/  (long-running workers & gateways)
     │  own
data/  (Postgres+pgvector · Redis · Kafka · Meilisearch · Qdrant · R2)
```

### Shared packages (the connective tissue)
- **`@quant/auth` + `@quant/identity-permissions`** — OAuth2/OIDC client, JWT, session, RBAC/scopes.
- **`@quant/api-client`** — typed cross-app API calls.
- **`@quant/brand`** — the single visual-identity source: `--quant-*` design tokens, per-app accent hue, icons.
- **`@quant/app-registry`** — the single app catalog (id/name/route/category/color/hue/icon for all 9). ✅ shipped; supersedes the three drifted per-shell lists as consumers migrate onto it (Phase 1+).
- **`@quant/credits`** — the economy (ledger, `UsageGate`, plans, payouts, marketplace).
- **`@quant/shared-ui`** — the component library + hooks (`useAuth`, etc.).
- **`@quant/common`, `@quant/database`, `@quant/federation`, `@quant/notifications`, `@quant/storage`, `@quant/realtime`, `@quant/agentic` (voice-commands)** — shared primitives.
- **Planned:** `@quant/desktop-kit` (Rust ProjFS VFS + Tauri chrome) and `@quant/mobile-kit` (Capacitor plugin bridges + launcher) — native, **verification-blocked** on this box, so CI/native-only.

### Services (the workers)
`ws-gateway` (realtime fan-out) · `search-indexer` (→ Meilisearch + Qdrant) · `moderation-worker` (safety) · `matchmaking` (QuantMax/QuantWave) · `video-transcoder` (QuanTube/QuantCooks) · `cdc-relay` (change-data-capture) · `smtp-inbound` (QuantMail) · `git-server` (QuantGit) · `ci-runner` (CodeHub CI/CD) · `ad-engine` (QuantAds auction) · `signal-projector` (derived feeds/recs).

### Data layer
- **PostgreSQL + pgvector** (Prisma) — relational source of truth *and* semantic embeddings in one place.
- **Redis** — cache, sessions, and BullMQ job queues (render/transcode/email).
- **Kafka** — event bus + CDC stream; the async spine.
- **Meilisearch** — instant full-text search; **Qdrant** — large-scale vector/semantic search & recommendations.
- **Cloudflare R2** — object storage (video, images, attachments).

### Security & observability
- **Identity:** QuantMail is the sovereign OAuth2/OIDC + PKCE provider → short-lived JWT → SSO; sessions persisted to Postgres (SSO phase-0 ✅).
- **Authorization:** RBAC + scopes via `identity-permissions`; **admin is per-app**; DLP/domain controls live in QuantMail's admin.
- **Metering as a control:** the fail-closed `UsageGate` also caps runaway AI/abuse.
- **Observability:** OpenTelemetry → Prometheus (metrics) + Grafana (dashboards) + Jaeger (traces).
- **Delivery:** Docker → Kubernetes + Helm + ArgoCD (GitOps) + Terraform (infra). CI's single required check is **`gate`** (`turbo typecheck lint test build` on changed workspaces); installs are frozen-lockfile, so a new/removed workspace package needs a matching `pnpm-lock.yaml` importer entry.

---

## Monorepo structure & conventions

### The target per-app layout (the restructure destination)
Each product owns its full platform presence in one folder — this is law #1 made concrete:

```
apps/<app>/
  src/                    # Next.js 15 web app (the product's web surface)
    app/
      admin/              # this app's OWN admin panel (role-gated route segment)
      marketing/          # this app's OWN landing/content (route segment)
      ...                 # product routes
  backend/                # Fastify 5 API
  desktop/                # thin Tauri target → @quant/desktop-kit
  mobile/                 # thin Capacitor target → @quant/mobile-kit
  app.config.ts           # per-app manifest (id, name, icon, color, routes, ports)
```

**Why admin + marketing are route segments, not new packages:** fewer moving parts, no lockfile churn, and it matches the owner's "in their proper place" directive. Only **desktop + mobile** need separate native build tooling, so only those stay nested kit-backed targets. `pnpm-workspace.yaml` gains the `apps/*/*` glob (keeping `apps/*` during migration); Turbo picks the surfaces up automatically and `gate` runs each changed one.

### Ecosystem hubs (thin, never monoliths)
`apps/_ecosystem/marketing-home` (lists apps from the registry, links into each product's `marketing/`) · `apps/_ecosystem/enterprise-admin` (composes each product's `admin/` slice) · `apps/_ecosystem/trinity` (owner economy console reading per-app slices).

### The old shells and their fate
| Shell | Was | Becomes |
|---|---|---|
| `quant-desktop` | one Tauri window for all apps | `@quant/desktop-kit` + per-app `desktop/` |
| `quant-mobile` | one Capacitor launcher for all | `@quant/mobile-kit` + per-app `mobile/` |
| `marketing` | one 1233-line all-apps landing | per-app `marketing/` + thin `marketing-home` hub |
| `admin-enterprise` | one org console (99-line scaffold) | per-app `admin/` + thin `enterprise-admin` hub |
| `quanttrinity` | owner command center | stays the economy **control-plane** (not one of the 9) |

Nothing is deleted until its per-app replacement is proven (Phase 4).

### Conventions that bite if ignored
- **TypeScript strict**, Next.js 15 App Router, Tailwind, Fastify 5.
- QuantMail uses **flat route segments** (no route-group parens) and has **no `middleware.ts`** — find the existing session/role guard before adding routes.
- Single sources of truth: `@quant/app-registry` (catalog), `@quant/brand` (visuals). **Caveat:** brand still stores *legacy* display names (e.g. `quantgram → "QuantNeon"`), so pull only `color/hue/iconRef` from brand for renamed apps; name/route/category are registry-owned.
- Commit trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`; PR footer `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

---

## Build roadmap

Sequenced so each step ships behind the `gate` check (local builds are impossible on the current box, so **CI is the verifier**; native desktop/mobile work is verification-blocked here and validated in CI only).

### Foundation — done / in-flight
- ✅ **SSO phase-0** — `SessionService` persisted to Postgres.
- ✅ **Design tokens Wave-0** — `--quant-*` core consolidated; token codegen + drift guard shipped.
- ✅ **`@quant/app-registry`** — single 9-product catalog (PR #347).
- ✅ **Phase-3 rename Part A** — `quantsync/neon/edits → QuantWave/Gram/Cooks` (ids).
- 🟡 **Per-app restructure spec** — approved, bound to the README.

### Restructure (per-app platform presence) — phases 0→4
- **Phase 0** 🟡 extract `@quant/desktop-kit`, `@quant/mobile-kit`, `@quant/app-registry` (additive; old shells keep working). Registry done; kits blocked-on-native.
- **Phase 1** 🔴 **pilot: QuantMail** — add per-app `admin/` + `marketing/` route segments + `desktop/` + `mobile/` + `app.config.ts`, wired to SSO + registry. Prove the pattern end-to-end.
- **Phase 2** 🔴 replicate to the other 8 (one PR each).
- **Phase 3** 🔴 Category B — thin `enterprise-admin` + `trinity` hubs over per-app slices.
- **Phase 4** 🔴 retire the old shells; update `pnpm-workspace.yaml`, deploy workflows, DNS.

### Deepening — the product work (per app, ongoing)
For every app: build out the **feature depth** in its deep-dive section, wire its **Quanty tool registry**, meter it through **credits**, roll out **design tokens + shared-ui**, add the **3D/WebGL surfaces** where they win, and reach **web/desktop/mobile parity**. QuantMail (flagship, most mature) leads; the creator flywheel (QuantCooks → QuanTube/Gram → QuantAds → payouts) is prioritized because it funds the rest.

### Cross-cutting tracks
Quanty agent runtime + per-app tool registries · credits rollout across all apps · notifications via QuantChat · shared AI-memory in Drive · observability everywhere.

---

## Non-goals & guardrails

- **Not a merged super-app.** We are pulling platform presence *into* each product, not smashing products together. The opposite of "sab ko ek me kar dena."
- **No behavior change during structural moves.** Restructure = relocation + kit extraction; features change in their own PRs, not in a move.
- **Admin never re-centralizes** into one monolith; the org hub only aggregates per-app slices.
- **Never break the connected backbone** — SSO, credits, realtime, AI-memory, registry are load-bearing.
- **No verbatim proprietary / nulled third-party code.** External apps are reference only.
- **Money & irreversible actions get a pre-flight** — paid deploys, live DNS cutover, real SMS/notification sends, store/npm publishes pause for a brief confirmation, then proceed or hand off.
- **Don't suppress security findings** (CodeQL, dependabot) without an explicit decision.

---

*This document is assembled from `docs/goal/_parts/*.md`. Edit the parts, then run `node scripts/build-goal.mjs` to regenerate `GOAL.md`.*
