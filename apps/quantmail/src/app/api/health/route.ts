/**
 * Liveness probe for the container HEALTHCHECK — and it did not exist.
 *
 * `apps/quantmail/Dockerfile` has polled `http://localhost:3010/api/health`
 * since it was written, `infra/helm/quant-platform/values.yaml` probes this app,
 * and `infra/scripts/health-check.sh` — the script the production cutover
 * runbook runs — polls it too. Nothing served it, so the image reported
 * `(unhealthy)` under Docker, and a chart rollout gated on that readiness probe
 * never became Ready while liveness restarted the container every 30 seconds.
 *
 * IT IS REACHED BY THE KUBELET, NOT BY THE BROWSER, and that is not a mistake.
 * The nginx ingress captures `/api(/|$)(.*)` and rewrites it onto the Fastify
 * backend, so from the internet this file is unreachable — `/api/health` on the
 * live host answers with the backend's own 404 (`Route GET:/health not found`;
 * the backend serves `/healthz`, `/livez` and `/readyz`, never `/health`). A
 * probe does not traverse the ingress: kubelet dials the pod IP on the container
 * port, which is this Next.js server. Same path, two different answers depending
 * on who asks — so do not point the chart at the public URL, and do not delete
 * this as dead code because curling the site 404s.
 *
 * Next resolves the static `api/health` segment ahead of the `api/[...path]`
 * catch-all, so the proxy's `ALLOWED_BACKEND_ROUTES` allowlist is not consulted
 * and local dev gets the same answer the probe does.
 *
 * WHY THIS IS NOT A PROXY. The backend has its own `/livez` and `/readyz` and
 * its own probes. This one answers a different question — "is *this* Next.js
 * container serving?" — so forwarding it would make the frontend report
 * unhealthy for a backend outage it is not responsible for, and take the whole
 * UI down with it.
 *
 * WHY IT CARRIES NO DEPENDENCY DETAIL. A frontend container has no database and
 * no queue; there is nothing to be ready *for* beyond having booted. Reporting
 * anything more here would be inventing a check.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const startedAt = Date.now();

export function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'quantmail',
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      version: process.env['APP_VERSION'] ?? '1.0.0',
    },
    {
      // This app is the one behind Cloudflare (`cf-cache-status` is present on
      // every live response), so the no-store is explicit rather than left to
      // the framework default: a cached 200 is exactly how a dead container
      // keeps reporting itself alive.
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    },
  );
}
