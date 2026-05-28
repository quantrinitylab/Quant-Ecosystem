import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.QUANTDOCS_BACKEND_URL || 'http://localhost:3105';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await fetch(`${BACKEND_URL}/docs/${id}`, {
    headers: { Authorization: request.headers.get('Authorization') || '' },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
