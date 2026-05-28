import type { ElderModeConfig } from '../types.js';
export class ElderMode {
  private cfg: ElderModeConfig | null = null;
  // prettier-ignore
  enable(c: ElderModeConfig) { this.cfg = { ...c, enabled: true }; }
  // prettier-ignore
  disable() { this.cfg = null; }
  // prettier-ignore
  isEnabled() { return this.cfg?.enabled ?? false; }
  // prettier-ignore
  getConfig() { return this.cfg; }
  // prettier-ignore
  triggerEmergency() { return this.cfg?.emergencyContact ?? null; }
  // prettier-ignore
  updateFamilyConfig(s: Partial<ElderModeConfig>) { if (this.cfg) Object.assign(this.cfg, s); }
  // prettier-ignore
  getFallbackUI() { return this.cfg ? { mode: 'large-buttons', fontSize: this.cfg.fontSize } : null; }
}
