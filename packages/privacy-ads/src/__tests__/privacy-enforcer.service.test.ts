// ============================================================================
// Privacy-First Ads - Privacy Enforcer Service Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { PrivacyEnforcerService } from '../services/privacy-enforcer.service';

describe('PrivacyEnforcerService', () => {
  let service: PrivacyEnforcerService;

  beforeEach(() => {
    service = new PrivacyEnforcerService();
  });

  describe('validateRequest', () => {
    it('should accept clean requests with no tracking', () => {
      const result = service.validateRequest({
        'content-type': 'application/json',
        accept: 'application/json',
      });

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should reject requests with Facebook tracking cookies', () => {
      const result = service.validateRequest({
        cookie: '_fbp=fb.1.123456789; session=abc',
      });

      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0]).toContain('_fbp');
    });

    it('should reject requests with Google Analytics cookies', () => {
      const result = service.validateRequest({
        cookie: '_ga=GA1.2.123456789; _gid=GA1.2.987654321',
      });

      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThanOrEqual(2);
    });

    it('should reject requests with Google Ads cookies', () => {
      const result = service.validateRequest({
        cookie: '__gads=ID=abc123; other=value',
      });

      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.includes('__gads'))).toBe(true);
    });

    it('should reject requests with tracking referers', () => {
      const result = service.validateRequest({
        referer: 'https://doubleclick.net/pixel?id=123',
      });

      expect(result.valid).toBe(false);
      expect(result.violations[0]).toContain('doubleclick');
    });

    it('should reject requests with cross-site identifier header', () => {
      const result = service.validateRequest({
        'x-cross-site-id': 'tracking_id_123',
      });

      expect(result.valid).toBe(false);
      expect(result.violations[0]).toContain('cross-site');
    });

    it('should detect multiple violations in a single request', () => {
      const result = service.validateRequest({
        cookie: '_fbp=fb.1.123; _ga=GA1.2.456',
        referer: 'https://doubleclick.net/pixel',
        'x-cross-site-id': 'abc',
      });

      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('auditAdResponse', () => {
    it('should accept clean ad responses', () => {
      const response = {
        adId: 'ad_123',
        creative: 'https://cdn.ourservice.com/ad.png',
        headline: 'Great product',
      };

      const result = service.auditAdResponse(response);

      expect(result.clean).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should reject responses with tracking pixel URLs', () => {
      const response = {
        adId: 'ad_123',
        trackingUrl: 'https://doubleclick.net/pixel?id=abc',
      };

      const result = service.auditAdResponse(response);

      expect(result.clean).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should reject responses with Facebook tracking pixels', () => {
      const response = {
        adId: 'ad_123',
        pixel: 'https://facebook.com/tr?id=123',
      };

      const result = service.auditAdResponse(response);

      expect(result.clean).toBe(false);
    });
  });

  describe('getStrictCSPDirectives', () => {
    it('should return CSP directives blocking third-party resources', () => {
      const csp = service.getStrictCSPDirectives();

      expect(csp['default-src']).toContain("'self'");
      expect(csp['frame-src']).toContain("'none'");
      expect(csp['object-src']).toContain("'none'");
    });

    it('should block mixed content', () => {
      const csp = service.getStrictCSPDirectives();

      expect(csp['block-all-mixed-content']).toBeDefined();
      expect(csp['upgrade-insecure-requests']).toBeDefined();
    });

    it('should restrict connect-src to self only', () => {
      const csp = service.getStrictCSPDirectives();

      expect(csp['connect-src']).toEqual(["'self'"]);
    });
  });
});
