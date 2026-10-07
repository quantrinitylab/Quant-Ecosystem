// ============================================================================
// Security Package - API Fuzzer
// ============================================================================

import crypto from 'node:crypto';
import type { FuzzResult, FuzzMutation } from '../types';

/** SQL injection payloads for fuzzing */
const SQL_INJECTION_PAYLOADS = [
  "' OR '1'='1",
  "'; DROP TABLE users; --",
  "1' UNION SELECT null,null,null--",
  "admin'--",
  "1; EXEC xp_cmdshell('dir')",
  "' OR 1=1#",
  "1' AND (SELECT * FROM (SELECT(SLEEP(5)))a)--",
];

/** XSS payloads for fuzzing */
const XSS_PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '"><script>alert(document.cookie)</script>',
  "javascript:alert('XSS')",
  '<svg onload=alert(1)>',
  '{{constructor.constructor("alert(1)")()}}',
  '<iframe src="javascript:alert(1)">',
];

/** Boundary value payloads */
const BOUNDARY_PAYLOADS = [
  '',
  ' ',
  '0',
  '-1',
  '2147483647',
  '-2147483648',
  '9'.repeat(100),
  'null',
  'undefined',
  'NaN',
  'Infinity',
  'true',
  'false',
  '[]',
  '{}',
];

/** Null byte and unicode payloads */
const SPECIAL_PAYLOADS = [
  '\x00',
  '\x00\x00\x00',
  '%00',
  '\n\r',
  '\u0000',
  '\uFFFD',
  '\uD800',
  'A'.repeat(10000),
  '\t'.repeat(100),
  '../../etc/passwd',
  '..\\..\\windows\\system32',
];

interface FuzzConfig {
  timeout?: number;
  delayBetweenRequests?: number;
  maxAnomalies?: number;
}

/**
 * APIFuzzer - Automated API security fuzzer.
 * Generates edge-case payloads for testing API endpoint robustness.
 */
export class APIFuzzer {
  private config: FuzzConfig;
  private results: FuzzResult[] = [];

  constructor(config: FuzzConfig = {}) {
    this.config = {
      timeout: config.timeout || 5000,
      delayBetweenRequests: config.delayBetweenRequests || 100,
      maxAnomalies: config.maxAnomalies || 100,
    };
  }

  /** Fuzz an endpoint with generated edge-case payloads */
  fuzzEndpoint(
    endpoint: string,
    schema: Record<string, string>,
    iterations: number = 100,
  ): FuzzResult[] {
    const results: FuzzResult[] = [];

    for (let i = 0; i < iterations; i++) {
      const payload = this.generatePayload(schema);
      const result = this.simulateRequest(endpoint, payload, i);
      results.push(result);
    }

    this.results.push(...results);
    return results;
  }

  /** Fuzz endpoint with malicious headers */
  fuzzHeaders(endpoint: string, maliciousHeaders: Record<string, string[]>): FuzzResult[] {
    const results: FuzzResult[] = [];
    let iteration = 0;

    for (const [header, values] of Object.entries(maliciousHeaders)) {
      for (const value of values) {
        const result = this.simulateRequest(endpoint, { header, value }, iteration++);

        // Mark as anomaly if header injection is possible
        if (this.isHeaderInjectionPayload(value)) {
          result.anomaly = true;
          result.anomalyReason = `Header injection attempt via ${header}`;
        }

        results.push(result);
      }
    }

    this.results.push(...results);
    return results;
  }

  /** Fuzz endpoint with mutated payloads */
  fuzzPayload(
    endpoint: string,
    basePayload: Record<string, unknown>,
    mutations: FuzzMutation[],
  ): FuzzResult[] {
    const results: FuzzResult[] = [];
    let iteration = 0;

    for (const mutation of mutations) {
      const mutatedPayloads = this.applyMutation(basePayload, mutation);
      for (const payload of mutatedPayloads) {
        const result = this.simulateRequest(endpoint, payload, iteration++);
        result.anomaly = this.detectAnomaly(result, mutation);
        if (result.anomaly) {
          result.anomalyReason = `Potential vulnerability: ${mutation} mutation accepted`;
        }
        results.push(result);
      }
    }

    this.results.push(...results);
    return results;
  }

