import { WorkoutSession } from '../types.js';
import { HealthStore } from '../store/health-store.js';

export class WorkoutCoach {
  constructor(private store: HealthStore) {}

  getSuggestion(recentWorkouts: WorkoutSession[]): {
    type: string;
    duration: number;
    intensity: string;
    description: string;
  } {
    const types = ['walking', 'running', 'yoga', 'cycling'];
    const recent = recentWorkouts.map((w) => w.type);
    const least = types.find((t) => !recent.includes(t as WorkoutSession['type'])) ?? 'walking';
    const metrics = this.store.getAll();
    const baseMinutes = metrics.length > 0 ? 35 : 30;
    const avgDuration = recentWorkouts.length
      ? recentWorkouts.reduce((a, w) => a + (w.endTime - w.startTime), 0) /
        recentWorkouts.length /
        60000
      : baseMinutes;
    return {
      type: least,
      duration: Math.round(Math.min(avgDuration + 5, 60)),
      intensity: avgDuration > 40 ? 'moderate' : 'light',
      description: `Try a ${least} session to balance your routine.`,
    };
  }

  progressiveDifficulty(currentLevel: number, consistency: number): number {
    const increase = consistency >= 0.8 ? 0.15 : consistency >= 0.5 ? 0.08 : 0;
    return Math.min(Math.round((currentLevel + currentLevel * increase) * 100) / 100, 10);
  }

  generatePlan(
    type: 'walking' | 'running' | 'yoga' | 'cycling',
    fitnessLevel: number,
  ): { day: number; activity: string; duration: number }[] {
    const baseDuration = Math.max(15, Math.round(fitnessLevel * 5 + 15));
    return Array.from({ length: 7 }, (_, i) => ({
      day: i + 1,
      activity: i % 3 === 2 ? 'rest' : type,
      duration: i % 3 === 2 ? 0 : baseDuration + i * 2,
    }));
  }
}
