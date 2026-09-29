import { PRODUCT_APPS, resolveApp } from './registry';
import type { AppCategory, QuantAppEntry, ResolvedQuantApp } from './types';

/** Look up a single product by canonical id. */
export function getApp(id: string): QuantAppEntry | undefined {
  return PRODUCT_APPS.find((a) => a.id === id);
}

/** All products, in catalog order (a fresh array — safe to mutate). */
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
