// ============================================================================
// Tests for dual-mode (real serving backend + naive fallback) core components
// ============================================================================

import { describe, it, expect, vi } from 'vitest';

import { AnomalyDetector } from '../core/anomaly-detector';
import type { AnomalyInferenceBackend } from '../core/anomaly-detector';
import { AutoMLPipeline } from '../core/automl-pipeline';
import type { AutoMLBackend } from '../core/automl-pipeline';
import { FeatureStore } from '../core/feature-store';
import type { FeatureStoreBackend } from '../core/feature-store';
import { ImageFeatureExtractor } from '../core/image-features';
import type { ImageFeatureBackend } from '../core/image-features';
import { ModelMonitor } from '../core/model-monitor';
import type { ModelMonitorBackend } from '../core/model-monitor';
import { TimeSeriesForecaster } from '../core/time-series-forecaster';
import type { ForecastBackend } from '../core/time-series-forecaster';
import { TrainingPipeline } from '../core/training-pipeline';
import type { TrainingBackend } from '../core/training-pipeline';
import type { AutoMLConfig, Feature, Forecast, DriftReport, TrainingResult } from '../types';

// ---------------------------------------------------------------------------
// AnomalyDetector
// ---------------------------------------------------------------------------
describe('AnomalyDetector dual-mode', () => {
  it('uses the injected backend for detectServed', async () => {
    const backend: AnomalyInferenceBackend = {
      detect: vi.fn().mockResolvedValue({ score: 0.91, isAnomaly: true }),
      detectBatch: vi.fn().mockResolvedValue([{ score: 0.8, isAnomaly: true }]),
      isAvailable: () => true,
    };
    const detector = new AnomalyDetector({ method: 'zscore' }, backend);

    expect(detector.isServed()).toBe(true);
    const result = await detector.detectServed([1, 2, 3]);
    expect(result.score).toBe(0.91);
    expect(result.isAnomaly).toBe(true);
    expect(backend.detect).toHaveBeenCalledWith([1, 2, 3]);
  });

  it('delegates batches to the backend for detectBatchServed', async () => {
    const backend: AnomalyInferenceBackend = {
      detect: vi.fn().mockResolvedValue({ score: 0.1, isAnomaly: false }),
      detectBatch: vi.fn().mockResolvedValue([
        { score: 0.2, isAnomaly: false },
        { score: 0.95, isAnomaly: true },
      ]),
      isAvailable: () => true,
    };
    const detector = new AnomalyDetector({}, backend);
    const results = await detector.detectBatchServed([
      [1, 2],
      [3, 4],
    ]);
    expect(results).toHaveLength(2);
    expect(results[1]!.isAnomaly).toBe(true);
  });

  it('falls back to the naive path when no backend is configured', async () => {
    const detector = new AnomalyDetector({ method: 'zscore' }, null);
    detector.fit([
      [1, 1],
      [1.1, 0.9],
      [0.9, 1.1],
    ]);

    expect(detector.isServed()).toBe(false);
    const result = await detector.detectServed([1, 1]);
    expect(result.method).toBe('zscore');
    expect(typeof result.score).toBe('number');
  });

  it('falls back to the naive path when the backend throws', async () => {
    const backend: AnomalyInferenceBackend = {
      detect: vi.fn().mockRejectedValue(new Error('inference down')),
      detectBatch: vi.fn().mockRejectedValue(new Error('inference down')),
      isAvailable: () => true,
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const detector = new AnomalyDetector({ method: 'zscore' }, backend);
    detector.fit([
      [1, 1],
      [2, 2],
    ]);

    const result = await detector.detectServed([1, 1]);
    expect(result.method).toBe('zscore');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// AutoMLPipeline
// ---------------------------------------------------------------------------
describe('AutoMLPipeline dual-mode', () => {
  function makeConfig(): AutoMLConfig {
    return {
      searchSpace: {
        parameters: [{ name: 'lr', type: 'continuous', range: [0.01, 0.1] }],
        method: 'random',
        maxTrials: 3,
      },
      metric: 'accuracy',
      maximize: true,
      cv: 3,
      earlyTermination: false,
    };
  }

  it('uses the injected backend for searchServed and merges results', async () => {
    const backend: AutoMLBackend = {
      search: vi.fn().mockResolvedValue([
        { trialId: 0, config: { lr: 0.05 }, metric: 0.8, duration: 5, status: 'completed' },
        { trialId: 1, config: { lr: 0.07 }, metric: 0.92, duration: 6, status: 'completed' },
      ]),
      isAvailable: () => true,
    };
    const pipeline = new AutoMLPipeline(makeConfig(), backend);

    expect(pipeline.isServed()).toBe(true);
    const trials = await pipeline.searchServed(() => 0.5);
    expect(trials).toHaveLength(2);
    expect(pipeline.getBestTrial()?.metric).toBe(0.92);
    expect(pipeline.getAllTrials()).toHaveLength(2);
  });

  it('falls back to naive random search when no backend is configured', async () => {
    const pipeline = new AutoMLPipeline(makeConfig(), null);
    expect(pipeline.isServed()).toBe(false);
    const trials = await pipeline.searchServed((params) => Number(params['lr']));
    expect(trials).toHaveLength(3);
  });

  it('falls back to naive random search when the backend throws', async () => {
    const backend: AutoMLBackend = {
      search: vi.fn().mockRejectedValue(new Error('autopilot offline')),
      isAvailable: () => true,
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const pipeline = new AutoMLPipeline(makeConfig(), backend);
    const trials = await pipeline.searchServed((params) => Number(params['lr']));
    expect(trials).toHaveLength(3);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// FeatureStore
// ---------------------------------------------------------------------------
describe('FeatureStore dual-mode', () => {
  function backendFeature(value: number): Feature {
    return { name: 'age', dtype: 'numeric', value, timestamp: Date.now(), entityId: 'user-1' };
  }

  it('reads from the injected backend for getFeatureServed', async () => {
    const backend: FeatureStoreBackend = {
      fetchFeatures: vi.fn().mockResolvedValue([backendFeature(99)]),
      isAvailable: () => true,
    };
    const store = new FeatureStore({}, backend);

    expect(store.isServed()).toBe(true);
    const feature = await store.getFeatureServed('user-1', 'age');
    expect(feature?.value).toBe(99);
    expect(backend.fetchFeatures).toHaveBeenCalledWith('user-1', ['age']);
  });

  it('reads a feature set from the injected backend', async () => {
    const backend: FeatureStoreBackend = {
      fetchFeatures: vi.fn().mockResolvedValue([backendFeature(42)]),
      isAvailable: () => true,
    };
    const store = new FeatureStore({}, backend);
    const set = await store.getFeatureSetServed('user-1', ['age']);
    expect(set.features).toHaveLength(1);
    expect(set.features[0]!.value).toBe(42);
  });

  it('falls back to the in-memory cache when no backend is configured', async () => {
    const store = new FeatureStore({}, null);
    store.registerFeature({ name: 'age', dtype: 'numeric', transforms: [] });
    store.computeFeature('user-1', 'age', 7);

    expect(store.isServed()).toBe(false);
    const feature = await store.getFeatureServed('user-1', 'age');
    expect(feature?.value).toBe(7);
  });

  it('falls back to the in-memory cache when the backend throws', async () => {
    const backend: FeatureStoreBackend = {
      fetchFeatures: vi.fn().mockRejectedValue(new Error('feast unavailable')),
      isAvailable: () => true,
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const store = new FeatureStore({}, backend);
    store.registerFeature({ name: 'age', dtype: 'numeric', transforms: [] });
    store.computeFeature('user-1', 'age', 13);

    const feature = await store.getFeatureServed('user-1', 'age');
    expect(feature?.value).toBe(13);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// ImageFeatureExtractor
// ---------------------------------------------------------------------------
describe('ImageFeatureExtractor dual-mode', () => {
  const image = [
    [0, 1, 0, 1],
    [1, 0, 1, 0],
    [0, 1, 0, 1],
    [1, 0, 1, 0],
  ];

  it('uses the injected backend for extractFeaturesServed', async () => {
    const backend: ImageFeatureBackend = {
      extract: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      isAvailable: () => true,
    };
    const extractor = new ImageFeatureExtractor(backend);

    expect(extractor.isServed()).toBe(true);
    const features = await extractor.extractFeaturesServed(image);
    expect(features).toEqual([0.1, 0.2, 0.3]);
    expect(backend.extract).toHaveBeenCalledWith(image);
  });

  it('falls back to the naive extractor when no backend is configured', async () => {
    const extractor = new ImageFeatureExtractor(null);
    expect(extractor.isServed()).toBe(false);
    const features = await extractor.extractFeaturesServed(image);
    expect(features.length).toBeGreaterThan(0);
  });

  it('falls back to the naive extractor when the backend throws', async () => {
    const backend: ImageFeatureBackend = {
      extract: vi.fn().mockRejectedValue(new Error('clip down')),
      isAvailable: () => true,
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const extractor = new ImageFeatureExtractor(backend);
    const features = await extractor.extractFeaturesServed(image);
    expect(features.length).toBeGreaterThan(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// ModelMonitor
// ---------------------------------------------------------------------------
describe('ModelMonitor dual-mode', () => {
  function makeReport(): DriftReport {
    return {
      modelName: 'm1',
      reportTime: Date.now(),
      featureDrifts: [
        { feature: 'f1', psi: 0.6, drifted: true },
        { feature: 'f2', psi: 0.01, drifted: false },
      ],
      predictionDrift: { psi: 0.5, drifted: true },
      performanceMetrics: { f1: 0.7 },
      alerts: [
        {
          metric: 'f1',
          expected: 0.25,
          actual: 0.6,
          severity: 'high',
          timestamp: Date.now(),
          modelName: 'm1',
          description: 'drift',
        },
      ],
    };
  }

  it('uses the injected backend for checkDriftServed and records alerts', async () => {
    const backend: ModelMonitorBackend = {
      detectDrift: vi.fn().mockResolvedValue(makeReport()),
      isAvailable: () => true,
    };
    const monitor = new ModelMonitor('m1', {}, backend);
    monitor.setBaseline(new Map([['f1', [1, 2, 3]]]), [0.1, 0.2]);
    monitor.recordFeature('f1', 9);

    expect(monitor.isServed()).toBe(true);
    const report = await monitor.checkDriftServed();
    expect(report.predictionDrift.drifted).toBe(true);
    expect(monitor.shouldRetrain()).toBe(true);
    expect(monitor.getRecentAlerts().length).toBeGreaterThan(0);
    expect(backend.detectDrift).toHaveBeenCalled();
  });

  it('falls back to naive drift detection when no backend is configured', async () => {
    const monitor = new ModelMonitor('m1', {}, null);
    monitor.setBaseline(new Map([['f1', [1, 2, 3, 4]]]), [0.1, 0.2, 0.3]);
    monitor.recordFeature('f1', 2);
    monitor.recordFeature('f1', 3);

    expect(monitor.isServed()).toBe(false);
    const report = await monitor.checkDriftServed();
    expect(report.modelName).toBe('m1');
    expect(Array.isArray(report.featureDrifts)).toBe(true);
  });

  it('falls back to naive drift detection when the backend throws', async () => {
    const backend: ModelMonitorBackend = {
      detectDrift: vi.fn().mockRejectedValue(new Error('evidently down')),
      isAvailable: () => true,
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const monitor = new ModelMonitor('m1', {}, backend);
    monitor.setBaseline(new Map([['f1', [1, 2, 3, 4]]]), [0.1, 0.2]);
    monitor.recordFeature('f1', 2);

    const report = await monitor.checkDriftServed();
    expect(report.modelName).toBe('m1');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// TimeSeriesForecaster
// ---------------------------------------------------------------------------
describe('TimeSeriesForecaster dual-mode', () => {
  const forecast: Forecast[] = [{ point: 5, lower: 4, upper: 6, timestamp: 1000 }];

  it('uses the injected backend for forecastServed', async () => {
    const backend: ForecastBackend = {
      forecast: vi.fn().mockResolvedValue(forecast),
      isAvailable: () => true,
    };
    const forecaster = new TimeSeriesForecaster(backend);
    forecaster.addData([
      { timestamp: 1, value: 1 },
      { timestamp: 2, value: 2 },
    ]);

    expect(forecaster.isServed()).toBe(true);
    const result = await forecaster.forecastServed(1);
    expect(result).toEqual(forecast);
    expect(backend.forecast).toHaveBeenCalled();
  });

  it('falls back to naive smoothing when no backend is configured', async () => {
    const forecaster = new TimeSeriesForecaster(null);
    forecaster.addData([
      { timestamp: 1, value: 10 },
      { timestamp: 2, value: 12 },
      { timestamp: 3, value: 11 },
    ]);

    expect(forecaster.isServed()).toBe(false);
    const result = await forecaster.forecastServed(2);
    expect(result).toHaveLength(2);
  });

  it('falls back to naive smoothing when the backend throws', async () => {
    const backend: ForecastBackend = {
      forecast: vi.fn().mockRejectedValue(new Error('prophet down')),
      isAvailable: () => true,
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const forecaster = new TimeSeriesForecaster(backend);
    forecaster.addData([
      { timestamp: 1, value: 10 },
      { timestamp: 2, value: 12 },
    ]);

    const result = await forecaster.forecastServed(1);
    expect(result).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// TrainingPipeline
// ---------------------------------------------------------------------------
describe('TrainingPipeline dual-mode', () => {
  function makeResult(): TrainingResult {
    return {
      finalLoss: 0.12,
      finalMetrics: {
        accuracy: 0.95,
        precision: 0.9,
        recall: 0.92,
        f1: 0.91,
        auc: 0.97,
        mse: 0.01,
        mae: 0.05,
      },
      epochsCompleted: 10,
      trainingTime: 1234,
      history: [],
      bestEpoch: 8,
      converged: true,
    };
  }

  const features = Array.from({ length: 16 }, (_, i) => [i % 2, (i + 1) % 2]);
  const labels = Array.from({ length: 16 }, (_, i) => i % 2);

  it('uses the injected backend for trainServed', async () => {
    const backend: TrainingBackend = {
      train: vi.fn().mockResolvedValue(makeResult()),
      isAvailable: () => true,
    };
    const pipeline = new TrainingPipeline({ epochs: 3 }, backend);

    expect(pipeline.isServed()).toBe(true);
    const result = await pipeline.trainServed(features, labels);
    expect(result.finalMetrics.accuracy).toBe(0.95);
    expect(result.converged).toBe(true);
    expect(backend.train).toHaveBeenCalled();
  });

  it('falls back to the naive training loop when no backend is configured', async () => {
    const pipeline = new TrainingPipeline({ epochs: 3 }, null);
    expect(pipeline.isServed()).toBe(false);
    const result = await pipeline.trainServed(features, labels);
    expect(result.epochsCompleted).toBeGreaterThan(0);
    expect(result.history.length).toBeGreaterThan(0);
  });

  it('falls back to the naive training loop when the backend throws', async () => {
    const backend: TrainingBackend = {
      train: vi.fn().mockRejectedValue(new Error('training cluster down')),
      isAvailable: () => true,
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const pipeline = new TrainingPipeline({ epochs: 3 }, backend);
    const result = await pipeline.trainServed(features, labels);
    expect(result.epochsCompleted).toBeGreaterThan(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
