import { describe, it, expect, vi } from 'vitest';
import { PhoneFreeSessionLogger } from '../phone-free/session-logger.js';

describe('PhoneFreeSessionLogger', () => {
  it('starts a session', () => {
    const logger = new PhoneFreeSessionLogger();
    const s = logger.startSession();
    expect(s.id).toBeTruthy();
    expect(s.startTime).toBeGreaterThan(0);
    expect(s.endTime).toBeNull();
  });

  it('ends a session with reason', () => {
    const logger = new PhoneFreeSessionLogger();
    const s = logger.startSession();
    const ended = logger.endSession(s.id, 'user_disabled');
    expect(ended).not.toBeNull();
    expect(ended!.endTime).toBeGreaterThan(0);
    expect(ended!.endReason).toBe('user_disabled');
  });

  it('returns null for unknown session id', () => {
    const logger = new PhoneFreeSessionLogger();
    expect(logger.endSession('no-exist', 'x')).toBeNull();
  });

  it('lists all sessions', () => {
    const logger = new PhoneFreeSessionLogger();
    logger.startSession();
    logger.startSession();
    expect(logger.listSessions()).toHaveLength(2);
  });

  it('computes stats for week', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
    const logger = new PhoneFreeSessionLogger();
    const s = logger.startSession();
    vi.advanceTimersByTime(60000);
    logger.endSession(s.id, 'timeout');
    const stats = logger.getStats('week');
    expect(stats.sessionCount).toBe(1);
    expect(stats.totalTime).toBe(60000);
    expect(stats.averageDuration).toBe(60000);
    vi.useRealTimers();
  });

  it('computes stats filtering old sessions', () => {
    vi.useFakeTimers();
    // Session from 10 days ago
    vi.setSystemTime(new Date('2024-06-05T12:00:00Z'));
    const logger = new PhoneFreeSessionLogger();
    const old = logger.startSession();
    vi.advanceTimersByTime(1000);
    logger.endSession(old.id, 'timeout');
    // Move to now
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
    const recent = logger.startSession();
    vi.advanceTimersByTime(5000);
    logger.endSession(recent.id, 'user');
    const weekStats = logger.getStats('week');
    expect(weekStats.sessionCount).toBe(1);
    const monthStats = logger.getStats('month');
    expect(monthStats.sessionCount).toBe(2);
    vi.useRealTimers();
  });
});
