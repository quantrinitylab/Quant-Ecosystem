// ============================================================================
// Security Package - Compliance Framework
// ============================================================================

import crypto from 'node:crypto';
import type {
  ComplianceControl,
  ComplianceAuditResult,
  ComplianceFrameworkType,
  DPIAReport,
  DataFlow,
  DPIARisk,
  SBOMEntry,
  SBOMOutput,
} from '../types';

/** GDPR controls */
const GDPR_CONTROLS: Omit<ComplianceControl, 'status'>[] = [
  {
    id: 'GDPR-01',
    framework: 'GDPR',
    category: 'Data Subject Rights',
    title: 'Right to Access',
    description: 'Data subjects can request access to their personal data (Art. 15)',
  },
  {
    id: 'GDPR-02',
    framework: 'GDPR',
    category: 'Data Subject Rights',
    title: 'Right to Erasure',
    description: 'Data subjects can request deletion of their data (Art. 17)',
  },
  {
    id: 'GDPR-03',
    framework: 'GDPR',
    category: 'Data Subject Rights',
    title: 'Right to Portability',
    description: 'Data subjects can request data in machine-readable format (Art. 20)',
  },
  {
    id: 'GDPR-04',
    framework: 'GDPR',
    category: 'Data Subject Rights',
    title: 'Right to Rectification',
    description: 'Data subjects can request correction of inaccurate data (Art. 16)',
  },
  {
    id: 'GDPR-05',
    framework: 'GDPR',
    category: 'Governance',
    title: 'Data Protection Officer',
    description: 'DPO appointed where required (Art. 37)',
  },
  {
    id: 'GDPR-06',
    framework: 'GDPR',
    category: 'Governance',
    title: 'Breach Notification',
    description: 'Supervisory authority notified within 72 hours of breach (Art. 33)',
  },
  {
    id: 'GDPR-07',
    framework: 'GDPR',
    category: 'Governance',
    title: 'Records of Processing',
    description: 'Maintain records of processing activities (Art. 30)',
  },
  {
    id: 'GDPR-08',
    framework: 'GDPR',
    category: 'Security',
    title: 'Encryption at Rest',
    description: 'Personal data encrypted at rest using industry-standard algorithms',
  },
  {
    id: 'GDPR-09',
    framework: 'GDPR',
    category: 'Security',
    title: 'Encryption in Transit',
    description: 'Personal data encrypted in transit using TLS 1.3',
  },
  {
    id: 'GDPR-10',
    framework: 'GDPR',
    category: 'Consent',
    title: 'Consent Management',
    description: 'Lawful basis established and documented for all processing (Art. 6)',
  },
];

/** CCPA controls */
const CCPA_CONTROLS: Omit<ComplianceControl, 'status'>[] = [
  {
    id: 'CCPA-01',
    framework: 'CCPA',
    category: 'Consumer Rights',
    title: 'Right to Know',
    description: 'Consumers can request disclosure of personal information collected',
  },
  {
    id: 'CCPA-02',
    framework: 'CCPA',
    category: 'Consumer Rights',
    title: 'Right to Delete',
    description: 'Consumers can request deletion of personal information',
  },
  {
    id: 'CCPA-03',
    framework: 'CCPA',
    category: 'Consumer Rights',
    title: 'Right to Opt-Out',
    description: 'Consumers can opt out of sale of personal information',
  },
  {
    id: 'CCPA-04',
    framework: 'CCPA',
    category: 'Consumer Rights',
    title: 'Non-Discrimination',
    description: 'No discrimination for exercising privacy rights',
  },
  {
    id: 'CCPA-05',
    framework: 'CCPA',
    category: 'Disclosure',
    title: 'Privacy Notice',
    description: 'Privacy notice at or before point of collection',
  },
  {
    id: 'CCPA-06',
    framework: 'CCPA',
    category: 'Disclosure',
    title: 'Financial Incentives',
    description: 'Financial incentive programs disclosed and opt-in',
  },
];

