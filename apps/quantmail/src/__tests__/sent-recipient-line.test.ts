// @vitest-environment node
/**
 * SIA-P2-5 — Sent view self-rows showed only the sender's own handle
 * ("kundan") with no recipient. The Sent row's primary line must be the
 * RECIPIENT, prefixed with "To: " so the direction of the delivery trail is
 * unambiguous — including for self-sent mail, where sender and recipient are
 * the same handle.
 */
import { describe, it, expect } from 'vitest';
import { formatSentRecipientLine } from '../app/sent/recipients';

describe('SIA-P2-5 — formatSentRecipientLine', () => {
  it('prefixes a single recipient with "To: "', () => {
    expect(formatSentRecipientLine([{ email: 'a@x.com', name: 'Asha' }])).toBe('To: Asha');
  });

  it('falls back to the email when no display name is set', () => {
    expect(formatSentRecipientLine([{ email: 'a@x.com' }])).toBe('To: a@x.com');
  });

  it('joins multiple recipients in order', () => {
    expect(
      formatSentRecipientLine([
        { email: 'a@x.com', name: 'Asha' },
        { email: 'b@x.com', name: 'Bhanu' },
      ]),
    ).toBe('To: Asha, Bhanu');
  });

  it('labels a self-sent row as the recipient, not the sender', () => {
    // Self-row: the only name on the line is the sender's own handle.
    expect(formatSentRecipientLine([{ email: 'kundan@quantmail.in', name: 'kundan' }])).toBe(
      'To: kundan',
    );
  });

  it('stays honest when the recipient list is empty or missing', () => {
    expect(formatSentRecipientLine([])).toBe('To: Unknown');
    expect(formatSentRecipientLine(undefined)).toBe('To: Unknown');
    expect(formatSentRecipientLine(null)).toBe('To: Unknown');
  });

  it('skips empty entries instead of rendering gaps', () => {
    expect(
      formatSentRecipientLine([
        { email: '', name: '' },
        { email: 'a@x.com', name: 'Asha' },
      ]),
    ).toBe('To: Asha');
  });
});
