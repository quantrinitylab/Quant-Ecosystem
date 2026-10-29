import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

// CP-1: one tool's detail (schemas, pricing rule, availability).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  return proxyToBackend(request, `/tools/${name}`);
}
