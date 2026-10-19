// @vitest-environment jsdom
// ============================================================================
// EmailThreadTimeline — guarded date rendering contract.
//
// A bad timestamp must NEVER render as "Invalid Date" in the timeline:
// formatTimelineTimestamp returns the raw string when the timestamp does not
// parse to a valid Date, and the component wires that guard into every event
// row (see finding: unguarded toLocaleString in the unused/dead component).
// ============================================================================

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  EmailThreadTimeline,
  formatTimelineTimestamp,
} from '../components/EmailThreadTimeline';

const BASE_EVENT = {
  id: 'evt-1',
  type: 'received' as const,
  participant: { name: 'Friend', email: 'friend@example.com' },
  subject: 'Hello',
};

describe('formatTimelineTimestamp', () => {
  it('formats a valid ISO timestamp without ever printing "Invalid Date"', () => {
    const out = formatTimelineTimestamp('2026-10-15T10:30:00Z');
    expect(out).not.toContain('Invalid Date');
    expect(out.length).toBeGreaterThan(0);
  });

  it('falls back to the raw string for an unparsable timestamp', () => {
    const bad = 'not-a-real-timestamp';
    expect(formatTimelineTimestamp(bad)).toBe(bad);
    expect(formatTimelineTimestamp(bad)).not.toContain('Invalid Date');
  });

  it('falls back to the raw string for a garbage timestamp that parses NaN', () => {
    const bad = '2026-13-99T99:99:99Z';
    expect(formatTimelineTimestamp(bad)).toBe(bad);
    expect(formatTimelineTimestamp(bad)).not.toContain('Invalid Date');
  });
});

describe('EmailThreadTimeline', () => {
  it('renders nothing when the event list is empty', () => {
    expect(renderToStaticMarkup(<EmailThreadTimeline events={[]} />)).toBe('');
  });

  it('never renders "Invalid Date" for a bad event timestamp', () => {
    const html = renderToStaticMarkup(
      <EmailThreadTimeline
        events={[
          { ...BASE_EVENT, id: 'bad-ts', timestamp: 'not-a-real-timestamp' },
          { ...BASE_EVENT, id: 'good-ts', timestamp: '2026-10-15T10:30:00Z' },
        ]}
      />,
    );
    expect(html).not.toContain('Invalid Date');
    // The raw bad timestamp is shown honestly instead of being dropped.
    expect(html).toContain('not-a-real-timestamp');
  });
});
