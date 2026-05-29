// ============================================================================
// Chaos Testing - Comprehensive Test Suite
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServiceHealthChecker } from '../health-checker';
import { FaultInjector } from '../fault-injector';
import { ResilienceTester } from '../resilience-tester';
import type { HealthCheck } from '../types';

describe('ServiceHealthChecker', () => {
  let checker: ServiceHealthChecker;

  beforeEach(() => {
    checker = new ServiceHealthChecker();
  });

  it('registers a service and returns unknown status initially', () => {
    const check: HealthCheck = {
      name: 'api-service',
      endpoint: 'http://localhost:3000/health',
      interval: 5000,
      timeout: 2000,
      check: async () => true,
    };

    checker.registerService(check);
    const status = checker.getStatus('api-service');

    expect(status).toBeDefined();
    expect(status!.status).toBe('unknown');
    expect(status!.name).toBe('api-service');
  });

  it('checks all registered services', async () => {
    checker.registerService({
      name: 'service-a',
      endpoint: '/health-a',
      interval: 5000,
      timeout: 2000,
      check: async () => true,
    });
    checker.registerService({
      name: 'service-b',
      endpoint: '/health-b',
      interval: 5000,
      timeout: 2000,
      check: async () => true,
    });

    const results = await checker.checkAll();

    expect(results.size).toBe(2);
    expect(results.get('service-a')!.status).toBe('healthy');
    expect(results.get('service-b')!.status).toBe('healthy');
  });

  it('marks unhealthy service when check fails', async () => {
    checker.registerService({
      name: 'failing-service',
      endpoint: '/health',
      interval: 5000,
      timeout: 2000,
      check: async () => false,
    });

    await checker.checkAll();
    const status = checker.getStatus('failing-service');

    expect(status!.status).toBe('unhealthy');
    expect(status!.errorCount).toBe(1);
  });

  it('marks service unhealthy on exception', async () => {
    checker.registerService({
      name: 'crashing-service',
      endpoint: '/health',
      interval: 5000,
      timeout: 2000,
      check: async () => {
        throw new Error('Connection refused');
      },
    });

    await checker.checkAll();
    const status = checker.getStatus('crashing-service');

    expect(status!.status).toBe('unhealthy');
  });

  it('marks service unhealthy on timeout', async () => {
    checker.registerService({
      name: 'slow-service',
      endpoint: '/health',
      interval: 5000,
      timeout: 50,
      check: () => new Promise((resolve) => setTimeout(() => resolve(true), 200)),
    });

    await checker.checkAll();
    const status = checker.getStatus('slow-service');

    expect(status!.status).toBe('unhealthy');
  });

  it('invokes unhealthy callback when service becomes unhealthy', async () => {
    const callback = vi.fn();
    checker.onUnhealthy(callback);

    checker.registerService({
      name: 'monitored',
      endpoint: '/health',
      interval: 5000,
      timeout: 2000,
      check: async () => false,
    });

    await checker.checkAll();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'monitored', status: 'unhealthy' }),
    );
  });

  it('unregisters callback on cleanup', async () => {
    const callback = vi.fn();
    const unsubscribe = checker.onUnhealthy(callback);
    unsubscribe();

    checker.registerService({
      name: 'no-notify',
      endpoint: '/health',
      interval: 5000,
      timeout: 2000,
      check: async () => false,
    });

    await checker.checkAll();
    expect(callback).not.toHaveBeenCalled();
  });

  it('returns all service statuses', () => {
    checker.registerService({
      name: 'svc-1',
      endpoint: '/h',
      interval: 5000,
      timeout: 2000,
      check: async () => true,
    });
    checker.registerService({
      name: 'svc-2',
      endpoint: '/h',
      interval: 5000,
      timeout: 2000,
      check: async () => true,
    });

    const statuses = checker.getAllStatuses();
    expect(statuses).toHaveLength(2);
    expect(statuses.map((s) => s.name).sort()).toEqual(['svc-1', 'svc-2']);
  });

  it('unregisters services', async () => {
    checker.registerService({
      name: 'temp',
      endpoint: '/h',
      interval: 5000,
      timeout: 2000,
      check: async () => true,
    });

    checker.unregisterService('temp');
    expect(checker.getStatus('temp')).toBeUndefined();
  });

  it('checks individual service', async () => {
    checker.registerService({
      name: 'single',
      endpoint: '/h',
      interval: 5000,
      timeout: 2000,
      check: async () => true,
    });

    const health = await checker.checkService('single');
    expect(health).not.toBeNull();
    expect(health!.status).toBe('healthy');
  });

  it('returns null for unknown service check', async () => {
    const health = await checker.checkService('nonexistent');
    expect(health).toBeNull();
  });
});

