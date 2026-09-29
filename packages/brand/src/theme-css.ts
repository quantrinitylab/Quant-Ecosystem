/**
 * `--quant-*` CSS-variable pipeline (design-system token unification, Wave 0).
 *
 * Emits the ONE canonical semantic namespace (`--quant-*`) from the
 * @quant/brand source of truth. Every color variable holds a raw
 * space-separated "R G B" channel triplet (e.g. `--quant-primary: 255 140 66;`)
 * — never a `#hex` or `rgb()` string — so the Tailwind preset can wrap them as
 * `rgb(var(--quant-*) / <alpha-value>)` and opacity utilities (`bg-primary/50`)
 * compose. A raw hex would make the `/alpha` modifier a silent no-op.
 *
 * See docs/superpowers/specs/2026-09-28-design-system-token-unification.md §6.
 */

import { primary, neutral, semantic } from './colors';
import { fontFamily } from './typography';
import { easing, duration } from './motion';
import { apps, type AppBrandConfig } from './apps';
import { themes, type Theme } from './themes';
import { hexToRgb } from './contrast';

/**
 * The three physically-renamed apps are still keyed under their legacy ids in
 * apps.ts (the full §2.6 registry reconciliation is deferred to Wave 6).
 * Resolving additively here lets `buildQuantPreset('quantgram')` and
 * `generateRootCss('quantgram')` work today, without a destructive rename that
 * could break importers we haven't migrated yet.
 */
export const APP_ALIASES: Record<string, string> = {
  quantgram: 'quantneon',
  quantwave: 'quantsync',
  quantcooks: 'quantedits',
};

/** Resolve an app id (new or legacy) to its brand config; throws on unknown. */
export function resolveAppConfig(appId: string): AppBrandConfig {
  const canonical = APP_ALIASES[appId] ?? appId;
  const app = apps[canonical];
  if (!app) {
    throw new Error(`Unknown app: ${appId}`);
  }
  return app;
}

/** Convert `#RRGGBB` to a space-separated "R G B" channel triplet. */
export function hexToTriplet(hex: string): string {
  return hexToRgb(hex).join(' ');
}

/** The 14 semantic color slots every theme carries (Theme minus `name`). */
const COLOR_SLOTS: Exclude<keyof Theme, 'name'>[] = [
  'background',
  'foreground',
  'surface',
  'surfaceElevated',
  'primary',
  'primaryForeground',
  'accent',
  'accentForeground',
  'border',
  'muted',
  'mutedForeground',
  'destructive',
  'destructiveForeground',
  'ring',
];

