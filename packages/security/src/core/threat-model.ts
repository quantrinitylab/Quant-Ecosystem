// ============================================================================
// Security Package - Threat Modeler (STRIDE)
// ============================================================================

import type { Threat, ThreatCategory, RiskAssessment, ServiceInterface } from '../types';

const STRIDE_CATEGORIES: ThreatCategory[] = [
  'Spoofing',
  'Tampering',
  'Repudiation',
  'InformationDisclosure',
  'DenialOfService',
  'ElevationOfPrivilege',
];

/**
 * ThreatModeler - STRIDE-based threat modeling for services.
 * Identifies threats per category, assesses risk, and generates mitigations.
 */
export class ThreatModeler {
  private threatCounter = 0;

  /** Model threats for a service using STRIDE methodology */
  modelService(service: string, assets: string[], interfaces: ServiceInterface[]): Threat[] {
    const threats: Threat[] = [];

    for (const iface of interfaces) {
      for (const asset of assets) {
        const categoryThreats = this.identifyThreats(service, asset, iface);
        threats.push(...categoryThreats);
      }
    }

    return threats;
  }

  /** Assess risk for a threat */
  assessRisk(threat: Threat): RiskAssessment {
    const likelihood = this.calculateLikelihood(threat);
    const impact = this.calculateImpact(threat);
    const score = likelihood * impact;

    let severity: RiskAssessment['severity'];
    if (score >= 20) severity = 'critical';
    else if (score >= 12) severity = 'high';
    else if (score >= 6) severity = 'medium';
    else severity = 'low';

    return { severity, likelihood, impact, score };
  }

  /** Generate mitigations for a set of threats */
  generateMitigations(threats: Threat[]): Map<string, string[]> {
    const mitigationMap = new Map<string, string[]>();

    for (const threat of threats) {
      const mitigations = this.getMitigationsForCategory(threat.category, threat);
      mitigationMap.set(threat.id, mitigations);
    }

    return mitigationMap;
  }

  private identifyThreats(service: string, asset: string, iface: ServiceInterface): Threat[] {
    const threats: Threat[] = [];

    for (const category of STRIDE_CATEGORIES) {
      if (this.isCategoryApplicable(category, iface)) {
        threats.push({
          id: `THREAT-${++this.threatCounter}`,
          category,
          title: this.generateThreatTitle(category, asset, iface),
          description: this.generateThreatDescription(category, asset, iface, service),
          affectedAsset: asset,
          affectedInterface: iface.name,
        });
      }
    }

    return threats;
  }

  private isCategoryApplicable(category: ThreatCategory, iface: ServiceInterface): boolean {
    switch (category) {
      case 'Spoofing':
        return !iface.authenticated || iface.type === 'external';
      case 'Tampering':
        return !iface.encrypted || iface.type === 'api';
      case 'Repudiation':
        return iface.type === 'api' || iface.type === 'event';
      case 'InformationDisclosure':
        return !iface.encrypted || iface.type === 'database';
      case 'DenialOfService':
        return iface.type === 'api' || iface.type === 'external';
      case 'ElevationOfPrivilege':
        return iface.authenticated;
      default:
        return true;
    }
  }

  private generateThreatTitle(
    category: ThreatCategory,
    asset: string,
    iface: ServiceInterface,
  ): string {
    const titles: Record<ThreatCategory, string> = {
      Spoofing: `Identity spoofing on ${iface.name} accessing ${asset}`,
      Tampering: `Data tampering of ${asset} via ${iface.name}`,
      Repudiation: `Repudiation of actions on ${asset} through ${iface.name}`,
      InformationDisclosure: `Information disclosure of ${asset} via ${iface.name}`,
      DenialOfService: `Denial of service on ${iface.name} affecting ${asset}`,
      ElevationOfPrivilege: `Privilege escalation via ${iface.name} to access ${asset}`,
    };
    return titles[category];
  }

  private generateThreatDescription(
    category: ThreatCategory,
    asset: string,
    iface: ServiceInterface,
    service: string,
  ): string {
    const descriptions: Record<ThreatCategory, string> = {
      Spoofing: `An attacker could impersonate a legitimate user or service to access ${asset} in ${service} through the ${iface.name} interface (${iface.protocol}).`,
      Tampering: `An attacker could modify ${asset} data in transit or at rest through the ${iface.name} interface of ${service}.`,
      Repudiation: `A user could deny performing actions on ${asset} through ${iface.name} in ${service} due to insufficient logging.`,
      InformationDisclosure: `Sensitive data from ${asset} in ${service} could be exposed through the ${iface.name} interface (${iface.protocol}).`,
      DenialOfService: `An attacker could overwhelm the ${iface.name} interface of ${service}, making ${asset} unavailable.`,
      ElevationOfPrivilege: `An attacker could exploit ${iface.name} in ${service} to gain unauthorized access to ${asset}.`,
    };
    return descriptions[category];
  }

  private calculateLikelihood(threat: Threat): number {
    let score = 3; // base

    if (threat.category === 'DenialOfService') score += 1;
    if (threat.category === 'Spoofing') score += 1;
    if (threat.category === 'ElevationOfPrivilege') score -= 1;

    return Math.min(5, Math.max(1, score));
  }

  private calculateImpact(threat: Threat): number {
    let score = 3; // base

    if (threat.category === 'InformationDisclosure') score += 1;
    if (threat.category === 'ElevationOfPrivilege') score += 2;
    if (threat.category === 'Tampering') score += 1;
    if (threat.category === 'DenialOfService') score -= 1;

    return Math.min(5, Math.max(1, score));
  }

  private getMitigationsForCategory(category: ThreatCategory, _threat: Threat): string[] {
    const mitigations: Record<ThreatCategory, string[]> = {
      Spoofing: [
        'Implement strong authentication (mTLS, OAuth2 with PKCE)',
        'Use certificate pinning for service-to-service communication',
        'Enable multi-factor authentication for user-facing interfaces',
      ],
      Tampering: [
        'Enable TLS encryption for all data in transit',
        'Implement message signing and integrity checks',
        'Use immutable audit logs for data modifications',
      ],
      Repudiation: [
        'Implement comprehensive audit logging',
        'Use tamper-evident log storage',
        'Enable digital signatures for critical operations',
      ],
      InformationDisclosure: [
        'Encrypt data at rest using AES-256-GCM',
        'Implement field-level encryption for PII',
        'Apply principle of least privilege for data access',
      ],
      DenialOfService: [
        'Implement rate limiting and circuit breakers',
        'Deploy WAF with DDoS protection rules',
        'Use auto-scaling and resource quotas',
      ],
      ElevationOfPrivilege: [
        'Implement RBAC with least privilege',
        'Use input validation and parameterized queries',
        'Enable runtime security monitoring',
      ],
    };

    return mitigations[category];
  }
}
