// ============================================================================
// Booking-link proxy allow-list pin (fix/qm-bookinglinks-read-write).
//
// The BookingLinksModal reads the host's links (GET /api/booking/links) and
// deletes them (DELETE /api/booking/links/:id) through the Next.js catch-all
// proxy, which only forwards methods listed in ALLOWED_BACKEND_ROUTES. Before
// this fix only POST was listed, so the modal could write but never read back
// (split-brain) and could never delete. These tests pin the allow-list rows.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { ALLOWED_BACKEND_ROUTES } from '../lib/routes-config';

function methodsFor(path: string): string[] | undefined {
  return ALLOWED_BACKEND_ROUTES.find(({ pattern }) => pattern.test(path))?.methods.slice();
}

describe('booking links proxy allow-list', () => {
  it('lists GET and POST for the collection path /booking/links', () => {
    expect(methodsFor('booking/links')).toEqual(['GET', 'POST']);
  });

  it('lists DELETE (and only DELETE) for the id-addressed path /booking/links/:id', () => {
    expect(methodsFor('booking/links/clx-booking-server-1')).toEqual(['DELETE']);
  });

  it('does not expose the id-addressed path for reads (public reads stay on /calendar/booking/:slug)', () => {
    const methods = methodsFor('booking/links/some-slug');
    expect(methods).not.toContain('GET');
    expect(methods).not.toContain('POST');
  });

  it('keeps the public invitee paths untouched', () => {
    expect(methodsFor('calendar/booking/my-slug')).toContain('GET');
    expect(methodsFor('calendar/booking/my-slug/slots')).toContain('GET');
    expect(methodsFor('calendar/booking/my-slug/book')).toContain('POST');
  });

  it('lists POST-only lock/unlock rows for the public invitee prefix (fix/qm-calendar-slot-lock)', () => {
    // The lock endpoint existed in the backend but was doubly dead from the
    // page: the page never called it AND this allow-list had no row, so the
    // Next catch-all proxy answered its own API_ROUTE_NOT_FOUND 404 to any
    // lock call. Only the /calendar/booking prefix is listed (like /book):
    // it is the public, logged-out-invitee prefix in publicPaths.
    expect(methodsFor('calendar/booking/my-slug/lock')).toEqual(['POST']);
    expect(methodsFor('calendar/booking/my-slug/unlock')).toEqual(['POST']);
  });
});