describe('FaultInjector', () => {
  let injector: FaultInjector;

  beforeEach(() => {
    injector = new FaultInjector();
  });

  it('injects latency fault', () => {
    const fault = injector.injectLatency('api-gateway', 500);

    expect(fault.type).toBe('latency');
    expect(fault.target).toBe('api-gateway');
    expect(fault.config.latencyMs).toBe(500);
    expect(fault.active).toBe(true);
  });

  it('injects failure fault with rate', () => {
    const fault = injector.injectFailure('payment-service', 0.5);

    expect(fault.type).toBe('failure');
    expect(fault.config.failureRate).toBe(0.5);
  });

  it('injects timeout fault', () => {
    const fault = injector.injectTimeout('db-connection', 10000);

    expect(fault.type).toBe('timeout');
    expect(fault.config.timeoutMs).toBe(10000);
  });

  it('clamps failure rate between 0 and 1', () => {
    const fault = injector.injectFailure('service', 1.5);
    expect(fault.config.failureRate).toBe(1);

    const fault2 = injector.injectFailure('service2', -0.5);
    expect(fault2.config.failureRate).toBe(0);
  });

  it('returns active faults', () => {
    injector.injectLatency('svc-a', 100);
    injector.injectFailure('svc-b', 0.3);

    const faults = injector.getActiveFaults();
    expect(faults).toHaveLength(2);
  });

  it('gets faults for specific target', () => {
    injector.injectLatency('target-1', 100);
    injector.injectFailure('target-1', 0.5);
    injector.injectTimeout('target-2', 5000);

    const target1Faults = injector.getFaultsForTarget('target-1');
    expect(target1Faults).toHaveLength(2);

    const target2Faults = injector.getFaultsForTarget('target-2');
    expect(target2Faults).toHaveLength(1);
  });

  it('checks if target is affected', () => {
    injector.injectLatency('affected', 100);

    expect(injector.isTargetAffected('affected')).toBe(true);
    expect(injector.isTargetAffected('clean')).toBe(false);
  });

  it('resets all faults', () => {
    injector.injectLatency('a', 100);
    injector.injectFailure('b', 0.5);
    injector.reset();

    expect(injector.getActiveFaults()).toHaveLength(0);
    expect(injector.isTargetAffected('a')).toBe(false);
  });

  it('resets specific fault by id', () => {
    const fault1 = injector.injectLatency('target', 100);
    injector.injectFailure('target', 0.5);

    injector.reset(fault1.id);

    expect(injector.getActiveFaults()).toHaveLength(1);
    expect(injector.getFaultsForTarget('target')).toHaveLength(1);
  });

  it('calculates total latency for target', () => {
    injector.injectLatency('slow-target', 100);
    injector.injectLatency('slow-target', 200);

    expect(injector.getLatencyDelay('slow-target')).toBe(300);
    expect(injector.getLatencyDelay('fast-target')).toBe(0);
  });

  it('returns timeout duration for target', () => {
    injector.injectTimeout('timeout-target', 5000);
    expect(injector.getTimeoutDuration('timeout-target')).toBe(5000);
    expect(injector.getTimeoutDuration('no-timeout')).toBeUndefined();
  });
});

