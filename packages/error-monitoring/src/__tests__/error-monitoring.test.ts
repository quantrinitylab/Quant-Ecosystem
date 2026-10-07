// ============================================================================
// Error Monitoring - Comprehensive Test Suite
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorCapture } from '../error-capture';
import { ErrorBoundary } from '../error-boundary';
import { ConsoleTransport } from '../transports/console-transport';
import { SentryTransport } from '../transports/sentry-transport';
import { GlitchTipTransport } from '../transports/glitchtip-transport';
import type { ErrorEvent, ErrorTransport } from '../types';

describe('ErrorCapture', () => {
  let capture: ErrorCapture;

  beforeEach(() => {
    capture = new ErrorCapture({ environment: 'test' });
  });

  it('captures exception with correct event structure', () => {
    const error = new Error('Test error');
    const event = capture.captureException(error);

    expect(event.message).toBe('Test error');
    expect(event.severity).toBe('error');
    expect(event.id).toBeTruthy();
    expect(event.timestamp).toBeGreaterThan(0);
    expect(event.exception?.type).toBe('Error');
    expect(event.exception?.value).toBe('Test error');
  });

  it('captures message with specified severity', () => {
    const event = capture.captureMessage('User logged out', 'info');

    expect(event.message).toBe('User logged out');
    expect(event.severity).toBe('info');
    expect(event.exception).toBeUndefined();
  });

  it('attaches context to events', () => {
    capture.setContext({
      user: { id: 'user-1', email: 'test@example.com' },
      tags: { module: 'auth' },
    });

    const event = capture.captureMessage('Login failed', 'warning');

    expect(event.context.user?.id).toBe('user-1');
    expect(event.context.user?.email).toBe('test@example.com');
    expect(event.context.tags?.module).toBe('auth');
  });

  it('merges context incrementally', () => {
    capture.setContext({ tags: { service: 'api' } });
    capture.setContext({ user: { id: 'u1' } });

    const ctx = capture.getContext();
    expect(ctx.tags?.service).toBe('api');
    expect(ctx.user?.id).toBe('u1');
  });

  it('adds and retrieves breadcrumbs', () => {
    capture.addBreadcrumb({ type: 'navigation', message: 'Navigated to /home', level: 'info' });
    capture.addBreadcrumb({ type: 'ui', message: 'Clicked button', level: 'info' });

    const breadcrumbs = capture.getBreadcrumbs();
    expect(breadcrumbs).toHaveLength(2);
    expect(breadcrumbs[0]!.message).toBe('Navigated to /home');
    expect(breadcrumbs[0]!.timestamp).toBeGreaterThan(0);
    expect(breadcrumbs[1]!.message).toBe('Clicked button');
  });

  it('respects maxBreadcrumbs limit', () => {
    const smallCapture = new ErrorCapture({ maxBreadcrumbs: 3 });

    for (let i = 0; i < 5; i++) {
      smallCapture.addBreadcrumb({ type: 'default', message: `Crumb ${i}`, level: 'info' });
    }

    const crumbs = smallCapture.getBreadcrumbs();
    expect(crumbs).toHaveLength(3);
    expect(crumbs[0]!.message).toBe('Crumb 2');
    expect(crumbs[2]!.message).toBe('Crumb 4');
  });

  it('attaches breadcrumbs to captured events', () => {
    capture.addBreadcrumb({ type: 'http', message: 'GET /api/user', level: 'info' });
    capture.addBreadcrumb({ type: 'error', message: 'Response 500', level: 'error' });

    const event = capture.captureException(new Error('API failure'));

    expect(event.breadcrumbs).toHaveLength(2);
    expect(event.breadcrumbs[0]!.type).toBe('http');
  });

  it('filters events by severity', () => {
    const filtered = new ErrorCapture({
      severityFilter: ['error', 'fatal'],
    });

    const transport: ErrorTransport = {
      name: 'test',
      send: vi.fn().mockResolvedValue(true),
      flush: vi.fn().mockResolvedValue(undefined),
    };
    filtered.addTransport(transport);

    filtered.captureMessage('Debug message', 'debug');
    filtered.captureMessage('Info message', 'info');

    expect(filtered.getQueueSize()).toBe(0);
  });

  it('applies beforeSend hook', () => {
    const beforeSend = vi.fn((event: ErrorEvent) => ({
      ...event,
      context: { ...event.context, tags: { processed: 'true' } },
    }));

    const hooked = new ErrorCapture({ beforeSend });
    hooked.captureMessage('Test');

    expect(beforeSend).toHaveBeenCalledTimes(1);
    expect(hooked.getQueueSize()).toBe(1);
  });

  it('drops event when beforeSend returns null', () => {
    const hooked = new ErrorCapture({
      beforeSend: () => null,
    });
    hooked.captureMessage('Dropped');
    expect(hooked.getQueueSize()).toBe(0);
  });

  it('sends events to registered transports', async () => {
    const sendFn = vi.fn().mockResolvedValue(true);
    const transport: ErrorTransport = {
      name: 'mock',
      send: sendFn,
      flush: vi.fn().mockResolvedValue(undefined),
    };

    capture.addTransport(transport);
    capture.captureException(new Error('Transport test'));

    await capture.flush();
    expect(sendFn).toHaveBeenCalledTimes(1);
  });

  it('removes transport by name', () => {
    const transport: ErrorTransport = {
      name: 'removable',
      send: vi.fn().mockResolvedValue(true),
      flush: vi.fn().mockResolvedValue(undefined),
    };

    capture.addTransport(transport);
    capture.removeTransport('removable');
    capture.captureMessage('After removal');

    expect(transport.send).not.toHaveBeenCalled();
  });

  it('clears breadcrumbs', () => {
    capture.addBreadcrumb({ type: 'default', message: 'crumb1', level: 'info' });
    capture.addBreadcrumb({ type: 'default', message: 'crumb2', level: 'info' });
    capture.clearBreadcrumbs();
    expect(capture.getBreadcrumbs()).toHaveLength(0);
  });

  it('flush sends queued events to all transports', async () => {
    const flushFn = vi.fn().mockResolvedValue(undefined);
    const transport: ErrorTransport = {
      name: 'flush-test',
      send: vi.fn().mockResolvedValue(true),
      flush: flushFn,
    };

    capture.addTransport(transport);
    capture.captureMessage('Queued');
    await capture.flush();

    expect(flushFn).toHaveBeenCalledTimes(1);
  });
});

