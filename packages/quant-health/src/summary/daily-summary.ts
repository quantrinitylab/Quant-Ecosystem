import { DailySummary, HealthGoals, MetricType } from '../types.js';
import { HealthStore } from '../store/health-store.js';

export class DailySummaryGenerator {
  constructor(private store: HealthStore) {}

  generate(date: string): DailySummary {
    const start = new Date(date).getTime();
    const end = start + 86400000;
    const hrMetrics = this.store.getMetrics(MetricType.heartRate, start, end);
    const hrValues = hrMetrics.map((m) => m.value);
    const avgHr = hrValues.length ? hrValues.reduce((a, b) => a + b, 0) / hrValues.length : 0;
    const minHr = hrValues.length ? Math.min(...hrValues) : 0;
    const maxHr = hrValues.length ? Math.max(...hrValues) : 0;

    const sleepHours = this.store.getDailyAggregate(MetricType.sleep, date);
    // Derive sleep quality from hours: 0 if no data, otherwise scale based on 8h target (capped at 100)
    const sleepQuality = sleepHours > 0 ? Math.min(Math.round((sleepHours / 8) * 100), 100) : 0;

    const calories = this.store.getDailyAggregate(MetricType.calories, date);

    return {
      date,
      steps: this.store.getDailyAggregate(MetricType.steps, date),
      sleepHours,
      sleepQuality,
      avgHeartRate: Math.round(avgHr),
      minHeartRate: minHr,
      maxHeartRate: maxHr,
      // activeMinutes derived as calories / 5 assumes ~5 kcal burned per active minute.
      // This is a rough placeholder estimate; a production implementation should use
      // actual activity duration data from workout sessions.
      activeMinutes: Math.round(calories / 5),
      caloriesBurned: calories,
      goalCompletion: 0,
    };
  }

  compareToGoals(summary: DailySummary, goals: HealthGoals): number {
    const stepsPct = Math.min(summary.steps / goals.dailySteps, 1);
    const sleepPct = Math.min(summary.sleepHours / goals.sleepHours, 1);
    const activePct = Math.min(summary.activeMinutes / goals.activeMinutes, 1);
    const calPct = Math.min(summary.caloriesBurned / goals.calories, 1);
    return Math.round(((stepsPct + sleepPct + activePct + calPct) / 4) * 100);
  }

  formatSummary(summary: DailySummary, language: 'en' | 'hi'): string {
    if (language === 'hi') {
      return `${summary.date}: ${summary.steps} कदम, ${summary.sleepHours} घंटे नींद, हृदय गति ${summary.avgHeartRate} bpm, ${summary.caloriesBurned} कैलोरी`;
    }
    return `${summary.date}: ${summary.steps} steps, ${summary.sleepHours}h sleep, HR ${summary.avgHeartRate} bpm, ${summary.caloriesBurned} cal burned`;
  }
}
