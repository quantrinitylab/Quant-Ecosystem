import { NextRequest } from 'next/server';
import { proxyGoals } from '../_lib';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyGoals(request, 'PATCH', `/goals/${id}`);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyGoals(request, 'DELETE', `/goals/${id}`);
}
