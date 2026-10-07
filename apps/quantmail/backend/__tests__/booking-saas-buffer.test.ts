// @vitest-environment node
/**
 * ============================================================================
 * Booking SaaS Meeting Buffers & Custom Intake Form Schema Vitest Suite
 * Tests Calendly-superior meeting buffers, daily booking caps, and dynamic
 * custom visitor intake question validation for @quant/quantmail.
 * ============================================================================
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createBookingPolicy,
  getBookingPolicy,
  clearPoliciesForTesting,
  applyMeetingBuffers,
  validateSlotWithBuffers,
  checkDailyCap,
  validateIntakeSubmission,
  type BookingPolicy,
  type CustomIntakeField,
  type TimeSlot,
} from '../services/booking-buffer.service';

describe('Booking SaaS Meeting Buffers & Custom Intake Form Schema', () => {
  beforeEach(() => {
    clearPoliciesForTesting();
  });

  describe('Policy Persistence & Retrieval', () => {
    it('creates and retrieves a host booking policy with buffers and custom intake fields', () => {
      const customFields: CustomIntakeField[] = [
        {
          id: 'company',
          label: 'Company Name',
          type: 'text',
          required: true,
          placeholder: 'Acme Corp',
        },
        {
          id: 'phone',
          label: 'Phone Number',
          type: 'phone',
          required: false,
          placeholder: '+1 555-0199',
        },
        {
          id: 'budget',
          label: 'Estimated Budget',
          type: 'dropdown',
          required: true,
          options: ['< $5k', '$5k - $25k', '$25k - $100k', '> $100k'],
        },
        { id: 'notes', label: 'Meeting Goals', type: 'textarea', required: false },
        { id: 'nda', label: 'Accept Mutual NDA', type: 'checkbox', required: true },
      ];

      const policy: BookingPolicy = {
        linkId: 'alex-consulting-30m',
        bufferBeforeMinutes: 10,
        bufferAfterMinutes: 15,
        maxBookingsPerDay: 4,
        customFields,
      };

      const created = createBookingPolicy(policy);
      expect(created.linkId).toBe('alex-consulting-30m');
      expect(created.bufferBeforeMinutes).toBe(10);
      expect(created.bufferAfterMinutes).toBe(15);
      expect(created.maxBookingsPerDay).toBe(4);
      expect(created.customFields).toHaveLength(5);

      const retrieved = getBookingPolicy('alex-consulting-30m');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.linkId).toBe('alex-consulting-30m');
      expect(retrieved?.customFields[2].options).toEqual([
        '< $5k',
        '$5k - $25k',
        '$25k - $100k',
        '> $100k',
      ]);
    });

    it('returns null for nonexistent policy linkId', () => {
      expect(getBookingPolicy('unknown-link-xyz')).toBeNull();
    });

    it('clears all policies when clearPoliciesForTesting is called', () => {
      createBookingPolicy({
        linkId: 'link-1',
        bufferBeforeMinutes: 5,
        bufferAfterMinutes: 5,
        maxBookingsPerDay: 2,
        customFields: [],
      });
      expect(getBookingPolicy('link-1')).not.toBeNull();
      clearPoliciesForTesting();
      expect(getBookingPolicy('link-1')).toBeNull();
    });
  });

  describe('applyMeetingBuffers', () => {
    it('properly expands slot boundaries before and after using ISO timestamps', () => {
      const slot: TimeSlot = {
        start: '2026-10-15T10:00:00.000Z',
        end: '2026-10-15T10:30:00.000Z',
      };

      // 10 minutes before, 15 minutes after
      const buffered = applyMeetingBuffers(slot, 10, 15);

      expect(buffered.bufferedStart).toBe('2026-10-15T09:50:00.000Z');
      expect(buffered.bufferedEnd).toBe('2026-10-15T10:45:00.000Z');
    });

    it('properly expands slot boundaries before and after using HH:mm time strings', () => {
      const slot: TimeSlot = {
        start: '14:00',
        end: '14:45',
      };

      // 15m before, 20m after
      const buffered = applyMeetingBuffers(slot, 15, 20);

      expect(buffered.bufferedStart).toBe('13:45');
      expect(buffered.bufferedEnd).toBe('15:05');
    });

    it('handles zero buffer times cleanly without changing slot boundaries', () => {
      const slot: TimeSlot = {
        start: '2026-10-15T16:00:00.000Z',
        end: '2026-10-15T17:00:00.000Z',
      };

      const buffered = applyMeetingBuffers(slot, 0, 0);

      expect(buffered.bufferedStart).toBe('2026-10-15T16:00:00.000Z');
      expect(buffered.bufferedEnd).toBe('2026-10-15T17:00:00.000Z');
    });
  });

  describe('validateSlotWithBuffers', () => {
    const existingMeetings: TimeSlot[] = [
      {
        start: '2026-10-15T10:00:00.000Z',
        end: '2026-10-15T11:00:00.000Z',
      },
      {
        start: '2026-10-15T14:00:00.000Z',
        end: '2026-10-15T15:00:00.000Z',
      },
    ];

    it('detects collision when candidate slot encroaches on buffer time of existing meeting (before buffer)', () => {
      // Existing meeting ends at 11:00. Candidate starts at 11:05.
      // With bufferBefore = 10m, candidate bufferedStart is 10:55, which encroaches on existing meeting ending at 11:00!
      const candidateSlot: TimeSlot = {
        start: '2026-10-15T11:05:00.000Z',
        end: '2026-10-15T11:35:00.000Z',
      };

      const isValid = validateSlotWithBuffers(candidateSlot, existingMeetings, 10, 15);
      expect(isValid).toBe(false);
    });

    it('detects collision when candidate slot encroaches on buffer time of existing meeting (after buffer)', () => {
      // Existing meeting starts at 14:00. Candidate ends at 13:50.
      // With bufferAfter = 15m, candidate bufferedEnd is 14:05, which encroaches on existing meeting starting at 14:00!
      const candidateSlot: TimeSlot = {
        start: '2026-10-15T13:20:00.000Z',
        end: '2026-10-15T13:50:00.000Z',
      };

      const isValid = validateSlotWithBuffers(candidateSlot, existingMeetings, 10, 15);
      expect(isValid).toBe(false);
    });

    it('detects direct collision when candidate slot overlaps directly with an existing meeting', () => {
      const candidateSlot: TimeSlot = {
        start: '2026-10-15T10:30:00.000Z',
        end: '2026-10-15T11:30:00.000Z',
      };

      const isValid = validateSlotWithBuffers(candidateSlot, existingMeetings, 0, 0);
      expect(isValid).toBe(false);
    });

    it('allows candidate slot when outside buffer boundaries (sufficient gap)', () => {
      // Existing meeting ends at 11:00. Candidate starts at 11:15.
      // With bufferBefore = 10m, candidate bufferedStart is 11:05 >= 11:00.
      // Next meeting starts at 14:00, candidate ends at 11:45 + 15m buffer = 12:00 <= 14:00.
      const candidateSlot: TimeSlot = {
        start: '2026-10-15T11:15:00.000Z',
        end: '2026-10-15T11:45:00.000Z',
      };

      const isValid = validateSlotWithBuffers(candidateSlot, existingMeetings, 10, 15);
      expect(isValid).toBe(true);
    });

    it('allows candidate slot when exactly matching buffer boundary touchpoint', () => {
      // Existing meeting ends at 11:00. Candidate starts at 11:10 with bufferBefore = 10m.
      // Buffered start = 11:00. Touching boundary 11:00 is allowed.
      const candidateSlot: TimeSlot = {
        start: '2026-10-15T11:10:00.000Z',
        end: '2026-10-15T11:40:00.000Z',
      };

      const isValid = validateSlotWithBuffers(candidateSlot, existingMeetings, 10, 15);
      expect(isValid).toBe(true);
    });

    it('validates slots with HH:mm strings correctly', () => {
      const hhmmMeetings: TimeSlot[] = [
        { start: '09:00', end: '10:00' },
        { start: '13:00', end: '14:00' },
      ];

      // Overlap with 09:00-10:00 due to 15m bufferBefore (candidate 10:10 -> bufferedStart 09:55)
      expect(validateSlotWithBuffers({ start: '10:10', end: '10:40' }, hhmmMeetings, 15, 10)).toBe(
        false,
      );

      // Outside buffer boundary (candidate 10:20 -> bufferedStart 10:05 >= 10:00)
      expect(validateSlotWithBuffers({ start: '10:20', end: '10:50' }, hhmmMeetings, 15, 10)).toBe(
        true,
      );
    });
  });

  describe('checkDailyCap', () => {
    it('allows booking and returns remaining capacity when under daily cap', () => {
      const result = checkDailyCap('2026-10-15', 2, 4);
      expect(result.allowed).toBe(true);
      expect(result.remainingCapacity).toBe(2);
    });

    it('allows booking on the last available slot of the day', () => {
      const result = checkDailyCap('2026-10-15', 3, 4);
      expect(result.allowed).toBe(true);
      expect(result.remainingCapacity).toBe(1);
    });

    it('rejects booking when max daily bookings limit is reached', () => {
      const result = checkDailyCap('2026-10-15', 4, 4);
      expect(result.allowed).toBe(false);
      expect(result.remainingCapacity).toBe(0);
    });

    it('rejects booking when existing bookings exceed the daily cap', () => {
      const result = checkDailyCap('2026-10-15', 5, 4);
      expect(result.allowed).toBe(false);
      expect(result.remainingCapacity).toBe(0);
    });

    it('rejects booking when daily cap is set to 0', () => {
      const result = checkDailyCap('2026-10-15', 0, 0);
      expect(result.allowed).toBe(false);
      expect(result.remainingCapacity).toBe(0);
    });
  });

  describe('validateIntakeSubmission', () => {
    const intakeFields: CustomIntakeField[] = [
      { id: 'fullName', label: 'Your Name', type: 'text', required: true },
      { id: 'company', label: 'Company Name', type: 'text', required: true, placeholder: 'Acme' },
      { id: 'phone', label: 'Phone Number', type: 'phone', required: false },
      {
        id: 'tier',
        label: 'Selected Plan',
        type: 'dropdown',
        required: true,
        options: ['Starter', 'Professional', 'Enterprise'],
      },
      { id: 'agenda', label: 'Meeting Agenda', type: 'textarea', required: false },
      { id: 'terms', label: 'Terms of Service', type: 'checkbox', required: true },
    ];

    it('passes valid visitor responses with all required and optional fields correctly formatted', () => {
      const submission = {
        fullName: 'Jane Doe',
        company: 'Stripe, Inc.',
        phone: '+1 (555) 234-5678',
        tier: 'Enterprise',
        agenda: 'Discuss enterprise CalDAV migration and buffer configurations.',
        terms: true,
      };

      const result = validateIntakeSubmission(intakeFields, submission);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual({});
    });

    it('returns specific errors when required fields are missing or whitespace-only', () => {
      const submission = {
        fullName: '   ', // empty whitespace
        // company is completely missing
        tier: 'Professional',
        terms: false, // required checkbox not checked
      };

      const result = validateIntakeSubmission(intakeFields, submission);
      expect(result.valid).toBe(false);
      expect(result.errors['fullName']).toBe('Your Name is required');
      expect(result.errors['company']).toBe('Company Name is required');
      expect(result.errors['terms']).toBe('Terms of Service is required');
    });

    it('returns specific error when dropdown value is not in allowed options', () => {
      const submission = {
        fullName: 'Jane Doe',
        company: 'Acme',
        tier: 'UltraHackerPlan', // Not in ['Starter', 'Professional', 'Enterprise']
        terms: true,
      };

      const result = validateIntakeSubmission(intakeFields, submission);
      expect(result.valid).toBe(false);
      expect(result.errors['tier']).toBe('Invalid option selected for Selected Plan');
    });

    it('returns error when phone number format is invalid', () => {
      const submission = {
        fullName: 'Jane Doe',
        company: 'Acme',
        phone: 'not-a-valid-phone-number',
        tier: 'Starter',
        terms: true,
      };

      const result = validateIntakeSubmission(intakeFields, submission);
      expect(result.valid).toBe(false);
      expect(result.errors['phone']).toBe('Invalid phone number format for Phone Number');
    });

    it('handles empty submission object gracefully', () => {
      const result = validateIntakeSubmission(intakeFields, {});
      expect(result.valid).toBe(false);
      expect(Object.keys(result.errors).length).toBeGreaterThanOrEqual(4);
    });
  });
});
