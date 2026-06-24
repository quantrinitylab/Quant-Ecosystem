import { NextRequest, NextResponse } from 'next/server';
import { runDueShifts } from '../../../../lib/scheduler';

/**
 * Run due shifts. Pass `?force=1` to run every active AI employee now
 * regardless of cadence ("Run all now").
 */
export async function POST(request: NextRequest) {
  const force = request.nextUrl.searchParams.get('force') === '1';
  const result = runDueShifts(Date.now(), force);
  return NextResponse.json({ success: true, data: result });
}
