/**
 * QC-F-581 — QuantChat getConfig must expose trustedProxies from
 * TRUSTED_PROXY_IPS (comma-separated IPs/CIDRs), defaulting to loopback only.
 *
 * Without this, server-core's trustProxy stays at its loopback default and the
 * staging/prod backend behind nginx ingress + Next.js API proxies keeps
 * keying every rate-limit bucket on the proxy pod IP (QC-F-581 premise).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getConfig } from '../app';

describe('QC-F-581 getConfig TRUSTED_PROXY_IPS', () => {
  const KEY = 'TRUSTED_PROXY_IPS';
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env[KEY];
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    if (saved === undefined) delete process.env[KEY];
    else process.env[KEY] = saved;
    vi.unstubAllEnvs();
  });

  it('T6: parses comma-separated IPs/CIDRs into trustedProxies', () => {
    vi.stubEnv(KEY, '10.244.0.0/16, 172.17.0.0/16 , 127.0.0.1');
    expect(getConfig().trustedProxies).toEqual([
      '10.244.0.0/16',
      '172.17.0.0/16',
      '127.0.0.1',
    ]);
  });

  it('T7: defaults to loopback only when the env var is unset', () => {
    delete process.env[KEY];
    expect(getConfig().trustedProxies).toEqual(['127.0.0.1', '::1']);
  });

  it('T8: empty/blank entries are dropped, never passed to Fastify', () => {
    vi.stubEnv(KEY, '10.0.0.0/8,, ,');
    expect(getConfig().trustedProxies).toEqual(['10.0.0.0/8']);
  });
});
