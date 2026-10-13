// Bitmoji seam proxy: POST|PUT /api/bitmoji -> backend /bitmoji (QC-F-089)
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../_lib/proxy';

export async function POST(request: NextRequest) {
  return proxyToBackend(request, '/bitmoji');
}

export async function PUT(request: NextRequest) {
  return proxyToBackend(request, '/bitmoji');
}
