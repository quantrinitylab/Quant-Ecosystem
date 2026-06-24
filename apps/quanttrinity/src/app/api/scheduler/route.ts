import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isEnabled, listSchedule, setCadence, setEnabled } from '../../../lib/scheduler';

export async function GET() {
  return NextResponse.json({
    success: true,
    data: { enabled: isEnabled(), entries: listSchedule() },
  });
}

const patchSchema = z.union([
  z.object({ enabled: z.boolean() }),
  z.object({ employeeId: z.string().min(1), cadence: z.enum(['manual', 'hourly', 'daily']) }),
]);

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

  if ('enabled' in parsed.data) {
    return NextResponse.json({ success: true, data: { enabled: setEnabled(parsed.data.enabled) } });
  }

  const entry = setCadence(parsed.data.employeeId, parsed.data.cadence);
  if (!entry) {
    return NextResponse.json(
      { success: false, error: { message: 'AI employee not found', code: 'NOT_FOUND' } },
      { status: 404 },
    );
  }
  return NextResponse.json({ success: true, data: entry });
}
