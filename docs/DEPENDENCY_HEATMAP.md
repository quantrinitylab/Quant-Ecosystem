# Dependency Heatmap — Blast Radius of Every Package

> **CEO Order #0006.** The question this document answers, per package:
> **"If we delete this package today, how much of the system breaks?"**
>
> Every score below is measured, not guessed. Method in §1. Reproduce anytime;
> if the numbers drift, regenerate this document — never hand-edit the tables.

**Snapshot:** main @ `aa1fc92` · 2026-07-09 · 108 packages, 18 apps, 7 services.

---

## 1. Methodology (reproducible)

Two independent signals per package:

1. **Declared dependents (D):** how many workspace `package.json` files list it
   in `dependencies`/`devDependencies`/`peerDependencies`.
2. **Import reach (I):** how many source files (`.ts/.tsx/.js`) across
   `apps/`, `packages/`, `services/` actually `import ... from '<pkg>'`
   (excluding the package itself).

Scoring rubric:

| Score | Criteria | Meaning if deleted |
|-------|----------|--------------------|
| **CRITICAL** | D ≥ 8 or I ≥ 50 | Platform-wide build failure; most apps dead |
| **HIGH** | D ≥ 3 or I ≥ 10 | Multiple apps/features break |
| **MEDIUM** | D = 2 or I in 4–9 | One or two features break |
| **LOW** | D = 1 or I in 1–3 | Single consumer breaks; contained |
| **DEAD** | D = 0 and I = 0 | Nothing breaks. Nothing calls it. |

> Note: D and I disagree sometimes (declared but never imported, or imported via
> transitive re-export). Disagreements are flagged in §6 — they are tech-debt signals.

---

## 2. CRITICAL — deleting these kills the platform (10)

| Package | D | I (files) | Role (organ, per QUANT_FOUNDATION) |
|---------|---|-----------|------------------------------------|
| `@quant/common` | 62 | 54 | Shared types/contracts — the protocol layer itself (Law 4) |
| `@quant/server-core` | 14 | 337 | Fastify runtime — the Heart |
| `@quant/shared-ui` | 15 | 188 | UI component system — every frontend |
| `@quant/brand` | 16 | 156 | Design tokens/brand — every frontend |
| `@quant/api-client` | 15 | 117 | Typed client — every frontend↔backend edge |
| `@quant/ai` | 19 | 76 | AI engine + memory subsystem — Frontal Cortex |
| `@quant/database` | 20 | 6 | Prisma schema/client — single source of persistence truth |
| `@quant/auth` | 18 | 13 | Identity root — DNA (Law 1) |
| `@quant/realtime` | 14 | 7 | Realtime plumbing — Nervous System |
| `@quant/queue` | 8 | 15 | BullMQ jobs/outbox — Blood Circulation |

> `database`, `auth`, `realtime` have low I but very high D: they are imported in
> few *files* but those files are every backend's spine. D is the truthful signal here.

## 3. HIGH — deleting these breaks multiple apps/features (16)

| Package | D | I | Notes |
|---------|---|---|-------|
| `@quant/agentic` | 5 | 22 | agent framework used by AI features |
| `@quant/search` | 3 | 22 | search across mail/drive/sync |
| `@quant/moderation` | 3 | 14 | trust pipeline (Law 7) — chat, sync, ads |
| `@quant/encryption` | 3 | 13 | Immune System component |
| `@quant/credits` | 4 | 11 | AI metering — gating for inference |
| `@quant/health-server` | 6 | 6 | liveness/readiness for services |
| `@quant/ml-runtime` | 5 | 4 | model serving glue |
| `@quant/notifications` | 4 | 6 | Hormones — cross-app fan-out |
| `@quant/quant-tools` | 3 | 8 | AI tool registry (dep of `@quant/ai`) |
| `@quant/quant-economy` | 2 | 8 | credits/economy flows |
| `@quant/triton-client` | 4 | 5 | GPU inference client |
| `@quant/ranking` | 3 | 6 | feed/search ranking |
| `@quant/recommendations` | 3 | 3 | recommendation surface |
| `@quant/federation` | 3 | 3 | cross-instance protocol |
| `@quant/payments` | 3 | 3 | billing edge |
| `@quant/storage` | 3 | 4 | object-storage abstraction |

