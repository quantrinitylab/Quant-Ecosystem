import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

// CP-1: invoke a tool — { params, quoteId?, idempotencyKey? }. Agent /
// delegated invokes refuse DELEGATION_NOT_CONFIGURED until CP-3; the
// proxy passes every verdict through untouched.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  return proxyToBackend(request, `/tools/${name}/invoke`);
}
