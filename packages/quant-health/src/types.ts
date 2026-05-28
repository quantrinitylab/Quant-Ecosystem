export enum MetricType {
  steps = 'steps',
  heartRate = 'heartRate',
  sleep = 'sleep',
  calories = 'calories',
  weight = 'weight',
  bloodPressure = 'bloodPressure',
  bloodGlucose = 'bloodGlucose',
  spo2 = 'spo2',
}

export enum HealthProvider {
  apple_healthkit = 'apple_healthkit',
  google_fit = 'google_fit',
  samsung_health = 'samsung_health',
  fitbit = 'fitbit',
  garmin = 'garmin',
  abdm = 'abdm',
}

export interface HealthMetric {
  id: string;
  type: MetricType;
  value: number;
  unit: string;
  timestamp: number;
  source: HealthProvider;
}

export interface DailySummary {
  date: string;
  steps: number;
  sleepHours: number;
  sleepQuality: number;
  avgHeartRate: number;
  minHeartRate: number;
  maxHeartRate: number;
  activeMinutes: number;
  caloriesBurned: number;
  goalCompletion: number;
}

export interface WorkoutSession {
  id: string;
  type: 'walking' | 'running' | 'yoga' | 'cycling';
  startTime: number;
  endTime: number;
  caloriesBurned: number;
  avgHeartRate: number;
  distance: number | null;
  notes: string;
}

export interface SleepSession {
  id: string;
  startTime: number;
  endTime: number;
  quality: number;
  deepSleepMinutes: number;
  remSleepMinutes: number;
  lightSleepMinutes: number;
  awakeMinutes: number;
}

export interface MedicationReminder {
  id: string;
  name: string;
  dosage: string;
  frequency: 'daily' | 'twice_daily' | 'weekly' | 'as_needed';
  times: string[];
  nextDue: number;
  adherenceRate: number;
  interactions: string[];
}

export interface CrisisSignal {
  detected: boolean;
  keywords: string[];
  helplines: { name: string; number: string }[];
  message: string;
}

export interface HealthGoals {
  dailySteps: number;
  sleepHours: number;
  activeMinutes: number;
  calories: number;
}
