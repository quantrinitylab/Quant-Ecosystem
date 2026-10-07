import { describe, it, expect, beforeEach } from 'vitest';
import { WAFRuleEngine } from './waf-rules';
import type { WAFRequest } from '../types';

describe('WAFRuleEngine', () => {
  let waf: WAFRuleEngine;

  beforeEach(() => {
    waf = new WAFRuleEngine();
  });

  describe('evaluateRequest', () => {
    it('should block SQL injection in body', () => {
      const request: WAFRequest = {
        uri: '/api/users',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{ "name": "admin\' OR \'1\'=\'1" }',
        ip: '10.0.0.1',
      };
      const decision = waf.evaluateRequest(request);
      expect(decision.action).toBe('block');
      expect(decision.ruleId).toBeDefined();
    });

    it('should block XSS in body', () => {
      const request: WAFRequest = {
        uri: '/api/comments',
        method: 'POST',
        headers: {},
        body: '<script>alert(1)</script>',
        ip: '10.0.0.1',
      };
      const decision = waf.evaluateRequest(request);
      expect(decision.action).toBe('block');
    });

    it('should block path traversal in URI', () => {
      const request: WAFRequest = {
        uri: '/files/../../etc/passwd',
        method: 'GET',
        headers: {},
        ip: '10.0.0.1',
      };
      const decision = waf.evaluateRequest(request);
      expect(decision.action).toBe('block');
    });

    it('should block command injection in body', () => {
      const request: WAFRequest = {
        uri: '/api/exec',
        method: 'POST',
        headers: {},
        body: '; cat /etc/passwd',
        ip: '10.0.0.1',
      };
      const decision = waf.evaluateRequest(request);
      expect(decision.action).toBe('block');
    });

    it('should allow clean requests', () => {
      const request: WAFRequest = {
        uri: '/api/users',
        method: 'GET',
        headers: { 'content-type': 'application/json' },
        body: '{"name": "John Doe"}',
        ip: '10.0.0.1',
      };
      const decision = waf.evaluateRequest(request);
      expect(decision.action).toBe('allow');
    });

    it('should block local file inclusion', () => {
      const request: WAFRequest = {
        uri: '/page?file=/etc/passwd',
        method: 'GET',
        headers: {},
        ip: '10.0.0.1',
      };
      const decision = waf.evaluateRequest(request);
      expect(decision.action).toBe('block');
    });
  });

  describe('addCustomRule', () => {
    it('should add and evaluate custom rules', () => {
      waf.addCustomRule({
        id: 'CUSTOM-001',
        name: 'Block admin path',
        pattern: '\\/admin',
        target: 'uri',
        action: 'block',
        severity: 'high',
        enabled: true,
      });

      const request: WAFRequest = {
        uri: '/admin/dashboard',
        method: 'GET',
        headers: {},
        ip: '10.0.0.1',
      };
      const decision = waf.evaluateRequest(request);
      expect(decision.action).toBe('block');
      expect(decision.ruleId).toBe('CUSTOM-001');
    });
  });

  describe('toggleRule', () => {
    it('should disable a rule', () => {
      waf.toggleRule('WAF-005', false);
      const request: WAFRequest = {
        uri: '/files/../../etc/passwd',
        method: 'GET',
        headers: {},
        ip: '10.0.0.1',
      };
      const decision = waf.evaluateRequest(request);
      // Path traversal rule disabled, but file inclusion rule still catches /etc/passwd
      expect(decision.ruleId).not.toBe('WAF-005');
    });
  });

  describe('getBlockedRequests', () => {
    it('should track blocked requests', () => {
      const request: WAFRequest = {
        uri: '/api/test',
        method: 'POST',
        headers: {},
        body: '<script>alert(1)</script>',
        ip: '192.168.1.1',
      };
      waf.evaluateRequest(request);
      waf.evaluateRequest({ ...request, ip: '192.168.1.2' });

      const stats = waf.getBlockedRequests({
        start: Date.now() - 60000,
        end: Date.now() + 1000,
      });
      expect(stats.total).toBe(2);
      expect(stats.byIP['192.168.1.1']).toBe(1);
      expect(stats.byIP['192.168.1.2']).toBe(1);
    });
  });

  describe('getRules', () => {
    it('should return all rules', () => {
      const rules = waf.getRules();
      expect(rules.length).toBeGreaterThan(0);
      expect(rules[0]!.id).toMatch(/^WAF-/);
    });
  });

  describe('rule priority ordering', () => {
    it('should prioritize block rules over log rules for the same request', () => {
      // Add a log rule that matches the same content as a block rule
      waf.addCustomRule({
        id: 'CUSTOM-LOG',
        name: 'Log script tags',
        pattern: '<script',
        target: 'body',
        action: 'log',
        severity: 'low',
        enabled: true,
      });

      const request: WAFRequest = {
        uri: '/api/test',
        method: 'POST',
        headers: {},
        body: '<script>alert(1)</script>',
        ip: '10.0.0.1',
      };

      const decision = waf.evaluateRequest(request);
      // Block rule should take precedence over log rule
      expect(decision.action).toBe('block');
    });

    it('should sort rules by action severity: block > challenge > log', () => {
      const customWaf = new WAFRuleEngine([
        {
          id: 'LOG-1',
          name: 'Log all posts',
          pattern: 'test-payload',
          target: 'body',
          action: 'log',
          severity: 'low',
          enabled: true,
        },
        {
          id: 'BLOCK-1',
          name: 'Block test payload',
          pattern: 'test-payload',
          target: 'body',
          action: 'block',
          severity: 'critical',
          enabled: true,
        },
      ]);

      const request: WAFRequest = {
        uri: '/api/test',
        method: 'POST',
        headers: {},
        body: 'test-payload',
        ip: '10.0.0.1',
      };

      const decision = customWaf.evaluateRequest(request);
      expect(decision.action).toBe('block');
      expect(decision.ruleId).toBe('BLOCK-1');
    });
  });
});
