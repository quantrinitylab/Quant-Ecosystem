// ============================================================================
// Browser RUM - Real User Monitoring for Web Vitals and User Journeys
// ============================================================================

import {
  WebVitalMetric,
  UserJourneyStep,
  UserJourneyRecord,
  RUMError,
  InteractionMeasurement,
  RUMConfig,
} from './types';

export class BrowserRUM {
  private config: RUMConfig;
  private vitals: WebVitalMetric[] = [];
  private journeys: UserJourneyRecord[] = [];
  private errors: RUMError[] = [];
  private interactions: InteractionMeasurement[] = [];
  private batch: Array<Record<string, unknown>> = [];

  constructor(config?: Partial<RUMConfig>) {
    this.config = {
      endpoint: config?.endpoint ?? 'http://localhost:4318/v1/metrics',
      batchSize: config?.batchSize ?? 10,
      flushInterval: config?.flushInterval ?? 5000,
      sampleRate: config?.sampleRate ?? 1.0,
    };
  }

  /**
   * Collect Web Vitals metrics (CLS, FID, LCP, TTFB, INP).
   */
  collectWebVitals(
    metrics: Array<{ name: WebVitalMetric['name']; value: number }>,
  ): WebVitalMetric[] {
    const collected: WebVitalMetric[] = [];

    for (const metric of metrics) {
      const vital: WebVitalMetric = {
        name: metric.name,
        value: metric.value,
        rating: this.rateMetric(metric.name, metric.value),
        timestamp: Date.now(),
      };

      this.vitals.push(vital);
      collected.push(vital);
      this.addToBatch({ type: 'web_vital', ...vital });
    }

    this.flushIfNeeded();
    return collected;
  }

  /**
   * Track a multi-step user journey.
   */
  trackUserJourney(steps: UserJourneyStep[]): UserJourneyRecord {
    const totalDuration = steps.reduce((sum, s) => sum + (s.endTime - s.startTime), 0);
    const success = steps.every((s) => s.success);

    const journey: UserJourneyRecord = {
      id: this.generateId(),
      name: steps.map((s) => s.name).join(' -> '),
      steps,
      totalDuration,
      success,
      timestamp: Date.now(),
    };

    this.journeys.push(journey);
    this.addToBatch({ type: 'user_journey', ...journey });
    this.flushIfNeeded();
    return journey;
  }

  /**
   * Report an error with context.
   */
  reportError(error: Error | string, context: Record<string, unknown> = {}): RUMError {
    const rumError: RUMError = {
      message: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      context,
      timestamp: Date.now(),
    };

    this.errors.push(rumError);
    this.addToBatch({ type: 'error', ...rumError });
    this.flushIfNeeded();
    return rumError;
  }

  /**
   * Measure a user interaction by name and duration.
   */
  measureInteraction(name: string, duration: number): InteractionMeasurement {
    const measurement: InteractionMeasurement = {
      name,
      duration,
      timestamp: Date.now(),
    };

    this.interactions.push(measurement);
    this.addToBatch({ type: 'interaction', ...measurement });
    this.flushIfNeeded();
    return measurement;
  }

  /**
   * Get all collected vitals.
   */
  getVitals(): WebVitalMetric[] {
    return [...this.vitals];
  }

  /**
   * Get all tracked journeys.
   */
  getJourneys(): UserJourneyRecord[] {
    return [...this.journeys];
  }

  /**
   * Get all reported errors.
   */
  getErrors(): RUMError[] {
    return [...this.errors];
  }

  /**
   * Get all interaction measurements.
   */
  getInteractions(): InteractionMeasurement[] {
    return [...this.interactions];
  }

  /**
   * Get the current batch size.
   */
  getBatchSize(): number {
    return this.batch.length;
  }

  /**
   * Flush the current batch to the OTel endpoint.
   */
  flush(): Array<Record<string, unknown>> {
    const flushed = [...this.batch];
    this.batch = [];
    return flushed;
  }

  private addToBatch(entry: Record<string, unknown>): void {
    if (Math.random() > this.config.sampleRate) {
      return;
    }
    this.batch.push(entry);
  }

  private flushIfNeeded(): void {
    if (this.batch.length >= this.config.batchSize) {
      this.flush();
    }
  }

  private rateMetric(name: WebVitalMetric['name'], value: number): WebVitalMetric['rating'] {
    const thresholds: Record<WebVitalMetric['name'], { good: number; poor: number }> = {
      CLS: { good: 0.1, poor: 0.25 },
      FID: { good: 100, poor: 300 },
      LCP: { good: 2500, poor: 4000 },
      TTFB: { good: 800, poor: 1800 },
      INP: { good: 200, poor: 500 },
    };

    const threshold = thresholds[name];
    if (value <= threshold.good) return 'good';
    if (value >= threshold.poor) return 'poor';
    return 'needs-improvement';
  }

  private generateId(): string {
    return `rum_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }
}
