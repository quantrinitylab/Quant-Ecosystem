import type { LensDefinition, LensTrigger, LensEffectStep } from '../types.js';

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const VALID_TRIGGERS: LensTrigger[] = [
  'face_detect',
  'smile',
  'blink',
  'mouth_open',
  'hand_raise',
  'always',
];

export class LensSchema {
  validate(definition: LensDefinition): ValidationResult {
    const errors: string[] = [];

    if (!definition.id || definition.id.trim() === '') {
      errors.push('Lens ID is required');
    }

    if (!definition.name || definition.name.trim() === '') {
      errors.push('Lens name is required');
    }

    if (!definition.version || !/^\d+\.\d+\.\d+$/.test(definition.version)) {
      errors.push('Version must be semver format (x.y.z)');
    }

    if (!definition.triggers || definition.triggers.length === 0) {
      errors.push('At least one trigger is required');
    } else {
      for (const trigger of definition.triggers) {
        if (!VALID_TRIGGERS.includes(trigger)) {
          errors.push(`Invalid trigger: ${trigger}`);
        }
      }
    }

    if (!definition.effects || definition.effects.length === 0) {
      errors.push('At least one effect is required');
    } else {
      this.validateEffects(definition.effects, errors);
    }

    this.validateParameters(definition.parameters, errors);

    return { valid: errors.length === 0, errors };
  }

  private validateEffects(effects: LensEffectStep[], errors: string[]): void {
    const orders = effects.map((e) => e.order);
    const uniqueOrders = new Set(orders);
    if (uniqueOrders.size !== orders.length) {
      errors.push('Effect orders must be unique');
    }

    for (const effect of effects) {
      if (!effect.effectType || effect.effectType.trim() === '') {
        errors.push('Effect type is required');
      }
      if (effect.order < 0) {
        errors.push('Effect order must be non-negative');
      }
    }
  }

  private validateParameters(
    parameters: Record<string, { min: number; max: number; default: number }>,
    errors: string[],
  ): void {
    for (const [key, param] of Object.entries(parameters)) {
      if (param.min > param.max) {
        errors.push(`Parameter '${key}': min cannot exceed max`);
      }
      if (param.default < param.min || param.default > param.max) {
        errors.push(`Parameter '${key}': default must be between min and max`);
      }
    }
  }

  serialize(definition: LensDefinition): string {
    return JSON.stringify(definition);
  }

  deserialize(data: string): LensDefinition | null {
    try {
      const parsed = JSON.parse(data) as LensDefinition;
      const result = this.validate(parsed);
      return result.valid ? parsed : null;
    } catch {
      return null;
    }
  }
}
