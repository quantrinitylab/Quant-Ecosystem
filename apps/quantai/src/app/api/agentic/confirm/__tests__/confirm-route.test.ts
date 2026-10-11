// F-112: the held-plan confirm round-trip is the ONLY way a tier-2+ plan
// executes. This proxy must forward the bearer verbatim, validate the
// planId shape and the approved boolean, and relay the backend's verdict
// (401 bad token, 403 wrong user, 404 unknown/expired plan) unchanged.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { POST } from '../[planId]/route';

const AUTH = 'Bearer real-user-jwt';
const PLAN_ID = 'plan-1700000000000-ab12cd';

interface CapturedCall {
  url: string;
  init: RequestInit | undefined;
}

let captured: CapturedCall[];

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  captured = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      captured.push({ url: String(url), init });
      return handler(url, init);
    }),
  );
}

function postConfirm(planId: string, body: unknown, headers: Record<string, string> = {}) {
  const req = new Request('http://localhost/api/agentic/confirm/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return POST(req, { params: Promise.resolve({ planId }) });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/agentic/confirm/:planId (F-112)', () => {
  it('fails closed with 401 when the Authorization header is missing', async () => {
    const res = await postConfirm(PLAN_ID, { approved: true });
    expect(res.status).toBe(401);
  });

  it('returns 400 for a malformed plan id', async () => {
    for (const bad of ['../../etc', 'plan id with spaces!', 'a'.repeat(200), '']) {
      const res = await postConfirm(bad, { approved: true }, { authorization: AUTH });
      expect(res.status).toBe(400);
    }
  });

  it('returns 400 when approved is missing or not a boolean', async () => {
    for (const body of [{}, { approved: 'yes' }, { approved: 1 }]) {
      const res = await postConfirm(PLAN_ID, body, { authorization: AUTH });
      expect(res.status).toBe(400);
    }
  });

  it('proxies approval to the backend with the bearer forwarded verbatim', async () => {
    stubFetch(
      () =>
        new Response(
          JSON.stringify({ success: true, data: { results: [], approved: true } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );

    const res = await postConfirm(PLAN_ID, { approved: true }, { authorization: AUTH });

    expect(res.status).toBe(200);
    expect(captured).toHaveLength(1);
    expect(captured[0]!.url).toBe(`http://localhost:3004/agentic/confirm/${PLAN_ID}`);
    const sentHeaders = new Headers(captured[0]!.init?.headers);
    expect(sentHeaders.get('authorization')).toBe(AUTH);
    expect(JSON.parse(String(captured[0]!.init?.body))).toEqual({ approved: true });
    expect((await res.json()).success).toBe(true);
  });

  it('relays the backend 403 when the plan belongs to another user', async () => {
    stubFetch(
      () =>
        new Response(JSON.stringify({ error: { code: 'PLAN_USER_MISMATCH' } }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }),
    );

    const res = await postConfirm(PLAN_ID, { approved: true }, { authorization: AUTH });
    expect(res.status).toBe(403);
  });

  it('relays the backend 404 for an unknown or expired plan', async () => {
    stubFetch(
      () =>
        new Response(JSON.stringify({ error: { code: 'PLAN_NOT_FOUND' } }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }),
    );

    const res = await postConfirm(PLAN_ID, { approved: true }, { authorization: AUTH });
    expect(res.status).toBe(404);
  });

  it('returns 503 (plan not executed) when the backend is unreachable', async () => {
    stubFetch(() => {
      throw new Error('connect ECONNREFUSED');
    });

    const res = await postConfirm(PLAN_ID, { approved: true }, { authorization: AUTH });
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('UPSTREAM_UNAVAILABLE');
  });
});
