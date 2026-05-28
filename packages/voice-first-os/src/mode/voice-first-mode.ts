import type { AmbientContext, VoiceFirstConfig } from '../types.js';
export class VoiceFirstMode {
  private cfg: VoiceFirstConfig = { enabled: false, lockScreenActive: false, ambientContext: null };
  // prettier-ignore
  enable() { this.cfg.enabled = true; }
  // prettier-ignore
  disable() { this.cfg.enabled = false; }
  // prettier-ignore
  isEnabled() { return this.cfg.enabled; }
  // prettier-ignore
  activateFromLockScreen() { this.cfg.lockScreenActive = this.cfg.enabled = true; return true; }
  // prettier-ignore
  setAmbientContext(ctx: AmbientContext) { this.cfg.ambientContext = ctx; }
  // prettier-ignore
  getAmbientContext() { return this.cfg.ambientContext; }
  // prettier-ignore
  routeInteraction(_: string): 'voice' | 'standard' { return this.cfg.enabled ? 'voice' : 'standard'; }
}
