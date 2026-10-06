// GET /api/quanty/popup — popup dashboard data (frontend QuantyPopupData contract).
import { NextRequest, NextResponse } from 'next/server';
import { backendJson, backendUnavailable } from '../_lib/backend';
import { mapPopupData, type BackendPopupData } from '../_lib/quanty-mapper';

export async function GET(request: NextRequest) {
  const { status, body } = await backendJson<BackendPopupData>(request, '/api/quanty/popup');
  if (status === 502) return backendUnavailable();
  if (!body.success || !body.data) {
    return NextResponse.json(
      { error: body.error?.message ?? 'Popup data unavailable' },
      { status: status === 200 ? 500 : status },
    );
  }
  return NextResponse.json(mapPopupData(body.data), {
    headers: { 'cache-control': 'no-store' },
  });
}
