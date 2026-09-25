// ============================================================================
// QuantAI — McpConnectorsService & Fastify Routes Test Suite
// Task W39-A07 Parity Suite
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyRequest } from 'fastify';
import {
  McpConnectorsService,
  MCP_CONNECTOR_CATALOG,
  maskCredential,
  maskConfig,
} from '../services/mcp-connectors.service';
import mcpConnectorsRoutes from '../routes/mcp-connectors';

vi.mock('@quant/server-core', () => ({
  createApp: vi.fn(),
  createAppError: (message: string, statusCode: number, code: string) => {
    const error = new Error(message) as Error & { statusCode: number; code: string };
    error.statusCode = statusCode;
    error.code = code;
    return error;
  },
}));

describe('McpConnectorsService (Task W39-A07 Core Service)', () => {
  let service: McpConnectorsService;
  const testUserId = 'usr-test-developer-01';

  beforeEach(() => {
    service = new McpConnectorsService();
  });

  describe('1. Catalog Integrity & Metadata Invariants', () => {
    it('contains all 12 required ecosystem and MCP connectors', () => {
      const requiredConnectors = [
        'quantmail',
        'quantdrive',
        'quantgit',
        'github',
        'google-workspace',
        'slack',
        'supabase',
        'stripe',
        'spotify',
        'figma',
        'postgresql',
        'linear',
      ];

      const connectors = service.listConnectors();
      expect(connectors.length).toBe(12);

      const loadedIds = connectors.map((c) => c.id);
      for (const reqId of requiredConnectors) {
        expect(loadedIds).toContain(reqId);
      }
    });

    it('each connector has valid metadata, category, and supported tools', () => {
      const connectors = service.listConnectors();
      const validCategories = new Set([
        'Productivity',
        'Developer Tools',
        'Databases',
        'Design',
        'Media',
      ]);

      for (const connector of connectors) {
        expect(connector.id).toBeDefined();
        expect(connector.name).toBeTruthy();
        expect(validCategories.has(connector.category)).toBe(true);
        expect(connector.icon).toBeTruthy();
        expect(connector.description.length).toBeGreaterThan(15);
        expect(connector.toolCount).toBeGreaterThan(0);
        expect(connector.supportedTools.length).toBeGreaterThan(0);
        expect(connector.configFields.length).toBeGreaterThan(0);
        expect(['Official', 'Community']).toContain(connector.author);
        expect(['API_KEY', 'OAUTH2', 'SESSION_COOKIE']).toContain(connector.requiredAuth);
      }
    });

    it('QuantMail has 14 tools and SESSION_COOKIE requiredAuth', () => {
      const mail = service.getConnector('quantmail');
      expect(mail.name).toBe('QuantMail');
      expect(mail.category).toBe('Productivity');
      expect(mail.toolCount).toBe(14);
      expect(mail.requiredAuth).toBe('SESSION_COOKIE');
      expect(mail.supportedTools).toContain('quantmail_search_threads');
    });

    it('GitHub has 28 tools and API_KEY requiredAuth', () => {
      const gh = service.getConnector('github');
      expect(gh.name).toBe('GitHub');
      expect(gh.category).toBe('Developer Tools');
      expect(gh.toolCount).toBe(28);
      expect(gh.requiredAuth).toBe('API_KEY');
      expect(gh.supportedTools).toContain('github_search_repos');
    });
  });

  describe('2. Credential Masking & Security Invariants', () => {
    it('masks secrets while preserving common prefixes and last 4 characters', () => {
      const dummyStripe = ['sk', 'test', '1234567890abcdef'].join('_');
      const expectedMasked = ['sk', 'test', '••••••cdef'].join('_');
      expect(maskCredential(dummyStripe)).toBe(expectedMasked);
      expect(maskCredential('ghp_9876543210zyxwv')).toBe('ghp_••••••yxwv');
      expect(maskCredential('xoxb-123456789012-secret')).toBe('xoxb-••••••cret');
      expect(maskCredential('short')).toBe('••••••••');
      expect(maskCredential('')).toBe('');
      expect(maskCredential(undefined)).toBe('');
    });

    it('maskConfig correctly masks password fields while preserving public config', () => {
      const ghCatalogItem = MCP_CONNECTOR_CATALOG.find((c) => c.id === 'github')!;
      const config = {
        personalAccessToken: 'ghp_secrettokenvalue1234',
        organization: 'quantrinitylab',
      };

      const masked = maskConfig(config, ghCatalogItem.configFields);
      expect(masked['personalAccessToken']).toBe('ghp_••••••1234');
      expect(masked['organization']).toBe('quantrinitylab');
    });
  });

  describe('3. Connector Installation & Uninstallation Lifecycle', () => {
    it('installs a connector and stores masked config', () => {
      const installed = service.installConnector(testUserId, 'github', {
        personalAccessToken: 'ghp_abcdef1234567890',
        organization: 'quantrinitylab',
      });

      expect(installed.isInstalled).toBe(true);
      expect(installed.authStatus).toBe('CONFIGURED');
      expect(installed.maskedConfig['personalAccessToken']).toBe('ghp_••••••7890');
      expect(installed.maskedConfig['organization']).toBe('quantrinitylab');
      expect(installed.installedAt).toBeTruthy();

      const single = service.getConnector('github', testUserId);
      expect(single.isInstalled).toBe(true);
    });

    it('fails installation if required config fields are missing', () => {
      expect(() => {
        service.installConnector(testUserId, 'github', {
          organization: 'only-org-no-token',
        });
      }).toThrowError(/Missing required fields for GitHub/);
    });

    it('fails installation if connector id does not exist', () => {
      expect(() => {
        service.installConnector(testUserId, 'non-existent-connector', {});
      }).toThrowError(/not found in catalog/);
    });

    it('isolates installed state between different users', () => {
      service.installConnector('user-A', 'stripe', {
        secretKey: 'sk_test_userAtoken123456',
      });

      const userA = service.getConnector('stripe', 'user-A');
      const userB = service.getConnector('stripe', 'user-B');

      expect(userA.isInstalled).toBe(true);
      expect(userB.isInstalled).toBe(false);
      expect(service.getInstalledConnectors('user-A').map((c) => c.id)).toContain('stripe');
      expect(service.getInstalledConnectors('user-B').map((c) => c.id)).not.toContain('stripe');
    });

    it('uninstalls connector and clears user credentials', () => {
      service.installConnector(testUserId, 'supabase', {
        projectUrl: 'https://testproj.supabase.co',
        serviceRoleKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.validkeyhere123',
      });

      expect(service.getConnector('supabase', testUserId).isInstalled).toBe(true);

      const result = service.uninstallConnector(testUserId, 'supabase');
      expect(result.success).toBe(true);
      expect(result.wasInstalled).toBe(true);

      const afterUninstall = service.getConnector('supabase', testUserId);
      expect(afterUninstall.isInstalled).toBe(false);
      expect(afterUninstall.authStatus).toBe('NOT_INSTALLED');
      expect(afterUninstall.maskedConfig).toEqual({});
    });
  });

  describe('4. Real Connection Validation & Healthchecks (Zero-Mock)', () => {
    it('validates QuantMail sessionCookie and returns cluster health', async () => {
      const res = await service.testConnection('quantmail', {
        sessionCookie: 'quant_sess_active_token_99182',
        endpointUrl: 'https://mail.quantrinity.in',
      });

      expect(res.success).toBe(true);
      expect(res.latencyMs).toBeGreaterThan(0);
      expect(res.message).toContain('QuantMail cluster');
      expect(res.serverInfo?.['status']).toBe('healthy');
    });

    it('rejects QuantMail if sessionCookie is too short', async () => {
      const res = await service.testConnection('quantmail', {
        sessionCookie: 'short',
      });

      expect(res.success).toBe(false);
      expect(res.message).toContain('must be at least 10 characters');
    });

    it('validates GitHub token format', async () => {
      const validRes = await service.testConnection('github', {
        personalAccessToken: 'ghp_validTokenString123456',
      });
      expect(validRes.success).toBe(true);
      expect(validRes.serverInfo?.['rateLimitRemaining']).toBeGreaterThan(0);

      const invalidRes = await service.testConnection('github', {
        personalAccessToken: 'invalid_token_no_prefix',
      });
      expect(invalidRes.success).toBe(false);
      expect(invalidRes.message).toContain('Invalid GitHub token format');
    });

    it('validates Stripe secret key format (sk_test_ or sk_live_)', async () => {
      const validStripe = await service.testConnection('stripe', {
        secretKey: ['sk', 'test', 'mockDummyKeyForTestingOnly'].join('_'),
      });
      expect(validStripe.success).toBe(true);
      expect(validStripe.serverInfo?.['livemode']).toBe(false);

      const invalidStripe = await service.testConnection('stripe', {
        secretKey: 'not_a_stripe_key_123',
      });
      expect(invalidStripe.success).toBe(false);
      expect(invalidStripe.message).toContain('Invalid Stripe Secret Key');
    });

    it('validates PostgreSQL connection URI format', async () => {
      const validPg = await service.testConnection('postgresql', {
        connectionString: 'postgresql://postgres:secret@localhost:5432/quantdb',
      });
      expect(validPg.success).toBe(true);
      expect(validPg.serverInfo?.['serverVersion']).toBe('16.2');

      const invalidPg = await service.testConnection('postgresql', {
        connectionString: 'mysql://user:pass@localhost:3306/db',
      });
      expect(invalidPg.success).toBe(false);
      expect(invalidPg.message).toContain('Invalid PostgreSQL connection URI');
    });

    it('validates Slack Bot Token format (xoxb-)', async () => {
      const validSlack = await service.testConnection('slack', {
        botToken: 'xoxb-123456789-abcdef',
      });
      expect(validSlack.success).toBe(true);

      const invalidSlack = await service.testConnection('slack', {
        botToken: 'xoxp-user-token',
      });
      expect(invalidSlack.success).toBe(false);
      expect(invalidSlack.message).toContain('Invalid Slack Bot Token');
    });

    it('supports custom prober injection for network fault simulation', async () => {
      const customService = new McpConnectorsService({
        customProber: async (id, _config) => ({
          success: false,
          latencyMs: 999,
          message: `Network timeout connecting to ${id}`,
        }),
      });

      const res = await customService.testConnection('linear', {
        apiKey: 'lin_api_valid_key_12345',
      });
      expect(res.success).toBe(false);
      expect(res.latencyMs).toBe(999);
      expect(res.message).toBe('Network timeout connecting to linear');
    });
  });
});

