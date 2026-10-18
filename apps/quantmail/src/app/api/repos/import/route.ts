import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

// R18-NEW-1 (P0): a static route must exist for /api/repos/import so that POST
// is not swallowed by the dynamic sibling apps/quantmail/src/app/api/repos/[id]/route.ts,
// which exports only GET + DELETE (Next.js returns 405 for any other method
// on the matched [id] route). Static routes beat dynamic [id] segments in the
// App Router, so this un-shadows /import. Auth stays enforced by the backend
// (handleImportRepo calls requireUserId -> honest 401 for unauthenticated
// callers); the proxy adds no auth of its own.
export async function POST(request: NextRequest) {
  return proxyToBackend(request, '/repos/import');
}
