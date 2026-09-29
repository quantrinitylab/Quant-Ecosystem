# Per-App Platform Presence Restructure — Design Spec

**Status:** DRAFT for owner review (no files moved yet — "pehle spec, phir move")
**Date:** 2026-09-30
**Author:** Claude Opus 4.8 (with owner)
**Relation:** redirects the old "super-app consolidation" line item; complements the design-token unification and the phase-3 rename.

## Goal

Every Quant product owns its **entire platform presence** — web, backend, desktop, mobile, marketing, admin — **inside its own `apps/<app>/` folder**. Cross-cutting machinery lives in shared `packages/`. Ecosystem-wide surfaces become **thin hubs that compose per-app slices**, never monoliths that re-implement them. Each app is independently buildable & shippable, yet all stay connected through shared packages + SSO. *Sab alag, fir bhi connected.*

## The core principle (one line)

> If a surface is something a single product exposes, it lives in that product's folder. If it is machinery many products share, it lives in `packages/`. If it is an ecosystem-wide view, it is a thin aggregator over each product's own slice.

---

## 1. Problem — the current architecture is platform-sliced, not product-sliced

Today `apps/` holds **14 entries = 9 real products + 5 horizontal "shell" apps**:

| Shell app | What it really is | Scope |
|---|---|---|
| `quant-desktop` | ONE Tauri window that frames *all* apps via a dock/tab switcher + Rust ProjFS VFS | whole ecosystem |
| `quant-mobile` | ONE Capacitor launcher grid that deep-links into *all* apps + native plugin bridges | whole ecosystem |
| `marketing` | ONE 1233-line landing page showcasing *all* apps | whole ecosystem |
| `admin-enterprise` | ONE enterprise admin console (Workspace-Admin parity), stub, 6 dead links | whole ecosystem |
| `quanttrinity` | ONE owner command-center governing *all* apps (economy, teams, audit) | whole ecosystem |

These five are **platform-layer monoliths**: one desktop for everyone, one mobile for everyone, etc. That is exactly the "sab ko ek me kar dena" flagged as wrong. Meanwhile the 9 products already co-locate `web + backend` correctly — so only the desktop/mobile/marketing/admin layers were wrongly pulled out.

### Hard evidence this pattern already broke

The **app catalog is triplicated and has drifted out of sync** across the three UI shells — proof that a shared source of truth was needed and each mega-shell reinvented it instead:

- `apps/quant-desktop/src/constants/apps.ts` → `QUANT_SOVEREIGN_APPS`, **8 apps, old names**, includes non-products (`codehub`, `quantdrive`, `quantcalendar`).
- `apps/quant-mobile/src/app-launcher.ts` → `QUANT_APPS`, **13 apps, pre-rename ids** (`quantneon`, `quantsync`, `quantedits`) + non-products (`quantdocs`, `quantmeet`).
- `apps/marketing/src/app/page.tsx` → `APPS_DATA`, a **different set again** (`quantgit`), with hardcoded `localhost:3000…` URLs.

Three catalogs, three different app lists, three naming eras. No product owns its own identity/port/icon/route — so they rot independently.

### Consequences
- Can't build or ship one app's desktop/mobile without dragging in the whole mega-shell.
- Every new app requires editing 3+ unrelated shells.
- The native VFS + mobile plugin bridges are entangled with UI aggregation.
- `admin-enterprise` & `quanttrinity` claim to be "apps" but are really platform services.

---

## 2. Classify the five shells (they are NOT all the same problem)

**Category A — per-product presence (move *into* each app):**
- **desktop** — each product gets its own desktop app.
- **mobile** — each product gets its own mobile app.
- **marketing** — each product owns its marketing page/content.

