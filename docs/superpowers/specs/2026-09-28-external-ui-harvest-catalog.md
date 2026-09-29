# External UI Harvest Catalog — Reference-and-Rebuild

**Date:** 2026-09-28
**Scope:** License-clean harvest of UI/UX + frontend patterns from three third-party apps under `C:\Users\Pc\new` into `@quant/shared-ui`.
**Method:** Read-only verification (paths cited). Nothing executed/built in `C:\Users\Pc\new`. No secret/key value reproduced.
**Platform target:** bespoke `@quant/shared-ui` + `@quant/brand` · Tailwind **v3** · React 18||19 · framer-motion · LiveKit. **NOT** shadcn/Radix/CVA/clsx/twMerge/cmdk.

> This catalog tells you what to **rebuild** and what to only **reference** — it does not paste third-party code. "Direct copy the best UI/UX" is realized by reproducing _behavior and layout_ onto our own bespoke primitives, which is both legally safe and consistent with the platform.

## Assumptions (stated, not asked)

- Verbatim copy is legally defensible ONLY for generic, non-expressive utility logic (algorithms, math, format regex). Proprietary/commercial _compositions_ must be REBUILT from observed behavior.
- WorkDo/ERPGo app code = **proprietary** (`"private": true`, no OSS license). Its shadcn/Radix _primitives_ are MIT-origin upstream, but the platform has no Radix — adopting them is a **new-dependency decision**, not a harvest.
- Nexsas + Whoxa = **commercial CodeCanyon** (no OSS license) → all authored components are REFERENCE/REBUILD.
- Nexsas pricing/testimonial/FAQ/bento/KPI are **ALREADY harvested** into `packages/shared-ui/src/bento` (`index.ts:542-549` re-exports `./bento`,`./theme`,`./resilience`) — excluded below to avoid duplicate work.
- Nexsas ships **Tailwind v4** (`@theme`/`@utility` in `src/styles/*.css`); platform is v3 → any token reuse needs a v4→v3 migration (appendix).

## Verdict legend

- **SAFE-to-copy snippet** — generic, non-expressive logic; low copyright risk (re-type clean-room anyway).
- **REBUILD-from-pattern** — reimplement behavior/interface onto shared-ui conventions; do NOT paste source.
- **REFERENCE-only** — study UX; no code transfer (commercial expression, secret-adjacent, or already superseded).

## Legal-risk legend

🟢 low (generic logic) · 🟡 medium (bespoke composition → rebuild) · 🔴 high (verbatim proprietary/commercial or secret-adjacent)

## Source roots (paths in table are relative to these)

