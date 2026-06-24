import { NextRequest, NextResponse } from 'next/server';
import { listAudit } from '../../../lib/store';

export async function GET(request: NextRequest) {
  const limitParam = Number(request.nextUrl.searchParams.get('limit') ?? '100');
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 100;
  return NextResponse.json({ success: true, data: listAudit(limit) });
}
