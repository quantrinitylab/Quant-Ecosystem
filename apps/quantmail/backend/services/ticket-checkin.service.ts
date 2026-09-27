/**
 * ============================================================================
 * Modern Events Calendar (MEC) Event Ticket Invoicing & QR Check-In Engine
 * Provides commercial-grade ticket issuance, HMAC-SHA256 signed QR code payloads,
 * anti-fraud double-check-in prevention, event validation gates, offline HMAC
 * verification, itemized invoice receipts, and real-time attendance analytics
 * for @quant/quantmail.
 * ============================================================================
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type TicketStatus = 'ISSUED' | 'CHECKED_IN' | 'CANCELLED';

export interface EventTicket {
  ticketId: string;
  eventId: string;
  workspaceId: string;
  attendeeName: string;
  attendeeEmail: string;
  seatId?: string;
  tier: string;
  price: number;
  status: TicketStatus;
  qrPayload: string; // Base64 encoded payload with HMAC signature
  issuedAt: string;
  checkedInAt?: string;
  checkedInByStaffId?: string;
}

export interface CheckInResult {
  success: boolean;
  ticket?: EventTicket;
  status: 'SUCCESS' | 'ALREADY_CHECKED_IN' | 'INVALID_TICKET' | 'WRONG_EVENT';
  errorMessage?: string;
}

export interface QRPayloadStructure {
  ticketId: string;
  eventId: string;
  attendeeEmail: string;
  signature: string;
}

export interface OfflineVerificationResult {
  valid: boolean;
  payload?: {
    ticketId: string;
    eventId: string;
    attendeeEmail: string;
  };
  errorMessage?: string;
}

export interface TicketInvoiceReceipt {
  invoiceNumber: string;
  ticketId: string;
  eventId: string;
  eventName: string;
  workspaceId: string;
  attendeeName: string;
  attendeeEmail: string;
  seatId?: string;
  tier: string;
  price: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  status: TicketStatus;
  qrPayload: string;
  issuedAt: string;
}

// In-memory ticket registry keyed by ticketId
const ticketRegistry = new Map<string, EventTicket>();

/**
 * Computes an HMAC-SHA256 digest over ticket credentials.
 */
function computeTicketHmac(
  ticketId: string,
  eventId: string,
  attendeeEmail: string,
  secretKey: string,
): string {
  const message = `${ticketId}:${eventId}:${attendeeEmail}`;
  return createHmac('sha256', secretKey).update(message).digest('hex');
}

/**
 * Issues a new ticket for an event attendee, generates a unique ticketId,
 * computes an HMAC-SHA256 signature, and encodes the QR payload as Base64.
 */
export function issueTicket(
  data: Omit<EventTicket, 'ticketId' | 'status' | 'qrPayload' | 'issuedAt'>,
  secretKey: string,
): EventTicket {
  if (!secretKey) {
    throw new Error('HMAC secretKey must be provided for secure ticket issuance');
  }

  const randomSuffix = randomBytes(4).toString('hex').toUpperCase();
  const ticketId = `TKT-${Date.now()}-${randomSuffix}`;
  const issuedAt = new Date().toISOString();

  const signature = computeTicketHmac(ticketId, data.eventId, data.attendeeEmail, secretKey);

  const payload: QRPayloadStructure = {
    ticketId,
    eventId: data.eventId,
    attendeeEmail: data.attendeeEmail,
    signature,
  };

  const qrPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');

  const ticket: EventTicket = {
    ticketId,
    eventId: data.eventId,
    workspaceId: data.workspaceId,
    attendeeName: data.attendeeName,
    attendeeEmail: data.attendeeEmail,
    seatId: data.seatId,
    tier: data.tier,
    price: data.price,
    status: 'ISSUED',
    qrPayload,
    issuedAt,
  };

  ticketRegistry.set(ticketId, ticket);
  return ticket;
}

/**
 * Verifies and checks in a scanned QR code ticket at the event gate.
 * Validates HMAC-SHA256 signature, ensures event ID matches, rejects double check-in,
 * and updates ticket status to CHECKED_IN.
 */
