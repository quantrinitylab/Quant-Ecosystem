import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScreenTimeMonitor, EventEmitter } from '../screen-time-monitor.js';

describe('ScreenTimeMonitor', () => {
  let mockEmitter: EventEmitter;
  let monitor: ScreenTimeMonitor;

  beforeEach(() => {
    mockEmitter = {
      emit: vi.fn(),
    };
    monitor = new ScreenTimeMonitor(mockEmitter);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should start and end a session', () => {
    monitor.startSession('user-1');
    expect(monitor.getSessionDuration('user-1')).toBeGreaterThanOrEqual(0);

    monitor.endSession('user-1');
    expect(monitor.getSessionDuration('user-1')).toBe(0);
  });

  it('should emit time_alert when session exceeds threshold', () => {
    vi.useFakeTimers();
    monitor.startSession('user-1');

    // Advance time by 31 minutes
    vi.advanceTimersByTime(31 * 60 * 1000);

    const result = monitor.checkSessionDuration('user-1');

    expect(result.shouldAlert).toBe(true);
    expect(result.minutes).toBeGreaterThanOrEqual(30);
    expect(mockEmitter.emit).toHaveBeenCalledWith(
      'time_alert',
      expect.objectContaining({
        userId: 'user-1',
        alertType: 'gentle_reminder',
      }),
    );

    vi.useRealTimers();
  });

  it('should not alert when session is under threshold', () => {
    vi.useFakeTimers();
    monitor.startSession('user-1');

    // Advance time by 10 minutes
    vi.advanceTimersByTime(10 * 60 * 1000);

    const result = monitor.checkSessionDuration('user-1');

    expect(result.shouldAlert).toBe(false);
    expect(mockEmitter.emit).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('should respect opt-out and not emit alerts', () => {
    vi.useFakeTimers();
    monitor.startSession('user-1');
    monitor.setOptOut('user-1', true);

    // Advance time past threshold
    vi.advanceTimersByTime(35 * 60 * 1000);

    const result = monitor.checkSessionDuration('user-1');

    expect(result.shouldAlert).toBe(false);
    expect(mockEmitter.emit).not.toHaveBeenCalled();
    expect(monitor.isOptedOut('user-1')).toBe(true);

    vi.useRealTimers();
  });

  it('should detect engagement-trap with rapid consecutive views', () => {
    monitor.startSession('user-1');

    const baseTime = 1000000;
    // Record 11 items viewed rapidly (< 3s apart)
    for (let i = 0; i < 11; i++) {
      monitor.recordItemView('user-1', baseTime + i * 2000); // 2s between items
    }

    // Should have triggered at the 10th consecutive rapid item
    expect(mockEmitter.emit).toHaveBeenCalledWith(
      'engagement_trap',
      expect.objectContaining({
        userId: 'user-1',
        consecutiveRapidItems: expect.any(Number),
      }),
    );
  });

  it('should reset consecutive rapid count after slow view', () => {
    monitor.startSession('user-1');

    const baseTime = 1000000;
    // Record 5 rapid items
    for (let i = 0; i < 5; i++) {
      monitor.recordItemView('user-1', baseTime + i * 2000);
    }

    // Then a slow item (5s gap)
    monitor.recordItemView('user-1', baseTime + 5 * 2000 + 5000);

    // Then 5 more rapid items
    for (let i = 0; i < 5; i++) {
      monitor.recordItemView('user-1', baseTime + 5 * 2000 + 5000 + (i + 1) * 2000);
    }

    // Should not trigger because the slow view reset the counter
    expect(mockEmitter.emit).not.toHaveBeenCalledWith('engagement_trap', expect.anything());
  });

  it('should not alert for unknown users', () => {
    const result = monitor.checkSessionDuration('unknown-user');
    expect(result.shouldAlert).toBe(false);
    expect(result.minutes).toBe(0);
  });

  it('should support custom threshold configuration', () => {
    vi.useFakeTimers();
    const customMonitor = new ScreenTimeMonitor(mockEmitter, {
      alertThresholdMinutes: 15,
    });
    customMonitor.startSession('user-1');

    vi.advanceTimersByTime(16 * 60 * 1000);

    const result = customMonitor.checkSessionDuration('user-1');
    expect(result.shouldAlert).toBe(true);

    vi.useRealTimers();
  });

  it('should allow opt-out to be toggled', () => {
    monitor.startSession('user-1');

    expect(monitor.isOptedOut('user-1')).toBe(false);
    monitor.setOptOut('user-1', true);
    expect(monitor.isOptedOut('user-1')).toBe(true);
    monitor.setOptOut('user-1', false);
    expect(monitor.isOptedOut('user-1')).toBe(false);
  });
});
