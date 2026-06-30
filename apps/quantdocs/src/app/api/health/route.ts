import { NextResponse } from 'next/server';

// Liveness probe for the container HEALTHCHECK. Always cheap + dynamic.
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ status: 'ok', service: 'quantdocs' });
}
