// @vitest-environment node
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { QuantyActivityFeed } from '../components/QuantyLiveAgent/QuantyActivityFeed';
import type { QuantyStep } from '../components/QuantyLiveAgent/types';

/**
 * QuantyActivityFeed formatTime NaN guard — same defect family as
 * quantyTime.formatClockTime / formatRelativeTime (PR #894):
 * `new Date(garbage)` never throws, so the try/catch was dead code and broken
 * step.updatedAt rendered the literal "Invalid Date" in the live progress
 * feed's step time slot. The guard degrades to '' — the sibling convention —
 * never "Invalid Date".
 */
function makeStep(id: string, updatedAt: string): QuantyStep {
  return {
    id,
    label: `Step ${id}`,
    status: 'done',
    updatedAt,
  };
}

describe('QuantyActivityFeed invalid updatedAt', () => {
  it('never renders the literal "Invalid Date" for unparseable step.updatedAt', () => {
    const garbage = ['garbage', '', 'not-a-date', '2026-13-45T99:99:99'];
    const steps = garbage.map((updatedAt, i) => makeStep(`s${i}`, updatedAt));
    const html = renderToStaticMarkup(
      createElement(QuantyActivityFeed, { steps }),
    );
    expect(html).not.toContain('Invalid Date');
  });

  it('still renders a real clock time for a valid step.updatedAt', () => {
    const html = renderToStaticMarkup(
      createElement(QuantyActivityFeed, {
        steps: [makeStep('ok', '2026-10-11T14:30:05+05:30')],
      }),
    );
    // hi-IN 2-digit HH:MM:SS — digits + colons, not an empty <time> slot.
    const m = html.match(/<time[^>]*>([^<]*)<\/time>/);
    expect(m).toBeTruthy();
    expect(m![1].trim()).toMatch(/\d{1,2}:\d{2}:\d{2}/);
  });

  it('renders the empty-state copy when there are no steps', () => {
    const html = renderToStaticMarkup(
      createElement(QuantyActivityFeed, { steps: [] }),
    );
    expect(html).not.toContain('role="log"'); // no feed list
    expect(html).toContain('Quanty');
  });
});
