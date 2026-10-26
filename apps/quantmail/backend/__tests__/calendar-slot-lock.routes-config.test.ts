// ============================================================================
// Calendar slot-lock proxy allow-list pin (fix/qm-calendar-slot-lock-proxy).
//
// The backend registers POST /calendar/booking/:slug/lock (calendar.ts
// handleLockSlot) and the path is public in backend/app.ts publicPaths, but
// routes-config.ts had no /lock row — so the Next.js catch-all proxy answered
// 404 API_ROUTE_NOT_FOUND before the backend ever saw the request. Latent
// today (the booking page never calls /lock), but lock→book is the designed
// shape: confirmBookingSchema accepts an optional lockId. These tests pin the
// allow-list row.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { ALLOWED_BACKEND_ROUTES } from '../lib/routes-config';

function methodsFor(path: string): string[] | undefined {
  return ALLOWED_BACKEND_ROUTES.find(({ pattern }) => pattern.test(path))?.methods.slice();
}

describe('calendar slot-lock proxy allow-list', () => {
  it('lists POST (and only POST) for /calendar/booking/:slug/lock', () => {
    expect(methodsFor('calendar/booking/my-slug/lock')).toEqual(['POST']);
  });

  it('does not admit other methods on the lock path (no GET/DELETE export exists)', () => {
    const methods = methodsFor('calendar/booking/my-slug/lock') ?? [];
    expect(methods).not.toContain('GET');
    expect(methods).not.toContain('DELETE');
  });

  it('does not match nested paths under /lock (anchored row)', () => {
    expect(methodsFor('calendar/booking/my-slug/lock/extra')).toBeUndefined();
  });

  it('leaves the neighboring public booking rows untouched', () => {
    expect(methodsFor('calendar/booking/my-slug')).toContain('GET');
    expect(methodsFor('calendar/booking/my-slug/slots')).toContain('GET');
    expect(methodsFor('calendar/booking/my-slug/book')).toContain('POST');
  });
});
