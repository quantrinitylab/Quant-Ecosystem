import type { DataResidency } from '../types.js';
export class DataResidencyManager {
  private records = new Map<string, DataResidency>();
  track(id: string, region: string, shard: string, encrypted: boolean): DataResidency {
    const r: DataResidency = { recordId: id, region, shard, encrypted, movedAt: null };
    this.records.set(id, r);
    return r;
  }
  // prettier-ignore
  getResidency(id: string) { return this.records.get(id) ?? null; }
  // prettier-ignore
  moveToRegion(id: string, region: string) { const r = this.records.get(id); if (r) { r.region = region; r.movedAt = Date.now(); } }
  // prettier-ignore
  getByRegion(region: string) { return [...this.records.values()].filter((r) => r.region === region); }
  // prettier-ignore
  getUnencrypted() { return [...this.records.values()].filter((r) => !r.encrypted); }
  // prettier-ignore
  encryptRecord(id: string) { const r = this.records.get(id); if (r) r.encrypted = true; }
}
