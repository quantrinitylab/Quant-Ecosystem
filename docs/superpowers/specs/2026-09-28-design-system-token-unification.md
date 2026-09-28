# Design System Token Unification

- **Status:** Draft (design only — no code changed)
- **Date:** 2026-09-28
- **Author:** Design spec (agent-authored, evidence-verified)
- **Scope:** `@quant/brand`, `@quant/shared-ui`, all app `tailwind.config.ts` + `globals.css`, `EcosystemShell`
- **Type:** Architecture / migration spec

> Every claim below was verified by reading the actual files. Citations are `path:line`.
> This document proposes changes; it does **not** implement them.

---

## 1. Problem Statement

The platform's UI problem is **token fragmentation**, not missing components. `@quant/shared-ui`
already ships ~1245 files of bespoke components and `@quant/brand` already defines a real token
source of truth (colors, typography, motion, 6 themes, 16 per-app configs). The failure is that
**nothing enforces a single path from those tokens to rendered pixels.** Instead there are (at least)
**eight competing color/variable systems** and **five runtime theme mechanisms**, so the same
component renders differently per app, the 6 themes are unreachable at runtime, and `shared-ui`
primitives hardcode the dark palette so no theme can restyle them.

### 1.1 The eight competing token namespaces (all currently live)

| # | Namespace / format | Defined in | Consumed by | Note |
|---|---|---|---|---|
| 1 | `--brand-*` (shaded, e.g. `--brand-primary-500`) | `packages/brand/src/tokens.ts:16` `generateBrandCSS()` | 3 apps via brand-provider | orange scale |
| 2 | `--brand-primary` / `--brand-accent` / `--brand-app-color` (unshaded) | hand-written in every app `globals.css` | app `tailwind.config.ts` | **name-collides** with #1, never emitted by the generator |
| 3 | `--app-color` / `--app-name` / `--app-hue` | `tokens.ts:106` `generateAppCSS()` | almost nothing | |
| 4 | `--quant-*` | hand-written per-app `globals.css` + `shared-ui` `.quant-*` CSS | app configs, runtime CSS | de-facto app standard |
| 5 | unprefixed `--primary` / `--background` / `--surface` (`:root[data-theme]`) | `tokens.ts:119` `generateThemeCSS()` | **no app injects it** | orphaned |
| 6 | `--color-*` (shaded + semantic) | `shared-ui/src/themes/tokens.ts`, `advanced/theme-engine.ts` | parallel | third "neon" |
| 7 | HSL-triplet shadcn tokens (`--background: 0 0% 100%`) | `shared-ui/src/theme/theme-tokens.ts:31` | its own test only | nexsas harvest |
| 8 | `--qt-*` (`:root[data-quant-theme]`) | `packages/brand/src/foundation.ts:188` | quantrinity foundation | |

### 1.2 The five parallel runtime theme mechanisms

- **`ThemeProvider`** (`packages/shared-ui/src/components/ThemeProvider/index.tsx`): the one the shell
  uses. Type is `'light' | 'dark' | 'system'` only (`:8`). It writes `data-theme` = the resolved
  value (`:61`) but **only ever `'light'` or `'dark'`** (`:52-55`), and toggles the `.dark` class
  (`:62-66`). Persists to `localStorage['quant-theme']` (`:23`). It injects **no CSS variables** —
  it only flips an attribute/class and trusts CSS elsewhere to react.
- **`useTheme` hook** (`packages/shared-ui/src/hooks/useTheme.ts`): a *separate* JS theme with its own
  hardcoded `lightTheme`/`darkTheme` objects (`:19-80`, primary `#3B82F6`/`#60A5FA`), `light|dark|system`
  only, persisting to a **different** key `localStorage['quant_theme_mode']` (`:107`). Emits no CSS.
- **`ThemeEngine` class** (`packages/shared-ui/src/advanced/theme-engine.ts`): in-memory palette
  generator seeded from `#3b82f6`/`#60a5fa`/`#0000ff` (`:48,:81,:101`), emits `--color-{name}-{shade}`,
  built-in `light|dark|high-contrast`; persistence stubbed to no-op (`:341-358`).
- **`generateThemeCSS`** (`packages/brand/src/tokens.ts:119`): emits all 6 themes as
  `:root[data-theme="<name>"]` blocks — but no app calls it, so it is dead.
- **`generateFoundationCSS`** (`packages/brand/src/foundation.ts:224`): emits `:root[data-quant-theme="<mode>"]`
  with `--qt-*` — a third data-attribute selector.

**Consequence (verified):** the six curated themes (`dark`, `light`, `neon`, `bharat`, `highContrast`,
`colorblindSafe`) exist *only as data* in `packages/brand/src/themes.ts:21-139`. The only runtime
switch that ships — `ThemeProvider` — can never select `neon`/`bharat`/`highContrast`/`colorblindSafe`;
it resolves to `light`/`dark` exclusively. **Four of the six themes are unreachable at runtime.**

Two storage keys (`quant-theme` vs `quant_theme_mode`) mean a component reading `useTheme()` and one
reading `useThemeMode()` can disagree about the current theme.

### 1.3 EcosystemShell is not adopted

`EcosystemShell` (`packages/shared-ui/src/components/EcosystemShell/index.tsx`) is the intended single
mount point and wraps `ThemeProvider` (`:80`), but its `defaultTheme` prop is typed `'light' | 'dark' |
'system'` (`:49,:70`). A grep for `EcosystemShell` across `apps/**` returns **zero** usages — no app
mounts it today, so there is currently no shared theming entry point in production app trees.

