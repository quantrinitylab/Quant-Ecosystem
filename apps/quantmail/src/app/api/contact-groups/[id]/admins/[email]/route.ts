import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../../_lib/proxy';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; email: string }> },
) {
  const { id, email } = await params;
  return proxyToBackend(
    request,
    `/contact-groups/${encodeURIComponent(id)}/admins/${encodeURIComponent(email)}`,
    { method: 'DELETE' },
  );
}
