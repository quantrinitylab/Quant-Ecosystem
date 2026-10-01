import { resolveAppConfig } from '@quant/brand';
import type { QuantAppEntry, ResolvedQuantApp } from './types';

/**
 * The canonical Quant product catalog — the single source of truth that
 * replaces the drifted desktop / mobile / marketing lists.
 *
 * `id` is the post-rename canonical id (matches `apps/<id>` and `@quant/<id>`).
 * `name` / `route` / `category` / `maturity` are registry-owned. Visual
 * identity (`color` / `hue` / `iconRef`) is NOT stored here — call
 * {@link resolveApp} to merge it from `@quant/brand` (renamed ids resolve
 * through brand's alias map: quantgram→quantneon, quantwave→quantsync,
 * quantcooks→quantedits).
 */
const CATALOG: QuantAppEntry[] = [
  {
    id: 'quantmail',
    name: 'QuantMail',
    route: '/mail',
    category: 'core',
    maturity: 'ga',
    kind: 'product',
    // Pilot for the per-app restructure: QuantMail owns its OWN role-gated
    // `/admin` route segment (apps/quantmail/src/app/admin) and its OWN public
    // `/marketing` landing (apps/quantmail/src/app/marketing) instead of routing
    // staff to a shared admin-enterprise shell or its story to the horizontal
    // marketing shell. Declaring these here is what lets ecosystem aggregators
    // (enterprise-admin, marketing-home) discover this app's surfaces via
    // {@link withSurface}.
    surfaces: ['web', 'backend', 'admin', 'marketing'],
  },
  {
    id: 'quantchat',
    name: 'QuantChat',
    route: '/chat',
    category: 'core',
    maturity: 'beta',
    kind: 'product',
    surfaces: ['web', 'backend'],
  },
  {
    id: 'quantai',
    name: 'QuantAI',
    route: '/ai',
    category: 'core',
    maturity: 'beta',
    kind: 'product',
    surfaces: ['web', 'backend'],
  },
  {
    id: 'quantmax',
    name: 'QuantMax',
    route: '/max',
    category: 'core',
    maturity: 'alpha',
    kind: 'product',
    surfaces: ['web', 'backend'],
  },
  {
    id: 'quantgram',
    name: 'QuantGram',
    route: '/gram',
    category: 'social',
    maturity: 'alpha',
    kind: 'product',
    surfaces: ['web', 'backend'],
  },
  {
    id: 'quantwave',
    name: 'QuantWave',
    route: '/wave',
    category: 'social',
    maturity: 'alpha',
    kind: 'product',
    surfaces: ['web', 'backend'],
    devPort: 3003,
  },
  {
    id: 'quantcooks',
    name: 'QuantCooks',
    route: '/cooks',
    category: 'social',
    maturity: 'alpha',
    kind: 'product',
    surfaces: ['web', 'backend'],
  },
  {
    id: 'quantube',
    name: 'QuanTube',
    route: '/tube',
    category: 'social',
    maturity: 'beta',
    kind: 'product',
    surfaces: ['web', 'backend'],
    devPort: 3005,
  },
  {
    id: 'quantads',
    name: 'QuantAds',
    route: '/ads',
    category: 'infra',
    maturity: 'alpha',
    kind: 'product',
    surfaces: ['web', 'backend'],
    devPort: 3004,
  },
];

// Deep-freeze the catalog: every entry AND its `surfaces` array. The registry
// is the single source of truth, so the query helpers can hand out entries by
// reference without any consumer being able to corrupt shared state.
for (const entry of CATALOG) {
  Object.freeze(entry.surfaces);
  Object.freeze(entry);
}

/**
 * The canonical Quant product catalog — the deep-frozen single source of truth
 * that replaces the drifted desktop / mobile / marketing lists. Entries are
 * immutable at runtime and typed `readonly`; consumers read, never mutate.
 */
export const PRODUCT_APPS: readonly QuantAppEntry[] = Object.freeze(CATALOG);

/**
 * Merge a registry entry (or its id) with brand-derived visual identity.
 * Throws if the id is not a known product.
 */
export function resolveApp(entryOrId: QuantAppEntry | string): ResolvedQuantApp {
  const entry =
    typeof entryOrId === 'string'
      ? PRODUCT_APPS.find((a) => a.id === entryOrId)
      : entryOrId;
  if (!entry) {
    throw new Error(`Unknown app: ${String(entryOrId)}`);
  }
  const brand = resolveAppConfig(entry.id);
  return { ...entry, color: brand.color, hue: brand.hue, iconRef: brand.iconRef };
}
