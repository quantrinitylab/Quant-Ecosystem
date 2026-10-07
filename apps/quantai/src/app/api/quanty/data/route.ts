// ============================================================================
// DELETE /api/quanty/data — request deletion of your QuantAI data.
//
// Deletion across the ecosystem is irreversible and there is no self-serve
// deletion pipeline yet. This route therefore requires an explicit typed
// confirmation ("DELETE") and then honestly answers 501 with a support path —
// it NEVER returns a fake "your data was deleted" success.
// ============================================================================
import { NextResponse } from 'next/server';

export async function DELETE(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.length <= 7) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized: sign in to request deletion.' },
      { status: 401 },
    );
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const confirm =
    body && typeof body === 'object' && 'confirm' in body
      ? String((body as { confirm: unknown }).confirm ?? '')
      : '';

  if (confirm !== 'DELETE') {
    return NextResponse.json(
      {
        success: false,
        error: 'Confirmation required: send { "confirm": "DELETE" } to request deletion.',
      },
      { status: 400 },
    );
  }

  // No self-serve deletion pipeline exists yet — honest 501, never fake success.
  return NextResponse.json(
    {
      success: false,
      code: 'DELETION_NOT_SELF_SERVE',
      error:
        'Self-serve deletion is not available yet. To delete your data, email ' +
        'support@quantmail.in from your account email with the subject "Delete my QuantAI data" ' +
        'and we will process it manually. Nothing has been deleted.',
    },
    { status: 501 },
  );
}
