import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

// DELETE /api/shopping/cart/:productId — remove a line item from the cart.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { productId } = await params;
  return proxyToBackend(request, `/shopping/cart/${encodeURIComponent(productId)}`, {
    method: 'DELETE',
  });
}
