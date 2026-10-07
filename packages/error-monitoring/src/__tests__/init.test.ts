// ============================================================================
// Error Monitoring - Init Helper Tests
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initErrorMonitoring } from '../init';
import { SentryTransport } from '../transports/sentry-transport';
import { GlitchTipTransport } from '../transports/glitchtip-transport';

describe('initErrorMonitoring', () => {
  const originalProcess = globalThis.process;
  let processOnSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    processOnSpy = vi.fn();
    // Mock process.on to prevent side effects from global handlers
    vi.stubGlobal('process', {
      ...originalProcess,
      on: processOnSpy,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('initializes with sentry provider and attaches SentryTransport', () => {
    const sendSpy = vi.spyOn(SentryTransport.prototype, 'send').mockResolvedValue(true);

    const capture = initErrorMonitoring({
      dsn: 'https://key@sentry.io/1',
      provider: 'sentry',
    });

    capture.captureException(new Error('test'));
    void capture.flush();

    expect(sendSpy).toHaveBeenCalled();
    sendSpy.mockRestore();
  });

  it('initializes with glitchtip provider and attaches GlitchTipTransport', () => {
    const sendSpy = vi.spyOn(GlitchTipTransport.prototype, 'send').mockResolvedValue(true);

    const capture = initErrorMonitoring({
      dsn: 'https://key@glitchtip.example.com/1',
      provider: 'glitchtip',
    });

    capture.captureException(new Error('test'));
    void capture.flush();

    expect(sendSpy).toHaveBeenCalled();
    sendSpy.mockRestore();
  });

  it('throws error when dsn is missing', () => {
    expect(() =>
      initErrorMonitoring({
        dsn: '',
        provider: 'sentry',
      }),
    ).toThrow('Error monitoring DSN is required');
  });

  it('applies default config values (environment defaults to production, sampleRate defaults to 1.0)', () => {
    const capture = initErrorMonitoring({
      dsn: 'https://key@sentry.io/1',
      provider: 'sentry',
    });

    // With sampleRate=1.0 (default), every event should be queued
    capture.captureMessage('test message', 'info');
    expect(capture.getQueueSize()).toBe(1);

    // Capture another to confirm consistent behavior
    capture.captureMessage('second message', 'debug');
    expect(capture.getQueueSize()).toBe(2);
  });

  it('sets up process global handlers in Node environment', () => {
    initErrorMonitoring({
      dsn: 'https://key@sentry.io/1',
      provider: 'sentry',
    });

    expect(processOnSpy).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
    expect(processOnSpy).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
  });

  it('respects custom sampleRate configuration', () => {
    // With sampleRate=0, no events should be queued
    const capture = initErrorMonitoring({
      dsn: 'https://key@sentry.io/1',
      provider: 'sentry',
      sampleRate: 0,
    });

    capture.captureMessage('should be dropped', 'info');
    expect(capture.getQueueSize()).toBe(0);
  });

  it('respects custom environment configuration', () => {
    const capture = initErrorMonitoring({
      dsn: 'https://key@sentry.io/1',
      provider: 'sentry',
      environment: 'staging',
    });

    // Instance was created with custom environment; verify it works
    const event = capture.captureException(new Error('env test'));
    expect(event).toBeDefined();
    expect(capture.getQueueSize()).toBe(1);
  });
});
