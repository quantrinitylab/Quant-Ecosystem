import { DailySummaryGenerator } from '../summary/daily-summary.js';
import { HealthStore } from '../store/health-store.js';
import { HealthProvider, MetricType } from '../types.js';

describe('DailySummaryGenerator', () => {
  let store: HealthStore;
  let generator: DailySummaryGenerator;

  beforeEach(() => {
    store = new HealthStore();
    generator = new DailySummaryGenerator(store);
    const day = new Date('2024-01-15T00:00:00Z').getTime();
    store.addMetric({
      id: 's1',
      type: MetricType.steps,
      value: 8000,
      unit: 'steps',
      timestamp: day + 3600000,
      source: HealthProvider.google_fit,
    });
    store.addMetric({
      id: 'h1',
      type: MetricType.heartRate,
      value: 70,
      unit: 'bpm',
      timestamp: day + 3600000,
      source: HealthProvider.google_fit,
    });
    store.addMetric({
      id: 'h2',
      type: MetricType.heartRate,
      value: 90,
      unit: 'bpm',
      timestamp: day + 7200000,
      source: HealthProvider.google_fit,
    });
    store.addMetric({
      id: 'c1',
      type: MetricType.calories,
      value: 300,
      unit: 'kcal',
      timestamp: day + 3600000,
      source: HealthProvider.google_fit,
    });
    store.addMetric({
      id: 'sl1',
      type: MetricType.sleep,
      value: 7,
      unit: 'hours',
      timestamp: day + 1000,
      source: HealthProvider.google_fit,
    });
  });

  it('should generate a summary for a date', () => {
    const summary = generator.generate('2024-01-15');
    expect(summary.date).toBe('2024-01-15');
    expect(summary.steps).toBe(8000);
    expect(summary.avgHeartRate).toBe(80);
    expect(summary.minHeartRate).toBe(70);
    expect(summary.maxHeartRate).toBe(90);
    expect(summary.caloriesBurned).toBe(300);
    expect(summary.sleepHours).toBe(7);
    // sleepQuality derived from hours: round((7/8)*100) = 88
    expect(summary.sleepQuality).toBe(88);
  });

  it('should compare to goals and return percentage', () => {
    const summary = generator.generate('2024-01-15');
    const goals = { dailySteps: 10000, sleepHours: 8, activeMinutes: 60, calories: 500 };
    const completion = generator.compareToGoals(summary, goals);
    expect(completion).toBeGreaterThan(0);
    expect(completion).toBeLessThanOrEqual(100);
  });

  it('should format summary in English', () => {
    const summary = generator.generate('2024-01-15');
    const text = generator.formatSummary(summary, 'en');
    expect(text).toContain('8000 steps');
    expect(text).toContain('80 bpm');
  });

  it('should format summary in Hindi', () => {
    const summary = generator.generate('2024-01-15');
    const text = generator.formatSummary(summary, 'hi');
    expect(text).toContain('8000 कदम');
    expect(text).toContain('हृदय गति');
  });
});
