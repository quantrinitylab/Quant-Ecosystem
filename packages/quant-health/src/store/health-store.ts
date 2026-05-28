import { HealthMetric, MetricType } from '../types.js';

export class HealthStore {
  private metrics: Map<string, HealthMetric> = new Map();

  addMetric(metric: HealthMetric): void {
    this.metrics.set(metric.id, metric);
  }

  getMetrics(type: MetricType, startDate: number, endDate: number): HealthMetric[] {
    const result: HealthMetric[] = [];
    for (const m of this.metrics.values()) {
      if (m.type === type && m.timestamp >= startDate && m.timestamp < endDate) {
        result.push(m);
      }
    }
    return result;
  }

  getDailyAggregate(type: MetricType, date: string): number {
    const start = new Date(date).getTime();
    const end = start + 86400000;
    const dayMetrics = this.getMetrics(type, start, end);
    if (dayMetrics.length === 0) return 0;
    const sum = dayMetrics.reduce((acc, m) => acc + m.value, 0);
    if (type === MetricType.heartRate || type === MetricType.spo2) {
      return sum / dayMetrics.length;
    }
    return sum;
  }

  getTrend(type: MetricType, days = 7, referenceTime = Date.now()): number[] {
    const result: number[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const dayStart = referenceTime - (i + 1) * 86400000;
      const dayEnd = dayStart + 86400000;
      const dayMetrics = this.getMetrics(type, dayStart, dayEnd);
      if (dayMetrics.length === 0) {
        result.push(0);
      } else {
        const sum = dayMetrics.reduce((acc, m) => acc + m.value, 0);
        if (type === MetricType.heartRate || type === MetricType.spo2) {
          result.push(sum / dayMetrics.length);
        } else {
          result.push(sum);
        }
      }
    }
    return result;
  }

  getAll(): HealthMetric[] {
    return [...this.metrics.values()];
  }
}