/** PCI-DSS controls */
const PCI_DSS_CONTROLS: Omit<ComplianceControl, 'status'>[] = [
  {
    id: 'PCI-01',
    framework: 'PCI-DSS',
    category: 'Network Security',
    title: 'Network Segmentation',
    description: 'Cardholder data environment segmented from other networks',
  },
  {
    id: 'PCI-02',
    framework: 'PCI-DSS',
    category: 'Network Security',
    title: 'Firewall Configuration',
    description: 'Firewalls installed and maintained between CDE and untrusted networks',
  },
  {
    id: 'PCI-03',
    framework: 'PCI-DSS',
    category: 'Data Protection',
    title: 'Encryption of Stored Data',
    description: 'Stored cardholder data encrypted using strong cryptography',
  },
  {
    id: 'PCI-04',
    framework: 'PCI-DSS',
    category: 'Data Protection',
    title: 'Encryption in Transit',
    description: 'Cardholder data encrypted during transmission over open networks',
  },
  {
    id: 'PCI-05',
    framework: 'PCI-DSS',
    category: 'Access Control',
    title: 'Least Privilege',
    description: 'Access to cardholder data restricted to need-to-know basis',
  },
  {
    id: 'PCI-06',
    framework: 'PCI-DSS',
    category: 'Access Control',
    title: 'Unique IDs',
    description: 'Unique ID assigned to each person with computer access',
  },
  {
    id: 'PCI-07',
    framework: 'PCI-DSS',
    category: 'Monitoring',
    title: 'Audit Logging',
    description: 'All access to cardholder data logged and monitored',
  },
  {
    id: 'PCI-08',
    framework: 'PCI-DSS',
    category: 'Testing',
    title: 'Vulnerability Scanning',
    description: 'Regular vulnerability scans and penetration tests conducted',
  },
];

/** SOC 2 controls */
const SOC2_CONTROLS: Omit<ComplianceControl, 'status'>[] = [
  {
    id: 'SOC2-01',
    framework: 'SOC2',
    category: 'Security',
    title: 'Logical Access Controls',
    description: 'Logical access controls prevent unauthorized access',
  },
  {
    id: 'SOC2-02',
    framework: 'SOC2',
    category: 'Security',
    title: 'Change Management',
    description: 'Changes to infrastructure and software follow change management process',
  },
  {
    id: 'SOC2-03',
    framework: 'SOC2',
    category: 'Availability',
    title: 'Capacity Planning',
    description: 'System capacity monitored and planned to meet availability commitments',
  },
  {
    id: 'SOC2-04',
    framework: 'SOC2',
    category: 'Availability',
    title: 'Disaster Recovery',
    description: 'DR plan tested and maintained for business continuity',
  },
  {
    id: 'SOC2-05',
    framework: 'SOC2',
    category: 'Confidentiality',
    title: 'Data Classification',
    description: 'Data classified and protected according to sensitivity',
  },
  {
    id: 'SOC2-06',
    framework: 'SOC2',
    category: 'Processing Integrity',
    title: 'Input Validation',
    description: 'System inputs validated for completeness and accuracy',
  },
  {
    id: 'SOC2-07',
    framework: 'SOC2',
    category: 'Privacy',
    title: 'Privacy Notice',
    description: 'Privacy commitments communicated to data subjects',
  },
];

/** DPDP 2023 controls */
const DPDP_CONTROLS: Omit<ComplianceControl, 'status'>[] = [
  {
    id: 'DPDP-01',
    framework: 'DPDP',
    category: 'Consent',
    title: 'Purpose Limitation',
    description: 'Personal data processed only for the purpose for which consent was given',
  },
  {
    id: 'DPDP-02',
    framework: 'DPDP',
    category: 'Consent',
    title: 'Notice and Consent',
    description: 'Clear and specific notice given before obtaining consent',
  },
  {
    id: 'DPDP-03',
    framework: 'DPDP',
    category: 'Rights',
    title: 'Right to Correction',
    description: 'Data principals can request correction or erasure of data',
  },
  {
    id: 'DPDP-04',
    framework: 'DPDP',
    category: 'Rights',
    title: 'Right to Grievance',
    description: 'Grievance redressal mechanism available to data principals',
  },
  {
    id: 'DPDP-05',
    framework: 'DPDP',
    category: 'Obligations',
    title: 'Data Fiduciary Duties',
    description: 'Data fiduciary ensures accuracy, completeness, and security of data',
  },
  {
    id: 'DPDP-06',
    framework: 'DPDP',
    category: 'Cross-Border',
    title: 'Data Localization',
    description: 'Transfer restrictions to non-approved jurisdictions enforced',
  },
];

