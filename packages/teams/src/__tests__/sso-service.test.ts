import { describe, it, expect, beforeEach } from 'vitest';
import { SSOService } from '../sso/sso-service.js';

describe('SSOService', () => {
  let service: SSOService;

  beforeEach(() => {
    service = new SSOService();
  });

  it('configures SAML provider', async () => {
    const config = await service.configureSAML('org-1', {
      entityId: 'https://idp.example.com',
      metadataUrl: 'https://idp.example.com/metadata',
      certificate: 'cert-data',
    });
    expect(config.provider).toBe('saml');
    expect(config.entityId).toBe('https://idp.example.com');
    expect(config.orgId).toBe('org-1');
  });

  it('configures OIDC provider', async () => {
    const config = await service.configureOIDC('org-2', {
      entityId: 'https://oidc.example.com',
      metadataUrl: 'https://oidc.example.com/.well-known',
      certificate: 'oidc-cert',
      mappings: { email: 'preferred_username' },
    });
    expect(config.provider).toBe('oidc');
    expect(config.mappings.email).toBe('preferred_username');
  });

  it('validates a valid assertion', async () => {
    await service.configureSAML('org-1', {
      entityId: 'https://idp.example.com',
      metadataUrl: 'https://idp.example.com/metadata',
      certificate: 'cert-data',
    });
    const result = await service.validateAssertion('org-1', 'valid-assertion-token');
    expect(result.valid).toBe(true);
    expect(result.userId).toBeDefined();
  });

  it('rejects assertion for unconfigured org', async () => {
    const result = await service.validateAssertion('no-org', 'some-token');
    expect(result.valid).toBe(false);
  });

  it('rejects empty assertion', async () => {
    await service.configureSAML('org-1', {
      entityId: 'https://idp.example.com',
      metadataUrl: 'https://idp.example.com/metadata',
      certificate: 'cert-data',
    });
    const result = await service.validateAssertion('org-1', '');
    expect(result.valid).toBe(false);
  });

  it('gets SSO config', async () => {
    await service.configureSAML('org-1', {
      entityId: 'https://idp.example.com',
      metadataUrl: 'https://idp.example.com/metadata',
      certificate: 'cert-data',
    });
    const config = await service.getConfig('org-1');
    expect(config).toBeDefined();
    expect(config?.provider).toBe('saml');
  });

  it('disables SSO', async () => {
    await service.configureSAML('org-1', {
      entityId: 'https://idp.example.com',
      metadataUrl: 'https://idp.example.com/metadata',
      certificate: 'cert-data',
    });
    const disabled = await service.disable('org-1');
    expect(disabled).toBe(true);
    const config = await service.getConfig('org-1');
    expect(config).toBeUndefined();
  });

  it('tests connection', async () => {
    await service.configureSAML('org-1', {
      entityId: 'https://idp.example.com',
      metadataUrl: 'https://idp.example.com/metadata',
      certificate: 'cert-data',
    });
    const result = await service.testConnection('org-1');
    expect(result.success).toBe(true);
    expect(result.latencyMs).toBeGreaterThan(0);
  });

  it('testConnection fails for unconfigured org', async () => {
    const result = await service.testConnection('no-org');
    expect(result.success).toBe(false);
  });
});
