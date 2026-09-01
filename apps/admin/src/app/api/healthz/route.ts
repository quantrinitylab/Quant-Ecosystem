import { NextResponse } from 'next/server';

// Liveness probe for the container HEALTHCHECK. Always cheap + dynamic.
//
// `/api/healthz` AND NOT `/api/health`, WHICH IS ALREADY TAKEN BY A DASHBOARD.
//
// `api/health/route.ts` in this app is not a container probe: it fans out to 22
// `fetch('http://localhost:<port>/health')` calls — 14 apps plus 8 services —
// with a 2s AbortController each, and returns 200 whatever comes back. As a
// readiness probe every 5s and a liveness probe every 10s that is a self-
// inflicted request storm that reports only that Next is routing, which is what
// this three-line handler reports for the cost of one JSON serialisation.
//
// The dashboard endpoint keeps its path because the admin UI consumes its
// `apps`/`services` payload. It is separately wrong — the ports in its registry
// do not match any deployed service and `/health` is not a route anywhere in the
// platform — but that is a product question about what the dashboard should
// consider "the platform", not something a probe fix should invent.
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ status: 'ok', service: 'admin' });
}
