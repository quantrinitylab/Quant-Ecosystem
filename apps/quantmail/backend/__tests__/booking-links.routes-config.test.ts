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

  // fix/qm-slot-lock-dead-surface-6: POST /calendar/booking/:slug/lock was
  // dead surface — no allow-list row admitted it, so the Next.js catch-all
  // proxy 404'd it and the public booking page could never lock the slot
  // pre-confirm. Pin the row so a future edit cannot silently re-break it.
  it('admits POST for the slot-lock path /calendar/booking/:slug/lock', () => {
    expect(methodsFor('calendar/booking/my-slug/lock')).toEqual(['POST']);
  });
});