describe('ErrorBoundary', () => {
  it('catches errors with wrap()', () => {
    const onError = vi.fn();
    const boundary = new ErrorBoundary({ onError });

    const result = boundary.wrap(() => {
      throw new Error('Boundary test');
    });

    expect(result).toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(boundary.getState().hasError).toBe(true);
  });

  it('supports recovery attempts', () => {
    const onRecovery = vi.fn();
    const boundary = new ErrorBoundary({ onError: vi.fn(), onRecovery });

    boundary.handleError(new Error('Failure'));
    const recovered = boundary.recover();

    expect(recovered).toBe(true);
    expect(onRecovery).toHaveBeenCalledTimes(1);
    expect(boundary.getState().hasError).toBe(false);
  });

  it('limits recovery attempts', () => {
    const boundary = new ErrorBoundary({ onError: vi.fn() });

    for (let i = 0; i < 4; i++) {
      boundary.handleError(new Error(`Failure ${i}`));
      boundary.recover();
    }

    // After 3 recoveries, the next should fail
    boundary.handleError(new Error('Final failure'));
    const recovered = boundary.recover();
    expect(recovered).toBe(false);
  });

  it('provides fallback message when in error state', () => {
    const boundary = new ErrorBoundary({
      onError: vi.fn(),
      fallback: 'Custom fallback',
    });

    expect(boundary.getFallback()).toBeUndefined();
    boundary.handleError(new Error('Failure'));
    expect(boundary.getFallback()).toBe('Custom fallback');
  });

  it('resets state completely', () => {
    const boundary = new ErrorBoundary({ onError: vi.fn() });
    boundary.handleError(new Error('Reset test'));
    boundary.reset();

    const state = boundary.getState();
    expect(state.hasError).toBe(false);
    expect(state.error).toBeNull();
    expect(state.recoveryAttempts).toBe(0);
  });

  it('wraps async functions', async () => {
    const onError = vi.fn();
    const boundary = new ErrorBoundary({ onError });

    const result = await boundary.wrapAsync(async () => {
      throw new Error('Async failure');
    });

    expect(result).toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe('ConsoleTransport', () => {
  it('logs events above minimum severity', async () => {
    const transport = new ConsoleTransport({ minSeverity: 'warning' });

    const lowEvent: ErrorEvent = {
      id: '1',
      message: 'Debug',
      severity: 'debug',
      timestamp: Date.now(),
      context: {},
      breadcrumbs: [],
    };

    const highEvent: ErrorEvent = {
      id: '2',
      message: 'Error',
      severity: 'error',
      timestamp: Date.now(),
      context: {},
      breadcrumbs: [],
    };

    const sent1 = await transport.send(lowEvent);
    const sent2 = await transport.send(highEvent);

    expect(sent1).toBe(false);
    expect(sent2).toBe(true);
    expect(transport.getLoggedEvents()).toHaveLength(1);
  });

  it('clears logged events', async () => {
    const transport = new ConsoleTransport();
    const event: ErrorEvent = {
      id: '1',
      message: 'Test',
      severity: 'error',
      timestamp: Date.now(),
      context: {},
      breadcrumbs: [],
    };

    await transport.send(event);
    transport.clear();
    expect(transport.getLoggedEvents()).toHaveLength(0);
  });
});

describe('SentryTransport', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('batches events and flushes when batch is full', async () => {
    const transport = new SentryTransport({
      dsn: 'https://key@sentry.io/1',
      batchSize: 2,
      flushInterval: 60000,
    });

    const event1: ErrorEvent = {
      id: '1',
      message: 'Test 1',
      severity: 'error',
      timestamp: Date.now(),
      context: {},
      breadcrumbs: [],
    };
    const event2: ErrorEvent = {
      id: '2',
      message: 'Test 2',
      severity: 'error',
      timestamp: Date.now(),
      context: {},
      breadcrumbs: [],
    };

    await transport.send(event1);
    expect(transport.getPendingCount()).toBe(1); // not yet flushed
    await transport.send(event2);
    expect(transport.getPendingCount()).toBe(0); // flushed at batch size

    transport.destroy();
  });

  it('reports pending count', async () => {
    const transport = new SentryTransport({
      dsn: 'https://key@sentry.io/1',
      batchSize: 5,
      flushInterval: 60000,
    });

    const event: ErrorEvent = {
      id: '1',
      message: 'Queued',
      severity: 'warning',
      timestamp: Date.now(),
      context: {},
      breadcrumbs: [],
    };

    await transport.send(event);
    expect(transport.getPendingCount()).toBe(1);
    transport.destroy();
  });
});

describe('GlitchTipTransport', () => {
  it('sends events to GlitchTip endpoint', async () => {
    const transport = new GlitchTipTransport({
      dsn: 'https://key@glitchtip.example.com/1',
      batchSize: 5,
      flushInterval: 60000,
    });

    const event: ErrorEvent = {
      id: '1',
      message: 'GlitchTip test',
      severity: 'error',
      timestamp: Date.now(),
      context: {},
      breadcrumbs: [],
    };

    const sent = await transport.send(event);
    expect(sent).toBe(true);
    expect(transport.getPendingCount()).toBe(1);

    await transport.flush();
    expect(transport.getPendingCount()).toBe(0);

    transport.destroy();
  });
});