**Category B — genuinely ecosystem-level (become thin hubs + per-app slices):**
- **admin-enterprise** — org-wide (domains, directory, SCIM/SAML SSO, compliance, MDM, eDiscovery). Governs *a tenant across all apps*; it cannot live inside one product. But each product should expose its **own admin slice** (e.g. QuantMail's DLP/domain settings) that this console aggregates.
- **quanttrinity** — the *owner's* cross-app command center (economy, team/AI-employee provisioning, governance). Also inherently cross-app; it should read each product's own telemetry/economy slice rather than reimplement them.

> Honest note: for Category A the diagnosis is 100% right — fold them in. For Category B, "inside one app" doesn't fit; the correct expression of the *same* principle is *push a per-app slice into each product, keep a thin cross-app hub*.

---

## 3. Target folder structure

Each product folder becomes a small set of **nested workspace packages**, one per surface:

```
apps/quantmail/
  web/         # Next.js frontend            -> @quant/quantmail-web
  backend/     # Fastify API (already exists) -> @quant/quantmail-backend
  desktop/     # thin Tauri app              -> @quant/quantmail-desktop  (deps @quant/desktop-kit)
  mobile/      # thin Capacitor app          -> @quant/quantmail-mobile   (deps @quant/mobile-kit)
  marketing/   # this product's landing/content -> @quant/quantmail-marketing
  admin/       # this product's admin slice   -> @quant/quantmail-admin
  app.config.ts  # single per-app manifest (id, name, icon, color, routes, ports)
```

- `pnpm-workspace.yaml` gains the `apps/*/*` glob (keep `apps/*` during migration).
- Turbo picks these up automatically; `gate` runs each changed surface.
- `backend/` stays where it already is (quantmail/quantchat/… already co-locate it).

### New shared packages (extracted, not duplicated)
- **`@quant/desktop-kit`** — the Rust ProjFS VFS (`src-tauri/src/vfs/*.rs`), Tauri window chrome (TitleBar/Dock/CommandPalette/AppFrame), `vfs-bridge`. Each app's `desktop/` is a thin shell that imports the kit and mounts its own `web/`.
- **`@quant/mobile-kit`** — the 12 Capacitor plugin bridges + deep-link router + offline-sync + oauth + crash-reporter + launcher grid. Each app's `mobile/` imports the kit.
- **`@quant/app-registry`** — the single source of truth for the app catalog (id, name, icon, accent, route, ports, marketing blurb), assembled from each `app.config.ts`. Replaces the 3 drifted lists. (May extend the existing `@quant/app-store` service.)

### Ecosystem hubs (thin, Category B)
- `apps/_ecosystem/marketing-home` — optional top landing that lists apps from `@quant/app-registry` + links into each product's own `marketing/`.
- `apps/_ecosystem/enterprise-admin` — org-wide console composing each product's `admin/` slice + org packages (`identity-permissions`, `governance`, `audit`).
- `apps/_ecosystem/trinity` — owner console reading per-app economy/telemetry via `@quant/credits`, `@quant/governance`.

---

## 4. The "connected" backbone (already exists — strengthen, don't break)

Separation does **not** cut the connection. Apps stay connected through shared `packages/` that already exist: `auth`, `api-client`, `brand` (design tokens), `common`, `credits` (economy), `database`, `shared-ui`, `identity-permissions`, `federation`, `notifications` — plus cross-app **SSO** (QuantMail as sovereign auth root). The restructure *adds* one missing piece: a single `@quant/app-registry` so every surface reads the same catalog.

---

## 5. Migration strategy — pilot-first, CI-verified, one PR per phase

Local build/preview is impossible on this box, so every phase ships as its own PR gated on `gate` (+ a staging dry-run wherever a runtime surface changes). Nothing is deleted until its replacement is proven.

- **Phase 0 — extract shared kits (additive, touches no product):** create `@quant/desktop-kit`, `@quant/mobile-kit`, `@quant/app-registry` from the existing shells' code. The old shells keep working by consuming the kits. Gate stays green.
- **Phase 1 — PILOT: quantmail (flagship, already has backend):** add `web/ desktop/ mobile/ marketing/ admin/` + `app.config.ts` under `apps/quantmail/`, each wired to the kits/registry. Prove: gate green + staging deploy of quantmail-web + a desktop/mobile build in CI. Validates the whole pattern end-to-end before touching anything else.
- **Phase 2 — replicate to the other 8 products** (quantchat, quantai, quantgram, quantwave, quantcooks, quantube, quantmax, quantads), one PR each.
- **Phase 3 — Category B:** convert `enterprise-admin` + `trinity` into thin hubs over the per-app `admin/` slices; add each product's admin slice.
- **Phase 4 — retire the old horizontal shells** (`quant-desktop`, `quant-mobile`, `marketing`, `admin-enterprise`, `quanttrinity`) once superseded; update `pnpm-workspace.yaml`, `deploy.yml`/`deploy-staging.yml` workload names, DNS.

---

## 6. Risks & honest trade-offs

- **N desktop binaries + N mobile apps to sign/publish.** 9 products = 9 store listings on Android/iOS/desktop. Real overhead. Mitigate: shared signing config in the kits, and an *optional* ecosystem launcher for users who want one grid — but it is not the product boundary.
- **Rust ProjFS VFS is one-per-machine.** It must remain a shared daemon/kit, never copied 9×. `@quant/desktop-kit` owns it; per-app `desktop/` is a thin window over it.
- **Huge, locally-unverifiable moves.** Mitigate: pilot-first, one PR per phase, gate + staging on every PR, additive Phase 0.
- **Workspace-glob + Turbo change** affects all builds → done carefully in Phase 0, gate-gated.
- **In-flight PRs / other sessions' WIP** (SSO, connect-backends) touch these apps → sequence phases around open PRs; rebase.
- **Deploy workflows** reference fixed workload names → update alongside Phase 1/4.

## 7. Decisions needed before I write the implementation plan

1. **Surface granularity:** `apps/<app>/web` (rename `src/`→`web/`) vs keep `src/` as web and only add `desktop/ mobile/ marketing/ admin/`. *(Recommend: keep `src/` as web to minimise churn; add the four new surfaces.)*
2. **Desktop/mobile model:** truly standalone per-app binaries (max separation, the stated preference) vs one kit-built ecosystem shell that loads each app. *(Recommend: standalone per-app, kit-backed.)*
3. **Category B:** thin-hub-over-slices for enterprise-admin & trinity *(recommended)*, or leave them as-is for now and do Category A only first.
4. **Pilot app:** quantmail *(recommended — flagship, already has backend + is the SSO root)*.

## 8. Non-goals
- Not merging products into one super-app (this is the opposite).
- Not changing product features/behaviour — pure structural relocation + kit extraction.
- Not the design-token rollout (tracked separately).

## 9. Next step
On approval → invoke **writing-plans** to produce a per-phase implementation plan (starting Phase 0 + the Phase 1 quantmail pilot). No files move until then.




