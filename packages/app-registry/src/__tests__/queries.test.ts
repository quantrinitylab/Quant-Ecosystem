import { describe, it, expect } from 'vitest';
import { getApp, allApps, byCategory, searchApps, resolveAllApps, withSurface } from '../queries';

describe('registry query helpers', () => {
  it('getApp returns the entry or undefined', () => {
    expect(getApp('quantmail')?.name).toBe('QuantMail');
    expect(getApp('nope')).toBeUndefined();
  });

  it('allApps returns a fresh copy of the catalog', () => {
    const a = allApps();
    expect(a).toHaveLength(9);
    a.pop();
    expect(allApps()).toHaveLength(9); // original catalog not mutated
  });

  it('exposes deep-frozen, immutable catalog entries', () => {
    const app = getApp('quantmail');
    expect(app).toBeDefined();
    // Entries are shared by reference, so they must be frozen — a consumer
    // mutating one would otherwise corrupt every later query.
    expect(Object.isFrozen(app)).toBe(true);
    expect(Object.isFrozen(app!.surfaces)).toBe(true);
    // The outer array from allApps() is still a fresh, reorderable copy.
    expect(() => allApps().sort()).not.toThrow();
  });

  it('byCategory groups correctly', () => {
    expect(
      byCategory('core')
        .map((a) => a.id)
        .sort(),
    ).toEqual(['quantai', 'quantchat', 'quantmail', 'quantmax'].sort());
    expect(byCategory('social')).toHaveLength(4);
    expect(byCategory('infra').map((a) => a.id)).toEqual(['quantads']);
  });

  it('searchApps is case-insensitive and matches id / name / route', () => {
    expect(searchApps('mail').map((a) => a.id)).toEqual(['quantmail']);
    expect(searchApps('QUANT')).toHaveLength(9);
    expect(searchApps('/ai').map((a) => a.id)).toEqual(['quantai']);
    expect(searchApps('   ')).toEqual([]);
  });

  it('resolveAllApps merges a colour into every product', () => {
    const resolved = resolveAllApps();
    expect(resolved).toHaveLength(9);
    for (const app of resolved) {
      expect(app.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('withSurface finds the apps that expose a surface', () => {
    // Every product ships web + backend today.
    expect(withSurface('web')).toHaveLength(9);
    expect(withSurface('backend')).toHaveLength(9);
    // The QuantMail pilot is the only app that owns admin + marketing slices so far.
    expect(withSurface('admin').map((a) => a.id)).toEqual(['quantmail']);
    expect(withSurface('marketing').map((a) => a.id)).toEqual(['quantmail']);
    // No product ships a native surface yet (kits are verification-blocked).
    expect(withSurface('desktop')).toEqual([]);
    expect(withSurface('mobile')).toEqual([]);
  });
});
