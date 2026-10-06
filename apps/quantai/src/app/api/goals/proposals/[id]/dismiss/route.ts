import { NextRequest } from 'next/server';
import { proxyGoals } from '../../../_lib';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyGoals(request, 'POST', `/goals/proposals/${id}/dismiss`);
}
