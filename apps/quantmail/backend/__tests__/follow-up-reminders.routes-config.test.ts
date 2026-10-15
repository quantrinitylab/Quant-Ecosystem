// ============================================================================
// Follow-up reminder proxy allow-list pin (fix/qm-followup-reminders).
//
// The EmailFollowUpReminder component calls GET/POST /api/follow-up-reminders
// and DELETE /api/follow-up-reminders/:id through the Next.js catch-all proxy,
// which only forwards methods listed in ALLOWED_BACKEND_ROUTES. Without these
// rows the picker would die with 404 API_ROUTE_NOT_FOUND before the backend
// ever saw the request — the exact split-brain the email-templates fix hit.
// These tests pin the rows.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { ALLOWED_BACKEND_ROUTES } from '../lib/routes-config';

function methodsFor(path: string): string[] | undefined {
  return ALLOWED_BACKEND_ROUTES.find(({ pattern }) => pattern.test(path))?.methods.slice();
}

describe('follow-up reminders proxy allow-list', () => {
  it('lists GET and POST for the collection path /follow-up-reminders', () => {
    expect(methodsFor('follow-up-reminders')).toEqual(['GET', 'POST']);
  });

  it('lists DELETE (and only DELETE) for the id-addressed path /follow-up-reminders/:id', () => {
    expect(methodsFor('follow-up-reminders/rem-1')).toEqual(['DELETE']);
  });

  it('does not route stray sub-paths (e.g. /follow-up-reminders/:id/x) anywhere', () => {
    expect(methodsFor('follow-up-reminders/rem-1/extra')).toBeUndefined();
  });
});
