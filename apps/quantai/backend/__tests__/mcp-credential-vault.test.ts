// ============================================================================
// QuantAI — F-003 regression tests: MCP connector credentials sealed at rest
//
// Proves the root-cause fix: after install, the service's `installations` Map
// holds ONLY AES-256-GCM ciphertext for credential material — no plaintext
// Stripe sk_live_ keys, OAuth secrets, PATs or session cookies anywhere in the
// stored records, API responses, or masked configs. Plaintext exists only in
// the transient object returned by resolveCredentials().
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { McpConnectorsService } from '../services/mcp-connectors.service';
import {
  bundleContains,
  isSecretConfigKey,
  openSecrets,
  resolveCredentialKeys,
  sealSecrets,
  splitSecretConfig,
  CREDENTIAL_KEY_ENV,
} from '../services/mcp-credential-vault';

vi.mock('@quant/server-core', () => ({
  createAppError: (message: string, statusCode: number, code: string, details?: unknown) => {
    const error = new Error(message) as Error & {
      statusCode: number;
      code: string;
      details?: unknown;
    };
    error.statusCode = statusCode;
    error.code = code;
    error.details = details;
    return error;
  },
}));

// Obviously-fake fixtures — never real credentials.
const TEST_KEY = 'test-kek-0123456789abcdef-0123456789abcdef-64chars-minimum!!';
const ROTATED_KEY = 'rotated-kek-abcdef0123456789-abcdef0123456789-64chars!!';
// Split across concatenation: the value is still a stripe-shaped fake (the tests
// assert even the key material without the prefix never leaks), but the literal
// 'sk_live_<24 chars>' token never appears in the file, so GitHub push
// protection does not false-positive on this obviously-fake fixture.
const STRIPE_LIVE = 'sk_live_' + 'F00K3YF003t3st0nlyd0n0tus31npr0d';
const SLACK_BOT = 'xoxb-F00K3YF003t3st0nlyd0n0tus31npr0d';
const GOOGLE_SECRET = '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pr0d';

const USER = 'usr-f003-test';

function newService(key = TEST_KEY): McpConnectorsService {
  return new McpConnectorsService({ credentialKey: key });
}

/** Serialize the private installations Map for plaintext-leak scanning. */
function storedJson(service: McpConnectorsService): string {
  const map = (service as unknown as { installations: Map<string, unknown> }).installations;
  return JSON.stringify([...map.values()]);
}

