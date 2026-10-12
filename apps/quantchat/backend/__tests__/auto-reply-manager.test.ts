import { describe, it, expect } from 'vitest';
import { AutoReplyManager } from '../lib/auto-reply-manager';

const A = 'user_a';
const B = 'user_b';

describe('AutoReplyManager (Task 12.9, per-user since QC-F-067)', () => {
  it('tracks per-conversation enablement independently', () => {
    const m = new AutoReplyManager();
    m.enable(A, 'c1');
    expect(m.isEnabled(A, 'c1')).toBe(true);
    expect(m.isEnabled(A, 'c2')).toBe(false);
  });

  it('tracks enablement PER USER — one member arming a conversation does not arm another', () => {
    const m = new AutoReplyManager();
    m.enable(A, 'c1');
    expect(m.isEnabled(A, 'c1')).toBe(true);
    expect(m.isEnabled(B, 'c1')).toBe(false);
  });

  it('cancels all queued unsent responses for a conversation on disable', () => {
    const m = new AutoReplyManager();
    m.enable(A, 'c1');
    const t1 = m.enqueue(A, 'c1');
    const t2 = m.enqueue(A, 'c1');
    expect(m.pendingFor(A, 'c1')).toHaveLength(2);

    const cancelled = m.disable(A, 'c1');
    expect(cancelled).toBe(2);
    expect(m.isEnabled(A, 'c1')).toBe(false);
    expect(m.isPending(t1.ticketId)).toBe(false);
    expect(m.isPending(t2.ticketId)).toBe(false);
  });

  it("disable cancels only that user's queued responses — the other member's stay pending", () => {
    const m = new AutoReplyManager();
    m.enable(A, 'c1');
    m.enable(B, 'c1');
    const ta = m.enqueue(A, 'c1');
    const tb = m.enqueue(B, 'c1');

    const cancelled = m.disable(A, 'c1');
    expect(cancelled).toBe(1);
    expect(m.isPending(ta.ticketId)).toBe(false);
    expect(m.isPending(tb.ticketId)).toBe(true);
    expect(m.isEnabled(B, 'c1')).toBe(true);
  });

  it('refuses to mark a cancelled ticket as sent (response is dropped)', () => {
    const m = new AutoReplyManager();
    m.enable(A, 'c1');
    const ticket = m.enqueue(A, 'c1');
    m.disable(A, 'c1'); // cancels the in-flight ticket

    expect(m.markSent(ticket.ticketId)).toBe(false);
  });

  it('marks a still-pending ticket as sent successfully', () => {
    const m = new AutoReplyManager();
    m.enable(A, 'c1');
    const ticket = m.enqueue(A, 'c1');
    expect(m.markSent(ticket.ticketId)).toBe(true);
    expect(m.isPending(ticket.ticketId)).toBe(false);
  });

  it('disable on one conversation does not affect another', () => {
    const m = new AutoReplyManager();
    m.enable(A, 'c1');
    m.enable(A, 'c2');
    const t2 = m.enqueue(A, 'c2');
    m.disable(A, 'c1');
    expect(m.isEnabled(A, 'c2')).toBe(true);
    expect(m.isPending(t2.ticketId)).toBe(true);
  });
});
