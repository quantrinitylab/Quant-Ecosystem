// ============================================================================
// Memory Exporter - Export/import memory in portable formats
// ============================================================================

import type { MemoryEntry, ExportFormat, MemoryExportData } from './types';
import { MemoryExportSchema } from './types';
import { AIMemoryStore } from './memory-store';

export class MemoryExporter {
  private store: AIMemoryStore;

  constructor(store: AIMemoryStore) {
    this.store = store;
  }

  export(userId: string, format: ExportFormat): string {
    const entries = this.store.getUserMemories(userId);
    const exportData: MemoryExportData = {
      version: '1.0.0',
      exportedAt: Date.now(),
      userId,
      entries: this.sanitizeForExport(entries),
    };

    switch (format) {
      case 'json':
        return this.deterministicStringify(exportData);
      case 'markdown':
        return this.toMarkdown(exportData);
      case 'csv':
        return this.toCsv(exportData.entries);
    }
  }

  async exportEncrypted(userId: string, key: CryptoKey): Promise<ArrayBuffer> {
    const entries = this.store.getUserMemories(userId);
    const exportData: MemoryExportData = {
      version: '1.0.0',
      exportedAt: Date.now(),
      userId,
      entries: this.sanitizeForExport(entries),
    };

    const json = this.deterministicStringify(exportData);
    const encoder = new TextEncoder();
    const data = encoder.encode(json);

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);

    // Prepend IV to ciphertext
    const result = new Uint8Array(iv.length + encrypted.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(encrypted), iv.length);
    return result.buffer;
  }

  async importEncrypted(data: ArrayBuffer, key: CryptoKey): Promise<MemoryEntry[]> {
    const bytes = new Uint8Array(data);
    const iv = bytes.slice(0, 12);
    const ciphertext = bytes.slice(12);

    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    const decoder = new TextDecoder();
    const json = decoder.decode(decrypted);

    return this.importFromJson(json);
  }

  importFromJson(json: string): MemoryEntry[] {
    const parsed: unknown = JSON.parse(json);
    const validated = MemoryExportSchema.parse(parsed);

    const imported: MemoryEntry[] = [];
    for (const entry of validated.entries) {
      const created = this.store.create({
        userId: entry.userId,
        category: entry.category,
        content: entry.content,
        source: entry.source,
        sourceApp: entry.sourceApp,
        explanation: entry.explanation,
        expiresAt: entry.expiresAt,
        accessScopes: entry.accessScopes,
        writeSignal: 'explicit',
        status: entry.status,
        tags: entry.tags,
      });
      imported.push(created);
    }

    return imported;
  }

  private deterministicStringify(obj: unknown): string {
    return JSON.stringify(obj, (_key, value) => {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        const sorted: Record<string, unknown> = {};
        for (const k of Object.keys(value as Record<string, unknown>).sort()) {
          sorted[k] = (value as Record<string, unknown>)[k];
        }
        return sorted;
      }
      return value;
    });
  }

  private sanitizeForExport(entries: MemoryEntry[]): MemoryEntry[] {
    return entries.map((entry) => ({
      ...entry,
      accessLog: [],
    }));
  }

  private toMarkdown(data: MemoryExportData): string {
    const lines: string[] = [];
    lines.push(`# AI Memory Export`);
    lines.push(`**User:** ${data.userId}`);
    lines.push(`**Exported:** ${new Date(data.exportedAt).toISOString()}`);
    lines.push(`**Entries:** ${data.entries.length}`);
    lines.push('');

    for (const entry of data.entries) {
      lines.push(`## ${entry.category}: ${entry.content.slice(0, 50)}`);
      lines.push(`- **Source:** ${entry.sourceApp} (${entry.source})`);
      lines.push(`- **Created:** ${new Date(entry.createdAt).toISOString()}`);
      lines.push(`- **Explanation:** ${entry.explanation}`);
      lines.push(`- **Content:** ${entry.content}`);
      lines.push(`- **Access Count:** ${entry.accessLog.length}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  private sanitizeCsvCell(value: string): string {
    let sanitized = value;
    // Prefix cells that start with formula-triggering characters
    if (/^[=+\-@]/.test(sanitized)) {
      sanitized = `\t${sanitized}`;
    }
    // Escape double quotes and wrap in quotes
    sanitized = sanitized.replace(/"/g, '""');
    // Escape newlines within quoted fields
    sanitized = sanitized.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\n');
    return `"${sanitized}"`;
  }

  private toCsv(entries: MemoryEntry[]): string {
    const headers = [
      'id',
      'userId',
      'category',
      'content',
      'source',
      'sourceApp',
      'createdAt',
      'explanation',
      'accessCount',
    ];
    const lines: string[] = [headers.join(',')];

    for (const entry of entries) {
      const row = [
        this.sanitizeCsvCell(entry.id),
        this.sanitizeCsvCell(entry.userId),
        this.sanitizeCsvCell(entry.category),
        this.sanitizeCsvCell(entry.content),
        this.sanitizeCsvCell(entry.source),
        this.sanitizeCsvCell(entry.sourceApp),
        this.sanitizeCsvCell(String(entry.createdAt)),
        this.sanitizeCsvCell(entry.explanation),
        this.sanitizeCsvCell(String(entry.accessLog.length)),
      ];
      lines.push(row.join(','));
    }

    return lines.join('\n');
  }
}