---

## 2. Audit Evidence (verified)

### 2.1 `shared-ui/Button` hardcodes the brand orange and the whole dark palette

`packages/shared-ui/src/components/Button.tsx` builds Tailwind arbitrary values from literal hex and
**never references any CSS variable**:

- `:42` base: `focus-visible:ring-[#FF8C42]/50 ... focus-visible:ring-offset-[#090A0C]`
- `:46` primary: `bg-[#FF8C42] text-[#111111] ... hover:bg-[#FF9B5A] active:bg-[#E8752F]`
- `:48` secondary: `bg-[#16181D] text-[#F5F5F5] border-[#282C35] hover:bg-[#1C1F26] hover:border-[#3A404D] active:bg-[#111318]`
- `:50` ghost: `text-[#A1A4AC] hover:text-[#F5F5F5]`
- `:52` danger: `bg-[#2A1215] text-[#F87171] border-[#4E1F24] ...`
- `:54` success: `bg-[#0E2A1A] text-[#4ADE80] border-[#1B4D2E] ...`

`#FF8C42` is exactly `primary[500]` in `packages/brand/src/colors.ts:9` — the token exists, the
component just doesn't use it. Because the values are baked in, **the button is permanently dark-theme
and permanently brand-orange** regardless of app accent or active theme. The comment at `:64-67` even
notes it deliberately avoids the `min-h-touch` token because "only three of the fourteen app Tailwind
configs define that theme key" — i.e. the drift is already understood, just worked around.

### 2.2 The same dark palette is copy-pasted across primitives

The identical literal palette (`#16181D`, `#282C35`, `#111318`, `#F5F5F5`, `#A1A4AC`, `#FF8C42`,
`#EF4444`, `#F87171`, `#4ADE80`, …) recurs verbatim in sibling components:

- `Badge.tsx:29-49` — 6 variant rows + 6 dot colors, incl. `:45 bg-[#FF8C42]`
- `Card.tsx:33-61` — `bg-[#16181D]`, `border-[#282C35]`, `bg-[#111318]`, `text-[#F5F5F5]`, hover `#3A404D`/`#1C1F26`
- `Input.tsx:94-98` — `bg-[#111318] text-[#F5F5F5] placeholder-[#A1A4AC] focus:border-[#FF8C42] focus:ring-[#FF8C42]/20`, error `#EF4444`/`#F87171`

These are the brand `neutral`/`primary`/`semantic` values inlined — proving the tokens are known but
bypassed. Any theme change (light, bharat, neon, high-contrast) leaves every one of these dark.

### 2.3 Raw-hex offender count in `shared-ui`

`rg '#[0-9A-Fa-f]{6}\b' packages/shared-ui/src` → **445 matching lines across 54 files.** Top offenders:

| File | Lines w/ hex | Kind |
|---|---|---|
| `advanced/theme-engine.ts` | 41 | parallel token engine |
| `themes/tokens.ts` | 31 | parallel `--color-*` tokens |
| `components/Shell/NotificationPanel.tsx` | 22 | component |
| `components/Shell/SettingsPanel.tsx` | 19 | component |
| `components/CommandPaletteUI/index.tsx` | 18 | component |
| `components/Shell/UniversalSearch.tsx` | 17 | component |
| `bento/TestimonialShowcase.tsx` | 14 | component |
| `components/Shell/ActivityFeed.tsx` / `Auth/LoginPage.tsx` | 13 each | component |
| `components/Badge.tsx` / `themes/neon.ts` / `themes/light.ts` / `themes/dark.ts` | 12 each | component + parallel themes |
| `bento/PricingPlanTable.tsx` / `advanced/charts-engine.ts` / `components/Toast.tsx` / `Shell/CrossAppRelations.tsx` | 11 each | component |
| `interconnection/constants.ts` / `bento/FaqAccordion.tsx` / `components/Input.tsx` / `QuantSidekick/BubbleAvatar.tsx` | 10 each | component |
| … 34 more files | 1–8 each | component |

(3/4-digit hex like `#fff` is *not* counted above, so the true figure is higher.)

### 2.4 Per-app drift — every app hand-writes its config with no shared preset

`rg 'presets' apps/*/tailwind.config.ts` → **zero matches.** No app extends a shared Tailwind preset;
each hand-writes `theme.extend`. 10 of the 14 app dirs have a `tailwind.config.ts`
(`quantads, quantai, quantchat, quantedits, quantmax, quantneon, quanttrinity, quantube, quantmail, marketing`).

- **quantchat** (`tailwind.config.ts`): mixes namespaces — `background/foreground/surface/primary/...`
  point at `var(--quant-*)` (`:13-33`) but `accent.DEFAULT` points at `var(--brand-accent)` (`:21`);
  `quant.secondary` is hardcoded `#8b5cf6` (`:43`); and full `emerald`/`indigo`/`amber` scales are
  inlined (`:49-87`). Its `globals.css` sets `--brand-primary: #4f46e5` (indigo, `:7`) and
  `--quant-primary: #10b981` (emerald, `:15`), with a `.dark` override block (`:36`). Its
  `.quant-btn-primary` uses `background: var(--brand-primary, #ff9933)` (`:273`) — a **third** orange
  (`#ff9933`) that matches neither `#FF8C42` nor the indigo the var resolves to.
