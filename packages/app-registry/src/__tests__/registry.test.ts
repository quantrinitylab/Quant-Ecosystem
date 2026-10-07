import { describe, it, expect } from 'vitest';
import { resolveAppConfig } from '@quant/brand';
import { PRODUCT_APPS, resolveApp } from '../registry';

const CANONICAL_IDS = [
  'quantmail',
  'quantchat',
  'quantai',
  'quantmax',
  'quantgram',
  'quantwave',
  'quantcooks',
  'quantube',
  'quantads',
];

/** Pre-rename ids that must stay brand-internal, never product ids. */
const LEGACY_IDS = ['quantneon', 'quantsync', 'quantedits'];

describe('PRODUCT_APPS catalog', () => {
  it('lists exactly the 9 canonical products', () => {
    expect(PRODUCT_APPS).toHaveLength(9);
    expect(PRODUCT_APPS.map((a) => a.id).sort()).toEqual([...CANONICAL_IDS].sort());
  });

  it('never exposes a legacy (pre-rename) id as a product id', () => {
    for (const legacy of LEGACY_IDS) {
      expect(PRODUCT_APPS.some((a) => a.id === legacy)).toBe(false);
    }
  });

  it('uses canonical display names, not the legacy brand names', () => {
    const byId = Object.fromEntries(PRODUCT_APPS.map((a) => [a.id, a.name]));
    expect(byId.quantgram).toBe('QuantGram');
    expect(byId.quantwave).toBe('QuantWave');
    expect(byId.quantcooks).toBe('QuantCooks');
    // brand still stores the pre-rename display name for the same id:
    expect(resolveAppConfig('quantgram').name).toBe('QuantNeon');
  });

  it('has unique, slash-prefixed routes', () => {
    const routes = PRODUCT_APPS.map((a) => a.route);
    expect(new Set(routes).size).toBe(routes.length);
    for (const r of routes) expect(r.startsWith('/')).toBe(true);
  });

  it('has no duplicate explicit dev ports (guards the historical port collisions)', () => {
    const ports = PRODUCT_APPS.map((a) => a.devPort).filter(
      (p): p is number => p !== undefined,
    );
    expect(new Set(ports).size).toBe(ports.length);
  });

  it('resolves a valid brand colour + hue + icon for every product', () => {
    for (const app of PRODUCT_APPS) {
      const resolved = resolveApp(app);
      expect(resolved.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(typeof resolved.hue).toBe('number');
      expect(resolved.hue).toBeGreaterThanOrEqual(0);
      expect(resolved.hue).toBeLessThanOrEqual(360);
      expect(resolved.iconRef.length).toBeGreaterThan(0);
    }
  });

  it('resolveApp accepts an id string and throws on unknown ids', () => {
    expect(resolveApp('quantmail').id).toBe('quantmail');
    expect(() => resolveApp('nope')).toThrow(/Unknown app/);
  });
});
