// Quantneon - Haptics Service
// Mobile haptic feedback for social media platform

export type ImpactStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';

export type NotificationType = 'success' | 'warning' | 'error';

export interface HapticPattern {
  name: string;
  segments: HapticSegment[];
  repeat: boolean;
}

export interface HapticSegment {
  type: 'wait' | 'impact' | 'continuous';
  durationMs: number;
  intensity: number;
}

export interface HapticsCapabilities {
  supportsImpact: boolean;
  supportsNotification: boolean;
  supportsCustom: boolean;
  supportsContinuous: boolean;
  maxIntensity: number;
}

export interface HapticTriggerConfig {
  action: string;
  pattern: ImpactStyle | NotificationType | string;
  enabled: boolean;
}

export class HapticsService {
  private isAvailable: boolean = true;
  private isEnabled: boolean = true;
  private capabilities: HapticsCapabilities = {
    supportsImpact: true,
    supportsNotification: true,
    supportsCustom: true,
    supportsContinuous: true,
    maxIntensity: 1.0,
  };
  private customPatterns: Map<string, HapticPattern> = new Map();
  private triggerConfigs: Map<string, HapticTriggerConfig> = new Map();
  private intensityMultiplier: number = 1.0;

  constructor() {
    this.registerDefaultTriggers();
  }

  private registerDefaultTriggers(): void {
    const triggers: HapticTriggerConfig[] = [
      { action: 'post_published', pattern: 'medium', enabled: true },
      { action: 'story_viewed', pattern: 'success', enabled: true },
      { action: 'like_received', pattern: 'light', enabled: true },
      { action: 'error_occurred', pattern: 'error', enabled: true },
      { action: 'selection_change', pattern: 'light', enabled: true },
      { action: 'pull_to_refresh', pattern: 'medium', enabled: true },
      { action: 'long_press_activate', pattern: 'heavy', enabled: true },
    ];
    triggers.forEach(t => this.triggerConfigs.set(t.action, t));
  }

  public async checkAvailability(): Promise<HapticsCapabilities> {
    return { ...this.capabilities };
  }

  public async impact(style: ImpactStyle): Promise<void> {
    if (!this.isAvailable || !this.isEnabled) return;
    const intensityMap: Record<ImpactStyle, number> = { light: 0.3, medium: 0.5, heavy: 0.8, rigid: 0.9, soft: 0.2 };
    await this.triggerHaptic(intensityMap[style] * this.intensityMultiplier);
  }

  public async notification(type: NotificationType): Promise<void> {
    if (!this.isAvailable || !this.isEnabled) return;
    switch (type) {
      case 'success':
        await this.playPattern({ name: 'success', segments: [{ type: 'impact', durationMs: 50, intensity: 0.6 }, { type: 'wait', durationMs: 100, intensity: 0 }, { type: 'impact', durationMs: 50, intensity: 0.8 }], repeat: false });
        break;
      case 'warning':
        await this.playPattern({ name: 'warning', segments: [{ type: 'impact', durationMs: 80, intensity: 0.7 }, { type: 'wait', durationMs: 50, intensity: 0 }, { type: 'impact', durationMs: 80, intensity: 0.7 }], repeat: false });
        break;
      case 'error':
        await this.playPattern({ name: 'error', segments: [{ type: 'impact', durationMs: 100, intensity: 0.9 }, { type: 'wait', durationMs: 50, intensity: 0 }, { type: 'impact', durationMs: 100, intensity: 0.9 }, { type: 'wait', durationMs: 50, intensity: 0 }, { type: 'impact', durationMs: 100, intensity: 0.9 }], repeat: false });
        break;
    }
  }

  public async selectionChange(): Promise<void> {
    if (!this.isAvailable || !this.isEnabled) return;
    await this.triggerHaptic(0.15 * this.intensityMultiplier);
  }

  public async customPattern(pattern: HapticPattern): Promise<void> {
    if (!this.isAvailable || !this.isEnabled) return;
    await this.playPattern(pattern);
  }

  public registerPattern(name: string, pattern: HapticPattern): void {
    this.customPatterns.set(name, pattern);
  }

  public getPattern(name: string): HapticPattern | undefined {
    return this.customPatterns.get(name);
  }

  public async triggerForAction(action: string): Promise<void> {
    const config = this.triggerConfigs.get(action);
    if (!config || !config.enabled) return;
    const impactStyles: ImpactStyle[] = ['light', 'medium', 'heavy', 'rigid', 'soft'];
    const notifTypes: NotificationType[] = ['success', 'warning', 'error'];
    if (impactStyles.includes(config.pattern as ImpactStyle)) {
      await this.impact(config.pattern as ImpactStyle);
    } else if (notifTypes.includes(config.pattern as NotificationType)) {
      await this.notification(config.pattern as NotificationType);
    } else {
      const custom = this.customPatterns.get(config.pattern);
      if (custom) await this.customPattern(custom);
    }
  }

  public setTriggerEnabled(action: string, enabled: boolean): void {
    const config = this.triggerConfigs.get(action);
    if (config) config.enabled = enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  public isHapticsEnabled(): boolean {
    return this.isEnabled && this.isAvailable;
  }

  public setIntensityMultiplier(multiplier: number): void {
    this.intensityMultiplier = Math.max(0, Math.min(1, multiplier));
  }

  public getIntensityMultiplier(): number {
    return this.intensityMultiplier;
  }

  private async triggerHaptic(intensity: number): Promise<void> {
    const clampedIntensity = Math.max(0, Math.min(this.capabilities.maxIntensity, intensity));
    void clampedIntensity;
  }

  private async playPattern(pattern: HapticPattern): Promise<void> {
    for (const segment of pattern.segments) {
      if (segment.type === 'wait') {
        await new Promise(resolve => setTimeout(resolve, segment.durationMs));
      } else {
        await this.triggerHaptic(segment.intensity * this.intensityMultiplier);
      }
    }
  }

  public getAllTriggers(): HapticTriggerConfig[] {
    return Array.from(this.triggerConfigs.values());
  }
}
