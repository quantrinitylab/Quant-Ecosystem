// ============================================================================
// Feature Store - Feature Definitions (Zod Schemas)
// ============================================================================

import { z } from 'zod';

export const UserFeatureSchema = z.object({
  userId: z.string(),
  totalInteractions: z.number().int().min(0),
  avgSessionDuration: z.number().min(0),
  preferredCategories: z.array(z.string()),
  activityLevel: z.enum(['low', 'medium', 'high', 'power']),
  daysSinceSignup: z.number().int().min(0),
  clickThroughRate: z.number().min(0).max(1),
  purchaseFrequency: z.number().min(0),
  lastActiveAt: z.number(),
  embedding: z.array(z.number()).optional(),
});

export type UserFeatures = z.infer<typeof UserFeatureSchema>;

export const ItemFeatureSchema = z.object({
  itemId: z.string(),
  category: z.string(),
  tags: z.array(z.string()),
  popularity: z.number().min(0).max(1),
  freshness: z.number().min(0).max(1),
  qualityScore: z.number().min(0).max(1),
  createdAt: z.number(),
  updatedAt: z.number(),
  interactionCount: z.number().int().min(0),
  avgRating: z.number().min(0).max(5),
  embedding: z.array(z.number()).optional(),
});

export type ItemFeatures = z.infer<typeof ItemFeatureSchema>;

export const InteractionFeatureSchema = z.object({
  userId: z.string(),
  itemId: z.string(),
  interactionType: z.enum(['view', 'click', 'like', 'share', 'purchase', 'bookmark', 'comment']),
  timestamp: z.number(),
  duration: z.number().min(0).optional(),
  context: z
    .object({
      platform: z.enum(['web', 'mobile', 'tablet', 'api']).optional(),
      referrer: z.string().optional(),
      sessionId: z.string().optional(),
    })
    .optional(),
  weight: z.number().min(0).max(1).default(1),
});

export type InteractionFeatures = z.infer<typeof InteractionFeatureSchema>;

export interface FeatureDefinition {
  name: string;
  schema: z.ZodSchema;
  description: string;
  entityType: 'user' | 'item' | 'interaction';
  version: number;
}

const featureRegistry: Map<string, FeatureDefinition> = new Map();

featureRegistry.set('user_features', {
  name: 'user_features',
  schema: UserFeatureSchema,
  description: 'User behavior and preference features',
  entityType: 'user',
  version: 1,
});

featureRegistry.set('item_features', {
  name: 'item_features',
  schema: ItemFeatureSchema,
  description: 'Item metadata and engagement features',
  entityType: 'item',
  version: 1,
});

featureRegistry.set('interaction_features', {
  name: 'interaction_features',
  schema: InteractionFeatureSchema,
  description: 'User-item interaction event features',
  entityType: 'interaction',
  version: 1,
});

export function getFeatureDefinition(name: string): FeatureDefinition | undefined {
  return featureRegistry.get(name);
}

export function listFeatureDefinitions(): FeatureDefinition[] {
  return Array.from(featureRegistry.values());
}

export function registerFeatureDefinition(definition: FeatureDefinition): void {
  featureRegistry.set(definition.name, definition);
}
