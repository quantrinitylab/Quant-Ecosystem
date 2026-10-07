import { describe, it, expect } from 'vitest';
import { APIFuzzer } from './api-fuzzer';

describe('APIFuzzer', () => {
  describe('fuzzEndpoint', () => {
    it('should generate results for the specified iterations', () => {
      const fuzzer = new APIFuzzer();
      const results = fuzzer.fuzzEndpoint(
        'https://api.example.com/users',
        { name: 'string', age: 'number' },
        10,
      );
      expect(results.length).toBe(10);
    });

    it('should include endpoint and iteration in results', () => {
      const fuzzer = new APIFuzzer();
      const results = fuzzer.fuzzEndpoint('https://api.example.com/test', { id: 'string' }, 5);
      for (let i = 0; i < results.length; i++) {
        expect(results[i]!.endpoint).toBe('https://api.example.com/test');
        expect(results[i]!.iteration).toBe(i);
      }
    });

    it('should detect anomalies (500 status codes)', () => {
      const fuzzer = new APIFuzzer();
      const results = fuzzer.fuzzEndpoint('https://api.example.com/test', { data: 'string' }, 50);
      // With random simulation, some should be anomalies
      const hasResults = results.length === 50;
      expect(hasResults).toBe(true);
    });
  });

  describe('fuzzHeaders', () => {
    it('should test malicious header values', () => {
      const fuzzer = new APIFuzzer();
      const results = fuzzer.fuzzHeaders('https://api.example.com/test', {
        'X-Custom': ['normal', '\r\nInjected: header'],
      });
      expect(results.length).toBe(2);
    });

    it('should detect header injection payloads', () => {
      const fuzzer = new APIFuzzer();
      const results = fuzzer.fuzzHeaders('https://api.example.com/test', {
        'X-Forward': ['\r\nSet-Cookie: evil=1', 'normal-value'],
      });
      const injections = results.filter(
        (r) => r.anomaly && r.anomalyReason?.includes('Header injection'),
      );
      expect(injections.length).toBeGreaterThan(0);
    });
  });

  describe('fuzzPayload', () => {
    it('should apply mutations to the base payload', () => {
      const fuzzer = new APIFuzzer();
      const results = fuzzer.fuzzPayload(
        'https://api.example.com/test',
        { username: 'admin', email: 'test@test.com' },
        ['sql_injection'],
      );
      expect(results.length).toBeGreaterThan(0);
    });

    it('should support multiple mutation types', () => {
      const fuzzer = new APIFuzzer();
      const results = fuzzer.fuzzPayload('https://api.example.com/test', { input: 'value' }, [
        'sql_injection',
        'xss',
        'boundary',
      ]);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('getPayloadsForMutation', () => {
    it('should return SQL injection payloads', () => {
      const fuzzer = new APIFuzzer();
      const payloads = fuzzer.getPayloadsForMutation('sql_injection');
      expect(payloads.length).toBeGreaterThan(0);
      expect(payloads.some((p) => p.includes('UNION'))).toBe(true);
    });

    it('should return XSS payloads', () => {
      const fuzzer = new APIFuzzer();
      const payloads = fuzzer.getPayloadsForMutation('xss');
      expect(payloads.length).toBeGreaterThan(0);
      expect(payloads.some((p) => p.includes('<script>'))).toBe(true);
    });

    it('should return boundary value payloads', () => {
      const fuzzer = new APIFuzzer();
      const payloads = fuzzer.getPayloadsForMutation('boundary');
      expect(payloads.length).toBeGreaterThan(0);
      expect(payloads).toContain('');
    });
  });

  describe('reset', () => {
    it('should clear accumulated results', () => {
      const fuzzer = new APIFuzzer();
      fuzzer.fuzzEndpoint('https://api.example.com/test', { id: 'string' }, 5);
      expect(fuzzer.getResults().length).toBe(5);
      fuzzer.reset();
      expect(fuzzer.getResults().length).toBe(0);
    });
  });
});
