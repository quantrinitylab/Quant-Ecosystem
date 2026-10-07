import { FlightResult } from '../types.js';

export interface FlightSearchProvider {
  searchFlights(
    from: string,
    to: string,
    date: string,
    passengers: number,
    travelClass: string,
  ): Promise<FlightResult[]>;
  getFlightDetails(id: string): Promise<FlightResult | null>;
  compareFlights(flights: FlightResult[]): FlightResult[];
}

export class FlightSearchEngine implements FlightSearchProvider {
  private providers: FlightSearchProvider[] = [];

  addProvider(provider: FlightSearchProvider): void {
    this.providers.push(provider);
  }

  async searchFlights(
    from: string,
    to: string,
    date: string,
    passengers: number,
    travelClass: string,
  ): Promise<FlightResult[]> {
    const all: FlightResult[] = [];
    for (const p of this.providers) {
      try {
        all.push(...(await p.searchFlights(from, to, date, passengers, travelClass)));
      } catch {
        /* skip */
      }
    }
    return this.prioritizeIndiaRoutes(all);
  }

  async getFlightDetails(id: string): Promise<FlightResult | null> {
    for (const p of this.providers) {
      try {
        const r = await p.getFlightDetails(id);
        if (r) return r;
      } catch {
        /* skip */
      }
    }
    return null;
  }

  compareFlights(flights: FlightResult[]): FlightResult[] {
    return [...flights].sort(
      (a, b) => a.price - b.price || a.duration - b.duration || a.stops - b.stops,
    );
  }

  prioritizeIndiaRoutes(flights: FlightResult[]): FlightResult[] {
    const india = ['DEL', 'BOM', 'BLR', 'MAA', 'HYD', 'CCU', 'GOI', 'COK', 'PNQ'];
    const top: FlightResult[] = [];
    const rest: FlightResult[] = [];
    for (const f of flights) (india.includes(f.from) ? top : rest).push(f);
    return [...top, ...rest];
  }
}

export class MockFlightProvider implements FlightSearchProvider {
  private flights: FlightResult[] = [];
  setFlights(flights: FlightResult[]): void {
    this.flights = flights;
  }
  async searchFlights(): Promise<FlightResult[]> {
    return this.flights;
  }
  async getFlightDetails(id: string): Promise<FlightResult | null> {
    return this.flights.find((f) => f.id === id) ?? null;
  }
  compareFlights(flights: FlightResult[]): FlightResult[] {
    return [...flights].sort((a, b) => a.price - b.price);
  }
}