export function verifyAndCheckInTicket(
  qrPayload: string,
  eventId: string,
  staffUserId: string,
  secretKey: string,
): CheckInResult {
  if (!qrPayload || typeof qrPayload !== 'string') {
    return {
      success: false,
      status: 'INVALID_TICKET',
      errorMessage: 'QR payload is missing or invalid',
    };
  }

  let decoded: QRPayloadStructure;
  try {
    const jsonStr = Buffer.from(qrPayload, 'base64').toString('utf8');
    decoded = JSON.parse(jsonStr);
  } catch {
    return {
      success: false,
      status: 'INVALID_TICKET',
      errorMessage: 'Failed to decode or parse QR payload JSON',
    };
  }

  if (
    !decoded ||
    typeof decoded !== 'object' ||
    !decoded.ticketId ||
    !decoded.eventId ||
    !decoded.attendeeEmail ||
    !decoded.signature
  ) {
    return {
      success: false,
      status: 'INVALID_TICKET',
      errorMessage: 'Malformed ticket QR payload missing required cryptographic fields',
    };
  }

  // 1. Verify HMAC-SHA256 signature
  const expectedSig = computeTicketHmac(
    decoded.ticketId,
    decoded.eventId,
    decoded.attendeeEmail,
    secretKey,
  );

  try {
    const sigBuffer = Buffer.from(decoded.signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSig, 'hex');

    if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
      return {
        success: false,
        status: 'INVALID_TICKET',
        errorMessage: 'Tampered ticket signature: HMAC verification failed',
      };
    }
  } catch {
    return {
      success: false,
      status: 'INVALID_TICKET',
      errorMessage: 'Signature verification error: invalid signature encoding',
    };
  }

  // 2. Validate event ID matches expected scanning gate event
  if (decoded.eventId !== eventId) {
    return {
      success: false,
      status: 'WRONG_EVENT',
      errorMessage: `Ticket is issued for event ${decoded.eventId}, but this gate is scanning for event ${eventId}`,
    };
  }

  // 3. Locate ticket in registry
  const ticket = ticketRegistry.get(decoded.ticketId);
  if (!ticket) {
    return {
      success: false,
      status: 'INVALID_TICKET',
      errorMessage: `Ticket ID ${decoded.ticketId} does not exist in registry`,
    };
  }

  // Verify stored event ID also matches
  if (ticket.eventId !== eventId) {
    return {
      success: false,
      ticket,
      status: 'WRONG_EVENT',
      errorMessage: `Ticket registry record belongs to event ${ticket.eventId}, not ${eventId}`,
    };
  }

  // 4. Anti-Fraud Double-Check-In Gate
  if (ticket.status === 'CHECKED_IN') {
    return {
      success: false,
      ticket,
      status: 'ALREADY_CHECKED_IN',
      errorMessage: `Ticket ${ticket.ticketId} has already been checked in at ${ticket.checkedInAt} by staff member ${ticket.checkedInByStaffId}`,
    };
  }

  // 5. Cancelled check
  if (ticket.status === 'CANCELLED') {
    return {
      success: false,
      ticket,
      status: 'INVALID_TICKET',
      errorMessage: `Ticket ${ticket.ticketId} was cancelled and is no longer valid for venue admission`,
    };
  }

  // 6. Transition status to CHECKED_IN
  ticket.status = 'CHECKED_IN';
  ticket.checkedInAt = new Date().toISOString();
  ticket.checkedInByStaffId = staffUserId;

  return {
    success: true,
    ticket,
    status: 'SUCCESS',
  };
}

/**
 * Offline HMAC verification for field staff or portable scanners without active network access.
 * Cryptographically verifies payload authenticity and returns decoded metadata.
 */
