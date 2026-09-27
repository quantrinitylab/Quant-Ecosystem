// @vitest-environment node
/**
 * ============================================================================
 * Modern Events Calendar (MEC) Seating Chart & Tiered Reservation Vitest Suite
 * Validates seating chart generation, row labeling, tiered pricing multipliers,
 * temporary reservation mutex locks, double-booking prevention, lock expiration,
 * and final booking confirmation for @quant/quantmail.
 * ============================================================================
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createSeatingChart,
  lockSeat,
  bookSeat,
  releaseExpiredLocks,
  getSeatingChart,
  getSeatById,
  releaseSeatLock,
  getSeatingChartSummary,
  clearSeatingForTesting,
  getRowLabel,
  TIER_PRICE_MULTIPLIERS,
  type SeatTier,
} from '../services/seating-chart.service';

describe('Modern Events Calendar (MEC) Seating Chart & Tiered Reservation Engine', () => {
  const eventId = 'evt_mec_gala_2026';
  const user1 = 'usr_alice_123';
  const user2 = 'usr_bob_456';

  beforeEach(() => {
    clearSeatingForTesting();
    vi.restoreAllMocks();
  });

  describe('1. Seating Chart Generation & Tier Multipliers', () => {
    it('generates rows, seats, and applies tier price multipliers accurately', () => {
      const tierLayout: Record<string, SeatTier> = {
        A: 'VIP',
        B: 'STANDARD',
        C: 'BALCONY',
      };

      const chart = createSeatingChart(eventId, 3, 4, tierLayout, 100);

      expect(chart.eventId).toBe(eventId);
      expect(chart.totalSeats).toBe(12);
      expect(chart.availableSeats).toBe(12);
      expect(chart.seats).toHaveLength(12);

      // Verify Row A (VIP: 2.0x -> 200)
      const seatA1 = chart.seats.find((s) => s.id === 'A-1');
      expect(seatA1).toBeDefined();
      expect(seatA1?.row).toBe('A');
      expect(seatA1?.number).toBe(1);
      expect(seatA1?.tier).toBe('VIP');
      expect(seatA1?.price).toBe(200);
      expect(seatA1?.status).toBe('AVAILABLE');

      // Verify Row B (STANDARD: 1.0x -> 100)
      const seatB2 = chart.seats.find((s) => s.id === 'B-2');
      expect(seatB2).toBeDefined();
      expect(seatB2?.row).toBe('B');
      expect(seatB2?.number).toBe(2);
      expect(seatB2?.tier).toBe('STANDARD');
      expect(seatB2?.price).toBe(100);
      expect(seatB2?.status).toBe('AVAILABLE');

      // Verify Row C (BALCONY: 0.8x -> 80)
      const seatC4 = chart.seats.find((s) => s.id === 'C-4');
      expect(seatC4).toBeDefined();
      expect(seatC4?.row).toBe('C');
      expect(seatC4?.number).toBe(4);
      expect(seatC4?.tier).toBe('BALCONY');
      expect(seatC4?.price).toBe(80);
      expect(seatC4?.status).toBe('AVAILABLE');
    });

    it('defaults to STANDARD tier with 1.0x pricing when tierLayout is omitted', () => {
      const chart = createSeatingChart('evt_standard_only', 2, 3, undefined, 75);

      expect(chart.totalSeats).toBe(6);
      for (const seat of chart.seats) {
        expect(seat.tier).toBe('STANDARD');
        expect(seat.price).toBe(75);
        expect(seat.status).toBe('AVAILABLE');
      }
    });

    it('allows seat-level tier override over row-level tier layout', () => {
      const tierLayout: Record<string, SeatTier> = {
        A: 'STANDARD',
        'A-1': 'VIP', // specific seat override
      };

      const chart = createSeatingChart('evt_override', 1, 3, tierLayout, 100);
      const seatA1 = chart.seats.find((s) => s.id === 'A-1');
      const seatA2 = chart.seats.find((s) => s.id === 'A-2');

      expect(seatA1?.tier).toBe('VIP');
      expect(seatA1?.price).toBe(200);
      expect(seatA2?.tier).toBe('STANDARD');
      expect(seatA2?.price).toBe(100);
    });

    it('validates input parameters for creating seating charts', () => {
      expect(() => createSeatingChart('', 2, 2)).toThrow('Event ID is required');
      expect(() => createSeatingChart('evt_1', 0, 5)).toThrow('Rows must be a positive integer');
      expect(() => createSeatingChart('evt_1', -1, 5)).toThrow('Rows must be a positive integer');
      expect(() => createSeatingChart('evt_1', 2, 0)).toThrow(
        'Seats per row must be a positive integer',
      );
      expect(() => createSeatingChart('evt_1', 2, -3)).toThrow(
        'Seats per row must be a positive integer',
      );
    });

    it('generates multi-character row labels for large venues (Row AA, AB...)', () => {
      expect(getRowLabel(0)).toBe('A');
      expect(getRowLabel(25)).toBe('Z');
      expect(getRowLabel(26)).toBe('AA');
      expect(getRowLabel(27)).toBe('AB');
    });
  });

  describe('2. Seat Reservation Temporary Mutex Lock', () => {
    beforeEach(() => {
      createSeatingChart(eventId, 2, 2, { A: 'VIP', B: 'STANDARD' }, 100);
    });

    it('locks an available seat and sets status to LOCKED with expiration timestamp', () => {
      const before = Date.now();
      const res = lockSeat(eventId, 'A-1', user1, 300); // 5 min hold

      expect(res.success).toBe(true);
      expect(res.seat).toBeDefined();
      expect(res.seat?.id).toBe('A-1');
      expect(res.seat?.status).toBe('LOCKED');
      expect(res.seat?.lockedByUserId).toBe(user1);
      expect(res.seat?.lockExpiresAt).toBeGreaterThanOrEqual(before + 300 * 1000);

      // Verify chart available seats count decremented
      const chart = getSeatingChart(eventId);
      expect(chart?.availableSeats).toBe(3);
    });

    it('defaults hold duration to 600 seconds (10 minutes)', () => {
      const now = 1770000000000;
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const res = lockSeat(eventId, 'B-1', user1);
      expect(res.success).toBe(true);
      expect(res.seat?.lockExpiresAt).toBe(now + 600 * 1000);
    });

    it('rejects locking when seat is already locked by another user and lock is active', () => {
      // Alice locks seat A-1
      lockSeat(eventId, 'A-1', user1, 600);

      // Bob attempts to lock seat A-1
      const bobRes = lockSeat(eventId, 'A-1', user2, 600);
      expect(bobRes.success).toBe(false);
      expect(bobRes.error).toBe('SEAT_ALREADY_LOCKED');
      expect(bobRes.seat).toBeUndefined();
    });

    it('allows same user to refresh or extend their lock', () => {
      lockSeat(eventId, 'A-1', user1, 300);
      const extendRes = lockSeat(eventId, 'A-1', user1, 900);

      expect(extendRes.success).toBe(true);
      expect(extendRes.seat?.lockedByUserId).toBe(user1);
      expect(extendRes.seat?.status).toBe('LOCKED');
    });

    it('allows another user to lock if previous lock has expired', () => {
      let mockTime = 1770000000000;
      vi.spyOn(Date, 'now').mockImplementation(() => mockTime);

      // Alice locks for 60 seconds
      lockSeat(eventId, 'A-1', user1, 60);

      // Advance time past expiration
      mockTime += 65 * 1000;

      // Bob should now successfully acquire the lock
      const bobRes = lockSeat(eventId, 'A-1', user2, 300);
      expect(bobRes.success).toBe(true);
      expect(bobRes.seat?.lockedByUserId).toBe(user2);
    });

    it('returns error when locking non-existent event or seat', () => {
      const nonEvent = lockSeat('non_existent', 'A-1', user1);
      expect(nonEvent.success).toBe(false);
      expect(nonEvent.error).toBe('SEATING_CHART_NOT_FOUND');

      const nonSeat = lockSeat(eventId, 'Z-99', user1);
      expect(nonSeat.success).toBe(false);
      expect(nonSeat.error).toBe('SEAT_NOT_FOUND');
    });

    it('rejects locking an already booked seat', () => {
      bookSeat(eventId, 'A-1', user1);
      const lockRes = lockSeat(eventId, 'A-1', user2);
      expect(lockRes.success).toBe(false);
      expect(lockRes.error).toBe('SEAT_ALREADY_BOOKED');
    });
  });

  describe('3. Booking Finalization', () => {
    beforeEach(() => {
      createSeatingChart(eventId, 2, 2, { A: 'VIP', B: 'STANDARD' }, 100);
    });

    it('finalizes booking for a user who currently holds the seat lock', () => {
      lockSeat(eventId, 'A-1', user1, 600);

      const bookRes = bookSeat(eventId, 'A-1', user1);
      expect(bookRes.success).toBe(true);
      expect(bookRes.seat).toBeDefined();
      expect(bookRes.seat?.status).toBe('BOOKED');
      expect(bookRes.seat?.bookedByUserId).toBe(user1);
      expect(bookRes.seat?.bookedAt).toBeDefined();
      expect(bookRes.seat?.lockedByUserId).toBeUndefined();
      expect(bookRes.seat?.lockExpiresAt).toBeUndefined();

      // Chart available seats count reflects booked seat
      const chart = getSeatingChart(eventId);
      expect(chart?.availableSeats).toBe(3);
    });

    it('allows direct booking of an available seat without prior lock', () => {
      const bookRes = bookSeat(eventId, 'A-2', user2);
      expect(bookRes.success).toBe(true);
      expect(bookRes.seat?.status).toBe('BOOKED');
      expect(bookRes.seat?.bookedByUserId).toBe(user2);
    });

    it('rejects booking when seat is locked by another user with an active lock', () => {
      lockSeat(eventId, 'A-1', user1, 600);

      const bobBook = bookSeat(eventId, 'A-1', user2);
      expect(bobBook.success).toBe(false);
      expect(bobBook.error).toBe('SEAT_ALREADY_LOCKED');
    });

    it('rejects booking when seat is already booked', () => {
      bookSeat(eventId, 'A-1', user1);

      const duplicate = bookSeat(eventId, 'A-1', user2);
      expect(duplicate.success).toBe(false);
      expect(duplicate.error).toBe('SEAT_ALREADY_BOOKED');
    });

    it('returns error when booking non-existent event or seat', () => {
      const nonEvent = bookSeat('invalid_event', 'A-1', user1);
      expect(nonEvent.success).toBe(false);
      expect(nonEvent.error).toBe('SEATING_CHART_NOT_FOUND');

      const nonSeat = bookSeat(eventId, 'X-99', user1);
      expect(nonSeat.success).toBe(false);
      expect(nonSeat.error).toBe('SEAT_NOT_FOUND');
    });
  });

  describe('4. Expired Locks Auto-Release', () => {
    beforeEach(() => {
      createSeatingChart(eventId, 2, 2, { A: 'VIP', B: 'STANDARD' }, 100);
    });

    it('releases expired locks and reverts seats back to AVAILABLE', () => {
      let mockTime = 1770000000000;
      vi.spyOn(Date, 'now').mockImplementation(() => mockTime);

      // Lock seat A-1 for 60 seconds and A-2 for 600 seconds
      lockSeat(eventId, 'A-1', user1, 60);
      lockSeat(eventId, 'A-2', user2, 600);

      // Verify both are locked
      expect(getSeatById(eventId, 'A-1')?.status).toBe('LOCKED');
      expect(getSeatById(eventId, 'A-2')?.status).toBe('LOCKED');

      // Fast forward 120 seconds (A-1 expired, A-2 still active)
      mockTime += 120 * 1000;

      const released = releaseExpiredLocks(eventId);
      expect(released).toBe(1);

      const seatA1 = getSeatById(eventId, 'A-1');
      expect(seatA1?.status).toBe('AVAILABLE');
      expect(seatA1?.lockedByUserId).toBeUndefined();
      expect(seatA1?.lockExpiresAt).toBeUndefined();

      const seatA2 = getSeatById(eventId, 'A-2');
      expect(seatA2?.status).toBe('LOCKED');
      expect(seatA2?.lockedByUserId).toBe(user2);
    });

    it('getSeatingChart automatically cleans expired locks before returning', () => {
      let mockTime = 1770000000000;
      vi.spyOn(Date, 'now').mockImplementation(() => mockTime);

      lockSeat(eventId, 'B-1', user1, 30);
      mockTime += 45 * 1000;

      const chart = getSeatingChart(eventId);
      expect(chart).toBeDefined();
      const seatB1 = chart?.seats.find((s) => s.id === 'B-1');
      expect(seatB1?.status).toBe('AVAILABLE');
      expect(chart?.availableSeats).toBe(4);
    });

    it('returns 0 released locks if event does not exist', () => {
      expect(releaseExpiredLocks('unknown_event')).toBe(0);
    });
  });

  describe('5. Manual Seat Lock Release', () => {
    beforeEach(() => {
      createSeatingChart(eventId, 2, 2, undefined, 50);
    });

    it('allows the lock holder to explicitly release their seat lock', () => {
      lockSeat(eventId, 'A-1', user1, 600);
      const res = releaseSeatLock(eventId, 'A-1', user1);

      expect(res.success).toBe(true);
      const seat = getSeatById(eventId, 'A-1');
      expect(seat?.status).toBe('AVAILABLE');
      expect(seat?.lockedByUserId).toBeUndefined();
    });

    it('prevents another user from releasing a lock they do not hold', () => {
      lockSeat(eventId, 'A-1', user1, 600);
      const res = releaseSeatLock(eventId, 'A-1', user2);

      expect(res.success).toBe(false);
      expect(res.error).toBe('UNAUTHORIZED_LOCK_RELEASE');
      expect(getSeatById(eventId, 'A-1')?.status).toBe('LOCKED');
    });

    it('handles release request on non-locked seat gracefully', () => {
      const res = releaseSeatLock(eventId, 'A-1', user1);
      expect(res.success).toBe(false);
      expect(res.error).toBe('SEAT_NOT_LOCKED');
    });
  });

  describe('6. Seating Chart Summary & Revenue Metrics', () => {
    it('aggregates tier counts, statuses, and revenue calculations accurately', () => {
      // 1 Row VIP ($200), 1 Row Standard ($100), 1 Row Balcony ($80), 2 seats each = 6 seats total
      createSeatingChart(eventId, 3, 2, { A: 'VIP', B: 'STANDARD', C: 'BALCONY' }, 100);

      // Book 1 VIP ($200) and 1 Standard ($100)
      bookSeat(eventId, 'A-1', user1);
      bookSeat(eventId, 'B-1', user2);

      // Lock 1 Balcony ($80)
      lockSeat(eventId, 'C-1', user1, 600);

      const summary = getSeatingChartSummary(eventId);
      expect(summary).toBeDefined();
      expect(summary?.totalSeats).toBe(6);
      expect(summary?.availableSeats).toBe(3);
      expect(summary?.lockedSeats).toBe(1);
      expect(summary?.bookedSeats).toBe(2);

      // Revenue:
      // VIP: 2 * 200 = 400
      // STANDARD: 2 * 100 = 200
      // BALCONY: 2 * 80 = 160
      // Total Projected: 400 + 200 + 160 = 760
      // Booked Revenue: 200 + 100 = 300
      expect(summary?.projectedRevenue).toBe(760);
      expect(summary?.bookedRevenue).toBe(300);

      // Tier breakdowns
      expect(summary?.tiers.VIP.total).toBe(2);
      expect(summary?.tiers.VIP.booked).toBe(1);
      expect(summary?.tiers.VIP.available).toBe(1);

      expect(summary?.tiers.BALCONY.total).toBe(2);
      expect(summary?.tiers.BALCONY.locked).toBe(1);
      expect(summary?.tiers.BALCONY.available).toBe(1);
    });

    it('returns null summary for non-existent event', () => {
      expect(getSeatingChartSummary('non_existent')).toBeNull();
    });
  });
});
