import { NextRequest } from 'next/server';
import { proxyToBackend } from '../_lib/proxy';

// CP-1: the QuantAI tool registry catalogue (name, tier, availability).
export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/tools');
}
