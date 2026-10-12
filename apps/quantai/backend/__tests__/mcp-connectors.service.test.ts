// ============================================================================
// QuantAI — McpConnectorsService & Fastify Routes Test Suite
//
// F-183 honesty suite: no test may assert fabricated health data. Latency is
// only asserted as "measured" (>= 0, a real number); serverInfo is only
// asserted for observed facts (httpStatus/host from a stubbed probe).
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

// Synthetic, obviously-not-real credential fixtures for tests.
const GH_TOKEN = 'ghp_12345678';
const SLACK_TOKEN = 'xoxb-abcdefgh';
const STRIPE_KEY = 'sk_test_synthetic0000';
const LINEAR_KEY = 'lin_api_1234567890';

function stubFetchWith(impl: (...args: unknown[]) => unknown) {
  const mock = vi.fn(impl);
  vi.stubGlobal('fetch', mock);
  return mock;
}

describe('McpConnectorsService', () => {
  let service: McpConnectorsService;
  const testUserId = 'usr-test-developer-01';

  beforeEach(() => {
    service = new McpConnectorsService();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('1. Catalog Integrity & Metadata Invariants', () => {
    it('contains all 12 required ecosystem and third-party connectors', () => {
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

      const connectors = service.listConnectors('test-user');
      expect(connectors.length).toBe(12);

      const loadedIds = connectors.map((c) => c.id);
      for (const reqId of requiredConnectors) {
        expect(loadedIds).toContain(reqId);
      }
    });

    it('never advertises tools that cannot run (F-183)', () => {
      const connectors = service.listConnectors('test-user');
      for (const connector of connectors) {
        expect(['live', 'planned']).toContain(connector.availability);
        // toolCount must equal the number of actually-runnable tools.
        expect(connector.toolCount).toBe(connector.supportedTools.length);
        if (connector.availability === 'live') {
          expect(connector.supportedTools.length).toBeGreaterThan(0);
        } else {
          // Planned connectors: honest stub — no runnable tools advertised.
          expect(connector.supportedTools).toEqual([]);
          expect(connector.plannedTools!.length).toBeGreaterThan(0);
          expect(connector.description).toContain('not wired yet');
        }
      }
    });

    it('QuantMail wires the real lane executors (dotted names), not snake_case theater', () => {
      const mail = service.getConnector('quantmail', 'test-user');
      expect(mail.availability).toBe('live');
      // F-190: 6 runnable tools; 'quantmail.label' demoted to planned — it has
      // a tool definition but no registered executor (backend POST /labels/apply
      // takes labelId while the tool schema takes a label name).
      expect(mail.toolCount).toBe(6);
      expect(mail.requiredAuth).toBe('SESSION_COOKIE');
      for (const tool of [
        'quantmail.search',
        'quantmail.listUnread',
        'quantmail.getMessage',
        'quantmail.archive',
        'quantmail.draft',
        'quantmail.send',
      ]) {
        expect(mail.supportedTools).toContain(tool);
      }
      expect(mail.supportedTools).not.toContain('quantmail.label');
      expect(mail.plannedTools).toContain('quantmail.label');
      // The old fabricated snake_case names must be gone.
      expect(mail.supportedTools).not.toContain('quantmail_search_threads');
      expect(mail.supportedTools).not.toContain('quantmail_send_email');
    });

    it('QuantDrive wires the real lane executors', () => {
      const drive = service.getConnector('quantdrive', 'test-user');
      expect(drive.availability).toBe('live');
      // F-190: only quantdrive.upload has a gateway handler (drive backend not
      // deployed yet); download/share/organize/search are planned, honestly.
      expect(drive.toolCount).toBe(1);
      expect(drive.supportedTools).toEqual(['quantdrive.upload']);
      for (const tool of [
        'quantdrive.download',
        'quantdrive.share',
        'quantdrive.organize',
        'quantdrive.search',
      ]) {
        expect(drive.plannedTools).toContain(tool);
        expect(drive.supportedTools).not.toContain(tool);
      }
      expect(drive.supportedTools).not.toContain('quantdrive_list_files');
    });

    it('GitHub is an honest planned preview — zero runnable tools advertised', () => {
      const gh = service.getConnector('github', 'test-user');
      expect(gh.availability).toBe('planned');
      expect(gh.toolCount).toBe(0);
      expect(gh.supportedTools).toEqual([]);
      expect(gh.plannedTools).toContain('github_search_repos');
    });
  });

  describe('2. Credential Masking & Security Invariants', () => {
    it('masks secrets while preserving common prefixes and last 4 characters', () => {
      expect(maskCredential(GH_TOKEN)).toBe('ghp_••••••5678');
      expect(maskCredential(SLACK_TOKEN)).toBe('xoxb-••••••efgh');
      expect(maskCredential(LINEAR_KEY)).toBe('lin_api_••••••7890');
      expect(maskCredential('short')).toBe('••••••••');
      expect(maskCredential('')).toBe('');
      expect(maskCredential(undefined)).toBe('');
    });

    it('maskConfig correctly masks password fields while preserving public config', () => {
      const ghCatalogItem = MCP_CONNECTOR_CATALOG.find((c) => c.id === 'github')!;
      const config = {
        personalAccessToken: GH_TOKEN,
        organization: 'quantrinitylab',
      };

      const masked = maskConfig(config, ghCatalogItem.configFields);
      expect(masked['personalAccessToken']).toBe('ghp_••••••5678');
      expect(masked['organization']).toBe('quantrinitylab');
    });
  });

  describe('3. Connector Installation & Uninstallation Lifecycle', () => {
    it('installs a connector and stores masked config — without fabricating a test result', () => {
      const installed = service.installConnector(testUserId, 'github', {
        personalAccessToken: GH_TOKEN,
        organization: 'quantrinitylab',
      });

      expect(installed.isInstalled).toBe(true);
      expect(installed.authStatus).toBe('CONFIGURED');
      expect(installed.maskedConfig['personalAccessToken']).toBe('ghp_••••••5678');
      expect(installed.maskedConfig['organization']).toBe('quantrinitylab');
      expect(installed.installedAt).toBeTruthy();
      // F-183: installing stores config; no connection was tested.
      expect(installed.lastTestedAt).toBeNull();
      expect(installed.lastTestStatus).toBeNull();

      const single = service.getConnector('github', testUserId);
      expect(single.isInstalled).toBe(true);
      expect(single.lastTestedAt).toBeNull();
      expect(single.lastTestStatus).toBeNull();
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
        secretKey: STRIPE_KEY,
      });

      const userA = service.getConnector('stripe', 'user-A');
      const userB = service.getConnector('stripe', 'user-B');

      expect(userA.isInstalled).toBe(true);
      expect(userB.isInstalled).toBe(false);
      expect(service.getInstalledConnectors('user-A').map((c) => c.id)).toContain('stripe');
      expect(service.getInstalledConnectors('user-B').map((c) => c.id)).not.toContain('stripe');
    });

    it('returns an empty list for a user with zero installed connectors', () => {
      expect(service.getInstalledConnectors('brand-new-user')).toEqual([]);
    });

    it('fails closed when no userId is supplied (no default identity)', () => {
      expect(() =>
        service.getInstalledConnectors(undefined as unknown as string),
      ).toThrowError(/userId is required/);
      expect(() => service.getInstalledConnectors('')).toThrowError(/userId is required/);
    });

    it('uninstalls connector and clears user credentials', () => {
      service.installConnector(testUserId, 'supabase', {
        projectUrl: 'https://testproj.supabase.co',
        serviceRoleKey: 'synthetic-supabase-service-key-0000',
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

  describe('4. Honest Connection Validation (F-183 — no fabricated health data)', () => {
    it('reports unknown connector ids as not-verified, never as success', async () => {
      const res = await service.testConnection('nope-not-real', {});
      expect(res.success).toBe(false);
      expect(res.verified).toBe(false);
      expect(res.outcome).toBe('invalid');
      expect(res.latencyMs).toBe(0);
      expect(res.message).toContain('does not exist in catalog');
    });

    it('rejects missing required fields before any probe', async () => {
      const res = await service.testConnection('quantmail', {});
      expect(res.success).toBe(false);
      expect(res.verified).toBe(false);
      expect(res.outcome).toBe('invalid');
      expect(res.message).toContain('Missing required configuration field');
      expect(typeof res.latencyMs).toBe('number');
    });

    it('rejects malformed credentials with honest format messages (no fake latency)', async () => {
      const shortCookie = await service.testConnection('quantmail', {
        sessionCookie: 'short',
      });
      expect(shortCookie.success).toBe(false);
      expect(shortCookie.verified).toBe(false);
      expect(shortCookie.message).toContain('must be at least 10 characters');

      const badUrl = await service.testConnection('quantmail', {
        sessionCookie: 'synthetic-session-token-0000',
        endpointUrl: 'not a url at all',
      });
      expect(badUrl.success).toBe(false);
      expect(badUrl.verified).toBe(false);
      expect(badUrl.message).toContain('Invalid endpoint URL format');

      const badGithub = await service.testConnection('github', {
        personalAccessToken: 'invalid_token_no_prefix',
      });
      expect(badGithub.success).toBe(false);
      expect(badGithub.verified).toBe(false);
      expect(badGithub.message).toContain('Invalid GitHub token format');

      const badSlack = await service.testConnection('slack', {
        botToken: 'xoxp-user-token',
      });
      expect(badSlack.success).toBe(false);
      expect(badSlack.verified).toBe(false);
      expect(badSlack.message).toContain('Invalid Slack Bot Token');

      const badPg = await service.testConnection('postgresql', {
        connectionString: 'mysql://user:pass@localhost:3306/db',
      });
      expect(badPg.success).toBe(false);
      expect(badPg.verified).toBe(false);
      expect(badPg.message).toContain('Invalid PostgreSQL connection URI');
    });

    it('returns honest NOT-VERIFIED for valid config when no live probe is configured', async () => {
      // slack has valid format but no probe endpoint: must not claim success.
      const res = await service.testConnection('slack', { botToken: SLACK_TOKEN });
      expect(res.success).toBe(false);
      expect(res.verified).toBe(false);
      expect(res.outcome).toBe('unknown');
      expect(res.message).toContain('not verified');
      expect(res.serverInfo).toBeUndefined();
      expect(typeof res.latencyMs).toBe('number');
      expect(res.latencyMs).toBeGreaterThanOrEqual(0);
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
        apiKey: LINEAR_KEY,
      });
      expect(res.success).toBe(false);
      expect(res.verified).toBe(true);
      expect(res.outcome).toBe('failed');
      expect(res.latencyMs).toBe(999);
      expect(res.message).toBe('Network timeout connecting to linear');
    });

    it('performs a REAL auth-verifying probe for GitHub (stubbed fetch)', async () => {
      const fetchMock = stubFetchWith(async () => ({ status: 200, ok: true }));

      const res = await service.testConnection('github', {
        personalAccessToken: GH_TOKEN,
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.github.com/rate_limit',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: `Bearer ${GH_TOKEN}`,
          }),
        }),
      );
      expect(res.success).toBe(true);
      expect(res.verified).toBe(true);
      expect(res.outcome).toBe('ok');
      expect(typeof res.latencyMs).toBe('number');
      expect(res.latencyMs).toBeGreaterThanOrEqual(0);
      expect(res.message).toContain('verified against the live API');
      // Only observed facts — no invented rate limits, scopes, or versions.
      expect(res.serverInfo).toEqual({ httpStatus: 200, host: 'api.github.com' });
    });

    it('treats GitHub 401 as a real credential rejection (not a fabricated success)', async () => {
      stubFetchWith(async () => ({ status: 401, ok: false }));

      const res = await service.testConnection('github', {
        personalAccessToken: GH_TOKEN,
      });

      expect(res.success).toBe(false);
      expect(res.verified).toBe(true);
      expect(res.outcome).toBe('failed');
      expect(res.message).toContain('rejected the supplied credentials');
      expect(res.message).toContain('401');
    });

    it('maps a dead GitHub endpoint to honest unreachable (connector unreachable edge case)', async () => {
      stubFetchWith(async () => {
        throw new Error('socket hang up');
      });

      const res = await service.testConnection('github', {
        personalAccessToken: GH_TOKEN,
      });

      expect(res.success).toBe(false);
      expect(res.verified).toBe(true);
      expect(res.message).toContain('unreachable');
      expect(res.serverInfo).toEqual({ host: 'api.github.com' });
    });

    it('maps an aborted probe to an honest timeout', async () => {
      stubFetchWith(async () => {
        const err = new Error('The operation was aborted') as Error & { name: string };
        err.name = 'AbortError';
        throw err;
      });

      const res = await service.testConnection('github', {
        personalAccessToken: GH_TOKEN,
      });

      expect(res.success).toBe(false);
      expect(res.verified).toBe(true);
      expect(res.message).toContain('timed out');
    });

    it('handles a malformed probe payload without inventing a result', async () => {
      stubFetchWith(async () => undefined);

      const res = await service.testConnection('github', {
        personalAccessToken: GH_TOKEN,
      });

      expect(res.success).toBe(false);
      expect(res.verified).toBe(true);
      expect(res.message).toContain('unreadable response');
    });

    it('probes QuantMail endpoint reachability with measured latency (stubbed fetch)', async () => {
      const fetchMock = stubFetchWith(async () => ({ status: 200, ok: true }));

      const res = await service.testConnection('quantmail', {
        sessionCookie: 'synthetic-session-token-0000',
        endpointUrl: 'https://mail.example.test',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://mail.example.test',
        expect.objectContaining({ method: 'HEAD' }),
      );
      expect(res.success).toBe(true);
      expect(res.verified).toBe(true);
      expect(typeof res.latencyMs).toBe('number');
      expect(res.message).toContain('reachable');
      // Honest scope: reachability only — credentials not verified by the probe.
      expect(res.message).toContain('not verified by this probe');
      expect(res.serverInfo).toEqual({ httpStatus: 200, host: 'mail.example.test' });
    });

    it('falls back to the catalog default endpoint when none is configured', async () => {
      const fetchMock = stubFetchWith(async () => ({ status: 200, ok: true }));

      const res = await service.testConnection('quantdrive', {
        sessionCookie: 'synthetic-session-token-0000',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://drive.quantrinity.in',
        expect.objectContaining({ method: 'HEAD' }),
      );
      expect(res.verified).toBe(true);
    });

    it('maps an unreachable QuantMail endpoint honestly', async () => {
      stubFetchWith(async () => {
        throw new Error('getaddrinfo ENOTFOUND mail.example.test');
      });

      const res = await service.testConnection('quantmail', {
        sessionCookie: 'synthetic-session-token-0000',
        endpointUrl: 'https://mail.example.test',
      });

      expect(res.success).toBe(false);
      expect(res.verified).toBe(true);
      expect(res.message).toContain('unreachable');
    });
  });

  describe('5. Availability filtering', () => {
    it('lists only live connectors when asked', () => {
      const live = service.listConnectors('test-user', { availability: 'live' });
      expect(live.map((c) => c.id).sort()).toEqual(['quantdrive', 'quantmail']);
    });

    it('lists planned connectors separately', () => {
      const planned = service.listConnectors('test-user', { availability: 'planned' });
      expect(planned).toHaveLength(10);
      expect(planned.every((c) => c.supportedTools.length === 0)).toBe(true);
    });
  });
});

describe('Fastify Routes: /connectors', () => {
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

  it('GET /connectors?availability=live — lists only runnable connectors', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/connectors?availability=live',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.map((c: any) => c.id).sort()).toEqual(['quantdrive', 'quantmail']);
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
    expect(body.data.availability).toBe('planned');
  });

  it('POST /connectors/:id/install — installs connector and returns masked config', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/connectors/github/install',
      payload: {
        config: {
          personalAccessToken: GH_TOKEN,
          organization: 'quantrinitylab',
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.isInstalled).toBe(true);
    expect(body.data.maskedConfig.personalAccessToken).toBe('ghp_••••••5678');
    expect(body.data.maskedConfig.organization).toBe('quantrinitylab');
    // F-183: no fabricated test result at install time.
    expect(body.data.lastTestedAt).toBeNull();
    expect(body.data.lastTestStatus).toBeNull();
  });

  it('DELETE /connectors/:id — uninstalls connector', async () => {
    // Install first
    await app.inject({
      method: 'POST',
      url: '/connectors/linear/install',
      payload: {
        config: { apiKey: LINEAR_KEY },
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

  it('POST /connectors/:id/test — honest unknown is HTTP 200 with success:false (not a failure)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/connectors/slack/test',
      payload: {
        config: {
          botToken: SLACK_TOKEN,
        },
      },
    });

    // slack has valid format but no live probe: unknown, not failed.
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.data.verified).toBe(false);
    expect(body.data.outcome).toBe('unknown');
    expect(body.data.message).toContain('not verified');
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
