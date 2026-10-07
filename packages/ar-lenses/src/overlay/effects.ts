import type { LightingEffectConfig, LightingEffectType } from '../types.js';

interface EffectResult {
  type: LightingEffectType;
  applied: boolean;
  parameters: Record<string, number>;
}

export class LightingEffects {
  private effects: LightingEffectConfig[] = [];

  addEffect(config: LightingEffectConfig): void {
    this.effects.push(config);
  }

  removeEffect(type: LightingEffectType): void {
    this.effects = this.effects.filter((e) => e.type !== type);
  }

  apply(): EffectResult[] {
    return this.effects.map((effect) => this.applyEffect(effect));
  }

  private applyEffect(config: LightingEffectConfig): EffectResult {
    switch (config.type) {
      case 'color_grade':
        return this.applyColorGrade(config);
      case 'vignette':
        return this.applyVignette(config);
      case 'bloom':
        return this.applyBloom(config);
      case 'face_relight':
        return this.applyFaceRelight(config);
      case 'bg_blur':
        return this.applyBackgroundBlur(config);
    }
  }

  private applyColorGrade(config: LightingEffectConfig): EffectResult {
    const warmth = config.parameters['warmth'] ?? 0;
    const saturation = config.parameters['saturation'] ?? 1;
    return {
      type: 'color_grade',
      applied: config.intensity > 0,
      parameters: { warmth, saturation, intensity: config.intensity },
    };
  }

  private applyVignette(config: LightingEffectConfig): EffectResult {
    const radius = config.parameters['radius'] ?? 0.8;
    return {
      type: 'vignette',
      applied: config.intensity > 0,
      parameters: { radius, intensity: config.intensity },
    };
  }

  private applyBloom(config: LightingEffectConfig): EffectResult {
    const threshold = config.parameters['threshold'] ?? 0.8;
    return {
      type: 'bloom',
      applied: config.intensity > 0,
      parameters: { threshold, intensity: config.intensity },
    };
  }

  private applyFaceRelight(config: LightingEffectConfig): EffectResult {
    const direction = config.parameters['direction'] ?? 0;
    const softness = config.parameters['softness'] ?? 0.5;
    return {
      type: 'face_relight',
      applied: config.intensity > 0,
      parameters: { direction, softness, intensity: config.intensity },
    };
  }

  private applyBackgroundBlur(config: LightingEffectConfig): EffectResult {
    const radius = config.parameters['radius'] ?? 10;
    return {
      type: 'bg_blur',
      applied: config.intensity > 0,
      parameters: { radius, intensity: config.intensity },
    };
  }

  getEffectCount(): number {
    return this.effects.length;
  }

  clear(): void {
    this.effects = [];
  }
}
