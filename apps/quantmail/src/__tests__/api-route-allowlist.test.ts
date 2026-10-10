// @vitest-environment node
// ============================================================================
// quantmail — `src/app/api/[...path]/route.ts` allow-list tests
// ============================================================================
//
// This file exists because the allow-list shipped a live bug with no test to
// catch it. `backend/routes/ci.ts` implements six `/ci/*` routes, and its own
// header comment says it was written because the Pipelines page "showed Failed
// to load" — but `GET /ci/workflows`, `GET /ci/builds` and `GET /ci/builds/:id`
// were never listed here, so the proxy answered `API_ROUTE_NOT_FOUND` before
// the request left Next. The backend fix landed and the page still failed.
//
// The allow-list is a `.find()` over an ordered array, so it has two failure
// modes a typecheck cannot see: a route the product calls that no pattern
// matches (404 before the network), and a pattern that shadows a later, more
// specific one (405 on a route that exists). Both are asserted below.
//
// `fetch` is mocked, so "reached the backend" means `proxyToBackend` was given
// the request — not that a backend is running.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import * as apiRoute from '../app/api/[...path]/route';

const BACKEND = process.env['QUANTMAIL_BACKEND_URL'] ?? 'http://localhost:3010';

const contextFor = (path: string) => ({ params: Promise.resolve({ path: path.split('/') }) });

const requestFor = (path: string, method: string, search = '') =>
  new NextRequest(`http://localhost:3000/api/${path}${search}`, {
    method,
    ...(method === 'GET' || method === 'DELETE' ? {} : { body: JSON.stringify({}) }),
    headers: { 'content-type': 'application/json' },
  });

const call = (path: string, method: keyof typeof HANDLERS, search = '') =>
  HANDLERS[method](requestFor(path, method, search), contextFor(path));

const HANDLERS = {
  GET: apiRoute.GET,
  POST: apiRoute.POST,
  PUT: apiRoute.PUT,
  PATCH: apiRoute.PATCH,
  DELETE: apiRoute.DELETE,
} as const;

