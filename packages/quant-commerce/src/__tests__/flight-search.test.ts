import { FlightSearchEngine, MockFlightProvider } from '../travel/flight-search.js';
import { FlightResult, TravelProvider } from '../types.js';

function makeFlightResult(overrides: Partial<FlightResult> = {}): FlightResult {
  return {
    id: 'fl-1',
    airline: 'IndiGo',
    from: 'DEL',
    to: 'BLR',
    departureTime: 1700000000000,
    arrivalTime: 1700009000000,
    duration: 150,
    stops: 0,
    price: 4500,
    currency: 'INR',
    class: 'economy',
    provider: TravelProvider.indigo,
    ...overrides,
  };
}

describe('FlightSearchEngine', () => {
  let engine: FlightSearchEngine;
  let mockProvider: MockFlightProvider;

  beforeEach(() => {
    engine = new FlightSearchEngine();
    mockProvider = new MockFlightProvider();
    engine.addProvider(mockProvider);
  });

  it('should search flights and return results', async () => {
    mockProvider.setFlights([makeFlightResult(), makeFlightResult({ id: 'fl-2', price: 5500 })]);
    const results = await engine.searchFlights('DEL', 'BLR', '2024-03-01', 1, 'economy');
    expect(results).toHaveLength(2);
  });

  it('should compare flights by price then duration then stops', () => {
    const flights = [
      makeFlightResult({ id: 'fl-1', price: 6000, duration: 120, stops: 0 }),
      makeFlightResult({ id: 'fl-2', price: 4000, duration: 180, stops: 1 }),
      makeFlightResult({ id: 'fl-3', price: 4000, duration: 150, stops: 0 }),
    ];
    const sorted = engine.compareFlights(flights);
    expect(sorted[0]!.id).toBe('fl-3');
    expect(sorted[1]!.id).toBe('fl-2');
    expect(sorted[2]!.id).toBe('fl-1');
  });

  it('should prioritize India-origin flights', async () => {
    mockProvider.setFlights([
      makeFlightResult({ id: 'fl-1', from: 'LHR', to: 'BLR' }),
      makeFlightResult({ id: 'fl-2', from: 'DEL', to: 'BOM' }),
      makeFlightResult({ id: 'fl-3', from: 'JFK', to: 'DEL' }),
    ]);
    const results = await engine.searchFlights('DEL', 'BOM', '2024-03-01', 1, 'economy');
    expect(results[0]!.id).toBe('fl-2');
    expect(results[1]!.from).toBe('LHR');
  });

  it('should get flight details by id', async () => {
    mockProvider.setFlights([makeFlightResult({ id: 'fl-99' })]);
    const detail = await engine.getFlightDetails('fl-99');
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe('fl-99');
  });

  it('should return null for non-existent flight details', async () => {
    mockProvider.setFlights([]);
    const detail = await engine.getFlightDetails('not-found');
    expect(detail).toBeNull();
  });
});
