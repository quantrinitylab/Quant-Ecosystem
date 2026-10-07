import { describe, expect, it } from 'vitest';
import { EmptyStateManager, createEmptyStateManager, getAppPersonality } from '../empty-states.js';
import type { AppId } from '../types.js';

describe('Empty States', () => {
  const apps: AppId[] = [
    'quant-chat',
    'quant-mail',
    'quant-edits',
    'quant-drive',
    'quant-meet',
    'quant-calendar',
    'quant-tasks',
    'quant-code',
    'quant-social',
    'quant-ads',
    'quant-pay',
    'quant-photos',
    'quant-mobile',
  ];

  describe('personality per app', () => {
    it('quant-chat has witty personality', () => {
      expect(getAppPersonality('quant-chat')).toBe('witty');
    });

    it('quant-mail has professional personality', () => {
      expect(getAppPersonality('quant-mail')).toBe('professional');
    });

    it('quant-edits has creative personality', () => {
      expect(getAppPersonality('quant-edits')).toBe('creative');
    });

    it('quant-code has technical personality', () => {
      expect(getAppPersonality('quant-code')).toBe('technical');
    });

    it('quant-tasks has motivating personality', () => {
      expect(getAppPersonality('quant-tasks')).toBe('motivating');
    });

    it.each(apps)('has a personality defined for %s', (appId) => {
      const personality = getAppPersonality(appId);
      expect(personality).toBeTruthy();
      expect([
        'witty',
        'professional',
        'creative',
        'motivating',
        'technical',
        'friendly',
      ]).toContain(personality);
    });

    it('different apps can have different personalities', () => {
      const personalities = apps.map((appId) => getAppPersonality(appId));
      const unique = new Set(personalities);
      expect(unique.size).toBeGreaterThan(1);
    });
  });

  describe('empty state content', () => {
    it.each(apps)('provides empty state for %s', (appId) => {
      const manager = createEmptyStateManager();
      const state = manager.getEmptyState(appId);

      expect(state.appId).toBe(appId);
      expect(state.headline).toBeTruthy();
      expect(state.description).toBeTruthy();
      expect(state.personality).toBeTruthy();
    });

    it('returns all empty states', () => {
      const manager = new EmptyStateManager();
      const states = manager.getAllEmptyStates();
      expect(states.length).toBe(apps.length);
    });
  });

  describe('CTA generation', () => {
    it.each(apps)('has CTAs for %s', (appId) => {
      const manager = createEmptyStateManager();
      const ctas = manager.getCTAs(appId);
      expect(ctas.length).toBeGreaterThan(0);
    });

    it('has a primary CTA for each app', () => {
      const manager = createEmptyStateManager();
      for (const appId of apps) {
        const primary = manager.getPrimaryCTA(appId);
        expect(primary).not.toBeNull();
        expect(primary!.primary).toBe(true);
        expect(primary!.label).toBeTruthy();
        expect(primary!.action).toBeTruthy();
      }
    });

    it('CTAs have label and action', () => {
      const manager = createEmptyStateManager();
      const ctas = manager.getCTAs('quant-chat');
      for (const cta of ctas) {
        expect(cta.label).toBeTruthy();
        expect(cta.action).toBeTruthy();
        expect(typeof cta.primary).toBe('boolean');
      }
    });

    it('each app has at least one non-primary CTA', () => {
      const manager = createEmptyStateManager();
      for (const appId of apps) {
        const ctas = manager.getCTAs(appId);
        const nonPrimary = ctas.filter((c) => !c.primary);
        expect(nonPrimary.length).toBeGreaterThan(0);
      }
    });
  });
});