export function verifyTicketOffline(
  qrPayload: string,
  secretKey: string,
): OfflineVerificationResult {
  if (!qrPayload || typeof qrPayload !== 'string') {
    return { valid: false, errorMessage: 'QR payload is empty or invalid' };
  }

  try {
    const jsonStr = Buffer.from(qrPayload, 'base64').toString('utf8');
    const decoded = JSON.parse(jsonStr);

    if (
      !decoded ||
      typeof decoded !== 'object' ||
      !decoded.ticketId ||
      !decoded.eventId ||
      !decoded.attendeeEmail ||
      !decoded.signature
    ) {
      return { valid: false, errorMessage: 'Invalid payload structure' };
    }

    const expectedSig = computeTicketHmac(
      decoded.ticketId,
      decoded.eventId,
      decoded.attendeeEmail,
      secretKey,
    );

    const sigBuffer = Buffer.from(decoded.signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSig, 'hex');

    if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
      return { valid: false, errorMessage: 'HMAC signature verification failed: payload tampered' };
    }

    return {
      valid: true,
      payload: {
        ticketId: decoded.ticketId,
        eventId: decoded.eventId,
        attendeeEmail: decoded.attendeeEmail,
      },
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown decoding error';
    return { valid: false, errorMessage: errorMsg };
  }
}

/**
 * Calculates real-time attendance statistics and check-in percentage for an event.
 */
export function getEventAttendanceStats(eventId: string): {
  totalIssued: number;
  totalCheckedIn: number;
  checkInPercentage: number;
} {
  const eventTickets = Array.from(ticketRegistry.values()).filter(
    (t) => t.eventId === eventId && t.status !== 'CANCELLED',
  );

  const totalIssued = eventTickets.length;
  const totalCheckedIn = eventTickets.filter((t) => t.status === 'CHECKED_IN').length;
  const checkInPercentage =
    totalIssued > 0 ? Math.round((totalCheckedIn / totalIssued) * 100 * 100) / 100 : 0;

  return {
    totalIssued,
    totalCheckedIn,
    checkInPercentage,
  };
}

/**
 * Cancels an issued ticket (e.g. on refund or booking cancellation).
 * Cannot cancel a ticket that has already been checked into the venue.
 */
export function cancelTicket(ticketId: string): boolean {
  const ticket = ticketRegistry.get(ticketId);
  if (!ticket || ticket.status !== 'ISSUED') {
    return false;
  }
  ticket.status = 'CANCELLED';
  return true;
}

/**
 * Generates an itemized ticket receipt/invoice with ticket ID, QR code payload,
 * seat allocation, tax calculations, and attendee credentials.
 */
export function generateTicketInvoice(
  ticket: EventTicket,
  options?: {
    eventName?: string;
    currency?: string;
    taxRate?: number;
  },
): TicketInvoiceReceipt {
  const eventName = options?.eventName ?? 'MEC Quant Event';
  const currency = options?.currency ?? 'USD';
  const taxRate = options?.taxRate ?? 0.1; // default 10%
  const taxAmount = Math.round(ticket.price * taxRate * 100) / 100;
  const totalAmount = Math.round((ticket.price + taxAmount) * 100) / 100;
  const invoiceNumber = `INV-${ticket.ticketId.replace('TKT-', '')}`;

  return {
    invoiceNumber,
    ticketId: ticket.ticketId,
    eventId: ticket.eventId,
    eventName,
    workspaceId: ticket.workspaceId,
    attendeeName: ticket.attendeeName,
    attendeeEmail: ticket.attendeeEmail,
    seatId: ticket.seatId,
    tier: ticket.tier,
    price: ticket.price,
    taxAmount,
    totalAmount,
    currency,
    status: ticket.status,
    qrPayload: ticket.qrPayload,
    issuedAt: ticket.issuedAt,
  };
}

/**
 * Retrieves a single ticket by ID.
 */
export function getTicketById(ticketId: string): EventTicket | undefined {
  return ticketRegistry.get(ticketId);
}

/**
 * Lists all active tickets for a given event.
 */
export function listTicketsForEvent(eventId: string): EventTicket[] {
  return Array.from(ticketRegistry.values()).filter((t) => t.eventId === eventId);
}

/**
 * Lists all tickets associated with an attendee's email address.
 */
export function getTicketsByAttendee(attendeeEmail: string): EventTicket[] {
  return Array.from(ticketRegistry.values()).filter(
    (t) => t.attendeeEmail.toLowerCase() === attendeeEmail.toLowerCase(),
  );
}

/**
 * Clears the in-memory ticket registry for testing isolation.
 */
export function clearTicketsForTesting(): void {
  ticketRegistry.clear();
}
