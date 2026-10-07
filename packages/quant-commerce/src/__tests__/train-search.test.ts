import { TrainSearchEngine, MockTrainProvider } from '../travel/train-search.js';
import { TrainResult, TrainProvider } from '../types.js';

function makeTrainResult(overrides: Partial<TrainResult> = {}): TrainResult {
  return {
    id: 'train-1',
    trainNumber: '12301',
    trainName: 'Rajdhani Express',
    from: 'NDLS',
    to: 'HWH',
    departureTime: 1700000000000,
    arrivalTime: 1700060000000,
    duration: 1000,
    classes: [
      { name: '3AC', availability: 50, price: 1500 },
      { name: '2AC', availability: 20, price: 2500 },
    ],
    provider: TrainProvider.irctc,
    ...overrides,
  };
}

describe('TrainSearchEngine', () => {
  let engine: TrainSearchEngine;
  let mockProvider: MockTrainProvider;

  beforeEach(() => {
    engine = new TrainSearchEngine();
    mockProvider = new MockTrainProvider();
    engine.addProvider(mockProvider);
  });

  it('should search trains and return results', async () => {
    mockProvider.setTrains([makeTrainResult(), makeTrainResult({ id: 'train-2' })]);
    const results = await engine.searchTrains('NDLS', 'HWH', '2024-03-01');
    expect(results).toHaveLength(2);
  });

  it('should check availability for a train', async () => {
    const avail = await engine.checkAvailability('train-1', '3AC', '2024-03-01');
    expect(avail).toBe(42);
  });

  it('should get seat map', async () => {
    const seats = await engine.getSeatMap('train-1', '3AC');
    expect(seats.length).toBeGreaterThan(0);
  });

  it('should detect tatkal window for AC (10AM-12PM IST)', () => {
    // 10:30 IST = 05:00 UTC
    const inWindow = new Date('2024-03-01T05:00:00Z');
    const result = engine.supportsTatkal(inWindow);
    expect(result.ac).toBe(true);
  });

  it('should detect tatkal window for sleeper (11AM-12PM IST)', () => {
    // 11:30 IST = 06:00 UTC
    const inWindow = new Date('2024-03-01T06:00:00Z');
    const result = engine.supportsTatkal(inWindow);
    expect(result.sleeper).toBe(true);
    expect(result.ac).toBe(true);
  });

  it('should reject tatkal outside window', () => {
    // 9AM IST = 03:30 UTC
    const outsideWindow = new Date('2024-03-01T03:30:00Z');
    const result = engine.supportsTatkal(outsideWindow);
    expect(result.ac).toBe(false);
    expect(result.sleeper).toBe(false);
  });

  it('should allow tatkal booking when in window', () => {
    const inWindow = new Date('2024-03-01T05:00:00Z');
    const result = engine.bookTatkal('train-1', '2AC', inWindow);
    expect(result.eligible).toBe(true);
  });

  it('should reject tatkal booking outside window', () => {
    const outsideWindow = new Date('2024-03-01T03:30:00Z');
    const result = engine.bookTatkal('train-1', '2AC', outsideWindow);
    expect(result.eligible).toBe(false);
  });
});