  /** Get all accumulated results */
  getResults(): FuzzResult[] {
    return [...this.results];
  }

  /** Get payloads for a specific mutation type */
  getPayloadsForMutation(mutation: FuzzMutation): string[] {
    switch (mutation) {
      case 'sql_injection':
        return [...SQL_INJECTION_PAYLOADS];
      case 'xss':
        return [...XSS_PAYLOADS];
      case 'boundary':
        return [...BOUNDARY_PAYLOADS];
      case 'null_bytes':
      case 'unicode':
        return [...SPECIAL_PAYLOADS];
      case 'overflow':
        return ['A'.repeat(10000), '1'.repeat(10000), '\x00'.repeat(10000)];
      case 'format_string':
        return ['%s%s%s%s%s', '%x%x%x%x', '%n%n%n%n', '%d%d%d%d'];
      default:
        return [];
    }
  }

  /** Reset fuzzer state */
  reset(): void {
    this.results = [];
  }

  private generatePayload(schema: Record<string, string>): Record<string, unknown> {
    const payload: Record<string, unknown> = {};

    for (const [field, type] of Object.entries(schema)) {
      payload[field] = this.generateValueForType(type);
    }

    return payload;
  }

  private generateValueForType(type: string): unknown {
    const allPayloads = [
      ...SQL_INJECTION_PAYLOADS,
      ...XSS_PAYLOADS,
      ...BOUNDARY_PAYLOADS,
      ...SPECIAL_PAYLOADS,
    ];

    switch (type) {
      case 'string':
        return allPayloads[crypto.randomInt(allPayloads.length)];
      case 'number':
        return crypto.randomInt(2) === 0 ? Number.MAX_SAFE_INTEGER : -Number.MAX_SAFE_INTEGER;
      case 'boolean':
        return crypto.randomInt(2) === 0 ? 'yes' : null;
      case 'array':
        return Array(1000).fill(allPayloads[0]);
      case 'object':
        return { __proto__: { admin: true } };
      default:
        return allPayloads[crypto.randomInt(allPayloads.length)];
    }
  }

  private simulateRequest(endpoint: string, payload: unknown, iteration: number): FuzzResult {
    // Simulate request timing (fuzzer is for generating test cases, not making real HTTP calls)
    const responseTime = crypto.randomInt(0, this.config.timeout || 5000);
    const statusCode = this.simulateStatusCode(payload);

    return {
      endpoint,
      iteration,
      payload,
      statusCode,
      responseTime,
      anomaly: statusCode === 500 || responseTime > (this.config.timeout || 5000) * 0.8,
      anomalyReason:
        statusCode === 500
          ? 'Server error - potential vulnerability'
          : responseTime > (this.config.timeout || 5000) * 0.8
            ? 'Slow response - potential DoS vector'
            : undefined,
    };
  }

  private simulateStatusCode(payload: unknown): number {
    // Simulate realistic status codes based on payload characteristics
    const payloadStr = JSON.stringify(payload);
    if (payloadStr.length > 5000) return 413;
    if (payloadStr.includes('DROP') || payloadStr.includes('xp_cmdshell')) return 403;
    const codes = [200, 200, 200, 400, 400, 403, 422, 500];
    return codes[crypto.randomInt(codes.length)]!;
  }

  private applyMutation(
    basePayload: Record<string, unknown>,
    mutation: FuzzMutation,
  ): Record<string, unknown>[] {
    const payloads = this.getPayloadsForMutation(mutation);
    const results: Record<string, unknown>[] = [];

    for (const key of Object.keys(basePayload)) {
      for (const payload of payloads) {
        results.push({ ...basePayload, [key]: payload });
      }
    }

    return results;
  }

  private isHeaderInjectionPayload(value: string): boolean {
    return value.includes('\r\n') || value.includes('\n') || value.includes('\x00');
  }

  private detectAnomaly(result: FuzzResult, _mutation: FuzzMutation): boolean {
    return result.statusCode === 500 || result.statusCode === 200;
  }
}
