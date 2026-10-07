import type { FeatureFlag, FlagContext, FlagRule } from './types';
import { CreateFlagInput, UpdateFlagInput } from './types';
import type { z } from 'zod';
import type { FlagStore } from './flags-store';
import { InMemoryFlagStore } from './flags-store';

export interface FlagServiceOptions {
  store?: FlagStore;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function matchesRule(rule: FlagRule, context: FlagContext): boolean {
  const contextValue = getContextValue(rule.field, context);

  switch (rule.operator) {
    case 'eq':
      return contextValue === rule.value;
    case 'neq':
      return contextValue !== rule.value;
    case 'in':
      return Array.isArray(rule.value) && rule.value.includes(contextValue);
    case 'not_in':
      return Array.isArray(rule.value) && !rule.value.includes(contextValue);
    case 'gt':
      return (
        typeof contextValue === 'number' &&
        typeof rule.value === 'number' &&
        contextValue > rule.value
      );
    case 'lt':
      return (
        typeof contextValue === 'number' &&
        typeof rule.value === 'number' &&
        contextValue < rule.value
      );
    default:
      return false;
  }
}

function getContextValue(field: string, context: FlagContext): unknown {
  if (field === 'userId') return context.userId;
  if (field === 'email') return context.email;
  if (field === 'role') return context.role;
  if (field === 'orgId') return context.orgId;
  return context.attributes?.[field];
}

export class FeatureFlagService {
  private store: FlagStore;

  constructor(opts?: FlagServiceOptions) {
    this.store = opts?.store ?? new InMemoryFlagStore();
  }

  isEnabled(flagName: string, context?: FlagContext): boolean {
    const flag = this.store.get(flagName);
    if (!flag) return false;
    if (!flag.enabled) return false;

    // Check percentage rollout
    if (flag.percentage < 100) {
      const userId = context?.userId ?? 'anonymous';
      const hash = hashCode(flagName + userId) % 100;
      if (hash >= flag.percentage) return false;
    }

    // Check rules (all rules must match if any exist)
    if (flag.rules.length > 0 && context) {
      const allMatch = flag.rules.every((rule) => matchesRule(rule, context));
      if (!allMatch) return false;
    }

    return true;
  }

  getVariant(flagName: string, context?: FlagContext): unknown | null {
    const flag = this.store.get(flagName);
    if (!flag || !flag.enabled || flag.variants.length === 0) return null;

    if (!this.isEnabled(flagName, context)) return null;

    // Select variant based on weighted distribution using hash
    const userId = context?.userId ?? 'anonymous';
    const hash = hashCode(flagName + ':variant:' + userId) % 100;

    let cumulative = 0;
    for (const variant of flag.variants) {
      cumulative += variant.weight;
      if (hash < cumulative) return variant.value;
    }

    return flag.variants[flag.variants.length - 1]?.value ?? null;
  }

  getAllFlags(): FeatureFlag[] {
    return this.store.getAll();
  }

  createFlag(input: z.input<typeof CreateFlagInput>): FeatureFlag {
    const now = new Date();
    const flag: FeatureFlag = {
      id: generateId(),
      name: input.name,
      description: input.description ?? '',
      enabled: input.enabled ?? false,
      rules: (input.rules ?? []) as FlagRule[],
      percentage: input.percentage ?? 100,
      variants: (input.variants ?? []) as FeatureFlag['variants'],
      createdAt: now,
      updatedAt: now,
    };
    return this.store.save(flag);
  }

  updateFlag(id: string, input: z.input<typeof UpdateFlagInput>): FeatureFlag {
    const allFlags = this.store.getAll();
    const existing = allFlags.find((f) => f.id === id);
    if (!existing) throw new Error(`Flag with id "${id}" not found`);

    const updated: FeatureFlag = {
      ...existing,
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.enabled !== undefined && { enabled: input.enabled }),
      ...(input.rules !== undefined && { rules: input.rules as FlagRule[] }),
      ...(input.percentage !== undefined && { percentage: input.percentage }),
      ...(input.variants !== undefined && { variants: input.variants as FeatureFlag['variants'] }),
      updatedAt: new Date(),
    };

    return this.store.save(updated);
  }

  deleteFlag(id: string): void {
    this.store.delete(id);
  }

  refresh(): void {
    // Reload from store - for InMemoryStore this is a no-op
    // For persistent stores, this would re-fetch from database
  }
}

function generateId(): string {
  return 'flag_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
}
