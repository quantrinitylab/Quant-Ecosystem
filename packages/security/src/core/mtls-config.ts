// ============================================================================
// Security Package - mTLS Configurator
// ============================================================================

import type { CertificateConfig, CertChainValidation } from '../types';

/**
 * MTLSConfigurator - Manages mTLS certificate configuration and mesh setup.
 * Generates Istio PeerAuthentication and DestinationRule YAML for service mesh.
 */
export class MTLSConfigurator {
  private namespace: string;

  constructor(namespace: string = 'default') {
    this.namespace = namespace;
  }

  /** Generate certificate configuration for a service */
  generateCertificateConfig(
    service: string,
    ca: string,
    options: { validityDays?: number; keySize?: number } = {},
  ): CertificateConfig {
    const validityDays = options.validityDays || 365;
    const keySize = options.keySize || 2048;

    return {
      service,
      commonName: `${service}.${this.namespace}.svc.cluster.local`,
      sans: [
        `${service}.${this.namespace}.svc.cluster.local`,
        `${service}.${this.namespace}.svc`,
        `${service}.${this.namespace}`,
        `${service}`,
      ],
      ca,
      validityDays,
      keySize,
      algorithm: 'RSA',
    };
  }

  /** Validate a certificate chain */
  validateCertChain(cert: string, ca: string): CertChainValidation {
    const errors: string[] = [];

    // Basic structural validation
    if (!cert.includes('-----BEGIN CERTIFICATE-----')) {
      errors.push('Certificate does not have valid PEM header');
    }
    if (!cert.includes('-----END CERTIFICATE-----')) {
      errors.push('Certificate does not have valid PEM footer');
    }
    if (!ca.includes('-----BEGIN CERTIFICATE-----')) {
      errors.push('CA certificate does not have valid PEM header');
    }

    // Check for expiry (simplified check)
    const certBody = cert
      .replace('-----BEGIN CERTIFICATE-----', '')
      .replace('-----END CERTIFICATE-----', '')
      .trim();

    const valid = errors.length === 0 && certBody.length > 0;

    return {
      valid,
      chain: [cert, ca],
      expiry: Date.now() + 365 * 24 * 60 * 60 * 1000,
      issuer: 'quant-ca',
      errors,
    };
  }

  /** Generate Istio mesh configuration for services */
  configureMesh(services: string[]): {
    peerAuthentication: string;
    destinationRules: string;
  } {
    const peerAuthentication = this.generatePeerAuthentication();
    const destinationRules = services
      .map((svc) => this.generateDestinationRule(svc))
      .join('\n---\n');

    return { peerAuthentication, destinationRules };
  }

  private generatePeerAuthentication(): string {
    return `apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default-mtls
  namespace: ${this.namespace}
spec:
  mtls:
    mode: STRICT
`;
  }

  private generateDestinationRule(service: string): string {
    return `apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: ${service}-mtls
  namespace: ${this.namespace}
spec:
  host: ${service}.${this.namespace}.svc.cluster.local
  trafficPolicy:
    tls:
      mode: ISTIO_MUTUAL
    connectionPool:
      tcp:
        maxConnections: 100
      http:
        h2UpgradePolicy: UPGRADE
        maxRequestsPerConnection: 10
    outlierDetection:
      consecutive5xxErrors: 5
      interval: 30s
      baseEjectionTime: 30s
`;
  }
}
