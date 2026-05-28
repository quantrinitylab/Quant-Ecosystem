export type ExportFormat = 'markdown' | 'ics' | 'vcard' | 'mbox' | 'opml' | 'json';
// prettier-ignore
export interface DataQuery { id: string; naturalLanguage: string; parsed: { metric: string; period: string } | null }
// prettier-ignore
export interface QueryResult { queryId: string; data: unknown[]; summary: string; executedAt: number }
// prettier-ignore
export interface DataExport { id: string; format: ExportFormat; appId: string | null; status: 'pending' | 'ready' | 'expired'; createdAt: number; sizeBytes: number | null }
// prettier-ignore
export interface DataResidency { recordId: string; region: string; shard: string; encrypted: boolean; movedAt: number | null }
// prettier-ignore
export interface StorageRegion { id: string; name: string; country: string; available: boolean }
