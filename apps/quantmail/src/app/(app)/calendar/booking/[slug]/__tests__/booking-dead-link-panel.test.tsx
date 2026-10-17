import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BookingLinkDeadPanel, shouldUseHistoryBack } from '../dead-link-panel';

// Regression for the "booking dead-link panel is a dead end" finding:
// the honest not-found/inactive/error panel must never render zero actions.
describe('BookingLinkDeadPanel', () => {
  it('not-found state offers "Go back" + "Open QuantMail" (a retry cannot fix a mistyped URL)', () => {
    const html = renderToStaticMarkup(
      <BookingLinkDeadPanel
        status="not-found"
        message="BOOKING_LINK_NOT_FOUND"
        onRetry={vi.fn()}
        onGoBack={vi.fn()}
      />,
    );
    expect(html).toContain('Booking link not found');
    expect(html).toContain('Go back');
    expect(html).toContain('Open QuantMail');
    expect(html).toContain('href="/"');
    // A retry cannot fix a mistyped URL, so no misleading "Try again" here.
    expect(html).not.toContain('Try again');
  });

  it('inactive state keeps at least one action ("Try again" — the host may have re-enabled the link)', () => {
    const html = renderToStaticMarkup(
      <BookingLinkDeadPanel
        status="inactive"
        message={null}
        onRetry={vi.fn()}
        onGoBack={vi.fn()}
      />,
    );
    expect(html).toContain('This booking link is inactive');
    expect(html).toContain('The host has paused or disabled this link.');
    expect(html).toContain('Try again');
  });

  it('error state keeps the "Try again" retry and the nothing-was-booked reassurance', () => {
    const html = renderToStaticMarkup(
      <BookingLinkDeadPanel
        status="error"
        message="connection failed"
        onRetry={vi.fn()}
        onGoBack={vi.fn()}
      />,
    );
    expect(html).toContain('load this booking link');
    expect(html).toContain('connection failed');
    expect(html).toContain('Nothing was booked');
    expect(html).toContain('Try again');
  });

  it('every link-load failure state renders at least one actionable button/link', () => {
    for (const status of ['not-found', 'inactive', 'error'] as const) {
      const html = renderToStaticMarkup(
        <BookingLinkDeadPanel
          status={status}
          message={null}
          onRetry={vi.fn()}
          onGoBack={vi.fn()}
        />,
      );
      const hasAction = html.includes('<button') || html.includes('<a ');
      expect(hasAction, `status "${status}" must render at least one action`).toBe(true);
    }
  });

  it('shows the honest fallback copy when no backend message is supplied', () => {
    const html = renderToStaticMarkup(
      <BookingLinkDeadPanel
        status="error"
        message={null}
        onRetry={vi.fn()}
        onGoBack={vi.fn()}
      />,
    );
    expect(html).toContain('This booking link could not be loaded.');
  });

  it('shouldUseHistoryBack: a history-less tab falls back instead of silently doing nothing', () => {
    expect(shouldUseHistoryBack(1)).toBe(false);
    expect(shouldUseHistoryBack(2)).toBe(true);
    expect(shouldUseHistoryBack(10)).toBe(true);
  });
});
