import { NextResponse } from 'next/server';

// Liveness probe for the container HEALTHCHECK. Always cheap + dynamic.
//
// `apps/quantchat/Dockerfile` has polled `http://localhost:3015/api/health`
// since it was written and this route did not exist, so the image reported
// `(unhealthy)` while serving every request correctly. The Helm chart probes the
// same path (`infra/helm/quant-platform/values.yaml`), where a missing route is
// not cosmetic: readiness never goes green and liveness restarts the container.
//
// NOT `/livez` or `/readyz`. Those belong to `@quant/server-core` and are served
// by the Fastify backend on 3002 (`infra/k8s/quantchat-backend.yaml`), which is
// a different image on a different port. This container runs `next start`.
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ status: 'ok', service: 'quantchat' });
}
