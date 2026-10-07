import { z } from 'zod';

export interface FlagRule {
  field: string;
  operator: 'eq' | 'neq' | 'in' | 'not_in' | 'gt' | 'lt';
  value: unknown;
}

export interface FlagVariant {
  name: string;
  value: unknown;
  weight: number;
}

export interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  rules: FlagRule[];
  percentage: number;
  variants: FlagVariant[];
  createdAt: Date;
  updatedAt: Date;
}

export interface FlagContext {
  userId?: string;
  email?: string;
  role?: string;
  orgId?: string;
  attributes?: Record<string, unknown>;
}

export const FlagRuleSchema = z.object({
  field: z.string(),
  operator: z.enum(['eq', 'neq', 'in', 'not_in', 'gt', 'lt']),
  value: z.unknown(),
});

export const FlagVariantSchema = z.object({
  name: z.string(),
  value: z.unknown(),
  weight: z.number().min(0).max(100),
});

export const CreateFlagInput = z.object({
  name: z.string().min(1).max(100),
  description: z.string().default(''),
  enabled: z.boolean().default(false),
  rules: z.array(FlagRuleSchema).default([]),
  percentage: z.number().int().min(0).max(100).default(100),
  variants: z.array(FlagVariantSchema).default([]),
});

export const UpdateFlagInput = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  rules: z.array(FlagRuleSchema).optional(),
  percentage: z.number().int().min(0).max(100).optional(),
  variants: z.array(FlagVariantSchema).optional(),
});

export type CreateFlagInput = z.infer<typeof CreateFlagInput>;
export type UpdateFlagInput = z.infer<typeof UpdateFlagInput>;
