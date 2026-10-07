import { describe, it, expect, beforeEach } from 'vitest';
import { PenTestScanner } from './pen-test-scanner';

describe('PenTestScanner', () => {
  let scanner: PenTestScanner;

  beforeEach(() => {
    scanner = new PenTestScanner();
  });

  describe('scanEndpoint', () => {
    it('should detect missing authorization on DELETE requests', () => {
      const findings = scanner.scanEndpoint('https://api.example.com/users/1', 'DELETE', {});
      const accessControl = findings.filter((f) => f.category === 'access_control');
      expect(accessControl.length).toBeGreaterThan(0);
    });

    it('should detect path traversal patterns', () => {
      const findings = scanner.scanEndpoint('https://api.example.com/../etc/passwd', 'GET');
      const traversal = findings.filter((f) => f.title.includes('Path Traversal'));
      expect(traversal.length).toBeGreaterThan(0);
      expect(traversal[0]!.severity).toBe('critical');
    });

    it('should detect HTTP transport (non-localhost)', () => {
      const findings = scanner.scanEndpoint('http://api.example.com/data', 'GET');
      const crypto = findings.filter((f) => f.category === 'cryptography');
      expect(crypto.length).toBeGreaterThan(0);
    });

    it('should detect basic auth usage', () => {
      const findings = scanner.scanEndpoint('https://api.example.com/data', 'GET', {
        authorization: 'Basic dXNlcjpwYXNz',
      });
      const basicAuth = findings.filter((f) => f.title.includes('Basic Authentication'));
      expect(basicAuth.length).toBeGreaterThan(0);
    });

    it('should detect weak tokens', () => {
      const findings = scanner.scanEndpoint('https://api.example.com/data', 'GET', {
        authorization: 'Bearer short',
      });
      const weak = findings.filter((f) => f.title.includes('Weak Authentication'));
      expect(weak.length).toBeGreaterThan(0);
    });

    it('should detect missing security headers', () => {
      const findings = scanner.scanEndpoint('https://api.example.com/data', 'GET', {});
      const misconfig = findings.filter((f) => f.category === 'misconfiguration');
      expect(misconfig.length).toBeGreaterThan(0);
    });

    it('should not flag localhost URLs for SSRF', () => {
      const findings = scanner.scanEndpoint('http://localhost:3000/health', 'GET');
      const ssrf = findings.filter((f) => f.category === 'ssrf');
      expect(ssrf.length).toBe(0);
    });
  });

  describe('generateReport', () => {
    it('should generate a structured report with severity summary', () => {
      scanner.scanEndpoint('http://api.example.com/../secret', 'DELETE', {});
      const report = scanner.generateReport();

      expect(report.scanId).toMatch(/^scan-/);
      expect(report.timestamp).toBeGreaterThan(0);
      expect(report.findings.length).toBeGreaterThan(0);
      expect(report.summary.total).toBe(report.findings.length);
      expect(
        report.summary.critical +
          report.summary.high +
          report.summary.medium +
          report.summary.low +
          report.summary.info,
      ).toBe(report.summary.total);
    });

    it('should accept custom findings list', () => {
      const findings = scanner.scanEndpoint('http://api.example.com/data', 'GET');
      const report = scanner.generateReport(findings);
      expect(report.findings).toEqual(findings);
    });
  });

  describe('reset', () => {
    it('should clear accumulated findings', () => {
      scanner.scanEndpoint('http://api.example.com/data', 'GET');
      expect(scanner.getFindings().length).toBeGreaterThan(0);
      scanner.reset();
      expect(scanner.getFindings().length).toBe(0);
    });
  });
});
