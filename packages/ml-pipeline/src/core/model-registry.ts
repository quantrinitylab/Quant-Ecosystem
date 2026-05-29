// ============================================================================
// ML Pipeline - Model Registry
// ============================================================================

import {
  ModelMetadata,
  ModelVersion,
  ModelStatus,
  ModelLineage,
  ModelComparison,
  ABTestConfig,
  ModelFramework,
} from '../types';

interface RegisteredModel {
  metadata: ModelMetadata;
  weights?: number[][];
  bias?: number[];
  lineage?: ModelLineage;
  tags: Set<string>;
}

/**
 * @simulated This implementation is a simulation/prototype.
 * Classification: NAIVE
 * Reason: In-memory model versioning
 * Production path: Use MLflow or SageMaker Model Registry
 */
export class ModelRegistry {
  private models: Map<string, RegisteredModel> = new Map();
  private versionHistory: Map<string, string[]> = new Map();
  private abTests: Map<string, ABTestConfig> = new Map();
  private statusTransitions: Map<string, ModelStatus[]> = new Map();
  private productionModels: Map<string, string> = new Map();

  private getModelKey(name: string, version: string): string {
    return `${name}@${version}`;
  }

  parseVersion(version: string): ModelVersion {
    const parts = version.split('.');
    return {
      major: parseInt(parts[0] ?? '1', 10),
      minor: parseInt(parts[1] ?? '0', 10),
      patch: parseInt(parts[2] ?? '0', 10),
    };
  }

  formatVersion(v: ModelVersion): string {
    return `${v.major}.${v.minor}.${v.patch}`;
  }

  incrementVersion(current: string, type: 'major' | 'minor' | 'patch'): string {
    const v = this.parseVersion(current);
    switch (type) {
      case 'major':
        return this.formatVersion({ major: v.major + 1, minor: 0, patch: 0 });
      case 'minor':
        return this.formatVersion({ major: v.major, minor: v.minor + 1, patch: 0 });
      case 'patch':
        return this.formatVersion({ major: v.major, minor: v.minor, patch: v.patch + 1 });
    }
  }

  registerModel(
    name: string,
    version: string,
    framework: ModelFramework,
    metrics: Record<string, number>,
    options?: {
      weights?: number[][];
      bias?: number[];
      description?: string;
      tags?: string[];
      datasetId?: string;
      featureSet?: string;
      trainingConfig?: any;
    },
  ): ModelMetadata {
    const key = this.getModelKey(name, version);
    const metadata: ModelMetadata = {
      name,
      version,
      framework,
      metrics,
      status: 'training',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      description: options?.description,
      tags: options?.tags,
      datasetId: options?.datasetId,
      featureSet: options?.featureSet,
    };
    const model: RegisteredModel = {
      metadata,
      weights: options?.weights,
      bias: options?.bias,
      tags: new Set(options?.tags ?? []),
    };
    if (options?.datasetId || options?.featureSet) {
      model.lineage = {
        modelName: name,
        version,
        datasetId: options.datasetId ?? '',
        featureSet: options.featureSet ?? '',
        trainingConfig: options.trainingConfig ?? {},
        createdAt: Date.now(),
      };
    }
    this.models.set(key, model);
    const history = this.versionHistory.get(name) ?? [];
    history.push(version);
    this.versionHistory.set(name, history);
    this.statusTransitions.set(key, ['training']);
    return metadata;
  }

  getModel(name: string, version: string): ModelMetadata | null {
    const model = this.models.get(this.getModelKey(name, version));
    return model?.metadata ?? null;
  }

  getLatestVersion(name: string): string | null {
    const history = this.versionHistory.get(name);
    if (!history || history.length === 0) return null;
    return history.sort((a, b) => this.compareVersions(b, a))[0] ?? null;
  }

  private compareVersions(a: string, b: string): number {
    const va = this.parseVersion(a);
    const vb = this.parseVersion(b);
    if (va.major !== vb.major) return va.major - vb.major;
    if (va.minor !== vb.minor) return va.minor - vb.minor;
    return va.patch - vb.patch;
  }

  transitionStatus(name: string, version: string, newStatus: ModelStatus): boolean {
    const key = this.getModelKey(name, version);
    const model = this.models.get(key);
    if (!model) return false;
    const validTransitions: Record<ModelStatus, ModelStatus[]> = {
      training: ['staged', 'failed', 'archived'],
      staged: ['production', 'archived', 'training'],
      production: ['archived', 'staged'],
      archived: ['staged'],
      failed: ['training', 'archived'],
    };
    const allowed = validTransitions[model.metadata.status];
    if (!allowed.includes(newStatus)) return false;
    model.metadata.status = newStatus;
    model.metadata.updatedAt = Date.now();
    const transitions = this.statusTransitions.get(key) ?? [];
    transitions.push(newStatus);
    this.statusTransitions.set(key, transitions);
    if (newStatus === 'production') {
      // Demote current production model
      const currentProd = this.productionModels.get(name);
      if (currentProd && currentProd !== version) {
        const currentKey = this.getModelKey(name, currentProd);
        const currentModel = this.models.get(currentKey);
        if (currentModel) {
          currentModel.metadata.status = 'archived';
          currentModel.metadata.updatedAt = Date.now();
        }
      }
      this.productionModels.set(name, version);
    }
    return true;
  }

  getProductionModel(name: string): ModelMetadata | null {
    const version = this.productionModels.get(name);
    if (!version) return null;
    return this.getModel(name, version);
  }

