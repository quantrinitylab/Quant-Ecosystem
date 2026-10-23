// ============================================================================
// Inline RSVP card — contract tests (fix/qm-inline-rsvp-v4).
//
// Gmail parity pins: the invitation card offers Yes / No / Maybe (in that
// order) at the top of the invitation email; the viewer's own response is
// shown once known; failures are honest (role=alert, never a fake success);
// the card carries no divider-line classes (pure-black rule); and the
// container renders nothing until an invitation ICS resolves — no chips on
// ordinary mail.
//
// renderToStaticMarkup (no @testing-library/react — CI runs
// pnpm install --frozen-lockfile and the package is not a dependency).
// ============================================================================

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import React from 'react';
import {
  InlineEventRsvp,
  InlineRsvpCard,
  viewerRsvpStatus,
} from '../InlineEventRsvp';
import type { Email } from '../../types';
import type { RsvpScopeInfo } from '../../app/calendar/event/event-detail-utils';

const SCOPE_SINGLE: RsvpScopeInfo = { kind: 'event', appliesTo: 'event', fromOccurrence: null };

function renderCard(props: Partial<React.ComponentProps<typeof InlineRsvpCard>> = {}): string {
  return renderToStaticMarkup(
    <InlineRsvpCard
      eventTitle="Team sync"
      whenLabel="Friday, October 24, 2026 · 10:00 AM – 11:00 AM"
      location="Room 4B"
      currentStatus={null}
      isPending={false}
      error={null}
      confirmation={null}
      onRespond={() => undefined}
      {...props}
    />,
  );
}

function renderWithClient(ui: React.ReactNode): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

describe('InlineRsvpCard', () => {
  it('offers Yes / No / Maybe in Gmail order with honest aria labels', () => {
    const html = renderCard();
    const yes = html.indexOf('>Yes<');
    const no = html.indexOf('>No<');
    const maybe = html.indexOf('>Maybe<');
    expect(yes).toBeGreaterThan(-1);
    expect(no).toBeGreaterThan(-1);
    expect(maybe).toBeGreaterThan(-1);
    expect(yes).toBeLessThan(no);
    expect(no).toBeLessThan(maybe);
    expect(html).toContain('aria-label="Respond Accepted"');
    expect(html).toContain('aria-label="Respond Declined"');
    expect(html).toContain('aria-label="Respond Maybe"');
  });

  it('shows the event summary (title, when, location)', () => {
    const html = renderCard();
    expect(html).toContain('Team sync');
    expect(html).toContain('Friday, October 24, 2026');
    expect(html).toContain('Room 4B');
    expect(html).toContain('Event invitation');
  });

  it('invites a response when unanswered, names it once answered', () => {
    expect(renderCard({ currentStatus: null })).toContain('Respond to this invitation');
    expect(renderCard({ currentStatus: 'pending' })).toContain('Respond to this invitation');
    const answered = renderCard({ currentStatus: 'accepted' });
    expect(answered).toContain('Your response: Accepted');
    expect(answered).toContain('aria-pressed="true"');
  });

  it('disables the chips while a response is in flight', () => {
    const html = renderCard({ isPending: true });
    expect(html.match(/disabled/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('reports failures honestly via role=alert, never a fake success', () => {
    const html = renderCard({ error: 'Could not update your response.' });
    expect(html).toContain('role="alert"');
    expect(html).toContain('Could not update your response.');
    expect(html).not.toContain('Your response:');
  });

  it('shows the scope confirmation after a successful RSVP', () => {
    const html = renderCard({ confirmation: { status: 'accepted', scope: SCOPE_SINGLE } });
    expect(html).toContain('Accepted — recorded for this event.');
  });

  it('carries no divider-line classes (pure-black, no divider lines rule)', () => {
    const html = renderCard();
    expect(html).not.toMatch(/(?<![\w-])border-b(?![\w\[])/);
    expect(html).not.toMatch(/(?<![\w-])border-t(?![\w\[-])/);
    expect(html).not.toMatch(/(?<![\w-])divide-[xy](?![\w-])/);
  });
});

describe('InlineEventRsvp source', () => {
  it('contains no divider class tokens', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../InlineEventRsvp.tsx', import.meta.url)),
      'utf8',
    );
    expect(source).not.toMatch(/(?<![\w-])border-b(?![\w\[])/);
    expect(source).not.toMatch(/(?<![\w-])border-t(?![\w\[-])/);
    expect(source).not.toMatch(/(?<![\w-])divide-[xy](?![\w-])/);
  });
});

describe('viewerRsvpStatus', () => {
  const event = {
    id: 'evt_1',
    attendees: [
      { email: 'Bob@quantmail.in', rsvp: 'accepted' },
      { email: 'carol@quantmail.in', status: 'tentative' },
    ],
  };
  it('matches the viewer by email, case-insensitively, across rsvp/status shapes', () => {
    expect(viewerRsvpStatus(event, 'bob@quantmail.in')).toBe('accepted');
    expect(viewerRsvpStatus(event, 'CAROL@quantmail.in')).toBe('tentative');
  });
  it('returns null when the viewer is not an attendee or the status is unknown', () => {
    expect(viewerRsvpStatus(event, 'dave@quantmail.in')).toBeNull();
    expect(viewerRsvpStatus({ id: 'e', attendees: [{ email: 'x@y.z', rsvp: 'bogus' }] }, 'x@y.z')).toBeNull();
    expect(viewerRsvpStatus(null, 'x@y.z')).toBeNull();
    expect(viewerRsvpStatus(event, '')).toBeNull();
  });
});

describe('InlineEventRsvp container (SSR: effects do not run)', () => {
  const plainMessage = { id: 'm1', attachments: [] } as unknown as Email;
  const icsMessage = {
    id: 'm2',
    attachments: [{ filename: 'invite.ics', mimeType: 'text/calendar', url: null, id: null }],
  } as unknown as Email;

  it('renders nothing for ordinary mail without an invitation attachment', () => {
    expect(renderWithClient(<InlineEventRsvp message={plainMessage} viewerEmail="bob@quantmail.in" />)).toBe('');
  });

  it('renders nothing while the ICS has not resolved (no chips before proof)', () => {
    // In SSR the byte-loading effect never runs, so the card must stay
    // absent rather than guessing.
    expect(renderWithClient(<InlineEventRsvp message={icsMessage} viewerEmail="bob@quantmail.in" />)).toBe('');
  });
});
