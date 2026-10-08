// K13 remote-call timeout policy — behavior tests.
// Proves: timeouts fire (typed error), never hang, env overrides work,
// and fetch deadlines abort the underlying request.
import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import {
  RemoteCallTimeoutError,
  REMOTE_CALL_TIMEOUTS,
  getTimeoutMs,
  withTimeout,
  withDependencyTimeout,
  fetchWithTimeout,
} from '../timeouts';

const neverSettles = <T = never>() => new Promise<T>(() => {});
const flush = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('RemoteCallTimeoutError', () => {
  it('is a typed error carrying dependency label and budget', () => {
    const err = new RemoteCallTimeoutError('sso', 8000);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(RemoteCallTimeoutError);
    expect(err.code).toBe('REMOTE_CALL_TIMEOUT');
    expect(err.dependency).toBe('sso');
    expect(err.timeoutMs).toBe(8000);
    expect(err.message).toContain('sso');
    expect(err.message).toContain('8000');
  });
});

describe('REMOTE_CALL_TIMEOUTS', () => {
  it('defines a budget for every managed dependency', () => {
    for (const key of ['postgres', 'redis', 'ses', 'smtp', 'search', 'sso', 'storage'] as const) {
      expect(REMOTE_CALL_TIMEOUTS[key]).toBeGreaterThan(0);
    }
    expect(REMOTE_CALL_TIMEOUTS.default).toBeGreaterThan(0);
  });
});

describe('getTimeoutMs', () => {
  const ENV = 'QUANT_TIMEOUT_SEARCH';
  const saved = process.env[ENV];
  afterEach(() => {
    if (saved === undefined) delete process.env[ENV];
    else process.env[ENV] = saved;
  });

  it('returns the map default', () => {
    delete process.env[ENV];
    expect(getTimeoutMs('search')).toBe(REMOTE_CALL_TIMEOUTS.search);
  });

  it('honors QUANT_TIMEOUT_<KEY> env overrides', () => {
    process.env[ENV] = '1234';
    expect(getTimeoutMs('search')).toBe(1234);
  });

  it('ignores non-positive / unparsable env values', () => {
    process.env[ENV] = 'not-a-number';
    expect(getTimeoutMs('search')).toBe(REMOTE_CALL_TIMEOUTS.search);
    process.env[ENV] = '-5';
    expect(getTimeoutMs('search')).toBe(REMOTE_CALL_TIMEOUTS.search);
  });

  it('explicit override wins over env', () => {
    process.env[ENV] = '1234';
    expect(getTimeoutMs('search', 42)).toBe(42);
  });
});

describe('withTimeout', () => {
  it('passes through a promise that settles in time', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000, 'search')).resolves.toBe('ok');
  });

  it('rejects with the typed error instead of hanging', async () => {
    const start = Date.now();
    const err = await withTimeout(neverSettles(), 30, 'sso').catch((e) => e);
    const elapsed = Date.now() - start;
    expect(err).toBeInstanceOf(RemoteCallTimeoutError);
    expect(err.code).toBe('REMOTE_CALL_TIMEOUT');
    expect(err.dependency).toBe('sso');
    expect(err.timeoutMs).toBe(30);
    // Fails fast — nowhere near a hang.
    expect(elapsed).toBeLessThan(1000);
  });

  it('propagates the promise’s own rejection untouched', async () => {
    const boom = new Error('upstream 500');
    await expect(withTimeout(Promise.reject(boom), 1000, 'ses')).rejects.toBe(boom);
  });
});

describe('withDependencyTimeout', () => {
  it('resolves normally when the call is fast', async () => {
    await expect(withDependencyTimeout('search', async () => 'fast', { timeoutMs: 500 })).resolves.toBe('fast');
  });

  it('fails fast with the typed error and logs with the label', async () => {
    const logs: Array<{ obj: Record<string, unknown>; msg: string }> = [];
    let seen: unknown;
    const start = Date.now();
    const err = await withDependencyTimeout('storage', neverSettles, {
      timeoutMs: 30,
      logger: { warn: (obj, msg) => logs.push({ obj, msg }) },
      onTimeout: (e) => {
        seen = e;
      },
    }).catch((e) => e);
    expect(Date.now() - start).toBeLessThan(1000);
    expect(err).toBeInstanceOf(RemoteCallTimeoutError);
    expect((err as RemoteCallTimeoutError).dependency).toBe('storage');
    expect(seen).toBe(err);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.obj['dependency']).toBe('storage');
    expect(logs[0]?.obj['code']).toBe('REMOTE_CALL_TIMEOUT');
  });

  it('propagates synchronous throws from the thunk', async () => {
    const boom = new Error('sync boom');
    await expect(
      withDependencyTimeout('redis', () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
  });
});

describe('fetchWithTimeout', () => {
  let server: Server | null = null;
  const baseUrl = () =>
    `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((r) => server!.close(() => r()));
      server = null;
    }
  });

  it('returns the response when the upstream is fast', async () => {
    server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    const res = await fetchWithTimeout(`${baseUrl()}/health`, undefined, 'sso', { timeoutMs: 2000 });
    expect(res.status).toBe(200);
    await res.arrayBuffer(); // drain
  });

  it('aborts a hanging upstream and surfaces the typed error (no hang)', async () => {
    server = createServer(() => {
      // Never respond — simulates a hung upstream.
    });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    const start = Date.now();
    const err = await fetchWithTimeout(`${baseUrl()}/hang`, undefined, 'search', {
      timeoutMs: 50,
    }).catch((e) => e);
    const elapsed = Date.now() - start;
    expect(err).toBeInstanceOf(RemoteCallTimeoutError);
    expect((err as RemoteCallTimeoutError).dependency).toBe('search');
    expect(elapsed).toBeLessThan(2000);
  });

  it('keeps caller-initiated aborts distinct from timeouts', async () => {
    server = createServer(() => {
      // Never respond.
    });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    const caller = new AbortController();
    const pending = fetchWithTimeout(`${baseUrl()}/hang`, undefined, 'sso', {
      timeoutMs: 5000,
      signal: caller.signal,
    });
    await flush(20);
    caller.abort();
    const err = await pending.catch((e) => e);
    expect(err).not.toBeInstanceOf(RemoteCallTimeoutError);
    expect((err as Error).name).toBe('AbortError');
  });
});
