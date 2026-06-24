import { NextResponse } from 'next/server';
import { computeInsights } from '../../../lib/insights';

export async function GET() {
  return NextResponse.json({ success: true, data: computeInsights() });
}