describe('QuantMail backend allow-list', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // The file's closing comment records the trap: the App Router 405s a method
  // with no export *before* the allow-list is consulted, so a `methods` entry
  // for a verb this module does not export is a route that cannot be called.
  it('exports every verb its allow-list grants', () => {
    for (const verb of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      expect(typeof HANDLERS[verb], `${verb} must be exported`).toBe('function');
    }
  });

  describe('the six /ci/* routes the Pipelines page depends on', () => {
    // Path, verb, and the backend URL the proxy must call. Every one of these
    // is implemented in `backend/routes/ci.ts`; three of the GETs used to 404
    // here, which is the bug this block pins shut.
    const CI_ROUTES: Array<[string, keyof typeof HANDLERS]> = [
      ['ci/workflows', 'GET'],
      ['ci/builds', 'GET'],
      ['ci/builds/run_123', 'GET'],
      ['ci/deployments', 'GET'],
      ['ci/workflows/repo_9/trigger', 'POST'],
      ['ci/builds/run_123/cancel', 'POST'],
    ];

    for (const [path, method] of CI_ROUTES) {
      it(`forwards ${method} /${path} to the backend`, async () => {
        const response = await call(path, method);

        expect(response.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BACKEND}/${path}`);
        expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method });
      });
    }

    // `ci/builds/[^/]+` is listed GET-only and sits ABOVE the trigger/cancel
    // POST entry. `[^/]+` cannot cross a slash, so `ci/builds/x/cancel` falls
    // through to the POST entry instead of being 405'd by the GET one. Swap the
    // two entries or loosen that class to `.+` and this test goes red.
    it('does not let the GET-only build entry shadow the cancel POST', async () => {
      const response = await call('ci/builds/run_123/cancel', 'POST');

      expect(response.status).not.toBe(405);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('forwards query params on the builds list', async () => {
      await call('ci/builds', 'GET', '?page=2&status=RUNNING');

      const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
      expect(url.searchParams.get('page')).toBe('2');
      expect(url.searchParams.get('status')).toBe('RUNNING');
    });
  });

  describe('routes with no backend handler', () => {
    // `apiClient.deploy` posts here and has zero callers; `backend/routes/ci.ts`
    // has no POST handler for it. Listing the verb would advertise a route that
    // 404s at the backend instead of 405ing at the edge.
    it('405s POST /ci/deployments and names the verbs that do work', async () => {
      const response = await call('ci/deployments', 'POST');

      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('GET');
      expect(fetchMock).not.toHaveBeenCalled();
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'METHOD_NOT_ALLOWED' },
      });
    });

    it('404s an unmatched path without touching the network', async () => {
      const response = await call('ci/secrets', 'GET');

      expect(response.status).toBe(404);
      expect(fetchMock).not.toHaveBeenCalled();
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'API_ROUTE_NOT_FOUND' },
      });
    });
  });

  describe('K9 — the admin routes the M19/M20 screens depend on', () => {
    // Every one of these is implemented in `backend/routes/admin.ts` and
    // staff-gated there. If the proxy 404s any of them, the new admin screens
    // read "Unavailable" with a live backend — the failure mode this file pins.
    const ADMIN_ROUTES: Array<[string, keyof typeof HANDLERS]> = [
      ['admin/organizations', 'GET'],
      ['admin/mail/domains', 'GET'],
      ['admin/mail/domains', 'POST'],
      ['admin/mail/domains/dom_123/verify', 'POST'],
      ['admin/mail/domains/dom_123', 'DELETE'],
      ['admin/mail/dlp/policies', 'GET'],
      ['admin/audit/logs', 'GET'],
    ];

    for (const [path, method] of ADMIN_ROUTES) {
      it(`forwards ${method} /${path} to the backend`, async () => {
        const response = await call(path, method);

        expect(response.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BACKEND}/${path}`);
        expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method });
      });
    }

    it('forwards the organization scope query on the domains list', async () => {
      await call('admin/mail/domains', 'GET', '?organizationId=org-1');

      const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
      expect(url.searchParams.get('organizationId')).toBe('org-1');
    });

    it('forwards audit filter query params', async () => {
      await call('admin/audit/logs', 'GET', '?action=domain.verify&limit=25');

      const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
      expect(url.searchParams.get('action')).toBe('domain.verify');
      expect(url.searchParams.get('limit')).toBe('25');
    });

    // The DELETE body carries `{ organizationId }` (Next only forwards search
    // params for GET). The proxy must pass the JSON body through untouched.
    it('forwards the DELETE body carrying the organization scope', async () => {
      await HANDLERS.DELETE(
        new NextRequest('http://localhost:3000/api/admin/mail/domains/dom_123', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ organizationId: 'org-1' }),
        }),
        contextFor('admin/mail/domains/dom_123'),
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const sentBody = String(fetchMock.mock.calls[0]?.[1]?.body ?? '');
      expect(JSON.parse(sentBody)).toMatchObject({ organizationId: 'org-1' });
    });

    // The verify entry is POST-only: the GET-only domains entry must not
    // shadow it (pattern ordering check, like the ci/builds trap above).
    it('does not 405 POST /admin/mail/domains/:id/verify', async () => {
      const response = await call('admin/mail/domains/dom_123/verify', 'POST');
      expect(response.status).not.toBe(405);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('405s PUT on the admin domains collection', async () => {
      const response = await call('admin/mail/domains', 'PUT');
      expect(response.status).toBe(405);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('keeps a blanket admin/* door closed', async () => {
      const response = await call('admin/superuser/backdoor', 'GET');
      expect(response.status).toBe(404);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('QM-UIUX-091 — the data-export routes the Account page depends on', () => {
    // Every one of these is implemented in `backend/routes/data-lifecycle.ts`
    // (registered at `/data-lifecycle` and `/api/data-lifecycle` in
    // backend/app.ts). The allow-list had no `data-lifecycle` entry at all,
    // so the Account page's export control 404'd here — API_ROUTE_NOT_FOUND
    // before the request left Next — even though the backend export center
    // (QM-BACK-006) was live. Same failure class as the CI GETs above.
    const EXPORT_ROUTES: Array<[string, keyof typeof HANDLERS]> = [
      ['data-lifecycle/exports', 'GET'],
      ['data-lifecycle/exports', 'POST'],
      ['data-lifecycle/exports/exp_123', 'GET'],
      ['data-lifecycle/exports/exp_123/build', 'POST'],
    ];

    for (const [path, method] of EXPORT_ROUTES) {
      it(`forwards ${method} /${path} to the backend`, async () => {
        const response = await call(path, method);

        expect(response.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BACKEND}/${path}`);
        expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method });
      });
    }

    // The backend authorises from `request.auth.userId`, which comes from
    // the caller's access token — a proxy that dropped Authorization would
    // make every export call a 401. Pin the forwarding explicitly.
    it('forwards the Authorization header to the backend', async () => {
      const request = new NextRequest('http://localhost:3000/api/data-lifecycle/exports', {
        method: 'GET',
        headers: { authorization: 'Bearer test-token' },
      });
      const response = await apiRoute.GET(request, contextFor('data-lifecycle/exports'));

      expect(response.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const headers = fetchMock.mock.calls[0]?.[1]?.headers as
        | Record<string, string>
        | undefined;
      expect(headers?.Authorization).toBe('Bearer test-token');
    });

    // The GET-only `:id` entry is anchored and single-segment, so it cannot
    // shadow the `/build` POST — the same trap as ci/builds cancel above.
    // Loosen it to `.+` or drop the `$` and this test goes red.
    it('does not let the GET-only export entry shadow the build POST', async () => {
      const response = await call('data-lifecycle/exports/exp_123/build', 'POST');

      expect(response.status).not.toBe(405);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('405s DELETE on the exports collection and names the verbs that do work', async () => {
      const response = await call('data-lifecycle/exports', 'DELETE');

      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('GET, POST');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    // The retention sweep and the operations read have no web caller; the
    // proxy deliberately keeps those doors shut (enumerated list, like admin).
    it('keeps retention and operations routes closed', async () => {
      const sweep = await call('data-lifecycle/retention/sweep', 'POST');
      expect(sweep.status).toBe(404);
      const ops = await call('data-lifecycle/operations', 'GET');
      expect(ops.status).toBe(404);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