  rollback(name: string): ModelMetadata | null {
    const history = this.versionHistory.get(name);
    if (!history || history.length < 2) return null;
    const sorted = [...history].sort((a, b) => this.compareVersions(b, a));
    const currentVersion = this.productionModels.get(name);
    const previousVersion = sorted.find((v) => v !== currentVersion);
    if (!previousVersion) return null;
    if (currentVersion) {
      this.transitionStatus(name, currentVersion, 'archived');
    }
    this.transitionStatus(name, previousVersion, 'production');
    return this.getModel(name, previousVersion);
  }

  createABTest(config: ABTestConfig): void {
    this.abTests.set(config.name, config);
  }

  getABTestRoute(testName: string): { modelName: string; version: string } | null {
    const test = this.abTests.get(testName);
    if (!test || !test.active) return null;
    const totalWeight = test.modelA.trafficWeight + test.modelB.trafficWeight;
    const random = Math.random() * totalWeight;
    if (random < test.modelA.trafficWeight) {
      return { modelName: test.modelA.name, version: test.modelA.version };
    }
    return { modelName: test.modelB.name, version: test.modelB.version };
  }

  stopABTest(testName: string): void {
    const test = this.abTests.get(testName);
    if (test) {
      test.active = false;
      test.endTime = Date.now();
    }
  }

  compareModels(
    nameA: string,
    versionA: string,
    nameB: string,
    versionB: string,
  ): ModelComparison | null {
    const modelA = this.getModel(nameA, versionA);
    const modelB = this.getModel(nameB, versionB);
    if (!modelA || !modelB) return null;
    const metrics: Record<string, { a: number; b: number; diff: number }> = {};
    const allMetricKeys = new Set([...Object.keys(modelA.metrics), ...Object.keys(modelB.metrics)]);
    let winsA = 0,
      winsB = 0;
    for (const key of allMetricKeys) {
      const a = modelA.metrics[key] ?? 0;
      const b = modelB.metrics[key] ?? 0;
      metrics[key] = { a, b, diff: a - b };
      if (a > b) winsA++;
      else if (b > a) winsB++;
    }
    const totalMetrics = allMetricKeys.size || 1;
    const winner = winsA >= winsB ? `${nameA}@${versionA}` : `${nameB}@${versionB}`;
    const confidence = Math.abs(winsA - winsB) / totalMetrics;
    return {
      modelA: `${nameA}@${versionA}`,
      modelB: `${nameB}@${versionB}`,
      metrics,
      winner,
      confidence,
    };
  }

  getLineage(name: string, version: string): ModelLineage | null {
    const key = this.getModelKey(name, version);
    const model = this.models.get(key);
    return model?.lineage ?? null;
  }

  getStatusHistory(name: string, version: string): ModelStatus[] {
    const key = this.getModelKey(name, version);
    return this.statusTransitions.get(key) ?? [];
  }

  addTag(name: string, version: string, tag: string): void {
    const key = this.getModelKey(name, version);
    const model = this.models.get(key);
    if (model) {
      model.tags.add(tag);
      if (!model.metadata.tags) model.metadata.tags = [];
      if (!model.metadata.tags.includes(tag)) model.metadata.tags.push(tag);
    }
  }

  removeTag(name: string, version: string, tag: string): void {
    const key = this.getModelKey(name, version);
    const model = this.models.get(key);
    if (model) {
      model.tags.delete(tag);
      model.metadata.tags = model.metadata.tags?.filter((t) => t !== tag);
    }
  }

  searchByTag(tag: string): ModelMetadata[] {
    const results: ModelMetadata[] = [];
    for (const [, model] of this.models.entries()) {
      if (model.tags.has(tag)) {
        results.push(model.metadata);
      }
    }
    return results;
  }

  searchByStatus(status: ModelStatus): ModelMetadata[] {
    const results: ModelMetadata[] = [];
    for (const [, model] of this.models.entries()) {
      if (model.metadata.status === status) {
        results.push(model.metadata);
      }
    }
    return results;
  }

  listModels(name?: string): ModelMetadata[] {
    const results: ModelMetadata[] = [];
    for (const [, model] of this.models.entries()) {
      if (!name || model.metadata.name === name) {
        results.push(model.metadata);
      }
    }
    return results;
  }

  deleteModel(name: string, version: string): boolean {
    const key = this.getModelKey(name, version);
    const exists = this.models.has(key);
    this.models.delete(key);
    this.statusTransitions.delete(key);
    const history = this.versionHistory.get(name);
    if (history) {
      const idx = history.indexOf(version);
      if (idx >= 0) history.splice(idx, 1);
    }
    if (this.productionModels.get(name) === version) {
      this.productionModels.delete(name);
    }
    return exists;
  }

  getModelCount(): number {
    return this.models.size;
  }

  getWeights(name: string, version: string): { weights: number[][]; bias: number[] } | null {
    const key = this.getModelKey(name, version);
    const model = this.models.get(key);
    if (!model || !model.weights) return null;
    return { weights: model.weights, bias: model.bias ?? [] };
  }

  updateWeights(name: string, version: string, weights: number[][], bias: number[]): void {
    const key = this.getModelKey(name, version);
    const model = this.models.get(key);
    if (model) {
      model.weights = weights;
      model.bias = bias;
      model.metadata.updatedAt = Date.now();
    }
  }
}
