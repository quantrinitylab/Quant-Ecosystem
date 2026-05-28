import { HealthMetric, HealthProvider, MetricType } from '../types.js';

export interface HealthProviderInterface {
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  syncMetrics(from: number, to: number): Promise<HealthMetric[]>;
  getLatestMetric(type: MetricType): Promise<HealthMetric | null>;
}

export class MockHealthProvider implements HealthProviderInterface {
  private connected = false;

  async connect(): Promise<boolean> {
    this.connected = true;
    return true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async syncMetrics(from: number, to: number): Promise<HealthMetric[]> {
    const metrics: HealthMetric[] = [];
    const dayMs = 86400000;
    let day = from;
    let id = 0;
    while (day < to) {
      metrics.push({
        id: `mock-${id++}`,
        type: MetricType.steps,
        value: 5000 + Math.floor(Math.random() * 5000),
        unit: 'steps',
        timestamp: day,
        source: HealthProvider.google_fit,
      });
      metrics.push({
        id: `mock-${id++}`,
        type: MetricType.heartRate,
        value: 60 + Math.floor(Math.random() * 40),
        unit: 'bpm',
        timestamp: day,
        source: HealthProvider.google_fit,
      });
      day += dayMs;
    }
    return metrics;
  }

  async getLatestMetric(type: MetricType): Promise<HealthMetric | null> {
    if (!this.connected) return null;
    return {
      id: 'mock-latest',
      type,
      value: type === MetricType.heartRate ? 72 : 7500,
      unit: type === MetricType.heartRate ? 'bpm' : 'steps',
      timestamp: Date.now(),
      source: HealthProvider.google_fit,
    };
  }
}
