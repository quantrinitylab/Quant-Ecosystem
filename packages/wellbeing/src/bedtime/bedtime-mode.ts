import type { BedtimeConfig } from '../types.js';
export class BedtimeMode {
  private cfg: BedtimeConfig | null = null;
  // prettier-ignore
  configure(config: BedtimeConfig) { this.cfg = config; }
  // prettier-ignore
  getConfig() { return this.cfg; }
  isActive(h: number) {
    if (!this.cfg?.enabled) return false;
    const { startHour: s, endHour: e } = this.cfg;
    return s > e ? h >= s || h < e : h >= s && h < e;
  }
  // prettier-ignore
  getDimLevel(h: number) { return this.isActive(h) ? this.cfg!.dimLevel : 0; }
  shouldBlockNotification(priority: 'essential' | 'normal' | 'low', h: number) {
    return this.isActive(h) && this.cfg!.blockNonEssential && priority !== 'essential';
  }
}
