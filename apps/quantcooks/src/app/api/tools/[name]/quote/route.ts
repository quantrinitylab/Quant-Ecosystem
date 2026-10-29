import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

// CP-1: quote a tool's exact params — never executes, never reserves.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  return proxyToBackend(request, `/tools/${name}/quote`);
}