/** camelCase Theme slot → kebab-case CSS-variable suffix. */
function slotToVar(slot: string): string {
  return slot.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/** Emit `--<prefix>-<shade>: R G B;` lines for a primitive color scale. */
function scaleTriplets(prefix: string, shades: Record<string, string>): string {
  return Object.entries(shades)
    .map(([shade, hex]) => `  --${prefix}-${shade}: ${hexToTriplet(hex)};`)
    .join('\n');
}

/**
 * `:root` block: theme-independent primitive scales (as triplets), the per-app
 * accent, typography, motion and radius tokens. `appId` may be a new or legacy
 * registry key; unknown ids throw.
 */
export function generateRootCss(appId?: string): string {
  const app = appId !== undefined ? resolveAppConfig(appId) : undefined;
  const appLayer = app
    ? `\n\n  /* Per-app accent (tokenised — never hardcoded) */\n` +
      `  --quant-app-color: ${hexToTriplet(app.color)};\n` +
      `  --quant-app-hue: ${app.hue};`
    : '';
  return `:root {
  /* Primitive scales — theme-independent, "R G B" channel triplets */
${scaleTriplets('quant-primary', primary)}
${scaleTriplets('quant-neutral', neutral)}
${scaleTriplets('quant-success', semantic.success)}
${scaleTriplets('quant-warning', semantic.warning)}
${scaleTriplets('quant-error', semantic.error)}
${scaleTriplets('quant-info', semantic.info)}

  /* Typography */
  --quant-font-display: ${fontFamily.display};
  --quant-font-body: ${fontFamily.body};
  --quant-font-mono: ${fontFamily.mono};

  /* Motion */
  --quant-ease-out: ${easing.easeOut};
  --quant-duration-normal: ${duration.normal}ms;

  /* Radius — sensible default until @quant/brand adds a radius token */
  --quant-radius: 0.5rem;${appLayer}
}`;
}

/**
 * One `:root[data-theme="<name>"]` block per curated theme (all 6), each with
 * the 14 semantic `--quant-<slot>` colors as "R G B" triplets. This is the
 * `--quant-*` rewrite of the orphaned `generateThemeCSS` in tokens.ts: canonical
 * names, all six themes, triplet form, and actually injectable at runtime.
 */
export function generateThemeCss(): string {
  return Object.values(themes)
    .map((theme) => {
      const decls = COLOR_SLOTS.map(
        (slot) => `  --quant-${slotToVar(slot)}: ${hexToTriplet(theme[slot])};`,
      ).join('\n');
      return `:root[data-theme="${theme.name}"] {\n${decls}\n}`;
    })
    .join('\n\n');
}

/**
 * Back-compat alias block (spec §6.1): legacy var names → canonical --quant-*,
 * re-wrapped as rgb(var(...)) because --quant-* are raw "R G B" triplets and
 * legacy consumers use these as full colors (a bare alias emits invalid CSS).
 * Inert until an app imports it; removed in Wave 6.
 *
 * NOT aliased (no canonical target exists): the `--brand-primary-hover` /
 * `--brand-accent-hover` pair and the deprecated `--brand-accent-<shade>` scale.
 * Hover was dropped as a token — there is no `--quant-*-hover`. CONSEQUENCE: a
 * migrating app that deletes its hand-maintained `--brand-*-hover` lines (spec
 * §6.1) loses hover colors with no fallback here. Per-app rollout PRs must
 * handle hover deliberately — recompute it from the primary/accent role (a
 * lightness shift / `color-mix`) rather than expecting an alias from this block.
 */
const SCALE_ALIASES: { brand: string; quant: string; shades: Record<string, string> }[] = [
  { brand: 'brand-primary', quant: 'quant-primary', shades: primary },
  { brand: 'brand-neutral', quant: 'quant-neutral', shades: neutral },
  { brand: 'brand-success', quant: 'quant-success', shades: semantic.success },
  { brand: 'brand-warning', quant: 'quant-warning', shades: semantic.warning },
  { brand: 'brand-error', quant: 'quant-error', shades: semantic.error },
  { brand: 'brand-info', quant: 'quant-info', shades: semantic.info },
];

export function generateAliasCss(appId?: string): string {
  const scales = SCALE_ALIASES.map(({ brand, quant, shades }) =>
    Object.keys(shades)
      .map((shade) => `  --${brand}-${shade}: rgb(var(--${quant}-${shade}));`)
      .join('\n'),
  ).join('\n');
  const shadcn = COLOR_SLOTS.map(
    (slot) => `  --${slotToVar(slot)}: rgb(var(--quant-${slotToVar(slot)}));`,
  ).join('\n');
  // App-layer aliases only when an app id is in play: --quant-app-color and
  // --quant-app-hue exist solely in generateRootCss(appId)'s output, so emitting
  // these in base (no-id) mode would resolve to unset (invalid) values. --app-hue
  // is a scalar hue, aliased bare — NOT rgb()-wrapped, since it is not a color.
  const appLayer =
    appId !== undefined
      ? `\n  --brand-app-color: rgb(var(--quant-app-color));\n` +
        `  --app-color: rgb(var(--quant-app-color));\n` +
        `  --app-hue: var(--quant-app-hue);`
      : '';
  return `:root {
  /* Legacy shaded --brand-* primitive scales → canonical --quant-* */
${scales}

  /* Unprefixed shadcn semantics + unshaded --brand-* (+ app layer when id given) */
${shadcn}
  --brand-primary: rgb(var(--quant-primary));
  --brand-accent: rgb(var(--quant-accent));${appLayer}
}`;
}

/**
 * The full `@quant/brand` stylesheet as one string, in cascade order: `:root`
 * primitives (+ per-app accent), all 6 theme blocks, then the back-compat alias
 * block. Exactly what build-time codegen writes to `generated/quant-tokens.css`
 * (spec §6.2); apps `@import` that file or inject this string. `appId` (new or
 * legacy) adds the per-app accent; unknown ids throw.
 */
export function generateTokensCssDocument(appId?: string): string {
  return [generateRootCss(appId), generateThemeCss(), generateAliasCss(appId)].join('\n\n');
}

/**
 * Provenance header prepended to the committed `generated/quant-tokens.css`.
 * Lives here (not in the codegen script) so the file's exact bytes have ONE
 * source of truth the drift guard can assert against.
 */
export const QUANT_TOKENS_CSS_HEADER = `/* AUTO-GENERATED by @quant/brand \`generate:tokens\` — DO NOT EDIT.
   Edit the source tokens (colors / themes / typography / motion) and regenerate.
   Built from static tokens only (no user input): safe to import and cacheable. */`;

/**
 * The byte-exact contents of the committed base (appless)
 * `generated/quant-tokens.css`: provenance header + the canonical token document
 * + a trailing newline. `scripts/generate-tokens-css.ts` writes exactly this, and
 * the drift guard asserts the committed file equals it — so the codegen entrypoint
 * and the artifact can never silently diverge (this is the tested code path; the
 * script itself is only a thin `writeFileSync` wrapper around this function).
 */
export function generateTokensCssFile(): string {
  return `${QUANT_TOKENS_CSS_HEADER}\n\n${generateTokensCssDocument()}\n`;
}
