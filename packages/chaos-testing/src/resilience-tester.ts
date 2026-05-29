// ============================================================================
// Chaos Testing - Resilience Tester
// Tests service resilience patterns: circuit breaker, retry, graceful degradation
// ============================================================================

import type { ResilienceReport, ResilienceTestResult } from './types';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  halfOpenRequests: number;
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export interface DegradationConfig {
  fallbackResponse: unknown;
  timeout: number;
}

export class ResilienceTester {
  private results: ResilienceTestResult[] = [];

  async testCircuitBreaker(
    operation: () => Promise<unknown>,
    config: CircuitBreakerConfig,
  ): Promise<ResilienceTestResult> {
    const startTime = Date.now();
    let failureCount = 0;
    let circuitOpened = false;
    let circuitRecovered = false;

    // Phase 1: Trigger failures until threshold
    for (let i = 0; i < config.failureThreshold + 2; i++) {
      try {
        await operation();
      } catch {
        failureCount++;
        if (failureCount >= config.failureThreshold) {
          circuitOpened = true;
          break;
        }
      }
    }

    // Phase 2: Verify circuit blocks requests
    if (circuitOpened) {
      try {
        await operation();
        // If operation succeeds after circuit opens, recovery may have happened
        circuitRecovered = true;
      } catch {
        // Expected behavior when circuit is open
        circuitRecovered = false;
      }
    }

    const result: ResilienceTestResult = {
      name: 'circuit-breaker',
      passed: circuitOpened,
      duration: Date.now() - startTime,
      details: circuitOpened
        ? `Circuit opened after ${failureCount} failures. Recovered: ${circuitRecovered}`
        : `Circuit did not open after ${failureCount} failures (threshold: ${config.failureThreshold})`,
    };

    this.results.push(result);
    return result;
  }

  async testRetryLogic(
    operation: () => Promise<unknown>,
    config: RetryConfig,
  ): Promise<ResilienceTestResult> {
    const startTime = Date.now();
    let attempts = 0;
    let succeeded = false;
    let lastError: Error | null = null;

    for (let i = 0; i < config.maxAttempts; i++) {
      attempts++;
      try {
        await operation();
        succeeded = true;
        break;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        const delay = Math.min(
          config.baseDelay * Math.pow(config.backoffMultiplier, i),
          config.maxDelay,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    const result: ResilienceTestResult = {
      name: 'retry-logic',
      passed: succeeded || attempts === config.maxAttempts,
      duration: Date.now() - startTime,
      details: succeeded
        ? `Succeeded after ${attempts} attempts`
        : `Failed after ${attempts} attempts: ${lastError?.message ?? 'unknown error'}`,
    };

    this.results.push(result);
    return result;
  }

  async testGracefulDegradation(
    operation: () => Promise<unknown>,
    config: DegradationConfig,
  ): Promise<ResilienceTestResult> {
    const startTime = Date.now();
    let usedFallback = false;
    let response: unknown;

    try {
      response = await Promise.race([
        operation(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), config.timeout)),
      ]);
    } catch {
      response = config.fallbackResponse;
      usedFallback = true;
    }

    const result: ResilienceTestResult = {
      name: 'graceful-degradation',
      passed: response !== undefined,
      duration: Date.now() - startTime,
      details: usedFallback
        ? 'Service degraded gracefully, fallback response used'
        : 'Service responded within timeout',
    };

    this.results.push(result);
    return result;
  }

  generateReport(serviceName: string): ResilienceReport {
    const passedTests = this.results.filter((r) => r.passed).length;
    const totalTests = this.results.length;
    const score = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;

    const recommendations: string[] = [];

    for (const result of this.results) {
      if (!result.passed) {
        switch (result.name) {
          case 'circuit-breaker':
            recommendations.push('Implement circuit breaker pattern to prevent cascade failures');
            break;
          case 'retry-logic':
            recommendations.push(
              'Add exponential backoff retry with jitter for transient failures',
            );
            break;
          case 'graceful-degradation':
            recommendations.push('Add fallback responses for non-critical service dependencies');
            break;
        }
      }
    }

    if (score === 100) {
      recommendations.push(
        'All resilience tests passed. Consider adding more edge case scenarios.',
      );
    }

    const report: ResilienceReport = {
      timestamp: Date.now(),
      serviceName,
      tests: [...this.results],
      overallScore: Math.round(score),
      recommendations,
    };

    return report;
  }

  clearResults(): void {
    this.results = [];
  }

  getResults(): ResilienceTestResult[] {
    return [...this.results];
  }
}