describe('ResilienceTester', () => {
  let tester: ResilienceTester;

  beforeEach(() => {
    tester = new ResilienceTester();
  });

  it('tests circuit breaker with failing operation', async () => {
    let callCount = 0;
    const failingOp = async () => {
      callCount++;
      throw new Error('Service down');
    };

    const result = await tester.testCircuitBreaker(failingOp, {
      failureThreshold: 3,
      resetTimeout: 1000,
      halfOpenRequests: 1,
    });

    expect(result.name).toBe('circuit-breaker');
    expect(result.passed).toBe(true);
    expect(callCount).toBeGreaterThanOrEqual(3);
  });

  it('tests retry logic with eventually succeeding operation', async () => {
    let attempts = 0;
    const eventuallySucceeds = async () => {
      attempts++;
      if (attempts < 3) throw new Error('Not yet');
      return 'success';
    };

    const result = await tester.testRetryLogic(eventuallySucceeds, {
      maxAttempts: 5,
      baseDelay: 10,
      maxDelay: 100,
      backoffMultiplier: 2,
    });

    expect(result.name).toBe('retry-logic');
    expect(result.passed).toBe(true);
    expect(result.details).toContain('Succeeded after 3 attempts');
  });

  it('tests retry logic with always-failing operation', async () => {
    const alwaysFails = async () => {
      throw new Error('Permanent failure');
    };

    const result = await tester.testRetryLogic(alwaysFails, {
      maxAttempts: 3,
      baseDelay: 10,
      maxDelay: 50,
      backoffMultiplier: 2,
    });

    expect(result.passed).toBe(true); // passes because all attempts were exhausted
    expect(result.details).toContain('Failed after 3 attempts');
  });

  it('tests graceful degradation with slow operation', async () => {
    const slowOp = () => new Promise((resolve) => setTimeout(resolve, 500));

    const result = await tester.testGracefulDegradation(slowOp, {
      fallbackResponse: { cached: true },
      timeout: 50,
    });

    expect(result.name).toBe('graceful-degradation');
    expect(result.passed).toBe(true);
    expect(result.details).toContain('fallback');
  });

  it('tests graceful degradation with fast operation', async () => {
    const fastOp = async () => ({ data: 'fresh' });

    const result = await tester.testGracefulDegradation(fastOp, {
      fallbackResponse: { cached: true },
      timeout: 5000,
    });

    expect(result.passed).toBe(true);
    expect(result.details).toContain('within timeout');
  });

  it('generates comprehensive report', async () => {
    const failingOp = async () => {
      throw new Error('down');
    };
    const successOp = async () => 'ok';

    await tester.testCircuitBreaker(failingOp, {
      failureThreshold: 2,
      resetTimeout: 1000,
      halfOpenRequests: 1,
    });

    await tester.testRetryLogic(successOp, {
      maxAttempts: 3,
      baseDelay: 10,
      maxDelay: 100,
      backoffMultiplier: 2,
    });

    const report = tester.generateReport('api-service');

    expect(report.serviceName).toBe('api-service');
    expect(report.tests).toHaveLength(2);
    expect(report.overallScore).toBeGreaterThanOrEqual(0);
    expect(report.overallScore).toBeLessThanOrEqual(100);
    expect(report.timestamp).toBeGreaterThan(0);
  });

  it('generates recommendations for failed tests', async () => {
    // Force a circuit breaker failure (operation succeeds so circuit never opens)
    const succeedingOp = async () => 'ok';

    await tester.testCircuitBreaker(succeedingOp, {
      failureThreshold: 5,
      resetTimeout: 1000,
      halfOpenRequests: 1,
    });

    const report = tester.generateReport('fragile-service');

    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it('clears results between tests', async () => {
    const op = async () => 'ok';
    await tester.testGracefulDegradation(op, { fallbackResponse: null, timeout: 1000 });

    expect(tester.getResults()).toHaveLength(1);
    tester.clearResults();
    expect(tester.getResults()).toHaveLength(0);
  });
});
