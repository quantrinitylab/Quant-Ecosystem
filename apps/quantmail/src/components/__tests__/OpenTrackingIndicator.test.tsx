// ============================================================================
// QuantMail - Sent-view "opened" indicator tests (fix/qm-composer-open-tracking-2)
//
// The honesty contract: the indicator renders ONLY when the beacon fired
// (openCount > 0). Zero opens — tracked or not — renders nothing, because a
// recipient may block remote images and "not opened" must never read as a
// claim of non-reading.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { OpenTrackingIndicator } from '../EmailReadReceipt';
import { openStatusOf } from '../../lib/readReceipt';
import type { Email } from '../../types';

function email(partial: Partial<Email>): Email {
  return { id: 'm1', ...partial } as Email;
}

describe('openStatusOf', () => {
  it('returns null when tracking is off and there are no opens', () => {
    expect(openStatusOf(email({ openTrackingEnabled: false, openCount: 0 }))).toBeNull();
  });

  it('returns null for zero opens even when tracking was enabled (honest unknown)', () => {
    expect(openStatusOf(email({ openTrackingEnabled: true, openCount: 0 }))).toBeNull();
    expect(openStatusOf(email({}))).toBeNull();
  });

  it('returns the status once the beacon fired', () => {
    const status = openStatusOf(
      email({
        openTrackingEnabled: true,
        openCount: 3,
        firstOpenedAt: '2026-10-20T08:00:00Z',
        lastOpenedAt: '2026-10-20T09:30:00Z',
      }),
    );
    expect(status).not.toBeNull();
    expect(status!.openCount).toBe(3);
    expect(status!.firstOpenedAt).toBe('2026-10-20T08:00:00Z');
  });

  it('treats non-numeric openCount as zero', () => {
    expect(openStatusOf(email({ openCount: 'many' as unknown as number }))).toBeNull();
  });
});

describe('OpenTrackingIndicator', () => {
  it('renders the open count with an accessible label', () => {
    const html = renderToStaticMarkup(
      <OpenTrackingIndicator openCount={2} firstOpenedAt="2026-10-20T08:00:00Z" />,
    );
    expect(html).toContain('aria-label="Opened 2 times');
    expect(html).toContain('>2<');
    expect(html).toContain('<svg');
  });

  it('singularizes one open', () => {
    const html = renderToStaticMarkup(<OpenTrackingIndicator openCount={1} />);
    expect(html).toContain('aria-label="Opened 1 time"');
  });

  it('caps the visible count at 99+', () => {
    const html = renderToStaticMarkup(<OpenTrackingIndicator openCount={140} />);
    expect(html).toContain('>99+<');
    expect(html).toContain('aria-label="Opened 140 times"');
  });
});

describe('OpenTrackingIndicator zero/honesty', () => {
  it('renders nothing for zero opens (honest unknown, not "Opened 0 times")', () => {
    const html = renderToStaticMarkup(<OpenTrackingIndicator openCount={0} />);
    expect(html).toBe('');
  });
  it('renders nothing for negative/NaN counts', () => {
    expect(renderToStaticMarkup(<OpenTrackingIndicator openCount={-1} />)).toBe('');
    expect(renderToStaticMarkup(<OpenTrackingIndicator openCount={NaN} />)).toBe('');
  });
});
