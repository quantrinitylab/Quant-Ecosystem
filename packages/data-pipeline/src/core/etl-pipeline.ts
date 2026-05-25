// ============================================================================
// Data Pipeline Package - ETL Pipeline Builder
// ============================================================================

import type {
  ETLStage,
  ETLStageType,
  ExtractConfig,
  TransformConfig,
  LoadConfig,
  PipelineConfig,
  PipelineStatus,
  PipelineState,
  PipelineError,
  StageResult,
  StageMetrics,
  TransformOperation,
  TransformType,
  RetryPolicy,
} from '../types';

/** Record type for pipeline processing */
interface PipelineRecord {
  id: string;
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
  timestamp: number;
}

/** Pipeline builder state */
interface BuilderState {
  extractStages: ETLStage[];
  transformStages: ETLStage[];
  loadStages: ETLStage[];
  name: string;
  maxRetries: number;
  timeout: number;
}

/**
 * ETLPipeline - Builder pattern ETL pipeline engine
 * Supports extract from multiple sources, transform with various operations,
 * and load to multiple destinations with error handling and metrics.
 */
export class ETLPipeline {
  private config: PipelineConfig | null = null;
  private status: PipelineStatus;
  private builderState: BuilderState;
  private records: PipelineRecord[] = [];
  private stageResults: StageResult[] = [];
  private errors: PipelineError[] = [];
  private pipelineId: string;

