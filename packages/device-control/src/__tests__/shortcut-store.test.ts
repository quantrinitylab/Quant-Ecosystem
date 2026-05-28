import { describe, it, expect } from 'vitest';
import { ShortcutStore } from '../voice/shortcut-store.js';

describe('ShortcutStore', () => {
  it('creates and retrieves a shortcut', () => {
    const store = new ShortcutStore();
    const s = store.create({
      trigger: 'goodnight',
      actions: [
        { capability: 'iot', action: 'toggle', params: { device: 'lights', state: 'off' } },
      ],
    });
    expect(s.enabled).toBe(true);
    expect(s.stopOnFailure).toBe(true);
    expect(store.get('goodnight')).toEqual(s);
  });

  it('normalizes triggers to lowercase', () => {
    const store = new ShortcutStore();
    store.create({ trigger: 'GoOdNiGhT', actions: [] });
    expect(store.has('goodnight')).toBe(true);
    expect(store.get('GOODNIGHT')).toBeDefined();
  });

  it('updates a shortcut', () => {
    const store = new ShortcutStore();
    store.create({ trigger: 'test', actions: [] });
    expect(store.update('test', { enabled: false })).toBe(true);
    expect(store.get('test')!.enabled).toBe(false);
  });

  it('deletes a shortcut', () => {
    const store = new ShortcutStore();
    store.create({ trigger: 'test', actions: [] });
    expect(store.delete('test')).toBe(true);
    expect(store.has('test')).toBe(false);
  });

  it('lists all shortcuts', () => {
    const store = new ShortcutStore();
    store.create({ trigger: 'a', actions: [] });
    store.create({ trigger: 'b', actions: [] });
    expect(store.list()).toHaveLength(2);
  });

  it('returns false for update/delete on non-existent trigger', () => {
    const store = new ShortcutStore();
    expect(store.update('nope', {})).toBe(false);
    expect(store.delete('nope')).toBe(false);
  });
});