- **quantai**: `tailwind.config.ts:10-14` references `var(--brand-primary)`, `var(--brand-primary-hover)`,
  `var(--brand-app-color)` — none of which `generateBrandCSS()` emits (it emits the *shaded*
  `--brand-primary-500`), so they resolve only because `globals.css` hand-defines them. `globals.css:7`
  sets `--brand-primary: #4F46E5` (indigo) even though this app's brand color is `#8B5CF6` violet
  (`:6` comment, `:11`); `--quant-primary`/`--primary` then alias the indigo (`:15,:43`).
- **quantneon** (`tailwind.config.ts:9-14`): fully hardcoded `neon.primary #a855f7` (purple),
  `accent #ec4899` (pink), `background #0F0F14`, `surface #1a1a24`. No variables at all. This
  disagrees with **both** `apps.quantneon.color = #EC4899` (`apps.ts:78`) **and** the `neon` theme's
  `primary #00FF88` green (`themes.ts:66`).
- **marketing** (`tailwind.config.ts:9-22`): GitHub-dark hardcoded — `background #0D1117`,
  `card-bg #161B22`, `border #30363D`, `accent-blue #58A6FF`, `accent-orange #FF8C42`,
  `accent-green #238636`. `globals.css` hardcodes `body { background:#0D1117; color:#E6EDF3 }` (`:10-11`),
  fixes `color-scheme: dark` (`:6`), and re-inlines the orange in `glow-orange` (`rgba(255,140,66,…)`, `:44`).
  No CSS variables, no theme switching.
- **Same-name-different-color proof:** the Tailwind token `quant.secondary` is `#8b5cf6` (purple) in
  quantchat (`:43`), quantai (`:18`), quanttrinity (`:22`), but `#138808` (India green) in
  **quantmail** (`tailwind.config.ts:22`). One class, two colors.
- **quantube / quantmail / quanttrinity**: reference `var(--brand-primary)` + `var(--surface*)`
  (`quantube/tailwind.config.ts:10-19`, `quantmail:13-18`), and each `globals.css` redefines
  `--brand-primary` to a *different* value (quantube rose `#F43F5E`, quantchat/quantai indigo) — so the
  same variable name means a different thing per app.

### 2.5 The real source of truth (`@quant/brand`)

- `colors.ts` — `primary`/`accent`/`neutral`/`semantic`/`surface` palettes; `primary[500] = #FF8C42` (`:9`).
- `themes.ts` — the 6 `Theme` objects, each 15 semantic slots (`background, foreground, surface,
  surfaceElevated, primary, primaryForeground, accent, accentForeground, border, muted, mutedForeground,
  destructive, destructiveForeground, ring`): `dark:21`, `light:42`, `neon:60`, `bharat:78`,
  `highContrast:96`, `colorblindSafe:114`.
- `apps.ts` — 16 `AppBrandConfig` entries (`id, name, color, hue, description, iconRef`), e.g.
  quantchat `#10B981` (`:21`), quantai `#8B5CF6` (`:30`), quantneon `#EC4899` (`:75`).
- `tokens.ts` — generators: `generateBrandCSS()` → `--brand-*` shaded (`:16`); `generateAppCSS(id)` →
  `--app-color/name/hue` (`:106`); `generateThemeCSS(name)` → unprefixed `:root[data-theme]` (`:119`).
- `index.ts` — exports all of the above (`:51-52`). Package is `@quant/brand`, `type: module`,
  `main: src/index.ts` (raw TS, transpiled by consumers). `@quant/shared-ui` already depends on it
  (`packages/shared-ui/package.json:15`).

### 2.6 Registry mismatch (secondary finding)

`brand/apps.ts` registers 16 apps but the repo has 14 app dirs. `apps.ts` includes
`quantcalendar/quantdocs/quantdrive/quantmeet/quantmaps/quantphotos` (no app dir) and **omits**
`quanttrinity/admin-enterprise/quant-mobile/quant-desktop` (which do exist). The per-app token layer
must be keyed off a reconciled registry, not assume 1:1.

---

## 3. Goals / Non-Goals

**Goals**
1. One source of truth: `@quant/brand` TS tokens → one CSS-variable namespace → one Tailwind preset.
2. A shared Tailwind **preset** every app extends; app configs shrink to `presets: [...]` + app-specific extras.
3. A `--quant-*` CSS-variable pipeline with real **runtime switching across all 6 themes**.
4. Zero raw hex in `shared-ui` and app source — tokens/variables only; per-app accent via tokens.
5. `EcosystemShell` becomes the theming entry point; per-app identity flows through tokens.
6. Enforcement (ESLint) + automation (codemod) so drift cannot silently return.

