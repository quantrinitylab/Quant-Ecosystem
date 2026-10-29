// ============================================================================
// Dead-endpoint removal pin (fix/qm-alerts-scheduled-deadwire).
//
// GET /events/alerts/scheduled served CalendarCallAlertService's process-local
// in-memory list: zero frontend callers, empty after a restart, different
// across replicas — while the BullMQ job it described still fired. The route
// was removed from backend/routes/calendar.ts instead of gaining a consumer
// (a consumer would have shown a lying "scheduled" list). Real reminder
// delivery is DB-backed via GET /events/alarms/due + persistDueCallReminders.
// These tests pin the proxy side: the allow-list must not advertise the dead
// path, and the neighbouring calendar rows stay untouched.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { ALLOWED_BACKEND_ROUTES } from '../lib/routes-config';

function methodsFor(path: string): string[] | undefined {
  return ALLOWED_BACKEND_ROUTES.find(({ pattern }) => pattern.test(path))?.methods.slice();
}

describe('events/alerts/scheduled removal (fix/qm-alerts-scheduled-deadwire)', () => {
  it('does not allow-list events/alerts/scheduled for any method', () => {
    expect(methodsFor('events/alerts/scheduled')).toBeUndefined();
    expect(
      ALLOWED_BACKEND_ROUTES.some(({ pattern }) => pattern.source.includes('alerts')),
    ).toBe(false);
  });

  it('keeps the neighbouring calendar rows untouched', () => {
    expect(methodsFor('events')).toEqual(['GET', 'POST']);
    expect(methodsFor('events/alarms/due')).toEqual(['GET']);
    expect(methodsFor('events/today')).toEqual(['GET']);
    expect(methodsFor('events/ev-123')).toEqual(['GET', 'PUT', 'PATCH', 'DELETE']);
  });
});
