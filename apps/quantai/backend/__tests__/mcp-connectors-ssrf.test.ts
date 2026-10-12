/**
 * SSRF guard tests for connector probe URLs (CodeQL js/request-forgery #141).
 *
 * The probe URL flows from connector config (`endpointUrl`) into a
 * server-side fetch(). `isProbeUrlAllowed()` is the security boundary:
 * only public http(s) endpoints may be probed. These tests pin that
 * boundary, including the fail-closed behavior of `testConnection()` when
 * a blocked URL is configured (no fetch must occur).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  McpConnectorsService,
  MCP_CONNECTOR_CATALOG,
  isProbeUrlAllowed,
} from '../services/mcp-connectors.service';

describe('isProbeUrlAllowed — SSRF boundary', () => {
  describe('allows public endpoints', () => {
    it.each([
      'https://mail.quantrinity.in',
      'https://drive.quantrinity.in',
      'https://git.quantrinity.in',
      'https://api.github.com/rate_limit',
      'https://mail.example.test',
      'http://example.com:8080/path?q=1',
      'https://8.8.8.8/dns', // public IP literal is fine
      'http://[::ffff:8.8.8.8]/', // IPv4-mapped public stays allowed
    ])('allows %s', (url) => {
      expect(isProbeUrlAllowed(url)).toBe(true);
    });
  });

  describe('blocks dangerous targets', () => {
    it.each([
      'file:///etc/passwd',
      'gopher://evil.test/',
      'ftp://files.test/x',
      'http://127.0.0.1/',
      'https://127.0.0.1:8443/',
      'http://10.0.0.5/',
      'http://172.16.4.9/',
      'http://172.31.255.255/',
      'http://192.168.1.1/',
      'http://169.254.169.254/',
      'https://169.254.169.254/latest/meta-data/',
      'http://0.0.0.0/',
      'http://[::1]/',
      'http://[fe80::1]/',
      'http://[fc00::dead]/',
      'http://[::ffff:127.0.0.1]/', // IPv4-mapped loopback
      'http://metadata.google.internal/',
      'http://instance-data/',
      'not a url',
      '',
    ])('blocks %s', (url) => {
      expect(isProbeUrlAllowed(url)).toBe(false);
    });

    it('does not block the public boundary of private ranges', () => {
      expect(isProbeUrlAllowed('http://172.15.255.255/')).toBe(true);
      expect(isProbeUrlAllowed('http://172.32.0.1/')).toBe(true);
      expect(isProbeUrlAllowed('http://11.0.0.1/')).toBe(true);
    });
  });

  it('lets every catalog default endpointUrl pass the guard', () => {
    const defaults = MCP_CONNECTOR_CATALOG.map((item) =>
      item.configFields.find((f) => f.key === 'endpointUrl')?.defaultValue,
    ).filter((v): v is string => typeof v === 'string' && v.length > 0);
    expect(defaults.length).toBeGreaterThan(0);
    for (const d of defaults) {
      expect(isProbeUrlAllowed(d)).toBe(true);
    }
  });
});

describe('testConnection — fail-closed on blocked probe URL', () => {
  const service = new McpConnectorsService();

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('never calls fetch for a loopback endpointUrl and reports the block honestly', async () => {
    const fetchMock = vi.fn(async () => ({ status: 200, ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await service.testConnection('quantmail', {
      sessionCookie: 'synthetic-session-token-0000',
      endpointUrl: 'http://127.0.0.1:3999/',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.success).toBe(false);
    expect(res.verified).toBe(true);
    expect(res.outcome).toBe('failed');
    expect(res.message).toContain('not allowed');
  });

  it('never calls fetch for a metadata-IP endpointUrl', async () => {
    const fetchMock = vi.fn(async () => ({ status: 200, ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await service.testConnection('quantdrive', {
      sessionCookie: 'synthetic-session-token-0000',
      endpointUrl: 'http://169.254.169.254/',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.success).toBe(false);
    expect(res.message).toContain('not allowed');
  });

  it('still probes a public endpointUrl normally', async () => {
    const fetchMock = vi.fn(async () => ({ status: 200, ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await service.testConnection('quantmail', {
      sessionCookie: 'synthetic-session-token-0000',
      endpointUrl: 'https://mail.example.test',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.success).toBe(true);
  });
});
