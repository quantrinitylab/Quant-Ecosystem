/**
 * QM-UIUX-005 — canonical type scale for QuantMail web (apps/quantmail).
 *
 * P0 accessibility rule: **no rendered text may be smaller than 10px**
 * (WCAG readability floor). All sub-10px instances were bumped to the
 * nearest scale step >= 10px.
 *
 * Single source of truth for the scale:
 * - TS consumers: `QUANTMAIL_TYPE_SCALE` / `QUANTMAIL_TYPE_MIN_PX`
 * - CSS consumers: `--q-type-*` custom properties (declared in
 *   `src/app/globals.css` `:root`)
 * - Tailwind arbitrary-value consumers: `text-[var(--q-type-xs)]` etc.
 */
export const QUANTMAIL_TYPE_SCALE = Object.freeze({
  /** 10px — captions, badges, kbd hints, micro-labels (the floor) */
  xs: 10,
  /** 12px — secondary labels, metadata, timestamps */
  sm: 12,
  /** 14px — secondary body, list meta */
  md: 14,
  /** 16px — primary body */
  lg: 16,
  /** 20px — headings / display */
  xl: 20,
} as const);

export type QuantMailTypeStep = keyof typeof QUANTMAIL_TYPE_SCALE;

/** WCAG readability floor for rendered text in QuantMail web. */
export const QUANTMAIL_TYPE_MIN_PX = 10 as const;

/** px value for a scale step (e.g. `typePx('xs')` -> 10). */
export function quantMailTypePx(step: QuantMailTypeStep): number {
  return QUANTMAIL_TYPE_SCALE[step];
}

/** CSS var reference for a scale step (e.g. `var(--q-type-xs)`). */
export function quantMailTypeVar(step: QuantMailTypeStep): string {
  return `var(--q-type-${step})`;
}
