import { describe, it, expect } from 'vitest';
import { BrowserRUM } from '../browser-rum.js';

describe('BrowserRUM', () => {
  it('collects web vitals and rates them', () => {
    const rum = new BrowserRUM();
    const metrics = rum.collectWebVitals([
      { name: 'LCP', value: 2000 },
      { name: 'FID', value: 50 },
      { name: 'CLS', value: 0.05 },
      { name: 'TTFB', value: 500 },
      { name: 'INP', value: 150 },
    ]);

    expect(metrics).toHaveLength(5);
    expect(metrics[0]!.name).toBe('LCP');
    expect(metrics[0]!.rating).toBe('good');
    expect(metrics[1]!.name).toBe('FID');
    expect(metrics[1]!.rating).toBe('good');
    expect(metrics[2]!.name).toBe('CLS');
    expect(metrics[2]!.rating).toBe('good');
  });

  it('rates poor metrics correctly', () => {
    const rum = new BrowserRUM();
    const metrics = rum.collectWebVitals([
      { name: 'LCP', value: 5000 },
      { name: 'FID', value: 400 },
      { name: 'CLS', value: 0.3 },
    ]);

    expect(metrics[0]!.rating).toBe('poor');
    expect(metrics[1]!.rating).toBe('poor');
    expect(metrics[2]!.rating).toBe('poor');
  });

  it('rates needs-improvement metrics correctly', () => {
    const rum = new BrowserRUM();
    const metrics = rum.collectWebVitals([{ name: 'LCP', value: 3000 }]);

    expect(metrics[0]!.rating).toBe('needs-improvement');
  });

  it('tracks user journeys', () => {
    const rum = new BrowserRUM();
    const journey = rum.trackUserJourney([
      { name: 'login', startTime: 0, endTime: 1000, success: true },
      { name: 'navigate', startTime: 1000, endTime: 1500, success: true },
      { name: 'action', startTime: 1500, endTime: 2000, success: true },
    ]);

    expect(journey.success).toBe(true);
    expect(journey.totalDuration).toBe(2000);
    expect(journey.steps).toHaveLength(3);
  });

  it('marks journey as failed when a step fails', () => {
    const rum = new BrowserRUM();
    const journey = rum.trackUserJourney([
      { name: 'login', startTime: 0, endTime: 1000, success: true },
      { name: 'action', startTime: 1000, endTime: 2000, success: false },
    ]);

    expect(journey.success).toBe(false);
  });

  it('reports errors with context', () => {
    const rum = new BrowserRUM();
    const error = rum.reportError(new Error('Test error'), { page: '/home' });

    expect(error.message).toBe('Test error');
    expect(error.context).toEqual({ page: '/home' });
    expect(error.stack).toBeDefined();
  });

  it('reports string errors', () => {
    const rum = new BrowserRUM();
    const error = rum.reportError('Something went wrong');

    expect(error.message).toBe('Something went wrong');
    expect(error.stack).toBeUndefined();
  });

  it('measures interactions', () => {
    const rum = new BrowserRUM();
    const measurement = rum.measureInteraction('button_click', 150);

    expect(measurement.name).toBe('button_click');
    expect(measurement.duration).toBe(150);
    expect(measurement.timestamp).toBeGreaterThan(0);
  });

  it('flushes batch when batch size is reached', () => {
    const rum = new BrowserRUM({ batchSize: 3 });

    rum.measureInteraction('click1', 10);
    rum.measureInteraction('click2', 20);
    expect(rum.getBatchSize()).toBe(2);

    rum.measureInteraction('click3', 30);
    // Batch should have been auto-flushed
    expect(rum.getBatchSize()).toBe(0);
  });

  it('returns collected data via getters', () => {
    const rum = new BrowserRUM({ batchSize: 100 });
    rum.collectWebVitals([{ name: 'LCP', value: 2000 }]);
    rum.reportError('err');
    rum.measureInteraction('click', 50);

    expect(rum.getVitals()).toHaveLength(1);
    expect(rum.getErrors()).toHaveLength(1);
    expect(rum.getInteractions()).toHaveLength(1);
    expect(rum.getJourneys()).toHaveLength(0);
  });
});
