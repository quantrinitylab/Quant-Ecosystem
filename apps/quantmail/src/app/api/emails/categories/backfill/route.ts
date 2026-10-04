import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

// NOTE: proxyToBackend only forwards search params for GET requests.
// POST /emails/categories/backfill requires the `q` query param, so it is
// forwarded explicitly here — same pattern as Shift 2's post-emails-id-unsnooze.
export async function POST(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q');
  const query = q ? `?q=${encodeURIComponent(q)}` : '';
  return proxyToBackend(request, `/emails/categories/backfill${query}`);
}
