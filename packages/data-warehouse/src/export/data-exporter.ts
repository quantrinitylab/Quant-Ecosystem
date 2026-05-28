import type { DataExport, ExportFormat } from '../types.js';
export class DataExporter {
  private exports = new Map<string, DataExport>();
  exportApp(appId: string | null, format: ExportFormat): DataExport {
    // prettier-ignore
    const e: DataExport = { id: crypto.randomUUID(), format, appId, status: 'pending', createdAt: Date.now(), sizeBytes: null };
    this.exports.set(e.id, e);
    return e;
  }
  // prettier-ignore
  exportAll(format: ExportFormat) { return this.exportApp(null, format); }
  // prettier-ignore
  getExport(id: string) { return this.exports.get(id) ?? null; }
  // prettier-ignore
  markReady(id: string, size: number) { const e = this.exports.get(id); if (e) { e.status = 'ready'; e.sizeBytes = size; } }
  // prettier-ignore
  supportRTBF(appId?: string) { for (const e of this.exports.values()) { if (!appId || e.appId === appId || e.appId === null) e.status = 'expired'; } }
}
