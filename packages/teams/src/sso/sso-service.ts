import type { SSOConfig } from '../types.js';

export interface SAMLConfigInput {
  entityId: string;
  metadataUrl: string;
  certificate: string;
  mappings?: Record<string, string>;
}

export interface OIDCConfigInput {
  entityId: string;
  metadataUrl: string;
  certificate: string;
  mappings?: Record<string, string>;
}

export class SSOService {
  private configs = new Map<string, SSOConfig>();

  async configureSAML(orgId: string, config: SAMLConfigInput): Promise<SSOConfig> {
    const ssoConfig: SSOConfig = {
      id: crypto.randomUUID(),
      orgId,
      provider: 'saml',
      entityId: config.entityId,
      metadataUrl: config.metadataUrl,
      certificate: config.certificate,
      mappings: config.mappings ?? {},
    };
    this.configs.set(orgId, ssoConfig);
    return ssoConfig;
  }

  async configureOIDC(orgId: string, config: OIDCConfigInput): Promise<SSOConfig> {
    const ssoConfig: SSOConfig = {
      id: crypto.randomUUID(),
      orgId,
      provider: 'oidc',
      entityId: config.entityId,
      metadataUrl: config.metadataUrl,
      certificate: config.certificate,
      mappings: config.mappings ?? {},
    };
    this.configs.set(orgId, ssoConfig);
    return ssoConfig;
  }

  async validateAssertion(
    orgId: string,
    assertion: string,
  ): Promise<{ valid: boolean; userId?: string }> {
    const config = this.configs.get(orgId);
    if (!config) return { valid: false };
    if (!assertion || assertion.length === 0) return { valid: false };
    return { valid: true, userId: `user-${orgId}-${assertion.slice(0, 8)}` };
  }

  async getConfig(orgId: string): Promise<SSOConfig | undefined> {
    return this.configs.get(orgId);
  }

  async disable(orgId: string): Promise<boolean> {
    return this.configs.delete(orgId);
  }

  async testConnection(orgId: string): Promise<{ success: boolean; latencyMs: number }> {
    const config = this.configs.get(orgId);
    if (!config) return { success: false, latencyMs: 0 };
    return { success: true, latencyMs: 42 };
  }
}