- **ERPGo:** `C:\Users\Pc\new\ERPGo SaaS v9.8\source_erpgo\main-file\resources\js\`
- **Nexsas:** `C:\Users\Pc\new\Nexsas v2.7.0 Nextjs\Nexsas v2.7.0 Nextjs\nexsas-templates\<template>\src\`
- **Whoxa:** `C:\Users\Pc\new\Whoxa Chat v1.1.2\source_whoxa_frontend\src\`

## Prioritized harvest catalog (highest ROI + lowest legal risk first)

| #   | component / pattern                                                                                                                    | source app + path                                                     | license                                                     | verdict                                                                   | target in `@quant/shared-ui`                                     | effort                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------- |
| 1   | **Mobile chart-tick thinning** — thins a categorical axis to ~5 evenly-spaced labels on small screens                                  | ERPGo `hooks/use-mobile-chart-ticks.ts`                               | 🟢 generic logic                                            | **SAFE-to-copy** (clean re-type)                                          | `advanced/charts-engine` helper (or `hooks/useMobileChartTicks`) | XS (~1h)                                      |
| 2   | **Video-thumbnail generator** — canvas frame grab w/ blank-frame retry (`len>100000 \|\| retry>=n`)                                    | Whoxa `utils/generateVideoThumbnails.ts`                              | 🟢 generic canvas logic (commercial source → reimpl)        | **REBUILD-from-pattern** (near-drop-in, add TS types)                     | `utils/generateVideoThumbnail` → used by `Chat` + `MediaPlayer`  | S (~2-3h)                                     |
| 3   | **Client-side DataTable** — sort/search/paginate via useState/useMemo, no TanStack; `Column<T>`/`DataTableProps<T>`                    | ERPGo `components/ui/data-table.tsx`                                  | 🟡 WorkDo proprietary composition                           | **REBUILD-from-pattern**                                                  | new `components/DataTable`                                       | M (~1-2d)                                     |
| 4   | **Form-wizard stepper** — active/completed/error states, step clickable only if all prior steps valid                                  | ERPGo `components/ui/wizard.tsx`                                      | 🟡 bespoke (body uses Radix Tabs → swap for shared-ui Tabs) | **REBUILD-from-pattern**                                                  | new `components/Wizard` (or extend `Onboarding`)                 | S-M (~1d)                                     |
| 5   | **Kanban board** — native HTML5 drag-and-drop, self-contained                                                                          | ERPGo `components/kanban-board.tsx`                                   | 🟡 bespoke; **a11y gap** (no keyboard DnD)                  | **REBUILD-from-pattern** (wire to existing `useDragDrop` + keyboard a11y) | new `components/Kanban`                                          | M (~1-2d)                                     |
| 6   | **Recharts wrappers** — Area/Bar/Line/Pie/Radar/Radial; `gradient/stacked/areas/showLegend/showGrid`                                   | ERPGo `components/charts/*` (`AreaChart.tsx`, `index.ts`)             | 🟡 thin wrappers over MIT Recharts                          | **REBUILD-from-pattern**                                                  | fold into `advanced/charts-engine`                               | S (~1d) — low incremental ROI (engine exists) |
| 7   | **Rich-text toolbar** — TipTap 3: bold/italic/underline/strike/highlight/align/lists/quote/link/color/undo-redo                        | ERPGo `components/ui/rich-text-editor.tsx`                            | 🟡 bespoke toolbar; TipTap MIT                              | **REBUILD-from-pattern** (verify vs existing)                             | compare/extend `advanced/rich-text-editor`                       | S (~1d)                                       |
| 8   | **Message-type dispatcher** — date divider (Today/Yesterday), system messages, media image/video/gif; **inverse** infinite-scroll      | Whoxa `pages/Home/MessageList/MessageBody.tsx`                        | 🔴 commercial                                               | **REFERENCE-only**                                                        | informs `components/Chat/*`                                      | ref                                           |
| 9   | **Attachment composer + upload ring** — conic-gradient progress ring, video-thumb preview, doc card, 100MB guard, Giphy/location entry | Whoxa `pages/Home/MessageList/SendMessage/ShowSelectedFile.tsx`       | 🔴 commercial (keys elsewhere in app)                       | **REFERENCE-only**                                                        | informs `components/Chat/ChatInput`                              | ref                                           |
| 10  | **Extra message types** — document / inline-audio / location-map / GIF render variants                                                 | Whoxa message components (`pages/Home/MessageList/*`)                 | 🔴 commercial + secret-adjacent                             | **REFERENCE-only**                                                        | `components/Chat` render variants                                | ref                                           |
| 11  | **Marketing token scale** — 7 font families, 6-step per-font heading scale, 14 bg + accent + 27 gradients, 5 shadows, easings          | Nexsas `<template>/src/styles/variable.css` + `typography.css`        | 🔴 commercial theme (Tailwind v4 `@theme`/`@utility`)       | **REFERENCE-only** → derive our own v3 scale (do not copy wholesale)      | `@quant/brand` tokens + shared Tailwind preset                   | M (design)                                    |
| 12  | **Scroll-reveal animation** — blur(16px)+translate, spring easing, direction up/down/left/right, ScrollTrigger                         | Nexsas `<template>/src/components/animation/reveal-animation.tsx`     | 🟡 GSAP pattern                                             | **REBUILD-from-pattern** onto framer-motion                               | extend `components/Motion` (`FadeIn`/`StaggerList`)              | S (~1d)                                       |
| 13  | **Marketing layout patterns** — hero, sticky navbar + mega-menu, footer, CTA band (structure only)                                     | Nexsas Gen-B templates `<template>/src/components/home/*`, `layout/*` | 🔴 content/images proprietary                               | **REBUILD-from-pattern** (layout skeleton only)                           | marketing app + `Shell` nav patterns                             | M                                             |
| 14  | **shadcn primitive set** — button/input/dialog/etc. on Radix + CVA + `cn()`                                                            | ERPGo `components/ui/*`, `lib/utils.ts`                               | 🟢 MIT upstream but 🔴 as WorkDo bundle                     | **REFERENCE-only** (adopt ONLY via explicit Radix-adoption decision)      | n/a — platform is bespoke                                        | n/a                                           |

**Already harvested — do NOT re-catalog:** Nexsas bento grid, KPI metric cards, pricing tables, animated FAQ accordion, testimonial showcase, and a **basic** Nexsas palette/theme-helper set already live in `packages/shared-ui/src/bento` + `./theme` (`src/index.ts:542-549`); Appy offline-resilience in `./resilience`. **Scope note:** `./theme` is that basic palette + helpers only — it is **not** row 11's full marketing token scale (7 font families, the 6-step type scale, 14 backgrounds + 27 gradients, etc.), which stays **REFERENCE-only / to-derive** and is not yet in the package.

## Do NOT touch

**Proprietary / non-portable code (never copy verbatim):**

- **ERPGo Inertia-bound pages & dashboards** — anything using `usePage`, Ziggy `route()`, `router.*` (408 `route()` call sites). Business logic + WorkDo composition = proprietary; also structurally non-portable to Next App Router.
- **Commercial embedded SDK inside ERPGo** — `@syncfusion/ej2-react-diagrams` + `ej2-react-navigations` (Syncfusion is paid-license). Do not lift diagram/nav features that depend on it.
- **Whoxa calling stack** — PeerJS full-mesh (hardcoded `peer.whoxachat.com`) and dead `mediasoup` code. Our LiveKit path (`components/Media`) is superior; do not port.

**Nulled / pirated folders under `C:\Users\Pc\new` (copyright + Envato ToS violation, backdoor/malware risk — do NOT extract, run, or copy):** Artifism, BeDrive, Booking, Davinci, DTTube (per audit memory); Tier-2 nulled zips also flagged: Vizion, Orange, Chatter, Shortzz. Treat every "Nulled" folder as untrusted.

**Secrets — reference file by name only, NEVER reproduce the value (all inside Whoxa `source_whoxa_frontend/src`):**

- hardcoded Google Maps key — `pages/.../StarMessageList.tsx`
- real-looking JWT in a comment — `App.tsx`
- Giphy + OneSignal keys — in their respective feature components
- JWT stored in a non-HttpOnly cookie (anti-pattern — do NOT replicate the storage approach)

> When rebuilding the composer/location wins (rows 8-10), read only the secret-free files already cited (`MessageBody.tsx`, `ShowSelectedFile.tsx`). Any Maps/Giphy integration in our platform must use our own server-proxied keys, never a client-embedded key.

## Harvest item → design-effort mapping

| harvest item(s)                                                                    |              design-system               |   super-app   |     chat      | marketing / quanttrinity |
| ---------------------------------------------------------------------------------- | :--------------------------------------: | :-----------: | :-----------: | :----------------------: |
| DataTable (#3), Wizard (#4), Kanban (#5)                                           |                                          |  ✅ primary   |               |                          |
| Recharts wrappers (#6), chart-tick hook (#1)                                       |            ✅ (charts-engine)            | ✅ dashboards |               |                          |
| Rich-text toolbar (#7)                                                             |           ✅ (advanced editor)           |      ✅       | ✅ (composer) |                          |
| Video-thumb generator (#2)                                                         |                                          |               |  ✅ primary   |                          |
| Message-type dispatcher (#8), composer upload-ring (#9), extra message types (#10) |                                          |               |  ✅ primary   |                          |
| Nexsas token scale (#11)                                                           | ✅ **primary** (feeds token-unification) |               |               |            ✅            |
| Scroll-reveal → Motion (#12)                                                       |          ✅ (Motion primitives)          |               |               |        ✅ primary        |
| Marketing layout patterns (#13)                                                    |                                          |               |               |      ✅ **primary**      |
| shadcn primitives (#14)                                                            |          ⚠️ decision-gate only           |               |               |                          |

Notes: #11 directly feeds the in-flight **token-unification** effort (fixes the fragmentation where `Button.tsx` hardcodes `#FF8C42` and each app hand-writes its own `tailwind.config.ts`). Per-app harvest is discouraged — land everything in `@quant/shared-ui` and expose via `EcosystemShell`, consistent with the existing `./bento`/`./resilience` harvest pattern.

## Appendix — Nexsas Tailwind v4 → v3 token migration

The Nexsas tokens are declared as Tailwind v4 CSS-first directives; to reuse the _values_ (not the commercial theme wholesale) they must move into a v3 `tailwind.config.ts` preset / `@quant/brand`:

- **`@theme { --color-* }`** (verified in `variable.css`: `background-1..14`, `stroke-1..3`, `opai-*` accents, `gradient-1..27`) → `theme.extend.colors` (gradients become `backgroundImage` entries, not `colors`).
- **`@theme { --text-*-heading-N: <size> / --line-height / --letter-spacing }`** (6 heading steps × 6 font families + `tagline-1..4`) → `theme.extend.fontSize` as `[size, { lineHeight, letterSpacing }]` tuples.
- **`@utility text-<font>-heading-N { @apply font-<family> }`** (in `typography.css`) → since v3 has no `@utility`, bind font-family into the same `fontSize` composite or emit small component classes in a plugin; families go to `theme.extend.fontFamily` (`inter-tight`, `ibm-plex-mono`, `instrument-serif`, `manrope`, `sora`, `space-grotesk`, `funnel-display`).
- **`--shadow-1..5`** → `theme.extend.boxShadow`; **`--easing-*` / `--custom-ease-*`** → `theme.extend.transitionTimingFunction`; **`--breakpoint-lp: 1440px`** → `theme.screens.lp`.
- **Migration effort:** M (mechanical but wide). **Recommendation:** treat as a numeric reference to derive _our own_ brand-consistent scale — do not ship the commercial palette verbatim.

## Recommended sequencing

1. **Quick wins (rows 1-2):** chart-tick hook + video-thumb generator — hours, near-zero legal risk, immediate chat/charts value.
2. **Super-app core (rows 3-5):** DataTable → Wizard → Kanban — the highest-ROI rebuilds for dashboards/boards.
3. **Design-system (row 11 + token-unification):** derive the v3 token preset; retire per-app `#FF8C42` hardcoding.
4. **Chat polish (rows 8-10, reference):** upload-ring composer + extra message types onto existing `Chat`/LiveKit surfaces.
5. **Marketing (rows 12-13):** scroll-reveal onto Motion + hero/nav/footer skeletons for quanttrinity.
