// ============================================================================
// QuantChat - message-format unit tests
// Covers the P1-6 customer-audit fixes: bubble timestamps from backend
// `createdAt`, sender resolution from `senderId` vs the authenticated user,
// and honest delivery-status mapping.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  formatMessageTime,
  toDeliveryStatus,
  resolveMessageSender,
} from '../lib/message-format';

describe('formatMessageTime', () => {
  it('returns empty string for missing input', () => {
    expect(formatMessageTime(undefined)).toBe('');
    expect(formatMessageTime(null)).toBe('');
    expect(formatMessageTime('')).toBe('');
  });

  it('returns empty string for invalid dates', () => {
    expect(formatMessageTime('not-a-date')).toBe('');
  });

  it('formats a Date instance', () => {
    const out = formatMessageTime(new Date());
    expect(out).toMatch(/\d/);
  });

  it('formats an ISO string from the backend createdAt field', () => {
    const out = formatMessageTime(new Date().toISOString());
    expect(out.length).toBeGreaterThan(0);
  });

  it('includes the day for older messages', () => {
    const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const out = formatMessageTime(old.toISOString());
    expect(out).toContain(',');
  });
});

describe('toDeliveryStatus', () => {
  it('passes through real tick states', () => {
    expect(toDeliveryStatus('sent')).toBe('sent');
    expect(toDeliveryStatus('delivered')).toBe('delivered');
    expect(toDeliveryStatus('read')).toBe('read');
  });

  it('collapses sending/failed to sent (failed sends have their own retry UI)', () => {
    expect(toDeliveryStatus('sending')).toBe('sent');
    expect(toDeliveryStatus('failed')).toBe('sent');
    expect(toDeliveryStatus(undefined)).toBe('sent');
    expect(toDeliveryStatus('bogus')).toBe('sent');
  });
});

describe('resolveMessageSender', () => {
  const me = 'user-123';

  it('marks backend senderId === my id as self', () => {
    expect(resolveMessageSender({ senderId: 'user-123' }, me)).toBe('self');
    expect(resolveMessageSender({ userId: 'user-123' }, me)).toBe('self');
  });

  it('marks other users as other', () => {
    expect(resolveMessageSender({ senderId: 'user-999' }, me)).toBe('other');
  });

  it('honours an explicit self/other sender when no id is available', () => {
    expect(resolveMessageSender({ sender: 'self' }, null)).toBe('self');
    expect(resolveMessageSender({ sender: 'other' }, me)).toBe('other');
  });

  it('resolves realtime payloads that carry the raw user id in sender', () => {
    expect(resolveMessageSender({ sender: 'user-123' }, me)).toBe('self');
    expect(resolveMessageSender({ sender: 'user-999' }, me)).toBe('other');
  });

  it('defaults to other when nothing identifies the sender', () => {
    expect(resolveMessageSender({}, me)).toBe('other');
    expect(resolveMessageSender({ sender: 'user-999' }, null)).toBe('other');
  });
});
