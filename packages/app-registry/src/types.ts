/** Canonical catalog types for the Quant app registry. */

/** Product grouping used by launchers, marketing filters, and admin. */
export type AppCategory = 'core' | 'social' | 'infra';

/** Release maturity of a product's surfaces. */
export type AppMaturity = 'ga' | 'beta' | 'alpha';

/** A platform surface a product can expose. */
export type PlatformSurface =
  | 'web'
  | 'backend'
  | 'desktop'
  | 'mobile'
  | 'marketing'
  | 'admin';

/** Whether a catalog entry is a shippable product or an ecosystem hub. */
export type AppKind = 'product' | 'hub';

/**
 * Registry-owned catalog identity for one Quant app.
 *
 * Visual identity (`color`/`hue`/`iconRef`) is intentionally ABSENT here — it
 * is derived from `@quant/brand` at read time (see {@link ResolvedQuantApp}),
 * so the design system stays the single source of truth for colour and icons.
 */
export interface QuantAppEntry {
  /** Canonical, post-rename id. Matches the `apps/<id>` folder and `@quant/<id>` package. */
  id: string;
  /** Canonical display name (post-rename; may differ from the legacy brand name). */
  name: string;
  /** Canonical path segment when composed into a shell/hub (leading slash). */
  route: string;
  category: AppCategory;
  maturity: AppMaturity;
  kind: AppKind;
  /** Platform surfaces that exist today. */
  surfaces: PlatformSurface[];
  /** Explicit dev-server port, only where the app declares one (else undefined ⇒ default 3000). */
  devPort?: number;
}

/** A {@link QuantAppEntry} merged with brand-derived visual identity. */
export interface ResolvedQuantApp extends QuantAppEntry {
  /** `#RRGGBB`, resolved from `@quant/brand`. */
  color: string;
  /** Hue 0-360, resolved from `@quant/brand`. */
  hue: number;
  /** Brand icon asset id, resolved from `@quant/brand` (may be a legacy id via alias). */
  iconRef: string;
}
