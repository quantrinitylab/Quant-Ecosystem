/**
 * ============================================================================
 * Modern Events Calendar (MEC) Interactive Seating Chart & Tiered Reservation Engine
 * Provides commercial-grade seating chart layout, tiered pricing (VIP, Standard,
 * Balcony), temporary mutex seat reservation locks with auto-expiry, and booking
 * finalization for @quant/quantmail.
 * ============================================================================
 */

export type SeatTier = 'VIP' | 'STANDARD' | 'BALCONY';
export type SeatStatus = 'AVAILABLE' | 'LOCKED' | 'BOOKED';

export interface EventSeat {
  id: string; // e.g. "A-1"
  row: string;
  number: number;
  tier: SeatTier;
  price: number;
  status: SeatStatus;
  lockedByUserId?: string;
  lockExpiresAt?: number; // timestamp ms
  bookedByUserId?: string;
  bookedAt?: string;
}

export interface SeatingChart {
  eventId: string;
  name: string;
  totalSeats: number;
  availableSeats: number;
  seats: EventSeat[];
}

export interface SeatingTierSummary {
  tier: SeatTier;
  total: number;
  available: number;
  locked: number;
  booked: number;
  price: number;
}

export interface SeatingChartSummary {
  eventId: string;
  totalSeats: number;
  availableSeats: number;
  lockedSeats: number;
  bookedSeats: number;
  tiers: Record<SeatTier, SeatingTierSummary>;
  projectedRevenue: number;
  bookedRevenue: number;
}

export const TIER_PRICE_MULTIPLIERS: Record<SeatTier, number> = {
  VIP: 2.0,
  STANDARD: 1.0,
  BALCONY: 0.8,
};

// In-memory store for seating charts keyed by eventId
const seatingChartsStore = new Map<string, SeatingChart>();

/**
 * Converts a 0-based row index into a letter representation:
 * 0 -> 'A', 1 -> 'B', ... 25 -> 'Z', 26 -> 'AA', etc.
 */
export function getRowLabel(rowIndex: number): string {
  let label = '';
  let num = rowIndex;
  while (num >= 0) {
    label = String.fromCharCode(65 + (num % 26)) + label;
    num = Math.floor(num / 26) - 1;
  }
  return label;
}

/**
 * Helper to update availableSeats count on a seating chart.
 */
function updateAvailableSeats(chart: SeatingChart): void {
  chart.availableSeats = chart.seats.filter((s) => s.status === 'AVAILABLE').length;
}

/**
 * Creates a new seating chart for an event with row generation, seat numbering,
 * tier assignments, and price calculation based on base price and tier multipliers.
 */
export function createSeatingChart(
  eventId: string,
  rows: number,
  seatsPerRow: number,
  tierLayout?: Record<string, SeatTier>,
  basePrice: number = 100,
  name?: string,
): SeatingChart {
  if (!eventId || eventId.trim() === '') {
    throw new Error('Event ID is required');
  }
  if (!Number.isInteger(rows) || rows <= 0) {
    throw new Error('Rows must be a positive integer');
  }
  if (!Number.isInteger(seatsPerRow) || seatsPerRow <= 0) {
    throw new Error('Seats per row must be a positive integer');
  }

  const seats: EventSeat[] = [];
  const base = Math.max(0, basePrice);

  for (let r = 0; r < rows; r++) {
    const rowLabel = getRowLabel(r);
    for (let s = 1; s <= seatsPerRow; s++) {
      const seatId = `${rowLabel}-${s}`;

      // Resolve tier from layout: seat ID takes precedence over row label, defaulting to STANDARD
      const tier: SeatTier = tierLayout?.[seatId] || tierLayout?.[rowLabel] || 'STANDARD';

      const multiplier = TIER_PRICE_MULTIPLIERS[tier] ?? 1.0;
      const price = Math.round(base * multiplier * 100) / 100;

      seats.push({
        id: seatId,
        row: rowLabel,
        number: s,
        tier,
        price,
        status: 'AVAILABLE',
      });
    }
  }

  const chart: SeatingChart = {
    eventId,
    name: name || `Seating Chart - ${eventId}`,
    totalSeats: seats.length,
    availableSeats: seats.length,
    seats,
  };

  seatingChartsStore.set(eventId, chart);
  return chart;
}

/**
 * Acquires a temporary reservation mutex lock on a seat.
 * Prevents double-booking during checkout. Automatically handles expired locks.
 */
export function lockSeat(
  eventId: string,
  seatId: string,
  userId: string,
  holdDurationSeconds: number = 600,
): { success: boolean; seat?: EventSeat; error?: string } {
  if (!eventId || !seatId || !userId) {
    return { success: false, error: 'INVALID_PARAMETERS' };
  }

  const chart = seatingChartsStore.get(eventId);
  if (!chart) {
    return { success: false, error: 'SEATING_CHART_NOT_FOUND' };
  }

  const seat = chart.seats.find((s) => s.id === seatId);
  if (!seat) {
    return { success: false, error: 'SEAT_NOT_FOUND' };
  }

  if (seat.status === 'BOOKED') {
    return { success: false, error: 'SEAT_ALREADY_BOOKED' };
  }

  const now = Date.now();

  // If seat is currently locked, check if the lock has expired
  if (seat.status === 'LOCKED') {
    const isExpired = seat.lockExpiresAt !== undefined && seat.lockExpiresAt < now;
    if (!isExpired && seat.lockedByUserId !== userId) {
      return { success: false, error: 'SEAT_ALREADY_LOCKED' };
    }
  }

  // Acquire / refresh the lock
  const holdSeconds = Math.max(1, holdDurationSeconds);
  seat.status = 'LOCKED';
  seat.lockedByUserId = userId;
  seat.lockExpiresAt = now + holdSeconds * 1000;

  updateAvailableSeats(chart);
  return { success: true, seat };
}

