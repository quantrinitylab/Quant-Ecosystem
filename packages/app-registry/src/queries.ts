import { PRODUCT_APPS, resolveApp } from './registry';
import type { AppCategory, PlatformSurface, QuantAppEntry, ResolvedQuantApp } from './types';

/** Look up a single product by canonical id. */
export function getApp(id: string): QuantAppEntry | undefined {
  return PRODUCT_APPS.find((a) => a.id === id);
}

/**
 * All products, in catalog order. The returned outer array is fresh — reorder,
 * slice, or filter it freely. The entries themselves are the catalog's own
 * deep-frozen objects (shared by reference), so they cannot be mutated.
 */
export function allApps(): QuantAppEntry[] {
  return [...PRODUCT_APPS];
}

/** Products in a given category. */
export function byCategory(category: AppCategory): QuantAppEntry[] {
  return PRODUCT_APPS.filter((a) => a.category === category);
}

/** Case-insensitive search over id + name + route. Blank query ⇒ no matches. */
export function searchApps(query: string): QuantAppEntry[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  return PRODUCT_APPS.filter(
    (a) =>
      a.id.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      a.route.toLowerCase().includes(q),
  );
}

/** All products with brand-derived visual identity merged in. */
export function resolveAllApps(): ResolvedQuantApp[] {
  return PRODUCT_APPS.map((a) => resolveApp(a));
}

/**
 * Products that expose a given platform surface, in catalog order. This is how
 * a thin ecosystem hub discovers per-app slices to compose — e.g. the
 * enterprise-admin hub lists `withSurface('admin')` and the marketing-home hub
 * lists `withSurface('marketing')` — instead of hard-coding an app list that
 * drifts (the exact rot this registry replaced).
 */
export function withSurface(surface: PlatformSurface): QuantAppEntry[] {
  return PRODUCT_APPS.filter((a) => a.surfaces.includes(surface));
}
