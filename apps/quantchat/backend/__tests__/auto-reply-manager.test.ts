import { describe, it, expect } from 'vitest';
import { AutoReplyManager } from '../lib/auto-reply-manager';

describe('AutoReplyManager (Task 12.9)', () => {
  it('tracks per-conversation enablement independently', () => {
    const m = new AutoReplyManager();
    m.enable('c1');
    expect(m.isEnabled('c1')).toBe(true);
    expect(m.isEnabled('c2')).toBe(false);
  });

  it('cancels all queued unsent responses for a conversation on disable', () => {
    const m = new AutoReplyManager();
    m.enable('c1');
    const t1 = m.enqueue('c1');
    const t2 = m.enqueue('c1');
    expect(m.pendingFor('c1')).toHaveLength(2);

    const cancelled = m.disable('c1');
    expect(cancelled).toBe(2);
    expect(m.isEnabled('c1')).toBe(false);
    expect(m.isPending(t1.ticketId)).toBe(false);
    expect(m.isPending(t2.ticketId)).toBe(false);
  });

  it('refuses to mark a cancelled ticket as sent (response is dropped)', () => {
    const m = new AutoReplyManager();
    m.enable('c1');
    const ticket = m.enqueue('c1');
    m.disable('c1'); // cancels the in-flight ticket

    expect(m.markSent(ticket.ticketId)).toBe(false);
  });

  it('marks a still-pending ticket as sent successfully', () => {
    const m = new AutoReplyManager();
    m.enable('c1');
    const ticket = m.enqueue('c1');
    expect(m.markSent(ticket.ticketId)).toBe(true);
    expect(m.isPending(ticket.ticketId)).toBe(false);
  });

  it('disable on one conversation does not affect another', () => {
    const m = new AutoReplyManager();
    m.enable('c1');
    m.enable('c2');
    const t2 = m.enqueue('c2');
    m.disable('c1');
    expect(m.isEnabled('c2')).toBe(true);
    expect(m.isPending(t2.ticketId)).toBe(true);
  });
});
