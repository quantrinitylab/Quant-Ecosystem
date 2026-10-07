// @vitest-environment node
/**
 * ============================================================================
 * Modern Events Calendar (MEC) Event Ticket Invoicing & QR Check-In Engine Vitest Suite
 * Validates ticket issuance, HMAC-SHA256 signature generation, Base64 QR code encoding,
 * venue gate QR scanning and check-in status transitions, anti-fraud double-check-in
 * prevention, cross-event protection, tampered payload rejection, offline HMAC
 * verification, itemized invoice receipt generation, and real-time attendance statistics.
 * ============================================================================
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  issueTicket,
  verifyAndCheckInTicket,
  verifyTicketOffline,
  getEventAttendanceStats,
  cancelTicket,
  generateTicketInvoice,
  getTicketById,
  listTicketsForEvent,
  getTicketsByAttendee,
  clearTicketsForTesting,
  type EventTicket,
} from '../services/ticket-checkin.service';

describe('Modern Events Calendar (MEC) Event Ticket Invoicing & QR Check-In Engine', () => {
  const secretKey = 'quant_mec_super_secret_hmac_signing_key_2026';
  const eventId = 'evt_quant_summit_2026';
  const workspaceId = 'ws_enterprise_quant_01';
  const staffUserId = 'usr_staff_gatekeeper_77';

  beforeEach(() => {
    clearTicketsForTesting();
  });

  describe('1. Ticket Issuance & QR Payload Generation', () => {
    it('issues a valid ticket with unique ticketId, HMAC-SHA256 signed QR payload, and status ISSUED', () => {
      const ticket = issueTicket(
        {
          eventId,
          workspaceId,
          attendeeName: 'Ada Lovelace',
          attendeeEmail: 'ada@quant.network',
          seatId: 'A-1',
          tier: 'VIP',
          price: 250,
        },
        secretKey,
      );

      expect(ticket).toBeDefined();
      expect(ticket.ticketId).toMatch(/^TKT-\d+-[A-F0-9]+$/);
      expect(ticket.eventId).toBe(eventId);
      expect(ticket.workspaceId).toBe(workspaceId);
      expect(ticket.attendeeName).toBe('Ada Lovelace');
      expect(ticket.attendeeEmail).toBe('ada@quant.network');
      expect(ticket.seatId).toBe('A-1');
      expect(ticket.tier).toBe('VIP');
      expect(ticket.price).toBe(250);
      expect(ticket.status).toBe('ISSUED');
      expect(ticket.issuedAt).toBeDefined();
      expect(ticket.checkedInAt).toBeUndefined();
      expect(ticket.checkedInByStaffId).toBeUndefined();

      // Verify QR payload is valid Base64 JSON containing cryptographic signature
      const jsonStr = Buffer.from(ticket.qrPayload, 'base64').toString('utf8');
      const payload = JSON.parse(jsonStr);
      expect(payload.ticketId).toBe(ticket.ticketId);
      expect(payload.eventId).toBe(eventId);
      expect(payload.attendeeEmail).toBe('ada@quant.network');
      expect(payload.signature).toMatch(/^[a-f0-9]{64}$/); // SHA256 hex string
    });

    it('throws an error if secretKey is empty or missing', () => {
      expect(() => {
        issueTicket(
          {
            eventId,
            workspaceId,
            attendeeName: 'Alan Turing',
            attendeeEmail: 'alan@quant.network',
            tier: 'STANDARD',
            price: 100,
          },
          '',
        );
      }).toThrow('HMAC secretKey must be provided');
    });

    it('generates unique ticket IDs for sequential issuances', () => {
      const t1 = issueTicket(
        {
          eventId,
          workspaceId,
          attendeeName: 'User 1',
          attendeeEmail: 'u1@test.com',
          tier: 'STANDARD',
          price: 50,
        },
        secretKey,
      );
      const t2 = issueTicket(
        {
          eventId,
          workspaceId,
          attendeeName: 'User 2',
          attendeeEmail: 'u2@test.com',
          tier: 'STANDARD',
          price: 50,
        },
        secretKey,
      );

      expect(t1.ticketId).not.toBe(t2.ticketId);
      expect(t1.qrPayload).not.toBe(t2.qrPayload);
    });
  });

  describe('2. Gate QR Verification & Check-In Workflow', () => {
    it('successfully checks in an attendee, transitions status to CHECKED_IN, and records staff audit details', () => {
      const ticket = issueTicket(
        {
          eventId,
          workspaceId,
          attendeeName: 'Grace Hopper',
          attendeeEmail: 'grace@quant.network',
          seatId: 'VIP-04',
          tier: 'VIP',
          price: 300,
        },
        secretKey,
      );

      const result = verifyAndCheckInTicket(ticket.qrPayload, eventId, staffUserId, secretKey);

      expect(result.success).toBe(true);
      expect(result.status).toBe('SUCCESS');
      expect(result.ticket).toBeDefined();
      expect(result.ticket?.status).toBe('CHECKED_IN');
      expect(result.ticket?.checkedInByStaffId).toBe(staffUserId);
      expect(result.ticket?.checkedInAt).toBeDefined();

      // Check registry state
      const stored = getTicketById(ticket.ticketId);
      expect(stored?.status).toBe('CHECKED_IN');
      expect(stored?.checkedInByStaffId).toBe(staffUserId);
    });

    it('rejects double-check-in attempts with ALREADY_CHECKED_IN to prevent fraudulent ticket reuse', () => {
      const ticket = issueTicket(
        {
          eventId,
          workspaceId,
          attendeeName: 'Claude Shannon',
          attendeeEmail: 'claude@quant.network',
          tier: 'STANDARD',
          price: 150,
        },
        secretKey,
      );

      // First scan: Success
      const firstScan = verifyAndCheckInTicket(ticket.qrPayload, eventId, staffUserId, secretKey);
      expect(firstScan.success).toBe(true);
      expect(firstScan.status).toBe('SUCCESS');

      // Second scan (Double-check-in attempt by bad actor or shared screenshot): Rejected
      const secondStaffId = 'usr_staff_gatekeeper_88';
      const secondScan = verifyAndCheckInTicket(
        ticket.qrPayload,
        eventId,
        secondStaffId,
        secretKey,
      );

      expect(secondScan.success).toBe(false);
      expect(secondScan.status).toBe('ALREADY_CHECKED_IN');
      expect(secondScan.errorMessage).toContain('already been checked in');
      expect(secondScan.ticket?.checkedInByStaffId).toBe(staffUserId); // Points to original check-in
    });

    it('rejects ticket scanned for a different event with WRONG_EVENT', () => {
      const techSummitTicket = issueTicket(
        {
          eventId: 'evt_tech_summit_2026',
          workspaceId,
          attendeeName: 'Nikola Tesla',
          attendeeEmail: 'nikola@quant.network',
          tier: 'VIP',
          price: 200,
        },
        secretKey,
      );

      // Staff scans at an AI Gala gate
      const wrongEventId = 'evt_ai_gala_2026';
      const result = verifyAndCheckInTicket(
        techSummitTicket.qrPayload,
        wrongEventId,
        staffUserId,
        secretKey,
      );

      expect(result.success).toBe(false);
      expect(result.status).toBe('WRONG_EVENT');
      expect(result.errorMessage).toContain('evt_tech_summit_2026');
      expect(result.errorMessage).toContain(wrongEventId);
    });

    it('rejects tampered QR payload where signature does not match data', () => {
      const ticket = issueTicket(
        {
          eventId,
          workspaceId,
          attendeeName: 'John von Neumann',
          attendeeEmail: 'john@quant.network',
          tier: 'STANDARD',
          price: 120,
        },
        secretKey,
      );

      // Decode valid QR payload, tamper with attendee email, and re-encode
      const jsonStr = Buffer.from(ticket.qrPayload, 'base64').toString('utf8');
      const payload = JSON.parse(jsonStr);
      payload.attendeeEmail = 'fraudster@attacker.com';
      const tamperedQrPayload = Buffer.from(JSON.stringify(payload)).toString('base64');

      const result = verifyAndCheckInTicket(tamperedQrPayload, eventId, staffUserId, secretKey);

      expect(result.success).toBe(false);
      expect(result.status).toBe('INVALID_TICKET');
      expect(result.errorMessage).toContain('Tampered ticket signature');
    });

    it('rejects QR payload signed with a different or counterfeit secret key', () => {
      const fakeSecretKey = 'attacker_fake_signing_key_999';
      const forgedTicket = issueTicket(
        {
          eventId,
          workspaceId,
          attendeeName: 'Fake Attendee',
          attendeeEmail: 'fake@attack.com',
          tier: 'VIP',
          price: 0,
        },
        fakeSecretKey,
      );

      const result = verifyAndCheckInTicket(
        forgedTicket.qrPayload,
        eventId,
        staffUserId,
        secretKey, // Verified with genuine venue key
      );

      expect(result.success).toBe(false);
      expect(result.status).toBe('INVALID_TICKET');
      expect(result.errorMessage).toContain('Tampered ticket signature');
    });

    it('rejects malformed or unparseable QR payloads', () => {
      const result1 = verifyAndCheckInTicket('invalid_base64!@@#', eventId, staffUserId, secretKey);
      expect(result1.success).toBe(false);
      expect(result1.status).toBe('INVALID_TICKET');

      const emptyBase64Json = Buffer.from(JSON.stringify({})).toString('base64');
      const result2 = verifyAndCheckInTicket(emptyBase64Json, eventId, staffUserId, secretKey);
      expect(result2.success).toBe(false);
      expect(result2.status).toBe('INVALID_TICKET');
      expect(result2.errorMessage).toContain('Malformed ticket QR payload');
    });

    it('rejects tickets that do not exist in the registry (unregistered ticketId)', () => {
      const unknownPayload = {
        ticketId: 'TKT-999999999-XXXX',
        eventId,
        attendeeEmail: 'unknown@user.com',
        signature: 'invalid_sig',
      };
      // Sign correctly with legitimate key
      const message = `${unknownPayload.ticketId}:${unknownPayload.eventId}:${unknownPayload.attendeeEmail}`;
      unknownPayload.signature = createHmac('sha256', secretKey).update(message).digest('hex');

      const qrPayload = Buffer.from(JSON.stringify(unknownPayload)).toString('base64');
      const result = verifyAndCheckInTicket(qrPayload, eventId, staffUserId, secretKey);

      expect(result.success).toBe(false);
      expect(result.status).toBe('INVALID_TICKET');
      expect(result.errorMessage).toContain('does not exist in registry');
    });
  });

  describe('3. Offline HMAC Verification', () => {
    it('cryptographically verifies offline ticket authenticity without hitting registry', () => {
      const ticket = issueTicket(
        {
          eventId,
          workspaceId,
          attendeeName: 'Katherine Johnson',
          attendeeEmail: 'katherine@quant.network',
          seatId: 'BALC-01',
          tier: 'BALCONY',
          price: 80,
        },
        secretKey,
      );

      const offlineResult = verifyTicketOffline(ticket.qrPayload, secretKey);

      expect(offlineResult.valid).toBe(true);
      expect(offlineResult.payload).toBeDefined();
      expect(offlineResult.payload?.ticketId).toBe(ticket.ticketId);
      expect(offlineResult.payload?.eventId).toBe(eventId);
      expect(offlineResult.payload?.attendeeEmail).toBe('katherine@quant.network');
    });

    it('fails offline verification when secret key is incorrect or payload is tampered', () => {
      const ticket = issueTicket(
        {
          eventId,
          workspaceId,
          attendeeName: 'Margaret Hamilton',
          attendeeEmail: 'margaret@quant.network',
          tier: 'VIP',
          price: 250,
        },
        secretKey,
      );

      const failResult = verifyTicketOffline(ticket.qrPayload, 'wrong_offline_key');
      expect(failResult.valid).toBe(false);
      expect(failResult.errorMessage).toContain('HMAC signature verification failed');
    });
  });

  describe('4. Ticket Cancellation & Invalidation', () => {
    it('cancels an ISSUED ticket successfully', () => {
      const ticket = issueTicket(
        {
          eventId,
          workspaceId,
          attendeeName: 'Charles Babbage',
          attendeeEmail: 'charles@quant.network',
          tier: 'STANDARD',
          price: 100,
        },
        secretKey,
      );

      expect(ticket.status).toBe('ISSUED');
      const cancelled = cancelTicket(ticket.ticketId);
      expect(cancelled).toBe(true);

      const stored = getTicketById(ticket.ticketId);
      expect(stored?.status).toBe('CANCELLED');
    });

    it('rejects venue check-in if ticket has been CANCELLED', () => {
      const ticket = issueTicket(
        {
          eventId,
          workspaceId,
          attendeeName: 'Dorothy Vaughan',
          attendeeEmail: 'dorothy@quant.network',
          tier: 'VIP',
          price: 200,
        },
        secretKey,
      );

      cancelTicket(ticket.ticketId);

      const checkInResult = verifyAndCheckInTicket(
        ticket.qrPayload,
        eventId,
        staffUserId,
        secretKey,
      );

      expect(checkInResult.success).toBe(false);
      expect(checkInResult.status).toBe('INVALID_TICKET');
      expect(checkInResult.errorMessage).toContain('cancelled');
    });

    it('prevents cancelling a ticket that has already been CHECKED_IN', () => {
      const ticket = issueTicket(
        {
          eventId,
          workspaceId,
          attendeeName: 'Hedy Lamarr',
          attendeeEmail: 'hedy@quant.network',
          tier: 'VIP',
          price: 300,
        },
        secretKey,
      );

      verifyAndCheckInTicket(ticket.qrPayload, eventId, staffUserId, secretKey);
      expect(ticket.status).toBe('CHECKED_IN');

      const cancelResult = cancelTicket(ticket.ticketId);
      expect(cancelResult).toBe(false);
      expect(ticket.status).toBe('CHECKED_IN'); // Remains checked in
    });
  });

  describe('5. Attendance Analytics & Check-In Percentage', () => {
    it('accurately calculates totalIssued, totalCheckedIn, and checkInPercentage', () => {
      // Initially 0 tickets
      const initialStats = getEventAttendanceStats(eventId);
      expect(initialStats.totalIssued).toBe(0);
      expect(initialStats.totalCheckedIn).toBe(0);
      expect(initialStats.checkInPercentage).toBe(0);

      // Issue 4 tickets
      const t1 = issueTicket(
        {
          eventId,
          workspaceId,
          attendeeName: 'User 1',
          attendeeEmail: 'u1@q.net',
          tier: 'VIP',
          price: 100,
        },
        secretKey,
      );
      const t2 = issueTicket(
        {
          eventId,
          workspaceId,
          attendeeName: 'User 2',
          attendeeEmail: 'u2@q.net',
          tier: 'VIP',
          price: 100,
        },
        secretKey,
      );
      const t3 = issueTicket(
        {
          eventId,
          workspaceId,
          attendeeName: 'User 3',
          attendeeEmail: 'u3@q.net',
          tier: 'STANDARD',
          price: 50,
        },
        secretKey,
      );
      const t4 = issueTicket(
        {
          eventId,
          workspaceId,
          attendeeName: 'User 4',
          attendeeEmail: 'u4@q.net',
          tier: 'STANDARD',
          price: 50,
        },
        secretKey,
      );

      const issuedStats = getEventAttendanceStats(eventId);
      expect(issuedStats.totalIssued).toBe(4);
      expect(issuedStats.totalCheckedIn).toBe(0);
      expect(issuedStats.checkInPercentage).toBe(0);

      // Check in 2 attendees
      verifyAndCheckInTicket(t1.qrPayload, eventId, staffUserId, secretKey);
      verifyAndCheckInTicket(t2.qrPayload, eventId, staffUserId, secretKey);

      const halfStats = getEventAttendanceStats(eventId);
      expect(halfStats.totalIssued).toBe(4);
      expect(halfStats.totalCheckedIn).toBe(2);
      expect(halfStats.checkInPercentage).toBe(50); // 2/4 = 50%

      // Check in 3rd attendee
      verifyAndCheckInTicket(t3.qrPayload, eventId, staffUserId, secretKey);
      const threeQuarterStats = getEventAttendanceStats(eventId);
      expect(threeQuarterStats.totalIssued).toBe(4);
      expect(threeQuarterStats.totalCheckedIn).toBe(3);
      expect(threeQuarterStats.checkInPercentage).toBe(75); // 3/4 = 75%

      // Check in 4th attendee
      verifyAndCheckInTicket(t4.qrPayload, eventId, staffUserId, secretKey);
      const fullStats = getEventAttendanceStats(eventId);
      expect(fullStats.totalIssued).toBe(4);
      expect(fullStats.totalCheckedIn).toBe(4);
      expect(fullStats.checkInPercentage).toBe(100);
    });

    it('excludes cancelled tickets from total active issued count', () => {
      const t1 = issueTicket(
        {
          eventId,
          workspaceId,
          attendeeName: 'User 1',
          attendeeEmail: 'u1@q.net',
          tier: 'VIP',
          price: 100,
        },
        secretKey,
      );
      const t2 = issueTicket(
        {
          eventId,
          workspaceId,
          attendeeName: 'User 2',
          attendeeEmail: 'u2@q.net',
          tier: 'VIP',
          price: 100,
        },
        secretKey,
      );

      verifyAndCheckInTicket(t1.qrPayload, eventId, staffUserId, secretKey);
      cancelTicket(t2.ticketId); // Cancelled before check-in

      const stats = getEventAttendanceStats(eventId);
      expect(stats.totalIssued).toBe(1);
      expect(stats.totalCheckedIn).toBe(1);
      expect(stats.checkInPercentage).toBe(100);
    });
  });

  describe('6. Itemized Ticket Invoicing & Receipt Generation', () => {
    it('generates itemized ticket invoice receipt with tax and seat allocation details', () => {
      const ticket = issueTicket(
        {
          eventId,
          workspaceId,
          attendeeName: 'Tim Berners-Lee',
          attendeeEmail: 'tim@quant.network',
          seatId: 'ROW-A-12',
          tier: 'VIP',
          price: 200,
        },
        secretKey,
      );

      const invoice = generateTicketInvoice(ticket, {
        eventName: 'Global World Wide Web Summit 2026',
        currency: 'USD',
        taxRate: 0.15, // 15% tax
      });

      expect(invoice.invoiceNumber).toBe(`INV-${ticket.ticketId.replace('TKT-', '')}`);
      expect(invoice.ticketId).toBe(ticket.ticketId);
      expect(invoice.eventId).toBe(eventId);
      expect(invoice.eventName).toBe('Global World Wide Web Summit 2026');
      expect(invoice.attendeeName).toBe('Tim Berners-Lee');
      expect(invoice.attendeeEmail).toBe('tim@quant.network');
      expect(invoice.seatId).toBe('ROW-A-12');
      expect(invoice.tier).toBe('VIP');
      expect(invoice.price).toBe(200);
      expect(invoice.taxAmount).toBe(30); // 200 * 0.15 = 30
      expect(invoice.totalAmount).toBe(230); // 200 + 30 = 230
      expect(invoice.currency).toBe('USD');
      expect(invoice.status).toBe('ISSUED');
      expect(invoice.qrPayload).toBe(ticket.qrPayload);
    });
  });

  describe('7. Registry Queries & Attendee Ticket History', () => {
    it('lists all tickets for an event and all tickets for an attendee', () => {
      const email = 'linus@quant.network';
      const t1 = issueTicket(
        {
          eventId,
          workspaceId,
          attendeeName: 'Linus Torvalds',
          attendeeEmail: email,
          tier: 'VIP',
          price: 200,
        },
        secretKey,
      );
      const t2 = issueTicket(
        {
          eventId,
          workspaceId,
          attendeeName: 'Linus Torvalds',
          attendeeEmail: email,
          tier: 'STANDARD',
          price: 100,
        },
        secretKey,
      );
      issueTicket(
        {
          eventId: 'other_event',
          workspaceId,
          attendeeName: 'Other',
          attendeeEmail: 'other@q.net',
          tier: 'VIP',
          price: 200,
        },
        secretKey,
      );

      const eventTickets = listTicketsForEvent(eventId);
      expect(eventTickets).toHaveLength(2);

      const attendeeTickets = getTicketsByAttendee(email);
      expect(attendeeTickets).toHaveLength(2);
      expect(attendeeTickets.map((t) => t.ticketId)).toContain(t1.ticketId);
      expect(attendeeTickets.map((t) => t.ticketId)).toContain(t2.ticketId);
    });
  });
});
