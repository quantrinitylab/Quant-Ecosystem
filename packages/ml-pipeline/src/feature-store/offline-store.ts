// ============================================================================
// Feature Store - Offline Store (S3/Parquet-backed)
// ============================================================================

import { z } from 'zod';

export interface S3Client {
  putObject(
    bucket: string,
    key: string,
    data: ArrayBuffer,
    metadata?: Record<string, string>,
  ): Promise<void>;
  getObject(bucket: string, key: string): Promise<ArrayBuffer | null>;
  listObjects(bucket: string, prefix: string): Promise<string[]>;
  deleteObject(bucket: string, key: string): Promise<void>;
  headObject(bucket: string, key: string): Promise<{ size: number; lastModified: number } | null>;
}

export const OfflineStoreConfigSchema = z.object({
  bucket: z.string().default('ml-feature-store'),
  basePath: z.string().default('features/'),
  partitionBy: z.enum(['date', 'entity_type', 'both']).default('both'),
  format: z.enum(['parquet', 'json']).default('json'),
  compressionCodec: z.enum(['snappy', 'gzip', 'zstd', 'none']).default('none'),
  maxPartitionSize: z
    .number()
    .int()
    .positive()
    .default(128 * 1024 * 1024), // 128MB
});

export type OfflineStoreConfig = z.infer<typeof OfflineStoreConfigSchema>;

export interface FeatureDataset {
  entityType: string;
  records: Record<string, unknown>[];
  schema: string;
  createdAt: number;
}

export interface DataQuery {
  entityType: string;
  startDate?: number;
  endDate?: number;
  entityIds?: string[];
  featureNames?: string[];
  limit?: number;
}

export interface TrainingDataQuery {
  entityType: string;
  startDate: number;
  endDate: number;
  features: string[];
  labelColumn?: string;
  sampleRate?: number;
}

export interface TrainingDataResult {
  records: Record<string, unknown>[];
  totalCount: number;
  dateRange: { start: number; end: number };
  featureNames: string[];
}

export class OfflineFeatureStore {
  private readonly s3: S3Client;
  private readonly config: OfflineStoreConfig;

  constructor(s3: S3Client, config?: Partial<OfflineStoreConfig>) {
    this.config = OfflineStoreConfigSchema.parse(config ?? {});
    if (this.config.format === 'parquet') {
      throw new Error(
        'Parquet format is not yet supported. Use format: "json" instead. Parquet support is planned for a future release.',
      );
    }
    this.s3 = s3;
  }

  async writeFeatures(dataset: FeatureDataset): Promise<string> {
    const partitionPath = this.buildPartitionPath(dataset.entityType, dataset.createdAt);
    const key = `${this.config.basePath}${partitionPath}`;

    const serialized = this.serializeDataset(dataset);
    const metadata: Record<string, string> = {
      entityType: dataset.entityType,
      recordCount: String(dataset.records.length),
      schema: dataset.schema,
      format: this.config.format,
      compression: this.config.compressionCodec,
    };

    await this.s3.putObject(this.config.bucket, key, serialized, metadata);
    return key;
  }

  async readFeatures(query: DataQuery): Promise<Record<string, unknown>[]> {
    const prefix = this.buildQueryPrefix(query.entityType, query.startDate, query.endDate);
    const keys = await this.s3.listObjects(this.config.bucket, `${this.config.basePath}${prefix}`);

    const allRecords: Record<string, unknown>[] = [];
    for (const key of keys) {
      const data = await this.s3.getObject(this.config.bucket, key);
      if (!data) continue;

      const records = this.deserializeDataset(data);
      const filtered = this.filterRecords(records, query);
      allRecords.push(...filtered);

      if (query.limit && allRecords.length >= query.limit) {
        return allRecords.slice(0, query.limit);
      }
    }

    return allRecords;
  }

  async getTrainingData(query: TrainingDataQuery): Promise<TrainingDataResult> {
    const dataQuery: DataQuery = {
      entityType: query.entityType,
      startDate: query.startDate,
      endDate: query.endDate,
      featureNames: query.features,
    };

    let records = await this.readFeatures(dataQuery);

    // Apply sampling
    if (query.sampleRate && query.sampleRate < 1) {
      records = records.filter(() => Math.random() < (query.sampleRate ?? 1));
    }

    return {
      records,
      totalCount: records.length,
      dateRange: { start: query.startDate, end: query.endDate },
      featureNames: query.features,
    };
  }

  async deletePartition(entityType: string, date: number): Promise<void> {
    const partitionPath = this.buildPartitionPath(entityType, date);
    const key = `${this.config.basePath}${partitionPath}`;
    await this.s3.deleteObject(this.config.bucket, key);
  }

  async getPartitionInfo(
    entityType: string,
    date: number,
  ): Promise<{ size: number; lastModified: number } | null> {
    const partitionPath = this.buildPartitionPath(entityType, date);
    const key = `${this.config.basePath}${partitionPath}`;
    return this.s3.headObject(this.config.bucket, key);
  }

  private buildPartitionPath(entityType: string, timestamp: number): string {
    const date = new Date(timestamp);
    const dateStr = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;

    switch (this.config.partitionBy) {
      case 'date':
        return `${dateStr}/data.${this.config.format}`;
      case 'entity_type':
        return `${entityType}/data.${this.config.format}`;
      case 'both':
        return `${entityType}/${dateStr}/data.${this.config.format}`;
    }
  }

  private buildQueryPrefix(entityType: string, startDate?: number, _endDate?: number): string {
    switch (this.config.partitionBy) {
      case 'entity_type':
      case 'both':
        return `${entityType}/`;
      case 'date':
        if (startDate) {
          const date = new Date(startDate);
          return `${date.getFullYear()}/`;
        }
        return '';
    }
  }

  private filterRecords(
    records: Record<string, unknown>[],
    query: DataQuery,
  ): Record<string, unknown>[] {
    let filtered = records;

    if (query.entityIds && query.entityIds.length > 0) {
      const idSet = new Set(query.entityIds);
      filtered = filtered.filter((r) => {
        const id = r['entityId'] ?? r['userId'] ?? r['itemId'];
        return typeof id === 'string' && idSet.has(id);
      });
    }

    if (query.featureNames && query.featureNames.length > 0) {
      const featureSet = new Set(query.featureNames);
      filtered = filtered.map((r) => {
        const picked: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(r)) {
          if (featureSet.has(key) || key === 'entityId' || key === 'userId' || key === 'itemId') {
            picked[key] = value;
          }
        }
        return picked;
      });
    }

    return filtered;
  }

  private serializeDataset(dataset: FeatureDataset): ArrayBuffer {
    const json = JSON.stringify({
      entityType: dataset.entityType,
      schema: dataset.schema,
      createdAt: dataset.createdAt,
      records: dataset.records,
    });
    return new TextEncoder().encode(json).buffer as ArrayBuffer;
  }

  private deserializeDataset(data: ArrayBuffer): Record<string, unknown>[] {
    const text = new TextDecoder().decode(data);
    const parsed = JSON.parse(text);
    return parsed.records ?? [];
  }
}
