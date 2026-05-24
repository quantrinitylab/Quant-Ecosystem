// ============================================================================
// QuantEdits - Effects Controller
// Business logic for effects and transitions
// ============================================================================

import type { Effect, EffectCategory, AppliedEffect } from '../../src/types';

export class EffectsController {
  applyEffect(effectId: string, params: Record<string, unknown>, intensity: number): AppliedEffect {
    return {
      id: `applied_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      effectId,
      name: effectId,
      enabled: true,
      params,
      intensity: Math.max(0, Math.min(1, intensity)),
    };
  }

  removeEffect(effects: AppliedEffect[], effectInstanceId: string): AppliedEffect[] {
    return effects.filter(e => e.id !== effectInstanceId);
  }

  updateEffectParams(effects: AppliedEffect[], effectInstanceId: string, params: Record<string, unknown>): AppliedEffect[] {
    return effects.map(e => e.id === effectInstanceId ? { ...e, params: { ...e.params, ...params } } : e);
  }

  toggleEffect(effects: AppliedEffect[], effectInstanceId: string): AppliedEffect[] {
    return effects.map(e => e.id === effectInstanceId ? { ...e, enabled: !e.enabled } : e);
  }
}

export const effectsController = new EffectsController();
