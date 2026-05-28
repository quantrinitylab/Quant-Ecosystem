import { WorkoutCoach } from '../coaching/workout-coach.js';
import { HealthStore } from '../store/health-store.js';
import { WorkoutSession } from '../types.js';

describe('WorkoutCoach', () => {
  let coach: WorkoutCoach;

  beforeEach(() => {
    const store = new HealthStore();
    coach = new WorkoutCoach(store);
  });

  it('should return a valid suggestion', () => {
    const workouts: WorkoutSession[] = [
      {
        id: 'w1',
        type: 'running',
        startTime: Date.now() - 3600000,
        endTime: Date.now(),
        caloriesBurned: 300,
        avgHeartRate: 140,
        distance: 5,
        notes: '',
      },
    ];
    const suggestion = coach.getSuggestion(workouts);
    expect(suggestion.type).toBeTruthy();
    expect(suggestion.duration).toBeGreaterThan(0);
    expect(suggestion.intensity).toBeTruthy();
    expect(suggestion.description).toBeTruthy();
  });

  it('should suggest a different workout type than recent ones', () => {
    const workouts: WorkoutSession[] = [
      {
        id: 'w1',
        type: 'running',
        startTime: 0,
        endTime: 3600000,
        caloriesBurned: 300,
        avgHeartRate: 140,
        distance: 5,
        notes: '',
      },
      {
        id: 'w2',
        type: 'cycling',
        startTime: 0,
        endTime: 3600000,
        caloriesBurned: 250,
        avgHeartRate: 130,
        distance: 10,
        notes: '',
      },
    ];
    const suggestion = coach.getSuggestion(workouts);
    expect(suggestion.type).not.toBe('running');
    expect(suggestion.type).not.toBe('cycling');
  });

  it('should increase difficulty with high consistency', () => {
    const newLevel = coach.progressiveDifficulty(5, 0.9);
    expect(newLevel).toBeGreaterThan(5);
  });

  it('should not increase difficulty with low consistency', () => {
    const newLevel = coach.progressiveDifficulty(5, 0.2);
    expect(newLevel).toBe(5);
  });

  it('should generate a 7-day plan for each workout type', () => {
    const types: Array<'walking' | 'running' | 'yoga' | 'cycling'> = [
      'walking',
      'running',
      'yoga',
      'cycling',
    ];
    for (const type of types) {
      const plan = coach.generatePlan(type, 5);
      expect(plan).toHaveLength(7);
      expect(plan[0]!.day).toBe(1);
      expect(plan[6]!.day).toBe(7);
    }
  });
});
