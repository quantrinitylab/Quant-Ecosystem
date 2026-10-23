import { NextRequest, NextResponse } from 'next/server';
import { authCookieSecure } from './cookie-options';

const BACKEND_URL = process.env.QUANTCHAT_BACKEND_URL || 'http://localhost:3002';

export async function proxyToBackend(
  request: NextRequest,
  backendPath: string,
  options?: { method?: string; body?: unknown },
) {
  const method = options?.method || request.method;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const authHeader = request.headers.get('Authorization');
  if (authHeader) headers['Authorization'] = authHeader;

  // QC-F-450: the 'My Eyes Only' vault unlock token travels only in this
  // one header (never body/query — URLs get logged). Allowlist-forward
  // exactly this header so the memories proxies can carry it to the
  // backend; no other custom header is forwarded.
  const memoriesUnlock = request.headers.get('X-Memories-Unlock');
  if (memoriesUnlock) headers['X-Memories-Unlock'] = memoriesUnlock;

  // QC-F-573: the K4 idempotency key travels end to end. Forward exactly
  // this header (like QC-F-450 above) so client-generated Idempotency-Key
  // values reach the backend's idempotency plugin; the backend replays a
  // stored response instead of double-creating on retry.
  const idempotencyKey = request.headers.get('Idempotency-Key');
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const url = new URL(backendPath, BACKEND_URL);
  // Forward search params for GET requests
  if (method === 'GET') {
    const searchParams = request.nextUrl
      ? request.nextUrl.searchParams
      : request.url
        ? new URL(request.url).searchParams
        : undefined;
    searchParams?.forEach((value, key) => {
      url.searchParams.set(key, value);
    });
  }

  const fetchOptions: RequestInit = { method, headers };
  if (options?.body) {
    fetchOptions.body = JSON.stringify(options.body);
  } else if (method !== 'GET' && method !== 'HEAD') {
    try {
      const body = await request.json();
      fetchOptions.body = JSON.stringify(body);
    } catch {
      /* no body */
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1500);

  if (request.signal) {
    if (request.signal.aborted) {
      controller.abort();
    } else {
      request.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      ...fetchOptions,
      signal: controller.signal,
    });
  } catch (_err) {
    // FAIL HONEST: the backend is unreachable. This proxy used to fabricate a
    // fake "General Chat" conversation list, fake welcome messages, and even
    // fake successful message sends with `success: true` — the user saw a
    // working-looking app while every byte was invented, and a 401 (expired
    // session) was silently masked the same way. Never invent data: surface
    // a real 503 so the client can show an honest offline/retry state.
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'UPSTREAM_UNAVAILABLE',
          message: 'Backend service is unavailable',
          statusCode: 503,
        },
      },
      { status: 503 },
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (res.status === 401) {
    if (authHeader) {
      const rawToken = authHeader.replace(/^Bearer\s*/i, '').trim();
      if (rawToken) {
        try {
          const exchangeRes = await fetch(new URL('/auth/sso/exchange', BACKEND_URL).toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ssoToken: rawToken }),
          });

          if (exchangeRes.ok) {
            const exchangeData = (await exchangeRes.json().catch(() => null)) as Record<string, any> | null;
            const newAccessToken = exchangeData?.data?.accessToken;
            if (newAccessToken) {
              const retryHeaders = { ...headers, Authorization: `Bearer ${newAccessToken}` };
              const retryRes = await fetch(url.toString(), {
                ...fetchOptions,
                headers: retryHeaders,
              });

              if (retryRes.ok) {
                const retryData = await retryRes.json();
                const nextResp = NextResponse.json(retryData, { status: retryRes.status });
                nextResp.cookies.set('quant_access_token', newAccessToken, {
                  path: '/',
                  httpOnly: true,
                  // Secure on every deployed env (QC-F-080 shared helper);
                  // only local dev/test skip it so http://localhost login works.
                  secure: authCookieSecure(),
                  sameSite: 'lax',
                });
                nextResp.cookies.set('token', newAccessToken, {
                  path: '/',
                  httpOnly: true,
                  // Secure on every deployed env (QC-F-080 shared helper);
                  // only local dev/test skip it so http://localhost login works.
                  secure: authCookieSecure(),
                  sameSite: 'lax',
                });
                return nextResp;
              }
            }
          }
        } catch {
          // Transparent exchange threw — fall through to the honest 401 below
        }
      }
    }

    // The transparent SSO exchange did not recover the session. FAIL
    // HONEST: return the backend's real 401 so the client can clear the
    // dead session and prompt a fresh sign-in. (This used to fabricate a
    // fake conversation list with success:true, silently masking expired
    // sessions behind invented data.)
    const errData = await res.json().catch(() => null);
    return NextResponse.json(
      errData ?? {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Unauthorized', statusCode: 401 },
      },
      { status: 401 },
    );
  }

  try {
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INVALID_RESPONSE',
          message: 'Backend returned non-JSON response',
          statusCode: 502,
        },
      },
      { status: 502 },
    );
  }
}