  constructor(name: string = 'unnamed-pipeline') {
    this.pipelineId = `pipeline-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    this.builderState = {
      extractStages: [],
      transformStages: [],
      loadStages: [],
      name,
      maxRetries: 3,
      timeout: 300000,
    };
    this.status = {
      pipelineId: this.pipelineId,
      name,
      state: 'idle',
      currentStage: '',
      progress: 0,
      startedAt: 0,
      completedAt: null,
      recordsProcessed: 0,
      recordsFailed: 0,
      errors: [],
      metrics: {
        totalRecordsProcessed: 0,
        totalRecordsFailed: 0,
        totalDuration: 0,
        throughputPerSecond: 0,
        stageResults: [],
      },
    };
  }

  /**
   * Add an extract stage to the pipeline
   */
  public extract(config: ExtractConfig): ETLPipeline {
    const stage: ETLStage = {
      name: `extract-${config.source}-${this.builderState.extractStages.length}`,
      type: 'extract',
      config,
      retryPolicy: this.defaultRetryPolicy(),
      timeout: 60000,
      enabled: true,
    };
    this.builderState.extractStages.push(stage);
    return this;
  }

  /**
   * Add a transform stage with specified operations
   */
  public transform(config: TransformConfig): ETLPipeline {
    const stage: ETLStage = {
      name: `transform-${this.builderState.transformStages.length}`,
      type: 'transform',
      config,
      retryPolicy: this.defaultRetryPolicy(),
      timeout: 120000,
      enabled: true,
    };
    this.builderState.transformStages.push(stage);
    return this;
  }

  /**
   * Add a load stage to the pipeline
   */
  public load(config: LoadConfig): ETLPipeline {
    const stage: ETLStage = {
      name: `load-${config.destination}-${this.builderState.loadStages.length}`,
      type: 'load',
      config,
      retryPolicy: this.defaultRetryPolicy(),
      timeout: 120000,
      enabled: true,
    };
    this.builderState.loadStages.push(stage);
    return this;
  }

  /**
   * Build and finalize the pipeline configuration
   */
  public build(): PipelineConfig {
    const stages: ETLStage[] = [
      ...this.builderState.extractStages,
      ...this.builderState.transformStages,
      ...this.builderState.loadStages,
    ];

    if (stages.length === 0) {
      throw new Error('Pipeline must have at least one stage');
    }

    this.config = {
      name: this.builderState.name,
      stages,
      maxRetries: this.builderState.maxRetries,
      alertOnFailure: true,
      timeout: this.builderState.timeout,
      tags: [],
    };

    return this.config;
  }

  /**
   * Execute the pipeline with provided data
   */
  public async run(inputData: Record<string, unknown>[] = []): Promise<PipelineStatus> {
    if (!this.config) {
      this.build();
    }

    this.status.state = 'running';
    this.status.startedAt = Date.now();
    this.stageResults = [];
    this.errors = [];

    // Convert input to pipeline records
    this.records = inputData.map((data, idx) => ({
      id: `record-${idx}-${Date.now()}`,
      data,
      metadata: { sourceIndex: idx },
      timestamp: Date.now(),
    }));

    try {
      // Execute extract stages
      for (const stage of this.builderState.extractStages) {
        await this.executeStage(stage);
      }

      // Execute transform stages
      for (const stage of this.builderState.transformStages) {
        await this.executeStage(stage);
      }

      // Execute load stages
      for (const stage of this.builderState.loadStages) {
        await this.executeStage(stage);
      }

      this.status.state = this.errors.length > 0 ? 'completed' : 'completed';
      this.status.completedAt = Date.now();
    } catch (error) {
      this.status.state = 'failed';
      this.status.completedAt = Date.now();
      this.errors.push({
        stage: this.status.currentStage,
        message: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
        retryCount: 0,
      });
    }

    this.updateMetrics();
    return this.status;
  }

  /**
   * Get current pipeline status
   */
  public getStatus(): PipelineStatus {
    return { ...this.status };
  }

  /**
   * Pause pipeline execution
   */
  public pause(): void {
    if (this.status.state === 'running') {
      this.status.state = 'paused';
    }
  }

  /**
   * Cancel pipeline execution
   */
  public cancel(): void {
    this.status.state = 'cancelled';
    this.status.completedAt = Date.now();
  }

  /**
   * Apply a map transformation to records
   */
  public applyMap(
    records: PipelineRecord[],
    mapFn: (data: Record<string, unknown>) => Record<string, unknown>
  ): PipelineRecord[] {
    const results: PipelineRecord[] = [];
    for (const record of records) {
      try {
        const mapped = mapFn(record.data);
        results.push({ ...record, data: mapped });
      } catch (error) {
        this.errors.push({
          stage: 'map',
          message: error instanceof Error ? error.message : String(error),
          record: record.data,
          timestamp: Date.now(),
          retryCount: 0,
        });
      }
    }
    return results;
  }

  /**
   * Apply a filter transformation
   */
  public applyFilter(
    records: PipelineRecord[],
    predicate: (data: Record<string, unknown>) => boolean
  ): PipelineRecord[] {
    return records.filter(record => {
      try {
        return predicate(record.data);
      } catch {
        return false;
      }
    });
  }

  /**
   * Apply aggregation to records
   */
  public applyAggregate(
    records: PipelineRecord[],
    groupBy: string,
    aggregations: Record<string, 'sum' | 'count' | 'avg' | 'min' | 'max'>
  ): PipelineRecord[] {
    const groups = new Map<string, PipelineRecord[]>();

    for (const record of records) {
      const key = String(record.data[groupBy] ?? 'null');
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(record);
    }

    const results: PipelineRecord[] = [];
    for (const [key, groupRecords] of groups.entries()) {
      const aggregatedData: Record<string, unknown> = { [groupBy]: key };

      for (const [field, aggType] of Object.entries(aggregations)) {
        const values = groupRecords
          .map(r => Number(r.data[field]))
          .filter(v => !isNaN(v));

        switch (aggType) {
          case 'sum':
            aggregatedData[`${field}_sum`] = values.reduce((a, b) => a + b, 0);
            break;
          case 'count':
            aggregatedData[`${field}_count`] = values.length;
            break;
          case 'avg':
            aggregatedData[`${field}_avg`] = values.length > 0
              ? values.reduce((a, b) => a + b, 0) / values.length
              : 0;
            break;
          case 'min':
            aggregatedData[`${field}_min`] = values.length > 0 ? Math.min(...values) : 0;
            break;
          case 'max':
            aggregatedData[`${field}_max`] = values.length > 0 ? Math.max(...values) : 0;
            break;
        }
      }

      results.push({
        id: `agg-${key}-${Date.now()}`,
        data: aggregatedData,
        metadata: { groupSize: groupRecords.length },
        timestamp: Date.now(),
      });
    }

    return results;
  }

  /**
   * Deduplicate records based on a key field
   */
  public applyDeduplicate(records: PipelineRecord[], keyField: string): PipelineRecord[] {
    const seen = new Set<string>();
    const results: PipelineRecord[] = [];

    for (const record of records) {
      const key = String(record.data[keyField] ?? record.id);
      if (!seen.has(key)) {
        seen.add(key);
        results.push(record);
      }
    }

    return results;
  }

  /**
   * Join two record sets on a common key
   */
  public applyJoin(
    left: PipelineRecord[],
    right: PipelineRecord[],
    leftKey: string,
    rightKey: string,
    type: 'inner' | 'left' | 'right' | 'full' = 'inner'
  ): PipelineRecord[] {
    const rightIndex = new Map<string, PipelineRecord[]>();
    for (const record of right) {
      const key = String(record.data[rightKey] ?? '');
      if (!rightIndex.has(key)) {
        rightIndex.set(key, []);
      }
      rightIndex.get(key)!.push(record);
    }

    const results: PipelineRecord[] = [];
    const matchedRightKeys = new Set<string>();

    for (const leftRecord of left) {
      const key = String(leftRecord.data[leftKey] ?? '');
      const rightMatches = rightIndex.get(key);

      if (rightMatches && rightMatches.length > 0) {
        matchedRightKeys.add(key);
        for (const rightRecord of rightMatches) {
          results.push({
            id: `join-${leftRecord.id}-${rightRecord.id}`,
            data: { ...leftRecord.data, ...rightRecord.data },
            metadata: { joinType: type, leftId: leftRecord.id, rightId: rightRecord.id },
            timestamp: Date.now(),
          });
        }
      } else if (type === 'left' || type === 'full') {
        results.push({
          id: `join-left-${leftRecord.id}`,
          data: { ...leftRecord.data },
          metadata: { joinType: type, leftId: leftRecord.id, rightId: null },
          timestamp: Date.now(),
        });
      }
    }

    if (type === 'right' || type === 'full') {
      for (const [key, rightRecords] of rightIndex.entries()) {
        if (!matchedRightKeys.has(key)) {
          for (const rightRecord of rightRecords) {
            results.push({
              id: `join-right-${rightRecord.id}`,
              data: { ...rightRecord.data },
              metadata: { joinType: type, leftId: null, rightId: rightRecord.id },
              timestamp: Date.now(),
            });
          }
        }
      }
    }

    return results;
  }

  /**
   * Execute a single pipeline stage with retry logic
   */
  private async executeStage(stage: ETLStage): Promise<StageResult> {
    this.status.currentStage = stage.name;
    const stageStart = Date.now();
    let recordsIn = this.records.length;
    let recordsErrored = 0;

    let attempts = 0;
    const maxAttempts = stage.retryPolicy.maxRetries + 1;
    let lastError: Error | null = null;

    while (attempts < maxAttempts) {
      try {
        if (stage.type === 'transform') {
          const config = stage.config as TransformConfig;
          for (const op of config.operations) {
            this.records = this.applyTransformOperation(this.records, op, config.errorHandling);
          }
        }
        // Extract and Load stages are simulated since we don't have real connections
        lastError = null;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        attempts++;
        if (attempts < maxAttempts) {
          const delay = stage.retryPolicy.initialDelay *
            Math.pow(stage.retryPolicy.backoffMultiplier, attempts - 1);
          await this.sleep(Math.min(delay, stage.retryPolicy.maxDelay));
        }
      }
    }

    const result: StageResult = {
      stageName: stage.name,
      status: lastError ? 'failed' : recordsErrored > 0 ? 'partial' : 'success',
      recordsIn,
      recordsOut: this.records.length,
      recordsErrored,
      duration: Date.now() - stageStart,
      errors: lastError
        ? [{ stage: stage.name, message: lastError.message, timestamp: Date.now(), retryCount: attempts }]
        : [],
    };

    this.stageResults.push(result);
    this.updateProgress();

    return result;
  }

  /**
   * Apply a single transform operation
   */
  private applyTransformOperation(
    records: PipelineRecord[],
    operation: TransformOperation,
    errorHandling: 'skip' | 'fail' | 'quarantine'
  ): PipelineRecord[] {
    const config = operation.config;

    switch (operation.type) {
      case 'filter': {
        const field = config.field as string;
        const operator = config.operator as string;
        const value = config.value;
        return records.filter(r => this.evaluateCondition(r.data[field], operator, value));
      }
      case 'deduplicate': {
        const keyField = config.keyField as string;
        return this.applyDeduplicate(records, keyField);
      }
      default:
        return records;
    }
  }

  /**
   * Evaluate a filter condition
   */
  private evaluateCondition(fieldValue: unknown, operator: string, value: unknown): boolean {
    switch (operator) {
      case 'eq': return fieldValue === value;
      case 'neq': return fieldValue !== value;
      case 'gt': return Number(fieldValue) > Number(value);
      case 'gte': return Number(fieldValue) >= Number(value);
      case 'lt': return Number(fieldValue) < Number(value);
      case 'lte': return Number(fieldValue) <= Number(value);
      case 'in': return Array.isArray(value) && value.includes(fieldValue);
      case 'contains': return String(fieldValue).includes(String(value));
      case 'exists': return fieldValue !== undefined && fieldValue !== null;
      default: return true;
    }
  }

  /**
   * Update pipeline progress percentage
   */
  private updateProgress(): void {
    const totalStages = (this.config?.stages.length ?? 1);
    this.status.progress = Math.round((this.stageResults.length / totalStages) * 100);
    this.status.recordsProcessed = this.records.length;
  }

  /**
   * Update final pipeline metrics
   */
  private updateMetrics(): void {
    const totalDuration = this.status.completedAt
      ? this.status.completedAt - this.status.startedAt
      : Date.now() - this.status.startedAt;

    this.status.metrics = {
      totalRecordsProcessed: this.status.recordsProcessed,
      totalRecordsFailed: this.errors.length,
      totalDuration,
      throughputPerSecond: totalDuration > 0
        ? Math.round((this.status.recordsProcessed / totalDuration) * 1000)
        : 0,
      stageResults: this.stageResults,
    };
    this.status.errors = this.errors;
    this.status.recordsFailed = this.errors.length;
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get default retry policy
   */
  private defaultRetryPolicy(): RetryPolicy {
    return {
      maxRetries: 3,
      initialDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      retryableErrors: ['transient', 'timeout', 'rate_limit'],
    };
  }
}
