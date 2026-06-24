import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { SECTORS } from '../../../lib/domain';
import { listReports, recordAudit, updateReport } from '../../../lib/store';

export async function GET(request: NextRequest) {
  const sectorParam = request.nextUrl.searchParams.get('sector');
  const sector = SECTORS.find((s) => s === sectorParam);
  return NextResponse.json({ success: true, data: listReports(sector) });
}

const patchSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['open', 'in-review', 'resolved']),
});

export async function PATCH(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { message: 'Invalid JSON body', code: 'BAD_REQUEST' } },
      { status: 400 },
    );
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { message: 'Validation failed', code: 'VALIDATION' } },
      { status: 422 },
    );
  }

  const report = updateReport(parsed.data.id, parsed.data.status);
  if (!report) {
    return NextResponse.json(
      { success: false, error: { message: 'Report not found', code: 'NOT_FOUND' } },
      { status: 404 },
    );
  }
  recordAudit({
    action: `report.${parsed.data.status}`,
    target: report.id,
    detail: `${report.app} · ${report.reason}`,
  });
  return NextResponse.json({ success: true, data: report });
}