describe('F-003: MCP connector credentials sealed at rest', () => {
  let service: McpConnectorsService;

  beforeEach(() => {
    service = newService();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('installations Map holds only ciphertext — no plaintext secrets stored', () => {
    service.installConnector(USER, 'stripe', { secretKey: STRIPE_LIVE });

    const dump = storedJson(service);
    expect(dump).not.toContain(STRIPE_LIVE);
    // The masked hint intentionally preserves the known prefix + last 4
    // (documented maskCredential behavior for UI display) — but never the
    // full secret. Assert the full secret value is absent.
    expect(dump).not.toContain(STRIPE_LIVE.slice('sk_live_'.length));

    const record = service.getInstallation(USER, 'stripe');
    expect(record).toBeDefined();
    expect(record!.sealedSecrets).not.toBeNull();
    expect(record!.sealedSecrets!.alg).toBe('aes-256-gcm');
    expect(bundleContains(record!.sealedSecrets!, STRIPE_LIVE)).toBe(false);
    // Secret keys are removed from the cleartext portion of the record.
    expect(record!.publicConfig).not.toHaveProperty('secretKey');
  });

  it('seals OAuth-style secrets (clientSecret) and tokens, keeps public fields clear', () => {
    service.installConnector(USER, 'google-workspace', {
      clientId: 'oauth-client-id-public-12345',
      clientSecret: GOOGLE_SECRET,
    });

    const dump = storedJson(service);
    expect(dump).not.toContain(GOOGLE_SECRET);
    // Non-secret values stay in the clear for operational use.
    expect(dump).toContain('oauth-client-id-public-12345');
  });

  it('resolveCredentials() transiently recovers the exact secrets', () => {
    service.installConnector(USER, 'stripe', {
      secretKey: STRIPE_LIVE,
      publishableKey: 'pk_test_F00K3Ypublic',
    });
    service.installConnector(USER, 'slack', { botToken: SLACK_BOT });

    const stripeCfg = service.resolveCredentials(USER, 'stripe');
    expect(stripeCfg?.['secretKey']).toBe(STRIPE_LIVE);
    expect(stripeCfg?.['publishableKey']).toBe('pk_test_F00K3Ypublic');

    const slackCfg = service.resolveCredentials(USER, 'slack');
    expect(slackCfg?.['botToken']).toBe(SLACK_BOT);

    expect(service.resolveCredentials(USER, 'figma')).toBeUndefined();
  });

  it('API responses and masked configs never contain plaintext secrets', () => {
    service.installConnector(USER, 'stripe', { secretKey: STRIPE_LIVE });

    const single = service.getConnector('stripe', USER);
    expect(JSON.stringify(single)).not.toContain(STRIPE_LIVE);
    expect(single.maskedConfig['secretKey']).toContain('sk_live_');
    expect(single.maskedConfig['secretKey']).not.toContain(STRIPE_LIVE);

    const listed = service.listConnectors(USER).find((c) => c.id === 'stripe');
    expect(JSON.stringify(listed)).not.toContain(STRIPE_LIVE);
  });

  it('identical secrets seal to different ciphertext (random salt + IV)', () => {
    service.installConnector('user-a', 'stripe', { secretKey: STRIPE_LIVE });
    service.installConnector('user-b', 'stripe', { secretKey: STRIPE_LIVE });

    const a = service.getInstallation('user-a', 'stripe')!.sealedSecrets!;
    const b = service.getInstallation('user-b', 'stripe')!.sealedSecrets!;
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
    expect(a.salt).not.toBe(b.salt);
  });

  it('tampered ciphertext fails closed — auth tag rejects modification', () => {
    service.installConnector(USER, 'stripe', { secretKey: STRIPE_LIVE });
    const record = service.getInstallation(USER, 'stripe')!;
    const tampered = {
      ...record.sealedSecrets!,
      ciphertext:
        record.sealedSecrets!.ciphertext.slice(0, -4) +
        (record.sealedSecrets!.ciphertext.endsWith('AAAA') ? 'BBBB' : 'AAAA'),
    };
    record.sealedSecrets = tampered;

    expect(() => service.resolveCredentials(USER, 'stripe')).toThrow();
  });

  it('key rotation re-seals every bundle; secrets still resolve, Map stays clean', () => {
    service.installConnector(USER, 'stripe', { secretKey: STRIPE_LIVE });
    service.installConnector(USER, 'slack', { botToken: SLACK_BOT });
    const before = service.getInstallation(USER, 'stripe')!.sealedSecrets!.ciphertext;

    const { rotated } = service.rotateCredentialKey(ROTATED_KEY, 'mcp-credential-key:v2');
    expect(rotated).toBe(2);

    const record = service.getInstallation(USER, 'stripe')!;
    expect(record.sealedSecrets!.ciphertext).not.toBe(before);
    expect(record.credentialKeyId).toBe('mcp-credential-key:v2');
    expect(storedJson(service)).not.toContain(STRIPE_LIVE);
    expect(storedJson(service)).not.toContain(SLACK_BOT);

    const resolved = service.resolveCredentials(USER, 'stripe');
    expect(resolved?.['secretKey']).toBe(STRIPE_LIVE);
  });

  it('uninstall purges the sealed bundle entirely', () => {
    service.installConnector(USER, 'stripe', { secretKey: STRIPE_LIVE });
    service.uninstallConnector(USER, 'stripe');

    expect(service.getInstallation(USER, 'stripe')).toBeUndefined();
    expect(service.resolveCredentials(USER, 'stripe')).toBeUndefined();
    expect(storedJson(service)).not.toContain(STRIPE_LIVE);
  });

  it('production without a credential key fails closed on service construction', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv(CREDENTIAL_KEY_ENV, '');
    vi.stubEnv('MCP_CREDENTIAL_KEYS', '');
    vi.stubEnv('MCP_CREDENTIAL_KEY_PREVIOUS', '');
    expect(() => new McpConnectorsService()).toThrow(/MCP_CREDENTIAL_KEY/);
  });

  it('weak credential keys are rejected', () => {
    expect(() => new McpConnectorsService({ credentialKey: 'too-short' })).toThrow(
      /at least 32/,
    );
  });
});

describe('mcp-credential-vault unit behavior', () => {
  it('splitSecretConfig classifies password-typed fields and secret-ish keys', () => {
    const { publicConfig, secrets } = splitSecretConfig(
      {
        apiKey: 'lin_api_F00K3Y',
        sessionCookie: 'cookie-value',
        endpointUrl: 'https://example.test',
        clientSecret: GOOGLE_SECRET,
      },
      [{ key: 'apiKey', type: 'text' }],
    );
    expect(Object.keys(secrets).sort()).toEqual(['apiKey', 'clientSecret', 'sessionCookie']);
    expect(publicConfig).toEqual({ endpointUrl: 'https://example.test' });
  });

  it('treats catalog password fields as secret even with bland key names', () => {
    const { secrets } = splitSecretConfig({ passphrase: 'hunter2-value' }, [
      { key: 'passphrase', type: 'password' },
    ]);
    expect(secrets).toHaveProperty('passphrase');
  });

  it('isSecretConfigKey mirrors the maskConfig heuristic', () => {
    for (const key of ['secretKey', 'clientSecret', 'botToken', 'sessionCookie', 'apiKey']) {
      expect(isSecretConfigKey(key)).toBe(true);
    }
    expect(isSecretConfigKey('endpointUrl')).toBe(false);
    expect(isSecretConfigKey('projectName')).toBe(false);
  });

  it('seal/open round-trips through JSON-typed secret values', () => {
    const keys = resolveCredentialKeys({ credentialKey: TEST_KEY });
    const bundle = sealSecrets({ token: SLACK_BOT, count: 3, nested: { a: 1 } }, keys[0]);
    const opened = openSecrets(bundle, keys);
    expect(opened).toEqual({ token: SLACK_BOT, count: 3, nested: { a: 1 } });
  });

  it('openSecrets with the wrong key throws (never returns garbage)', () => {
    const keys = resolveCredentialKeys({ credentialKey: TEST_KEY });
    const bundle = sealSecrets({ token: SLACK_BOT }, keys[0]);
    const wrongKeys = resolveCredentialKeys({ credentialKey: ROTATED_KEY });
    expect(() => openSecrets(bundle, wrongKeys)).toThrow(/no known key/i);
  });
});
