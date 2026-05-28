import { HealthStore } from '../store/health-store.js';
import { HealthMetric, HealthProvider, MetricType } from '../types.js';

function makeMetric(overrides: Partial<HealthMetric> = {}): HealthMetric {
  return {
    id: 'test-1',
    type: MetricType.steps,
    value: 5000,
    unit: 'steps',
    timestamp: new Date('2024-01-15T10:00:00Z').getTime(),
    source: HealthProvider.google_fit,
    ...overrides,
  };
}

describe('HealthStore', () => {
  let store: HealthStore;

  beforeEach(() => {
    store = new HealthStore();
  });

  it('should add and retrieve metrics', () => {
    const metric = makeMetric();
    store.addMetric(metric);
    expect(store.getAll()).toHaveLength(1);
    expect(store.getAll()[0]).toEqual(metric);
  });

  it('should filter metrics by type and date range', () => {
    const day = new Date('2024-01-15T00:00:00Z').getTime();
    store.addMetric(makeMetric({ id: '1', type: MetricType.steps, timestamp: day + 3600000 }));
    store.addMetric(makeMetric({ id: '2', type: MetricType.heartRate, timestamp: day + 3600000 }));
    store.addMetric(
      makeMetric({ id: '3', type: MetricType.steps, timestamp: day + 86400000 + 1000 }),
    );

    const results = store.getMetrics(MetricType.steps, day, day + 86400000);
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('1');
  });

  it('should compute daily aggregate as sum for steps', () => {
    const day = new Date('2024-01-15T00:00:00Z').getTime();
    store.addMetric(makeMetric({ id: '1', value: 3000, timestamp: day + 1000 }));
    store.addMetric(makeMetric({ id: '2', value: 2000, timestamp: day + 5000 }));

    expect(store.getDailyAggregate(MetricType.steps, '2024-01-15')).toBe(5000);
  });

  it('should compute daily aggregate as average for heartRate', () => {
    const day = new Date('2024-01-15T00:00:00Z').getTime();
    store.addMetric(
      makeMetric({ id: '1', type: MetricType.heartRate, value: 60, timestamp: day + 1000 }),
    );
    store.addMetric(
      makeMetric({ id: '2', type: MetricType.heartRate, value: 80, timestamp: day + 5000 }),
    );

    expect(store.getDailyAggregate(MetricType.heartRate, '2024-01-15')).toBe(70);
  });

  it('should return trend array for last N days', () => {
    const trend = store.getTrend(MetricType.steps, 7);
    expect(trend).toHaveLength(7);
    expect(trend.every((v) => v === 0)).toBe(true);
  });

  it('should accept referenceTime parameter for deterministic trends', () => {
    const refTime = new Date('2024-01-16T00:00:00Z').getTime();
    const day15Start = new Date('2024-01-15T00:00:00Z').getTime();
    store.addMetric(makeMetric({ id: '1', value: 3000, timestamp: day15Start + 1000 }));
    store.addMetric(makeMetric({ id: '2', value: 2000, timestamp: day15Start + 5000 }));

    const trend = store.getTrend(MetricType.steps, 1, refTime);
    expect(trend).toHaveLength(1);
    expect(trend[0]).toBe(5000);
  });

  it('should sum steps in trend (consistent with getDailyAggregate)', () => {
    const refTime = new Date('2024-01-16T00:00:00Z').getTime();
    const day15Start = new Date('2024-01-15T00:00:00Z').getTime();
    store.addMetric(makeMetric({ id: '1', value: 3000, timestamp: day15Start + 1000 }));
    store.addMetric(makeMetric({ id: '2', value: 2000, timestamp: day15Start + 5000 }));

    const trend = store.getTrend(MetricType.steps, 1, refTime);
    const aggregate = store.getDailyAggregate(MetricType.steps, '2024-01-15');
    expect(trend[0]).toBe(aggregate);
  });

  it('should average heartRate in trend (consistent with getDailyAggregate)', () => {
    const refTime = new Date('2024-01-16T00:00:00Z').getTime();
    const day15Start = new Date('2024-01-15T00:00:00Z').getTime();
    store.addMetric(
      makeMetric({ id: '1', type: MetricType.heartRate, value: 60, timestamp: day15Start + 1000 }),
    );
    store.addMetric(
      makeMetric({ id: '2', type: MetricType.heartRate, value: 80, timestamp: day15Start + 5000 }),
    );

    const trend = store.getTrend(MetricType.heartRate, 1, refTime);
    const aggregate = store.getDailyAggregate(MetricType.heartRate, '2024-01-15');
    expect(trend[0]).toBe(aggregate);
    expect(trend[0]).toBe(70);
  });
});
