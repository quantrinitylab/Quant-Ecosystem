import { describe, it, expect } from 'vitest';
import {
  UserFeatureSchema,
  ItemFeatureSchema,
  InteractionFeatureSchema,
  getFeatureDefinition,
  listFeatureDefinitions,
  registerFeatureDefinition,
} from '../feature-store/feature-definitions';
import type { FeatureDefinition } from '../feature-store/feature-definitions';
import { z } from 'zod';

describe('Feature Definitions', () => {
  describe('UserFeatureSchema', () => {
    it('validates correct user features', () => {
      const result = UserFeatureSchema.parse({
        userId: 'user:123',
        totalInteractions: 50,
        avgSessionDuration: 120.5,
        preferredCategories: ['tech', 'science'],
        activityLevel: 'high',
        daysSinceSignup: 30,
        clickThroughRate: 0.15,
        purchaseFrequency: 2.5,
        lastActiveAt: Date.now(),
      });
      expect(result.userId).toBe('user:123');
      expect(result.activityLevel).toBe('high');
    });

    it('rejects invalid activity level', () => {
      expect(() =>
        UserFeatureSchema.parse({
          userId: 'user:1',
          totalInteractions: 10,
          avgSessionDuration: 60,
          preferredCategories: [],
          activityLevel: 'ultra',
          daysSinceSignup: 5,
          clickThroughRate: 0.1,
          purchaseFrequency: 0,
          lastActiveAt: Date.now(),
        }),
      ).toThrow();
    });

    it('rejects negative totalInteractions', () => {
      expect(() =>
        UserFeatureSchema.parse({
          userId: 'user:1',
          totalInteractions: -1,
          avgSessionDuration: 60,
          preferredCategories: [],
          activityLevel: 'low',
          daysSinceSignup: 5,
          clickThroughRate: 0.1,
          purchaseFrequency: 0,
          lastActiveAt: Date.now(),
        }),
      ).toThrow();
    });

    it('rejects clickThroughRate > 1', () => {
      expect(() =>
        UserFeatureSchema.parse({
          userId: 'user:1',
          totalInteractions: 10,
          avgSessionDuration: 60,
          preferredCategories: [],
          activityLevel: 'low',
          daysSinceSignup: 5,
          clickThroughRate: 1.5,
          purchaseFrequency: 0,
          lastActiveAt: Date.now(),
        }),
      ).toThrow();
    });

    it('allows optional embedding field', () => {
      const result = UserFeatureSchema.parse({
        userId: 'user:1',
        totalInteractions: 10,
        avgSessionDuration: 60,
        preferredCategories: ['gaming'],
        activityLevel: 'medium',
        daysSinceSignup: 100,
        clickThroughRate: 0.2,
        purchaseFrequency: 1,
        lastActiveAt: Date.now(),
        embedding: [0.1, 0.2, 0.3],
      });
      expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
    });
  });

  describe('ItemFeatureSchema', () => {
    it('validates correct item features', () => {
      const result = ItemFeatureSchema.parse({
        itemId: 'item:456',
        category: 'electronics',
        tags: ['smartphone', 'flagship'],
        popularity: 0.8,
        freshness: 0.9,
        qualityScore: 0.85,
        createdAt: Date.now() - 86400000,
        updatedAt: Date.now(),
        interactionCount: 1500,
        avgRating: 4.2,
      });
      expect(result.itemId).toBe('item:456');
      expect(result.avgRating).toBe(4.2);
    });

    it('rejects avgRating > 5', () => {
      expect(() =>
        ItemFeatureSchema.parse({
          itemId: 'item:1',
          category: 'books',
          tags: [],
          popularity: 0.5,
          freshness: 0.5,
          qualityScore: 0.5,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          interactionCount: 10,
          avgRating: 6,
        }),
      ).toThrow();
    });

    it('rejects popularity out of range', () => {
      expect(() =>
        ItemFeatureSchema.parse({
          itemId: 'item:1',
          category: 'books',
          tags: [],
          popularity: 1.5,
          freshness: 0.5,
          qualityScore: 0.5,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          interactionCount: 10,
          avgRating: 4,
        }),
      ).toThrow();
    });
  });

  describe('InteractionFeatureSchema', () => {
    it('validates correct interaction features', () => {
      const result = InteractionFeatureSchema.parse({
        userId: 'user:1',
        itemId: 'item:2',
        interactionType: 'click',
        timestamp: Date.now(),
        duration: 5.5,
        context: { platform: 'web', sessionId: 'sess:abc' },
      });
      expect(result.interactionType).toBe('click');
      expect(result.weight).toBe(1); // default
    });

    it('rejects invalid interaction type', () => {
      expect(() =>
        InteractionFeatureSchema.parse({
          userId: 'user:1',
          itemId: 'item:2',
          interactionType: 'invalid_type',
          timestamp: Date.now(),
        }),
      ).toThrow();
    });

    it('accepts all valid interaction types', () => {
      const types = ['view', 'click', 'like', 'share', 'purchase', 'bookmark', 'comment'];
      for (const type of types) {
        const result = InteractionFeatureSchema.parse({
          userId: 'user:1',
          itemId: 'item:1',
          interactionType: type,
          timestamp: Date.now(),
        });
        expect(result.interactionType).toBe(type);
      }
    });

    it('allows optional context and duration', () => {
      const result = InteractionFeatureSchema.parse({
        userId: 'user:1',
        itemId: 'item:1',
        interactionType: 'view',
        timestamp: Date.now(),
      });
      expect(result.context).toBeUndefined();
      expect(result.duration).toBeUndefined();
    });
  });

  describe('Feature Registry', () => {
    it('retrieves user_features definition', () => {
      const def = getFeatureDefinition('user_features');
      expect(def).toBeDefined();
      expect(def!.entityType).toBe('user');
      expect(def!.version).toBe(1);
    });

    it('retrieves item_features definition', () => {
      const def = getFeatureDefinition('item_features');
      expect(def).toBeDefined();
      expect(def!.entityType).toBe('item');
    });

    it('retrieves interaction_features definition', () => {
      const def = getFeatureDefinition('interaction_features');
      expect(def).toBeDefined();
      expect(def!.entityType).toBe('interaction');
    });

    it('returns undefined for unknown feature', () => {
      const def = getFeatureDefinition('nonexistent');
      expect(def).toBeUndefined();
    });

    it('lists all registered definitions', () => {
      const defs = listFeatureDefinitions();
      expect(defs.length).toBeGreaterThanOrEqual(3);
      const names = defs.map((d) => d.name);
      expect(names).toContain('user_features');
      expect(names).toContain('item_features');
      expect(names).toContain('interaction_features');
    });

    it('allows registering custom feature definitions', () => {
      const customDef: FeatureDefinition = {
        name: 'custom_features',
        schema: z.object({ score: z.number() }),
        description: 'Custom features',
        entityType: 'user',
        version: 1,
      };
      registerFeatureDefinition(customDef);
      const retrieved = getFeatureDefinition('custom_features');
      expect(retrieved).toBeDefined();
      expect(retrieved!.description).toBe('Custom features');
    });
  });
});
