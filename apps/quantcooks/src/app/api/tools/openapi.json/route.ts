import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

// CP-1: the registry-generated OpenAPI document (§2.4).
export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/tools/openapi.json');
}