/** COPPA controls */
const COPPA_CONTROLS: Omit<ComplianceControl, 'status'>[] = [
  {
    id: 'COPPA-01',
    framework: 'COPPA',
    category: 'Consent',
    title: 'Verifiable Parental Consent',
    description:
      'Verifiable parental consent obtained before collecting data from children under 13',
  },
  {
    id: 'COPPA-02',
    framework: 'COPPA',
    category: 'Notice',
    title: 'Direct Notice to Parents',
    description: 'Direct notice to parents about data collection practices',
  },
  {
    id: 'COPPA-03',
    framework: 'COPPA',
    category: 'Data Minimization',
    title: 'Collection Limitation',
    description: 'Only collect data reasonably necessary for the activity',
  },
  {
    id: 'COPPA-04',
    framework: 'COPPA',
    category: 'Rights',
    title: 'Parental Access',
    description: 'Parents can review and delete their child data',
  },
  {
    id: 'COPPA-05',
    framework: 'COPPA',
    category: 'Security',
    title: 'Data Security',
    description: 'Reasonable procedures to protect confidentiality of children data',
  },
  {
    id: 'COPPA-06',
    framework: 'COPPA',
    category: 'Retention',
    title: 'Retention Limitation',
    description: 'Children data retained only as long as necessary',
  },
];

const FRAMEWORK_CONTROLS: Record<ComplianceFrameworkType, Omit<ComplianceControl, 'status'>[]> = {
  GDPR: GDPR_CONTROLS,
  CCPA: CCPA_CONTROLS,
  'PCI-DSS': PCI_DSS_CONTROLS,
  SOC2: SOC2_CONTROLS,
  DPDP: DPDP_CONTROLS,
  COPPA: COPPA_CONTROLS,
};

/** Configuration of implemented controls (for audit checking) */
export interface ComplianceConfig {
  implementedControls: Set<string>;
  partialControls: Set<string>;
  notApplicableControls: Set<string>;
}

/**
 * ComplianceFramework - Comprehensive compliance auditing for GDPR, CCPA, PCI-DSS, SOC 2, DPDP 2023, COPPA.
 * Provides control checklists, DPIA generation, SBOM generation, and data retention validation.
 */
export class ComplianceFramework {
  private config: ComplianceConfig;

  constructor(config?: Partial<ComplianceConfig>) {
    this.config = {
      implementedControls: config?.implementedControls || new Set(),
      partialControls: config?.partialControls || new Set(),
      notApplicableControls: config?.notApplicableControls || new Set(),
    };
  }

  /** Audit compliance for a specific framework */
  auditCompliance(framework: ComplianceFrameworkType): ComplianceAuditResult {
    const controls = FRAMEWORK_CONTROLS[framework];
    if (!controls) {
      return {
        framework,
        auditDate: Date.now(),
        controls: [],
        summary: { total: 0, pass: 0, fail: 0, partial: 0, notApplicable: 0 },
        score: 0,
      };
    }

    const auditedControls: ComplianceControl[] = controls.map((control) => ({
      ...control,
      status: this.getControlStatus(control.id),
    }));

    const summary = {
      total: auditedControls.length,
      pass: auditedControls.filter((c) => c.status === 'pass').length,
      fail: auditedControls.filter((c) => c.status === 'fail').length,
      partial: auditedControls.filter((c) => c.status === 'partial').length,
      notApplicable: auditedControls.filter((c) => c.status === 'not_applicable').length,
    };

    const applicable = summary.total - summary.notApplicable;
    const score = applicable > 0 ? ((summary.pass + summary.partial * 0.5) / applicable) * 100 : 0;

    return {
      framework,
      auditDate: Date.now(),
      controls: auditedControls,
      summary,
      score: Math.round(score * 100) / 100,
    };
  }

  /** Generate a Data Protection Impact Assessment */
  generateDPIA(service: string, dataFlows: DataFlow[]): DPIAReport {
    const risks: DPIARisk[] = this.assessDPIARisks(dataFlows);
    const mitigations = this.generateDPIAMitigations(risks);

    return {
      service,
      dataFlows,
      risks,
      mitigations,
      necessity: `Processing is necessary for the performance of ${service} functionality as described in data flow analysis.`,
      proportionality: `Data collection is limited to what is necessary for ${service} operation. Retention periods are defined per data category.`,
      generatedAt: Date.now(),
    };
  }