/**
 * Confirms and finalizes booking for a seat.
 * Seat must either be locked by the same user or currently available.
 */
export function bookSeat(
  eventId: string,
  seatId: string,
  userId: string,
): { success: boolean; seat?: EventSeat; error?: string } {
  if (!eventId || !seatId || !userId) {
    return { success: false, error: 'INVALID_PARAMETERS' };
  }

  const chart = seatingChartsStore.get(eventId);
  if (!chart) {
    return { success: false, error: 'SEATING_CHART_NOT_FOUND' };
  }

  const seat = chart.seats.find((s) => s.id === seatId);
  if (!seat) {
    return { success: false, error: 'SEAT_NOT_FOUND' };
  }

  if (seat.status === 'BOOKED') {
    return { success: false, error: 'SEAT_ALREADY_BOOKED' };
  }

  const now = Date.now();

  if (seat.status === 'LOCKED') {
    const isExpired = seat.lockExpiresAt !== undefined && seat.lockExpiresAt < now;
    if (!isExpired && seat.lockedByUserId !== userId) {
      return { success: false, error: 'SEAT_ALREADY_LOCKED' };
    }
  }

  // Finalize booking
  seat.status = 'BOOKED';
  seat.bookedByUserId = userId;
  seat.bookedAt = new Date().toISOString();
  delete seat.lockedByUserId;
  delete seat.lockExpiresAt;

  updateAvailableSeats(chart);
  return { success: true, seat };
}

/**
 * Releases all expired locks for a given event, returning seats to 'AVAILABLE'.
 * Returns the count of seats released.
 */
export function releaseExpiredLocks(eventId: string): number {
  const chart = seatingChartsStore.get(eventId);
  if (!chart) {
    return 0;
  }

  const now = Date.now();
  let releasedCount = 0;

  for (const seat of chart.seats) {
    if (seat.status === 'LOCKED' && seat.lockExpiresAt !== undefined && seat.lockExpiresAt < now) {
      seat.status = 'AVAILABLE';
      delete seat.lockedByUserId;
      delete seat.lockExpiresAt;
      releasedCount++;
    }
  }

  if (releasedCount > 0) {
    updateAvailableSeats(chart);
  }

  return releasedCount;
}

/**
 * Manually releases a reservation lock held by a specific user (or admin).
 */
export function releaseSeatLock(
  eventId: string,
  seatId: string,
  userId: string,
): { success: boolean; error?: string } {
  const chart = seatingChartsStore.get(eventId);
  if (!chart) {
    return { success: false, error: 'SEATING_CHART_NOT_FOUND' };
  }

  const seat = chart.seats.find((s) => s.id === seatId);
  if (!seat) {
    return { success: false, error: 'SEAT_NOT_FOUND' };
  }

  if (seat.status !== 'LOCKED') {
    return { success: false, error: 'SEAT_NOT_LOCKED' };
  }

  if (seat.lockedByUserId !== userId) {
    return { success: false, error: 'UNAUTHORIZED_LOCK_RELEASE' };
  }

  seat.status = 'AVAILABLE';
  delete seat.lockedByUserId;
  delete seat.lockExpiresAt;

  updateAvailableSeats(chart);
  return { success: true };
}

/**
 * Retrieves the seating chart for an event, automatically releasing any expired locks first.
 */
export function getSeatingChart(eventId: string): SeatingChart | null {
  const chart = seatingChartsStore.get(eventId);
  if (!chart) {
    return null;
  }

  releaseExpiredLocks(eventId);
  return chart;
}

/**
 * Retrieves a single seat by eventId and seatId.
 */
export function getSeatById(eventId: string, seatId: string): EventSeat | null {
  const chart = seatingChartsStore.get(eventId);
  if (!chart) return null;
  return chart.seats.find((s) => s.id === seatId) || null;
}

/**
 * Generates an aggregated summary of seats and revenue projections by tier.
 */
export function getSeatingChartSummary(eventId: string): SeatingChartSummary | null {
  const chart = getSeatingChart(eventId);
  if (!chart) return null;

  const tiers: Record<SeatTier, SeatingTierSummary> = {
    VIP: { tier: 'VIP', total: 0, available: 0, locked: 0, booked: 0, price: 0 },
    STANDARD: { tier: 'STANDARD', total: 0, available: 0, locked: 0, booked: 0, price: 0 },
    BALCONY: { tier: 'BALCONY', total: 0, available: 0, locked: 0, booked: 0, price: 0 },
  };

  let totalSeats = 0;
  let availableSeats = 0;
  let lockedSeats = 0;
  let bookedSeats = 0;
  let projectedRevenue = 0;
  let bookedRevenue = 0;

  for (const seat of chart.seats) {
    totalSeats++;
    const t = tiers[seat.tier];
    t.total++;
    t.price = seat.price;
    projectedRevenue += seat.price;

    if (seat.status === 'AVAILABLE') {
      availableSeats++;
      t.available++;
    } else if (seat.status === 'LOCKED') {
      lockedSeats++;
      t.locked++;
    } else if (seat.status === 'BOOKED') {
      bookedSeats++;
      t.booked++;
      bookedRevenue += seat.price;
    }
  }

  return {
    eventId,
    totalSeats,
    availableSeats,
    lockedSeats,
    bookedSeats,
    tiers,
    projectedRevenue: Math.round(projectedRevenue * 100) / 100,
    bookedRevenue: Math.round(bookedRevenue * 100) / 100,
  };
}

/**
 * Clears in-memory seating chart store for clean test isolation.
 */
export function clearSeatingForTesting(): void {
  seatingChartsStore.clear();
}
