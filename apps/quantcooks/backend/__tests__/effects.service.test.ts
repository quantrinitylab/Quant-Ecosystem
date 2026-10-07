import { describe, it, expect, beforeEach } from 'vitest';
import {
  EffectsService,
  EffectNotFoundError,
  EFFECT_CATEGORIES,
} from '../services/effects.service';

describe('EffectsService', () => {
  let service: EffectsService;

  beforeEach(() => {
    service = new EffectsService();
  });

  it('lists effects across all categories', () => {
    const all = service.listEffects();
    expect(all.length).toBeGreaterThan(0);
    const categories = new Set(all.map((e) => e.category));
    for (const c of EFFECT_CATEGORIES) {
      expect(categories.has(c)).toBe(true);
    }
  });

  it('filters by category', () => {
    const filters = service.listEffects({ category: 'filters' });
    expect(filters.length).toBeGreaterThan(0);
    expect(filters.every((e) => e.category === 'filters')).toBe(true);
  });

  it('searches by name or tag (case-insensitive)', () => {
    const byName = service.listEffects({ search: 'GLITCH' });
    expect(byName.some((e) => e.name.toLowerCase().includes('glitch'))).toBe(true);

    const byTag = service.listEffects({ search: 'retro' });
    expect(byTag.length).toBeGreaterThan(0);
    expect(byTag.every((e) => e.tags.some((t) => t.includes('retro')))).toBe(true);
  });

  it('filters premium-only and free-only', () => {
    const premium = service.listEffects({ premiumOnly: true });
    expect(premium.length).toBeGreaterThan(0);
    expect(premium.every((e) => e.isPremium)).toBe(true);

    const free = service.listEffects({ freeOnly: true });
    expect(free.every((e) => !e.isPremium)).toBe(true);
  });

  it('returns defensive copies (cannot mutate the shared catalog)', () => {
    const first = service.listEffects({ category: 'filters' });
    const target = first[0]!;
    target.name = 'HACKED';
    target.tags.push('injected');
    target.parameters.push({ name: 'x', type: 'number', default: 0 });

    const second = service.listEffects({ category: 'filters' });
    expect(second[0]!.name).not.toBe('HACKED');
    expect(second[0]!.tags).not.toContain('injected');
  });

  it('gets a single effect by id', () => {
    const effect = service.getEffect('fl-vintage');
    expect(effect.id).toBe('fl-vintage');
    expect(effect.category).toBe('filters');
  });

  it('throws EffectNotFoundError for an unknown id', () => {
    expect(() => service.getEffect('does-not-exist')).toThrow(EffectNotFoundError);
  });

  it('reports category counts that sum to the full catalog', () => {
    const categories = service.getCategories();
    const total = categories.reduce((sum, c) => sum + c.count, 0);
    expect(total).toBe(service.listEffects().length);
    expect(categories.map((c) => c.id).sort()).toEqual([...EFFECT_CATEGORIES].sort());
  });
});