  /** Generate Software Bill of Materials in CycloneDX format */
  generateSBOM(
    dependencies: Array<{ name: string; version: string; license?: string }>,
  ): SBOMOutput {
    const components: SBOMEntry[] = dependencies.map((dep) => ({
      type: 'library',
      name: dep.name,
      version: dep.version,
      purl: `pkg:npm/${dep.name}@${dep.version}`,
      license: dep.license,
    }));

    return {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      serialNumber: `urn:uuid:${this.generateUUID()}`,
      version: 1,
      components,
      generatedAt: Date.now(),
    };
  }

  /** Check data retention compliance for a service */
  checkDataRetention(
    _service: string,
    retentionPolicies: Array<{ category: string; retentionDays: number; actualDays: number }>,
  ): {
    compliant: boolean;
    violations: Array<{ category: string; expected: number; actual: number }>;
  } {
    const violations: Array<{ category: string; expected: number; actual: number }> = [];

    for (const policy of retentionPolicies) {
      if (policy.actualDays > policy.retentionDays) {
        violations.push({
          category: policy.category,
          expected: policy.retentionDays,
          actual: policy.actualDays,
        });
      }
    }

    return { compliant: violations.length === 0, violations };
  }

  /** Check consent records for a user */
  checkConsentRecords(
    userId: string,
    records: Array<{ purpose: string; granted: boolean; timestamp: number; version: string }>,
  ): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    if (records.length === 0) {
      issues.push(`No consent records found for user ${userId}`);
    }

    for (const record of records) {
      if (!record.purpose) {
        issues.push('Consent record missing purpose specification');
      }
      if (!record.version) {
        issues.push('Consent record missing version number');
      }
      if (!record.timestamp) {
        issues.push('Consent record missing timestamp');
      }
    }

    return { valid: issues.length === 0, issues };
  }

  /** Mark a control as implemented */
  markControlImplemented(controlId: string): void {
    this.config.implementedControls.add(controlId);
    this.config.partialControls.delete(controlId);
  }

  /** Mark a control as partially implemented */
  markControlPartial(controlId: string): void {
    this.config.partialControls.add(controlId);
    this.config.implementedControls.delete(controlId);
  }

  /** Mark a control as not applicable */
  markControlNotApplicable(controlId: string): void {
    this.config.notApplicableControls.add(controlId);
  }

  private getControlStatus(controlId: string): ComplianceControl['status'] {
    if (this.config.notApplicableControls.has(controlId)) return 'not_applicable';
    if (this.config.implementedControls.has(controlId)) return 'pass';
    if (this.config.partialControls.has(controlId)) return 'partial';
    return 'fail';
  }

  private assessDPIARisks(dataFlows: DataFlow[]): DPIARisk[] {
    const risks: DPIARisk[] = [];

    for (const flow of dataFlows) {
      if (
        flow.dataType.toLowerCase().includes('personal') ||
        flow.dataType.toLowerCase().includes('pii')
      ) {
        risks.push({
          description: `Personal data flows from ${flow.source} to ${flow.destination} for ${flow.purpose}`,
          likelihood: 'medium',
          impact: 'high',
          residualRisk: 'medium',
        });
      }

      if (
        flow.destination.toLowerCase().includes('external') ||
        flow.destination.toLowerCase().includes('third-party')
      ) {
        risks.push({
          description: `Data transferred to external destination: ${flow.destination}`,
          likelihood: 'medium',
          impact: 'high',
          residualRisk: 'medium',
        });
      }
    }

    if (risks.length === 0) {
      risks.push({
        description: 'Minimal data processing risk identified',
        likelihood: 'low',
        impact: 'low',
        residualRisk: 'low',
      });
    }

    return risks;
  }

  private generateDPIAMitigations(risks: DPIARisk[]): string[] {
    const mitigations: string[] = [];

    for (const risk of risks) {
      if (risk.impact === 'high') {
        mitigations.push('Implement encryption at rest and in transit for all personal data');
        mitigations.push('Apply data minimization principles - collect only what is necessary');
        mitigations.push('Conduct regular access reviews and implement least privilege');
      }
      if (risk.likelihood === 'high' || risk.likelihood === 'medium') {
        mitigations.push('Implement monitoring and alerting for data access patterns');
        mitigations.push('Maintain audit logs for all data processing activities');
      }
    }

    // Deduplicate
    return [...new Set(mitigations)];
  }

  private generateUUID(): string {
    const bytes = crypto.randomBytes(16);
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }
}
