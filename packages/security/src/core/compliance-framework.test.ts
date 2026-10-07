import { describe, it, expect, beforeEach } from 'vitest';
import { ComplianceFramework } from './compliance-framework';

describe('ComplianceFramework', () => {
  let framework: ComplianceFramework;

  beforeEach(() => {
    framework = new ComplianceFramework();
  });

  describe('auditCompliance', () => {
    it('should audit GDPR controls', () => {
      const result = framework.auditCompliance('GDPR');
      expect(result.framework).toBe('GDPR');
      expect(result.controls.length).toBeGreaterThan(0);
      expect(result.summary.total).toBe(result.controls.length);
    });

    it('should audit CCPA controls', () => {
      const result = framework.auditCompliance('CCPA');
      expect(result.framework).toBe('CCPA');
      expect(result.controls.length).toBeGreaterThan(0);
    });

    it('should audit PCI-DSS controls', () => {
      const result = framework.auditCompliance('PCI-DSS');
      expect(result.framework).toBe('PCI-DSS');
      expect(result.controls.length).toBeGreaterThan(0);
    });

    it('should audit SOC2 controls', () => {
      const result = framework.auditCompliance('SOC2');
      expect(result.framework).toBe('SOC2');
      expect(result.controls.length).toBeGreaterThan(0);
    });

    it('should audit DPDP controls', () => {
      const result = framework.auditCompliance('DPDP');
      expect(result.framework).toBe('DPDP');
      expect(result.controls.length).toBeGreaterThan(0);
    });

    it('should audit COPPA controls', () => {
      const result = framework.auditCompliance('COPPA');
      expect(result.framework).toBe('COPPA');
      expect(result.controls.length).toBeGreaterThan(0);
    });

    it('should reflect implemented controls as passing', () => {
      framework.markControlImplemented('GDPR-01');
      framework.markControlImplemented('GDPR-02');
      const result = framework.auditCompliance('GDPR');
      const passing = result.controls.filter((c) => c.status === 'pass');
      expect(passing.length).toBe(2);
    });

    it('should calculate score based on pass/fail ratio', () => {
      framework.markControlImplemented('GDPR-01');
      framework.markControlImplemented('GDPR-02');
      framework.markControlImplemented('GDPR-03');
      const result = framework.auditCompliance('GDPR');
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });

  describe('generateDPIA', () => {
    it('should generate a DPIA report', () => {
      const report = framework.generateDPIA('identity', [
        {
          source: 'user',
          destination: 'identity-db',
          dataType: 'personal information',
          purpose: 'authentication',
          legalBasis: 'contract',
          retention: '2 years',
        },
      ]);

      expect(report.service).toBe('identity');
      expect(report.dataFlows.length).toBe(1);
      expect(report.risks.length).toBeGreaterThan(0);
      expect(report.mitigations.length).toBeGreaterThan(0);
      expect(report.generatedAt).toBeGreaterThan(0);
    });

    it('should identify risks for external data flows', () => {
      const report = framework.generateDPIA('analytics', [
        {
          source: 'user',
          destination: 'external-analytics',
          dataType: 'usage data',
          purpose: 'analytics',
          legalBasis: 'consent',
          retention: '1 year',
        },
      ]);

      const externalRisks = report.risks.filter((r) => r.description.includes('external'));
      expect(externalRisks.length).toBeGreaterThan(0);
    });
  });

  describe('generateSBOM', () => {
    it('should generate CycloneDX format SBOM', () => {
      const sbom = framework.generateSBOM([
        { name: 'express', version: '4.18.0', license: 'MIT' },
        { name: 'zod', version: '3.24.0', license: 'MIT' },
      ]);

      expect(sbom.bomFormat).toBe('CycloneDX');
      expect(sbom.specVersion).toBe('1.5');
      expect(sbom.components.length).toBe(2);
      expect(sbom.components[0]!.purl).toBe('pkg:npm/express@4.18.0');
    });
  });

  describe('checkDataRetention', () => {
    it('should pass when all retention policies are met', () => {
      const result = framework.checkDataRetention('identity', [
        { category: 'user_data', retentionDays: 730, actualDays: 365 },
        { category: 'logs', retentionDays: 90, actualDays: 60 },
      ]);
      expect(result.compliant).toBe(true);
      expect(result.violations.length).toBe(0);
    });

    it('should detect retention violations', () => {
      const result = framework.checkDataRetention('analytics', [
        { category: 'session_data', retentionDays: 30, actualDays: 90 },
      ]);
      expect(result.compliant).toBe(false);
      expect(result.violations.length).toBe(1);
      expect(result.violations[0]!.category).toBe('session_data');
    });
  });

  describe('checkConsentRecords', () => {
    it('should pass for valid consent records', () => {
      const result = framework.checkConsentRecords('user-123', [
        { purpose: 'marketing', granted: true, timestamp: Date.now(), version: '1.0' },
      ]);
      expect(result.valid).toBe(true);
      expect(result.issues.length).toBe(0);
    });

    it('should fail when no consent records exist', () => {
      const result = framework.checkConsentRecords('user-456', []);
      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should detect missing purpose in consent records', () => {
      const result = framework.checkConsentRecords('user-789', [
        { purpose: '', granted: true, timestamp: Date.now(), version: '1.0' },
      ]);
      expect(result.valid).toBe(false);
    });
  });
});
