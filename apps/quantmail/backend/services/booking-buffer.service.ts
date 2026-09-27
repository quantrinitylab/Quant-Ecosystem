/**
 * ============================================================================
 * Booking SaaS Dynamic Meeting Buffers & Custom Intake Form Schema Service
 * Provides Calendly-superior meeting buffers, daily booking caps, and dynamic
 * custom visitor intake question validation for @quant/quantmail.
 * ============================================================================
 */

export type IntakeFieldType = 'text' | 'textarea' | 'dropdown' | 'checkbox' | 'phone';

export interface CustomIntakeField {
  id: string;
  label: string;
  type: IntakeFieldType;
  required: boolean;
  options?: string[]; // For dropdown
  placeholder?: string;
}

export interface BookingPolicy {
  linkId: string;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  maxBookingsPerDay: number;
  customFields: CustomIntakeField[];
}

export interface TimeSlot {
  start: string; // ISO string or 'HH:mm'
  end: string;
}

// In-memory store for link policies
const policyStore = new Map<string, BookingPolicy>();

/**
 * Checks whether a given string is in ISO datetime format (e.g. 2026-10-15T10:00:00Z)
 */
function isIsoDateTime(str: string): boolean {
  return str.includes('T') || (str.includes('-') && !str.startsWith('-'));
}

/**
 * Converts a time string (ISO or HH:mm) to numeric milliseconds for comparison.
 */
function toEpochMs(timeStr: string, baseEpoch = 0): number {
  if (isIsoDateTime(timeStr)) {
    const epoch = new Date(timeStr).getTime();
    if (!isNaN(epoch)) {
      return epoch;
    }
  }

  // Parse HH:mm or HH:mm:ss
  const parts = timeStr.trim().split(':').map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const s = parts[2] ?? 0;
  return baseEpoch + (h * 3600 + m * 60 + s) * 1000;
}

/**
 * Formats minutes from midnight to HH:mm (with optional wrapping)
 */
