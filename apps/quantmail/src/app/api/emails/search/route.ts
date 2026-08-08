import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const base = process.env.QUANTMAIL_BACKEND_URL || 'http://localhost:3010';
  const url = new URL('/emails/search', base);

  // Map frontend param names to backend expected params
  const query = request.nextUrl.searchParams.get('query');
  if (query) url.searchParams.set('q', query);
  const from = request.nextUrl.searchParams.get('from');
  if (from) url.searchParams.set('from', from);
  const to = request.nextUrl.searchParams.get('to');
  if (to) url.searchParams.set('to', to);
  const page = request.nextUrl.searchParams.get('page');
  if (page) url.searchParams.set('page', page);
  const pageSize = request.nextUrl.searchParams.get('pageSize');
  if (pageSize) url.searchParams.set('pageSize', pageSize);
  const hasAttachment = request.nextUrl.searchParams.get('hasAttachment');
  if (hasAttachment) url.searchParams.set('hasAttachment', hasAttachment);
  const label = request.nextUrl.searchParams.get('label');
  if (label) url.searchParams.set('label', label);
  const dateFrom = request.nextUrl.searchParams.get('dateFrom');
  if (dateFrom) url.searchParams.set('dateFrom', dateFrom);
  // Also pass 'q' directly if frontend sends it
  const q = request.nextUrl.searchParams.get('q');
  if (q && !query) url.searchParams.set('q', q);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const auth = request.headers.get('Authorization');
  if (auth) headers['Authorization'] = auth;

  const res = await fetch(url.toString(), { headers });
  try {
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_RESPONSE', message: 'Backend returned non-JSON response', statusCode: 502 } },
      { status: 502 },
    );
  }
}
