import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThreadSummaryCard, messagesToSummaryPayload } from '../ThreadSummaryCard';

describe('messagesToSummaryPayload', () => {
  it('maps messages to the backend payload shape', () => {
    const payload = messagesToSummaryPayload([
      {
        from: { name: 'Alice', email: 'alice@example.com' },
        subject: 'Hello',
        bodyText: 'Hi there',
        receivedAt: '2026-10-08T10:00:00.000Z',
      },
    ]);
    expect(payload).toEqual([
      {
        from: 'Alice',
        subject: 'Hello',
        body: 'Hi there',
        date: '2026-10-08T10:00:00.000Z',
      },
    ]);
  });

  it('falls back to email when name is missing, and Unknown when both are', () => {
    const payload = messagesToSummaryPayload([
      { from: { email: 'bob@example.com' }, bodyText: 'x' },
      { from: null, bodyText: 'y' },
    ]);
    expect(payload[0].from).toBe('bob@example.com');
    expect(payload[1].from).toBe('Unknown');
  });

  it('strips HTML from bodyHtml', () => {
    const payload = messagesToSummaryPayload([
      { from: { email: 'a@b.c' }, bodyHtml: '<p>Hello <b>world</b></p>' },
    ]);
    expect(payload[0].body).not.toContain('<');
    expect(payload[0].body).toContain('Hello');
  });

  it('caps each body at 8000 chars', () => {
    const payload = messagesToSummaryPayload([{ from: { email: 'a@b.c' }, bodyText: 'x'.repeat(9000) }]);
    expect(payload[0].body.length).toBe(8000);
  });

  it('converts Date receivedAt to ISO string', () => {
    const payload = messagesToSummaryPayload([
      { from: { email: 'a@b.c' }, receivedAt: new Date('2026-10-08T10:00:00.000Z') },
    ]);
    expect(payload[0].date).toBe('2026-10-08T10:00:00.000Z');
  });
});

describe('ThreadSummaryCard', () => {
  it('renders the Summarize thread trigger initially — no fake summary', () => {
    const html = renderToStaticMarkup(
      <ThreadSummaryCard onSummarize={async () => ({ summary: '', keyPoints: [], actionItems: [], messageCount: 0 })} />,
    );
    expect(html).toContain('Summarize thread');
    expect(html).toContain('aria-label="Summarize this conversation"');
    // Nothing fabricated before the user clicks
    expect(html).not.toContain('Thread summary');
    expect(html).not.toContain('Key points');
  });
});
