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

  it('lists GET (public slug read) and DELETE (host delete) for the id/slug-addressed path /booking/links/:id', () => {
    // fix/qm-calendar-booking-routes: GET on this shape is the PUBLIC invitee
    // read — calendar.ts registers the same public-DTO handler at
    // /booking/links/:slug and /calendar/booking/:slug, and both prefixes are
    // public through the backend auth hook. DELETE stays the host delete.
    // One row carries both because the catch-all takes the FIRST pattern
    // match: a separate GET row after a DELETE-only row would 405 guests.
    expect(methodsFor('booking/links/clx-booking-server-1')).toEqual(['GET', 'DELETE']);
  });

  it('exposes the public invitee read on /booking/links/:slug but no POST on the bare shape', () => {
    const methods = methodsFor('booking/links/some-slug');
    expect(methods).toContain('GET');
    expect(methods).not.toContain('POST');
  });

  it('keeps the public invitee paths untouched', () => {
    expect(methodsFor('calendar/booking/my-slug')).toContain('GET');
    expect(methodsFor('calendar/booking/my-slug/slots')).toContain('GET');
    expect(methodsFor('calendar/booking/my-slug/book')).toContain('POST');
  });

  it('exposes every public invitee step on BOTH dual-registered prefixes (fix/qm-calendar-booking-routes)', () => {
    // The /booking/links/:slug* duplicates were registered in the backend but
    // missing here, so the catch-all 404'd them; the /calendar/booking lock
    // step was missing too. Slug read, slots and lock must pass on both
    // prefixes. EXCEPTION (wave-9 slice A8, phase-r-m R-D4): the book step
    // is NOT proxied on /booking/links — that duplicate is internal and
    // non-public, so the catch-all must not resolve it; the canonical guest
    // booking path is /calendar/booking/:slug/book only (the only web caller
    // posts there).
    for (const prefix of ['booking/links', 'calendar/booking']) {
      expect(methodsFor(`${prefix}/my-slug`)).toContain('GET');
      expect(methodsFor(`${prefix}/my-slug/slots`)).toContain('GET');
      expect(methodsFor(`${prefix}/my-slug/lock`)).toContain('POST');
    }
    expect(methodsFor('calendar/booking/my-slug/book')).toContain('POST');
    expect(methodsFor('booking/links/my-slug/book')).toBeUndefined();
  });

  it('does not widen the invitee rows to host-only verbs', () => {
    expect(methodsFor('booking/links/my-slug/lock')).not.toContain('GET');
    expect(methodsFor('booking/links/my-slug/book')).not.toContain('GET');
    expect(methodsFor('booking/links/my-slug/slots')).not.toContain('POST');
    expect(methodsFor('calendar/booking/my-slug/lock')).not.toContain('GET');
    expect(methodsFor('calendar/booking/my-slug/book')).not.toContain('GET');
  });
});