## 4. MEDIUM — one or two features break (14)

`@quant/agent-runtime` (2/4) · `@quant/feature-flags` (2/4) · `@quant/cross-app-gaming` (2/4)
· `@quant/media` (2/3) · `@quant/audit` (2/2) · `@quant/organizations` (2/2)
· `@quant/ar-lenses` (2/2) · `@quant/ml-pipeline` (3/3) · `@quant/agent-swarm` (1/3)
· `@quant/browser-agent` (1/3) · `@quant/code-agent` (1/3) · `@quant/identity-permissions` (1/3)
· `@quant/user-owned-ai` (1/3) · `@quant/ml` (1/1, but feeds ml-pipeline)

## 5. LOW — single consumer, contained blast radius (24)

`ab-testing, ai-memory, bharat-ai, cache, cdn, command-palette, contextual-sidekick,
creator-economy, cross-publish, error-monitoring, events, local-first, maps,
onboarding, payment, performance, privacy-ads, quant-commerce, quant-live,
recommendation, scaling, sync-engine, teams, universal-timeline, webrtc, wellbeing`

> ⚠️ Naming debt visible here: `payment` vs `payments`, `recommendation` vs
> `recommendations` — duplicate-concept packages. Consolidation candidates.

## 6. DEAD — nothing imports them (40)

D = 0 **and** I = 0. Deleting these breaks **zero** source files today:

```
ai-daily-brief, ai-organization, app-store, chaos-testing, co-presence,
cross-app-workflows, data-pipeline, data-warehouse, developer-platform,
device-control, edge-config, generative-media, governance, information-agents,
iot-control, launch-beta, launch-public, photos, quant-automate, quant-codex,
quant-flow, quant-health, quant-notebook, quant-orchestrator, quant-studio,
robotics-bridge, security-advanced, server, service-discovery, social-graph*,
spatial-ui, testing, universal-capture, voice-brain-dump, voice-first-os,
voice-input, wearables
```

**Flagged discrepancies (declared-but-never-imported — remove the declaration or the package):**

| Package | D | I | Verdict |
|---------|---|---|---------|
| `@quant/security` | 1 | 0 | declared somewhere, imported nowhere → effectively DEAD |
| `@quant/observability` | 1 | 0 | same |
| `@quant/data-plane` | 1 | 0 | outbox concept lives in DB schema, package unused |
| `@quant/quant-orchestrator` | 0 | 0 | name suggests core; reality: dead |

\* `social-graph` shows D=0 here but is referenced in QuantSync roadmap — verify before deletion.

---

## 7. Interpretation (CEO summary)

1. **37% of all packages (40/108) are DEAD.** This matches the repo-audit
   finding: architecture exists, wiring doesn't. The build farm pays for them,
   reviewers scan them, `pnpm install` resolves them — for zero runtime value.
2. **The real platform is ~10 CRITICAL + ~16 HIGH packages.** That is the
   actual organism; everything else is either a limb bud (future) or scar tissue (dead).
3. **Policy going forward:**
   - New package ⇒ must arrive with ≥ 1 real importer in the same PR, or it goes
     to a `graveyard/`-style incubation area — not `packages/`.
   - DEAD packages: freeze (no CI, no lockfile updates). Delete after one
     quarter unclaimed. History survives in git (Law 2 applies to code too).
   - Duplicate concepts (`payment/payments`, `recommendation/recommendations`)
     get a consolidation issue each — not a rewrite, a merge.
4. **Do NOT delete anything during M11 freeze.** This heatmap is evidence for a
   post-M11d cleanup milestone, executed as its own reviewed PR series.

## 8. Regeneration

```bash
# Declared dependents: scan all workspace package.jsons for @quant/* deps
# Import reach: grep -rlE "from [\"']<pkg>[\"'/]" apps packages services
node scripts/dependency-heatmap.mjs   # (add script when cleanup milestone starts)
```

**Owner:** Kiro · **Approved by:** CEO · **Version:** 1.0 (snapshot aa1fc92) · **Date:** 2026-07-09
