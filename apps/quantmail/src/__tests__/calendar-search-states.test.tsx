/**
 * QM-SCREEN-026 — Calendar feed search states (render pins).
 *
 * Before this fix the feed filtered locally by title/location only and
 * rendered the same empty day list for "still loading", "server load
 * failed" and "no matches" — including a misleading "Free day" card.
 * These tests pin the honest states and attendee matching.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CalendarFeedSubView } from '../components/CalendarSubViews';
import type { CalendarEventLike } from '../app/(app)/calendar/types';

const ev: CalendarEventLike = {
  id: 'ev-1',
  title: 'Design Review',
  startTime: new Date().toISOString(),
  endTime: new Date(Date.now() + 3600000).toISOString(),
  start: new Date().toISOString(),
  end: new Date(Date.now() + 3600000).toISOString(),
  location: 'Studio',
  attendees: ['priya@example.com'],
};

function render(props: Partial<React.ComponentProps<typeof CalendarFeedSubView>> = {}) {
  return renderToStaticMarkup(
    <CalendarFeedSubView
      events={[ev]}
      selectedDate={new Date()}
      onSelectDate={vi.fn()}
      openDedicatedSheet={vi.fn()}
      onSelectEvent={vi.fn()}
      {...props}
    />,
  );
}

describe('CalendarFeedSubView search states (QM-SCREEN-026)', () => {
  it('shows a loading state — not results — while the server load is pending', () => {
    const html = render({ searchFilter: 'design', isSearchLoading: true });
    expect(html).toContain('data-testid="calendar-feed-search-loading"');
    expect(html).toContain('Searching your calendar…');
    expect(html).not.toContain('No events match');
  });

  it('shows a degraded state with retry — not "no matches" — when the server load failed', () => {
    const html = render({
      searchFilter: 'design',
      searchError: 'Search unavailable — events couldn\'t be loaded from the server.',
      onSearchRetry: vi.fn(),
    });
    expect(html).toContain('data-testid="calendar-feed-search-error"');
    expect(html).toContain('Retry');
    expect(html).not.toContain('No events match');
    expect(html).not.toContain('Free day');
  });

  it('shows an explicit no-matches state only for a settled search with zero matches', () => {
    const html = render({ searchFilter: 'dentist' });
    expect(html).toContain('data-testid="calendar-feed-search-empty"');
    expect(html).toContain('No events match');
    expect(html).toContain('loaded from the server');
    // The old misleading affordance: today rendered as a "Free day".
    expect(html).not.toContain('Free day');
    expect(html).not.toContain('Design Review');
  });

  it('matches on attendee — the placeholder promises attendee search', () => {
    const html = render({ searchFilter: 'priya@example' });
    expect(html).toContain('Design Review');
    expect(html).not.toContain('data-testid="calendar-feed-search-empty"');
  });

  it('without a search, the normal feed (incl. free-day copy) is untouched', () => {
    const html = render({});
    expect(html).toContain('Design Review');
    expect(html).not.toContain('calendar-feed-search-');
  });

  it('no search state ever carries a latency claim', () => {
    for (const html of [
      render({ searchFilter: 'design', isSearchLoading: true }),
      render({ searchFilter: 'design', searchError: 'Search unavailable — events couldn\'t be loaded from the server.' }),
      render({ searchFilter: 'dentist' }),
    ]) {
      expect(html).not.toMatch(/5\s?ms/);
      expect(html).not.toContain('LIVE');
    }
  });
});