function formatMinutesToHhMm(totalMinutes: number): string {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Persists or updates a booking policy for a scheduling link.
 */
export function createBookingPolicy(policy: BookingPolicy): BookingPolicy {
  if (!policy || !policy.linkId) {
    throw new Error('BookingPolicy requires a valid linkId');
  }

  const stored: BookingPolicy = {
    linkId: policy.linkId,
    bufferBeforeMinutes: Math.max(0, policy.bufferBeforeMinutes ?? 0),
    bufferAfterMinutes: Math.max(0, policy.bufferAfterMinutes ?? 0),
    maxBookingsPerDay: Math.max(0, policy.maxBookingsPerDay ?? 0),
    customFields: Array.isArray(policy.customFields)
      ? policy.customFields.map((field) => ({ ...field }))
      : [],
  };

  policyStore.set(policy.linkId, stored);
  return {
    ...stored,
    customFields: stored.customFields.map((f) => ({ ...f })),
  };
}

/**
 * Retrieves the booking policy for a link by its ID.
 */
export function getBookingPolicy(linkId: string): BookingPolicy | null {
  const policy = policyStore.get(linkId);
  if (!policy) return null;
  return {
    ...policy,
    customFields: policy.customFields.map((f) => ({ ...f })),
  };
}

/**
 * Clears in-memory policies (useful for unit testing).
 */
export function clearPoliciesForTesting(): void {
  policyStore.clear();
}

/**
 * Expands a meeting slot by applying bufferBeforeMinutes to start and bufferAfterMinutes to end.
 * Supports both ISO datetime strings and 'HH:mm' 24-hour time strings.
 */
export function applyMeetingBuffers(
  meetingSlot: TimeSlot,
  bufferBeforeMinutes: number,
  bufferAfterMinutes: number,
): { bufferedStart: string; bufferedEnd: string } {
  const isIso = isIsoDateTime(meetingSlot.start);

  if (isIso) {
    const startDate = new Date(meetingSlot.start);
    const endDate = new Date(meetingSlot.end);

    const bufferedStartDate = new Date(startDate.getTime() - bufferBeforeMinutes * 60 * 1000);
    const bufferedEndDate = new Date(endDate.getTime() + bufferAfterMinutes * 60 * 1000);

    return {
      bufferedStart: bufferedStartDate.toISOString(),
      bufferedEnd: bufferedEndDate.toISOString(),
    };
  }

  // Handle 'HH:mm' format
  const [startH, startM] = meetingSlot.start.split(':').map(Number);
  const [endH, endM] = meetingSlot.end.split(':').map(Number);

  const startTotalMinutes = (startH ?? 0) * 60 + (startM ?? 0) - bufferBeforeMinutes;
  const endTotalMinutes = (endH ?? 0) * 60 + (endM ?? 0) + bufferAfterMinutes;

  return {
    bufferedStart: formatMinutesToHhMm(startTotalMinutes),
    bufferedEnd: formatMinutesToHhMm(endTotalMinutes),
  };
}

/**
 * Validates whether a candidate slot (expanded by buffers) can be booked without
 * overlapping any existing meeting slot.
 *
 * Returns false if candidateSlot (expanded by bufferBefore and bufferAfter) overlaps
 * with any existing meeting slot.
 * Returns true if completely collision-free.
 */
export function validateSlotWithBuffers(
  candidateSlot: TimeSlot,
  existingMeetings: TimeSlot[],
  bufferBeforeMinutes: number,
  bufferAfterMinutes: number,
): boolean {
  if (!candidateSlot || !candidateSlot.start || !candidateSlot.end) {
    return false;
  }

  const candStartMs = toEpochMs(candidateSlot.start);
  const candEndMs = toEpochMs(candidateSlot.end);

  if (candEndMs <= candStartMs) {
    return false;
  }

  const bufferedStartMs = candStartMs - bufferBeforeMinutes * 60 * 1000;
  const bufferedEndMs = candEndMs + bufferAfterMinutes * 60 * 1000;

  for (const existing of existingMeetings) {
    const existStartMs = toEpochMs(existing.start);
    const existEndMs = toEpochMs(existing.end);

    if (existEndMs <= existStartMs) {
      continue;
    }

    // Two intervals [A_start, A_end) and [B_start, B_end) overlap iff:
    // A_start < B_end && A_end > B_start
    if (bufferedStartMs < existEndMs && bufferedEndMs > existStartMs) {
      return false; // Collision detected
    }
  }

  return true; // Completely collision-free
}

/**
 * Checks whether booking on a given date is allowed based on the daily booking cap.
 */
export function checkDailyCap(
  _dateStr: string,
  existingBookingsOnDate: number,
  maxBookingsPerDay: number,
): { allowed: boolean; remainingCapacity: number } {
  const currentCount = Math.max(0, existingBookingsOnDate);
  const cap = Math.max(0, maxBookingsPerDay);

  const remaining = Math.max(0, cap - currentCount);
  const allowed = cap > 0 && currentCount < cap;

  return {
    allowed,
    remainingCapacity: remaining,
  };
}

/**
 * Validates dynamic custom intake questions submitted by a visitor during booking.
 * - Required fields must be provided and non-empty.
 * - Dropdown fields must match one of the defined options.
 * - Checkbox fields marked required must be true.
 * - Phone numbers (if provided) must conform to basic phone format.
 */
export function validateIntakeSubmission(
  fields: CustomIntakeField[],
  submission: Record<string, any> = {},
): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const data = submission || {};

  for (const field of fields) {
    const value = data[field.id];

    // Check required presence
    if (field.required) {
      if (value === undefined || value === null) {
        errors[field.id] = `${field.label} is required`;
        continue;
      }

      if (typeof value === 'string' && value.trim() === '') {
        errors[field.id] = `${field.label} is required`;
        continue;
      }

      if (field.type === 'checkbox' && value !== true) {
        errors[field.id] = `${field.label} is required`;
        continue;
      }

      if (Array.isArray(value) && value.length === 0) {
        errors[field.id] = `${field.label} is required`;
        continue;
      }
    }

    // Dropdown validation
    if (field.type === 'dropdown' && value !== undefined && value !== null && value !== '') {
      const selectedValue = String(value);
      if (field.options && field.options.length > 0) {
        if (!field.options.includes(selectedValue)) {
          errors[field.id] = `Invalid option selected for ${field.label}`;
          continue;
        }
      }
    }

    // Phone format validation (if provided)
    if (field.type === 'phone' && value !== undefined && value !== null && value !== '') {
      const phoneStr = String(value).trim();
      if (!/^[+]?[\d\s\-().]{7,25}$/.test(phoneStr)) {
        errors[field.id] = `Invalid phone number format for ${field.label}`;
        continue;
      }
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}