**Non-Goals**
- No redesign of component APIs or visual identity (the 6 themes' *values* stay as authored).
- No shadcn/Radix adoption — the bespoke component set stays.
- Not deleting `foundation.ts` `--qt-*` (quantrinity masterbrand) in this pass; it is aliased, not removed.

---

## 4. Target Architecture

### 4.1 Canonical decision: `--quant-*` is the one semantic namespace

`--quant-*` wins because it is already the de-facto app standard (namespace #4, referenced across 50+
app files) and the `shared-ui` runtime CSS (`.quant-field`, `.quant-btn-*`) already keys off it
(`quantchat/globals.css:240-291`). Every other namespace is redefined **in terms of** `--quant-*`:

- Primitive scales stay as `--quant-primary-50..950`, `--quant-neutral-*`, `--quant-{error,warning,success,info}-*`
  (renamed from `--brand-*`; old names kept as aliases during migration).
- Semantic theme slots become the 15 `--quant-<slot>` names (from `themes.ts`): `--quant-background`,
  `--quant-foreground`, `--quant-surface`, `--quant-surface-elevated`, `--quant-primary`,
  `--quant-primary-foreground`, `--quant-accent`, `--quant-accent-foreground`, `--quant-border`,
  `--quant-muted`, `--quant-muted-foreground`, `--quant-destructive`, `--quant-destructive-foreground`,
  `--quant-ring`.
- Per-app accent: `--quant-app-color` / `--quant-app-hue` (renamed from `--app-*`), set from `apps[id]`.
- Deprecated → alias (thin `var()` indirection, removed at end of rollout): `--brand-*` (#1/#2),
  `--app-*` (#3), unprefixed `--primary/--background` (#5), `--color-*` (#6), HSL-triplet (#7).
  `--qt-*` (#8) is kept but re-sourced from the same theme object.

### 4.2 Package layout

```
packages/
  brand/                       # unchanged source of truth (colors/typography/motion/themes/apps)
    src/
      tokens.ts                # REWORK: emit --quant-* (primitives + per-app), keep aliases
      theme-css.ts             # NEW: generateThemeCSS -> :root[data-theme] for ALL 6 themes, --quant-*
      preset.ts                # NEW: buildQuantPreset(appId?) -> Tailwind Config preset
    preset.js / preset.d.ts    # NEW export subpath: "@quant/brand/preset"
  shared-ui/
    src/
      themes/tokens.ts         # DELETE parallel --color-* tokens (fold into brand)
      advanced/theme-engine.ts # DEMOTE to dev-only palette tool or delete (not a runtime theme source)
      theme/theme-tokens.ts    # DELETE (nexsas HSL harvest) or quarantine behind a clearly-named export
      hooks/useTheme.ts        # REPLACE internals: delegate to ThemeProvider (one store, 6 themes)
      components/ThemeProvider  # EXTEND: value type = QuantThemeName (6), injects nothing but data-theme
```

### 4.3 Data flow (single path, tokens → pixels)

```
@quant/brand tokens (colors.ts, themes.ts, apps.ts)      <-- ONLY place hex literals live
        │
        ├── buildQuantPreset(appId)  ──►  app tailwind.config.ts { presets:[preset] }
        │        (maps Tailwind color keys to var(--quant-*); static scales inline)
        │
        └── generateGlobalCss(appId) ──►  app globals.css (build step / @quant/brand import)
                 │
                 ├─ :root                       -> --quant-<primitive scales>, --quant-app-*
                 ├─ :root[data-theme="dark"]     -> 15 --quant-<slot> for dark
                 ├─ :root[data-theme="light"]    -> …light
                 ├─ :root[data-theme="neon"]     -> …neon
                 ├─ :root[data-theme="bharat"]   -> …bharat
                 ├─ :root[data-theme="highContrast"]
                 └─ :root[data-theme="colorblindSafe"]
                          │
   ThemeProvider (shell) sets <html data-theme="<one of 6>">  ── runtime switch
                          │
   shared-ui components use Tailwind classes bg-surface / text-foreground / ring-primary
   (which are var(--quant-*))  ── restyle automatically per active theme + per app accent
```

The key inversion: **components stop naming colors.** They name *roles* (`bg-surface`,
`text-foreground`, `bg-primary`, `border-border`, `ring-ring`) that the preset maps to `--quant-*`,
which the active `data-theme` block and the per-app `:root` fill in.

---

## 5. The Preset API

New file `packages/brand/src/preset.ts`, exported at subpath `@quant/brand/preset`
(add `"exports"` map + a compiled `preset.js`/`.d.ts` so a CommonJS `tailwind.config.ts` can `require`
it — Tailwind loads configs outside the app's ESM graph).

```ts
// packages/brand/src/preset.ts
import type { Config } from 'tailwindcss';
import { apps } from './apps';

/** Semantic role tokens — every value is a var(--quant-*), never a literal. */
const semanticColors = {
  background: 'var(--quant-background)',
  foreground: 'var(--quant-foreground)',
  surface: {
    DEFAULT: 'var(--quant-surface)',
    elevated: 'var(--quant-surface-elevated)',
  },
  primary: { DEFAULT: 'var(--quant-primary)', foreground: 'var(--quant-primary-foreground)' },
  accent:  { DEFAULT: 'var(--quant-accent)',  foreground: 'var(--quant-accent-foreground)' },
  muted:   { DEFAULT: 'var(--quant-muted)',   foreground: 'var(--quant-muted-foreground)' },
  destructive: { DEFAULT: 'var(--quant-destructive)', foreground: 'var(--quant-destructive-foreground)' },
  border: 'var(--quant-border)',
  ring:   'var(--quant-ring)',
  app:    'var(--quant-app-color)',       // per-app accent, tokenised (never hardcoded)
};

/** Primitive scales, still var-backed so themes can retune them. */
const scaleColors = {
  brand:   scaleVars('quant-primary'),    // 50..950 -> var(--quant-primary-50)...
  neutral: scaleVars('quant-neutral'),
  success: scaleVars('quant-success'),
  warning: scaleVars('quant-warning'),
  error:   scaleVars('quant-error'),
  info:    scaleVars('quant-info'),
};

export function buildQuantPreset(appId?: string): Config {
  if (appId && !apps[appId]) throw new Error(`buildQuantPreset: unknown app "${appId}"`);
  return {
    darkMode: ['class', '[data-theme="dark"]'],          // one convention for all apps
    theme: {
      extend: {
        colors: { ...semanticColors, ...scaleColors },
        fontFamily: { display: ['var(--quant-font-display)'], body: ['var(--quant-font-body)'], mono: ['var(--quant-font-mono)'] },
        borderRadius: { DEFAULT: 'var(--quant-radius)' },
        transitionTimingFunction: { brand: 'var(--quant-ease-out)' },
        transitionDuration: { brand: 'var(--quant-duration-normal)' },
        minWidth:  { touch: '44px' },                    // fixes Button.tsx:64-67 workaround
        minHeight: { touch: '44px' },
      },
    },
    content: [],                                         // apps supply their own content globs
  } satisfies Config;
}

export default buildQuantPreset();
```

App configs collapse to (example — quantchat):

```ts
import type { Config } from 'tailwindcss';
import { buildQuantPreset } from '@quant/brand/preset';

export default {
  presets: [buildQuantPreset('quantchat')],
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}', '../../packages/shared-ui/src/**/*.{ts,tsx}'],
  // only genuinely app-unique extras (e.g. a bespoke keyframe) remain here
} satisfies Config;
```

This deletes the hand-written `colors` blocks and the inlined `emerald/indigo/amber` scales
(`quantchat/tailwind.config.ts:49-87`) and the GitHub-dark literals (`marketing/tailwind.config.ts:9-22`).

---

## 6. The `--quant-*` CSS-Variable Pipeline

### 6.1 Generators (reworked `packages/brand/src/tokens.ts` + new `theme-css.ts`)

- `generateRootCss(appId)`: emits `:root { … }` with **primitive scales** (`--quant-primary-50..950`,
  `--quant-neutral-*`, semantic scales), typography, motion, radius, **and** the per-app layer
  `--quant-app-color: <apps[appId].color>; --quant-app-hue: <apps[appId].hue>;`. This replaces the
  three hand-maintained `--brand-primary/-hover/-accent/-app-color` lines each app currently copies
  (`quantchat/globals.css:7-12`, `quantai/globals.css:7-12`, `quantube/globals.css:7-12`).
- `generateThemeCss()`: for **each of the 6 themes** emit `:root[data-theme="<name>"] { --quant-<slot>: <value>; }`
  for all 15 slots from `themes.ts`. This is the rewrite of the orphaned `generateThemeCSS`
  (`tokens.ts:119`) — same idea, `--quant-*` names, all 6 not just 1, actually injected.
- Back-compat aliases block (temporary): `--brand-primary: var(--quant-primary); --primary: var(--quant-primary); …`
  so un-migrated files keep working mid-rollout. Removed in the final step.

### 6.2 Injection

Prefer **build-time**: a tiny `@quant/brand` codegen writes `packages/brand/generated/quant-tokens.css`
that each app imports once at the top of `globals.css` (`@import '@quant/brand/quant-tokens.css';`).
This beats today's runtime `<style dangerouslySetInnerHTML>` in the brand-providers
(`quantchat/src/providers/brand-provider.tsx:19`, quantmail, quantedits) which ship CSS in JS and
cause a flash. Those three `BrandProvider`s are deleted once the import lands.

The static CSS file is safe (no user input) and cacheable; the existing "TRUST BOUNDARY" comment
(`brand-provider.tsx:15-18`) is preserved as a note in the generator.

### 6.3 Per-app accent through tokens (not hardcode)

`buildQuantPreset('quantneon')` + `generateRootCss('quantneon')` set `--quant-app-color: #EC4899`
from `apps.ts:78`. quantneon's hardcoded `#a855f7/#ec4899` (`tailwind.config.ts:9-14`) is deleted; the
app references `bg-app`/`text-app`. If the neon *theme* is desired as the app's default look, the app
ships `data-theme="neon"` (see §7) rather than hardcoding — resolving the current three-way
disagreement between `apps.quantneon`, the `neon` theme, and the app config.

---

## 7. Runtime Theme Switching (all 6 themes) + EcosystemShell

### 7.1 One provider, six themes

Extend `ThemeProvider` (`packages/shared-ui/src/components/ThemeProvider/index.tsx`):

```ts
export type QuantThemeName = 'dark' | 'light' | 'neon' | 'bharat' | 'highContrast' | 'colorblindSafe';
export type ThemeSetting = QuantThemeName | 'system';   // 'system' -> dark|light via matchMedia
```

- On change, write `document.documentElement.dataset.theme = resolved` for the full set (today it
  only ever writes `light`/`dark`, `:61`). Keep the `.dark` class toggle for `darkMode: ['class', …]`
  Tailwind compatibility (`:62-66`).
- Single storage key `quant-theme` (`:23`). **Delete** the competing `useTheme` store
  (`hooks/useTheme.ts`, key `quant_theme_mode` `:107`) and re-export a compatibility `useTheme()` that
  delegates to `useThemeMode()` so the ~1 store is authoritative. `ThemeEngine`
  (`advanced/theme-engine.ts`) is demoted to a build-time palette generator (or deleted) — it is not a
  runtime theme source.
- Add a pre-hydration inline script (in each app's root layout `<head>`) that reads
  `localStorage['quant-theme']` and sets `data-theme` before paint, to avoid FOUC.

### 7.2 EcosystemShell integration

`EcosystemShell` (`index.tsx:63-93`) already wraps `ThemeProvider` (`:80`). Widen its `defaultTheme`
prop (`:49`) from `'light'|'dark'|'system'` to `ThemeSetting`, and pass `appName` (already a prop,
`:66`) down so the shell can set the per-app `data-*`/accent. Adopting the shell in each app's root
layout becomes the single place theming is wired — closing the "zero apps mount it" gap (§1.3). A
`<ThemeSwitcher/>` (6 options + system) reads/writes `useThemeMode()`.

---

## 8. De-hardcoding `shared-ui` (tokens/vars only)

Rewrite each primitive to name roles. Button (`Button.tsx:41-55`) becomes:

```ts
const baseStyles =
  'inline-flex items-center justify-center font-medium rounded-lg transition-colors duration-150 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ' +
  'focus-visible:ring-offset-1 focus-visible:ring-offset-background active:scale-[0.98] select-none';

const variantStyles = {
  primary:   'bg-primary text-primary-foreground font-semibold hover:brightness-110 active:brightness-95 shadow-sm',
  secondary: 'bg-surface text-foreground border border-border hover:bg-surface-elevated active:brightness-95',
  ghost:     'bg-transparent text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06]',
  danger:    'bg-destructive/15 text-destructive border border-destructive/40 hover:bg-destructive/25',
  success:   'bg-success-500/15 text-success-400 border border-success-500/40 hover:bg-success-500/25',
};
```

Every arbitrary `#hex` is replaced by a preset role (`bg-primary`, `text-foreground`, `border-border`,
`ring-ring`, `bg-surface`, `text-muted-foreground`, `bg-destructive`). The same mechanical mapping
applies to `Badge.tsx:29-49`, `Card.tsx:33-61`, `Input.tsx:94-98`, `Toast.tsx`, `Modal.tsx`,
`Shell/*`, `bento/*`, etc. A canonical **hex→role lookup** (derived from `themes.ts` dark values,
since the inlined palette *is* the dark theme) drives the codemod:

| Literal | Role class | Source |
|---|---|---|
| `#FF8C42` | `primary` / `bg-primary` | `themes.dark.primary` (`themes.ts:27`) |
| `#090A0C` | `background` | `themes.dark.background` (`:23`) |
| `#111318` | `surface` | `themes.dark.surface` (`:25`) |
| `#16181D` | `surface-elevated` / `muted` | `themes.dark.surfaceElevated` (`:26`) |
| `#282C35` | `border` | `themes.dark.border` (`:31`) |
| `#F5F5F5` | `foreground` | `themes.dark.foreground` (`:24`) |
| `#A1A4AC` | `muted-foreground` | `themes.dark.mutedForeground` (`:33`) |
| `#EF4444`/`#DC2626` | `destructive` | `themes.dark.destructive` (`:37`) |
| `#4ADE80`/`#22C55E` | `success-400/500` | `semantic.success` (`colors.ts:72-84`) |

Charts/illustrations that legitimately need many discrete colors (`advanced/charts-engine.ts`,
`EmptyStateIllustration`) get a small **exported categorical palette** in `@quant/brand`
(`chartPalette: string[]`) and reference it via JS import, not inline hex — keeping them lint-clean.

`shared-ui/themes/tokens.ts` (`--color-*`) and `theme/theme-tokens.ts` (HSL harvest) are deleted; any
importer is repointed at `@quant/brand`.

---

## 9. Migration Path

### 9.1 Codemod (`scripts/codemods/hex-to-token.ts`, jscodeshift + a CSS pass)

1. **TSX/arbitrary values:** regex/AST scan for Tailwind arbitrary color values
   `-\[#([0-9a-fA-F]{3,8})\]` (matches `bg-[#FF8C42]`, `text-[#F5F5F5]`, `ring-[#FF8C42]/50`,
   `ring-offset-[#090A0C]`). Look up the hex in the mapping table (§8), replace with the role utility,
   preserving opacity suffix (`/50`) and prefix (`hover:`, `focus-visible:`). Case-insensitive; also
   normalise 3-digit hex.
2. **Unknown hex** (not in the table) → **do not auto-replace**; emit a report line + insert a
   `// eslint-disable-next-line quant/no-raw-hex -- TODO(token): <hex>` so the build stays green and a
   human triages it. This keeps the codemod safe on the ~445-line surface.
3. **CSS/globals pass:** replace hand-written `--brand-primary`/`--quant-*` literal declarations with
   `@import '@quant/brand/quant-tokens.css';`, leaving only truly app-local vars.
4. Run per-package; commit per-app so each diff is reviewable and `turbo run typecheck lint test` gates it.
5. Dry-run mode prints a per-file before/after and a residual-unknown-hex count.

### 9.2 ESLint rule `quant/no-raw-hex` (flat config, root `eslint.config.mjs`)

A custom rule (local plugin) forbidding raw hex in `className` strings, template literals, and JSX
color props, plus CSS via `stylelint`'s `color-no-hex` for `*.css`:

```js
// eslint.config.mjs (flat config already present at repo root)
{
  files: ['packages/shared-ui/src/**/*.{ts,tsx}', 'apps/**/src/**/*.{ts,tsx}', 'apps/**/app/**/*.{ts,tsx}'],
  plugins: { quant: quantPlugin },
  rules: {
    'quant/no-raw-hex': ['error', {
      // allow inside the ONE source of truth + generated files + charts palette
      allow: [/packages\/brand\/src\/(colors|themes|apps|foundation|motion|typography)\.ts$/],
    }],
  },
}
```

- **Scope now:** `error` in `shared-ui/src` + migrated apps; `warn` (ratchet) in not-yet-migrated apps
  so CI never goes red mid-rollout, flipped to `error` per app as it lands.
- The rule flags `#rgb/#rrggbb/#rrggbbaa` in JSX/TS strings and CSS; whitelists `@quant/brand` token
  files (the only legal home for literals) and `rgba(255,255,255,x)` overlay utilities if desired.
- Add `stylelint` with `color-no-hex` for `globals.css`/`*.css` to catch the CSS side the ESLint rule
  cannot see.

### 9.3 Ordered rollout across the ~14 apps (staging stays green)

Foundational steps ship the preset + tokens *with back-compat aliases* so nothing breaks before apps
migrate. Each app is a separate PR gated on `turbo run build typecheck lint test` + visual-regression.

| Wave | Work | Green-keeping guarantee |
|---|---|---|
| **0** | Add `@quant/brand/preset`, `generateRootCss`/`generateThemeCss` (`--quant-*`), **alias block** for `--brand-*`/`--primary`/`--color-*`. Add ESLint rule as `warn` everywhere. `stylelint` added. | Aliases mean existing hardcoded vars still resolve; rule is non-blocking. No behavior change. |
| **1** | Migrate `shared-ui` primitives to role classes (Button, Badge, Card, Input, Toast, Modal, Shell/*, bento/*). Delete `themes/tokens.ts`, `theme/theme-tokens.ts`; demote `theme-engine.ts`. Flip `quant/no-raw-hex` to `error` for `shared-ui/src`. | shared-ui compiled by every app; roles resolve via aliases even in un-migrated apps' vars. Visual-regression on a Storybook/host confirms parity. |
| **2** | Extend `ThemeProvider` to 6 themes + single store; wire pre-hydration script; add `<ThemeSwitcher/>`. | Additive; default remains `system`→dark/light, so current look is unchanged until a user picks a new theme. |
| **3** | Pilot apps **quantchat, quantai** (highest drift): replace config with `presets:[buildQuantPreset(id)]`, `globals.css` → `@import` tokens, delete `BrandProvider`. Flip rule to `error` for these apps. | Two-app blast radius; visual-regression diff reviewed before merge. |
| **4** | Remaining Next apps in dependency order: `quantube, quantmax, quantmail, quantedits, quantads, quanttrinity, quantsync, marketing, admin-enterprise`. One PR each; flip rule to `error` per app on merge. `marketing` (GitHub-dark) maps to `data-theme="dark"` + its own accent token. | Per-app isolation; a failing app blocks only its own PR. |
| **5** | `quant-mobile`, `quant-desktop` (RN/Electron — no Tailwind config): consume `@quant/brand` tokens directly via a JS theme object exported from brand. | Separate toolchain; not gated on the web preset. |
| **6** | Remove the alias block; reconcile `apps.ts` registry (§2.6); delete dead generators; `quant/no-raw-hex` = `error` repo-wide; CI blocks new hex. | Only after all consumers migrated — verified by a repo-wide `rg` returning 0 outside brand token files. |

Rollback: each wave is a revertable PR; the alias block (Waves 0–5) means reverting one app never
breaks others.

---

## 10. Testing

- **Unit (brand):** extend `packages/brand/src/__tests__/brand.test.ts`. Assert `buildQuantPreset(id)`
  produces `var(--quant-*)` for every semantic key and throws on unknown app (mirrors the existing
  `generateThemeCSS('unknown')` throw test at `brand.test.ts:367`). Assert `generateThemeCss()` emits a
  block for **all 6** theme names with all 15 slots.
- **Contrast/a11y:** reuse `packages/brand/src/contrast.ts` (`contrastRatio`, `meetsAA`, `meetsAAA`) to
  assert every theme's `foreground`/`background` and `primary`/`primaryForeground` pair meets AA
  (the `dark.destructive` comment at `themes.ts:34-36` shows this discipline already exists). Fail CI
  on regressions. `highContrast`/`colorblindSafe` assert AAA where intended.
- **Visual regression:** stand up a Storybook (or a `shared-ui` gallery route) rendering every
  primitive × 6 themes × a couple of app accents; snapshot with Playwright + `toHaveScreenshot` (or
  Chromatic). This is the safety net for Waves 1/3/4 — a role-mapping mistake shows as a pixel diff.
  Gate each app PR on a small per-app "smoke page" screenshot in light+dark+one exotic theme.
- **Lint gates:** `quant/no-raw-hex` (JS/TSX) + `stylelint color-no-hex` (CSS) run in `turbo lint`.
- **Guard test:** a repo-level test that greps `apps/*/tailwind.config.ts` for a `presets:` entry and
  fails if an app defines a `colors` block without the preset (prevents drift reintroduction).

---

## 11. Effort Estimate

Assumes one engineer familiar with the monorepo; ranges account for review + visual-regression triage.

| Wave | Work | Estimate |
|---|---|---|
| 0 | Preset + `--quant-*` generators + alias block + ESLint/stylelint scaffolding | 3–4 d |
| 1 | Codemod build + de-hardcode `shared-ui` (54 files, ~445 lines) + role mapping + VR baseline | 5–8 d |
| 2 | `ThemeProvider` 6-theme rework + single store + pre-hydration + `<ThemeSwitcher/>` | 2–3 d |
| 3 | Pilot quantchat + quantai (config + globals + delete BrandProvider) | 2–3 d |
| 4 | 9 remaining web apps (~0.5–1 d each incl. VR review) | 6–9 d |
| 5 | quant-mobile + quant-desktop token bridge | 2–3 d |
| 6 | Remove aliases, registry reconcile, repo-wide `error`, dead-code deletion | 2–3 d |
| — | Storybook/VR harness setup (parallelisable, front-loaded) | 3–4 d |

**Total ≈ 5–7 engineer-weeks** (~25–37 working days), front-loaded on Waves 0–1 (the preset and the
`shared-ui` de-hardcode are the real work; per-app waves are largely mechanical once the codemod exists).

---

## 12. Risks, Assumptions, Open Questions

**Risks**
- **Unknown-hex tail:** many of the 445 lines are one-off decorative colors (gradients, charts, glows
  e.g. `marketing/globals.css:44`) with no clean role. Mitigation: codemod leaves them behind a lint
  disable + report; triage into `chartPalette`/decorative tokens rather than forcing a semantic role.
- **Tailwind config module system:** configs are `.ts` loaded by Tailwind's own loader; the preset
  subpath must resolve without the app's ESM/tsconfig. Mitigation: ship a compiled `preset.js` + types
  and an `exports` map on `@quant/brand`.
- **Opacity modifiers on vars:** `bg-primary/15` requires the color to be a channel-triplet, not a hex,
  for Tailwind's `/alpha` to work cleanly. Mitigation: store `--quant-*` semantic colors as `R G B`
  triplets and reference via `rgb(var(--quant-primary) / <alpha-value>)` in the preset (the
  `theme-tokens.ts:31` HSL-triplet harvest shows the pattern is already understood).
- **FOUC** when switching to `[data-theme]`: mitigated by the pre-hydration inline script (§7.1).

**Assumptions (stated, not verified with the user)**
- The *values* in `themes.ts`/`apps.ts` are authoritative and correct; this spec unifies plumbing, not
  palette design. Where app config and brand disagree (quantneon), brand wins.
- Visual-regression tooling (Storybook/Playwright/Chromatic) may be introduced; none exists today in
  the paths inspected.
- `quant-mobile`/`quant-desktop` are non-Tailwind (RN/Electron) — inferred from the absence of a
  `tailwind.config.*`; a token-object bridge is proposed rather than the preset.
- The three `BrandProvider`s (quantchat/quantmail/quantedits) are the only runtime CSS injectors of
  brand tokens; other apps rely purely on their hand-written `globals.css`.

**Open questions**
- Should `--qt-*` (foundation/quantrinity) fold fully into `--quant-*`, or stay a distinct
  "endorsed product" layer? (Proposed: keep, re-sourced from the same theme objects.)
- Is `oled` (a 4th mode in `theme-tokens.ts:1`) a wanted 7th theme, or harvest cruft to drop?
- Per-app *default theme*: does quantneon default to `data-theme="neon"`, or dark with a pink accent?

---

## 13. Appendix — `shared-ui` raw-hex offender inventory

54 files contain 6-digit hex (445 matching lines). Grouped by disposition:

- **Parallel token sources to delete/fold into `@quant/brand`:** `advanced/theme-engine.ts` (41),
  `themes/tokens.ts` (31), `themes/neon.ts` (12), `themes/light.ts` (12), `themes/dark.ts` (12),
  `theme/theme-tokens.ts` (HSL), `interconnection/constants.ts` (10).
- **Components to codemod to roles:** `Shell/NotificationPanel.tsx` (22), `Shell/SettingsPanel.tsx`
  (19), `CommandPaletteUI/index.tsx` (18), `Shell/UniversalSearch.tsx` (17), `Shell/ActivityFeed.tsx`
  (13), `Auth/LoginPage.tsx` (13), `Badge.tsx` (12), `Toast.tsx` (11), `Shell/CrossAppRelations.tsx`
  (11), `Input.tsx` (10), `bento/TestimonialShowcase.tsx` (14), `bento/PricingPlanTable.tsx` (11),
  `bento/FaqAccordion.tsx` (10), `bento/BentoFeatureGrid.tsx` (6), `QuantSidekick/BubbleAvatar.tsx`
  (10), `Onboarding/FullOnboardingWizard.tsx` (7), `Avatar.tsx` (7), `Card.tsx` (6), `Button.tsx` (6),
  `Auth/ConsentScreen.tsx` (6), `Modal.tsx` (5), `EmptyStateIllustration/index.tsx` (5), `Dialog.tsx`
  (4), `Form/*` (~9 combined), `Media/*`, `Skeleton.tsx`, `Motion/*`, `resilience/*`, `quant-live/*`,
  and ~15 more at 1–3 lines each.
- **Chart/illustration hex → move to exported `chartPalette`:** `advanced/charts-engine.ts` (11),
  `advanced/skeleton-loader.ts` (3), `advanced/map-engine.ts` (1), `EmptyStateIllustration`.

App-side offenders confirmed by citation: `quantneon/tailwind.config.ts:9-14`,
`marketing/tailwind.config.ts:9-22` + `marketing/globals.css:10-44`, `quantchat/tailwind.config.ts:43-87`,
`quantchat/globals.css:7-53`, `quantai/globals.css:7-31`, `quantube/globals.css:7-31`,
`quantmail/tailwind.config.ts:22`, and the shared `.quant-btn-primary` `#ff9933` fallback
(`quantchat/globals.css:273`, `quantai/globals.css:177`).

---

*End of spec. No code was modified; no other files were created.*