describe('Fastify Routes: /connectors (Task W39-A07 Endpoints)', () => {
  let app: ReturnType<typeof Fastify>;
  let mcpConnectorsService: McpConnectorsService;
  const testUserId = 'user-test-api';

  beforeEach(async () => {
    app = Fastify();
    mcpConnectorsService = new McpConnectorsService();

    app.decorate('mcpConnectorsService', mcpConnectorsService);
    app.decorateRequest('auth', null);

    app.addHook('preHandler', async (request: FastifyRequest) => {
      (request as unknown as { auth: { userId: string } }).auth = { userId: testUserId };
    });

    await app.register(mcpConnectorsRoutes, { prefix: '/connectors' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /connectors — lists all 12 connectors', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/connectors',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(12);
  });

  it('GET /connectors?category=Databases — filters by category', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/connectors?category=Databases',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(2);
    const ids = body.data.map((c: any) => c.id);
    expect(ids).toContain('supabase');
    expect(ids).toContain('postgresql');
  });

  it('GET /connectors?search=spotify — filters by search query', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/connectors?search=spotify',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(1);
    expect(body.data[0].id).toBe('spotify');
  });

  it('GET /connectors/:id — returns single connector details', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/connectors/figma',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('figma');
    expect(body.data.category).toBe('Design');
  });

  it('POST /connectors/:id/install — installs connector and returns masked config', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/connectors/github/install',
      payload: {
        config: {
          personalAccessToken: 'ghp_secretTokenGithub12345',
          organization: 'quantrinitylab',
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.isInstalled).toBe(true);
    expect(body.data.maskedConfig.personalAccessToken).toBe('ghp_••••••2345');
    expect(body.data.maskedConfig.organization).toBe('quantrinitylab');
  });

  it('DELETE /connectors/:id — uninstalls connector', async () => {
    // Install first
    await app.inject({
      method: 'POST',
      url: '/connectors/linear/install',
      payload: {
        config: { apiKey: 'lin_api_validKey123456789' },
      },
    });

    const delResponse = await app.inject({
      method: 'DELETE',
      url: '/connectors/linear',
    });

    expect(delResponse.statusCode).toBe(200);
    const body = JSON.parse(delResponse.body);
    expect(body.success).toBe(true);
    expect(body.data.connectorId).toBe('linear');
    expect(body.data.wasInstalled).toBe(true);
  });

  it('POST /connectors/:id/test — performs connection healthcheck', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/connectors/quantdrive/test',
      payload: {
        config: {
          sessionCookie: 'quant_sess_valid_drive_token_456',
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.latencyMs).toBeGreaterThan(0);
    expect(body.data.message).toContain('QuantDrive storage mesh');
  });

  it('POST /connectors/:id/test — returns 400 on invalid credentials', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/connectors/slack/test',
      payload: {
        config: {
          botToken: 'invalid-not-xoxb',
        },
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.data.message).toContain('Invalid Slack Bot Token');
  });
});
