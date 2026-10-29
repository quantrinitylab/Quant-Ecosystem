/**
 * Send-mail-as identity authorization core — the shared, route-independent
 * half of fix/qm-accounts-import.
 *
 * Lives in services/ (not routes/) because EmailService.send() must
 * re-authorize the persisted identity at send time, and services must never
 * import from routes/. The route layer (routes/send-as.ts) re-exports the
 * compose-time resolver so existing imports keep working.
 *
 * Fail-closed contract shared by both entry points:
 * - an unknown id, or an id owned by another user, can never authorize;
 * - an unverified row is inert at compose time (404/403 SEND_AS_*) and
 *   denied at send time (403 SEND_AS_REVOKED).
 */

import type { PrismaClient } from '@prisma/client';
import { createAppError } from '@quant/server-core';

export interface SendAsIdentityRef {
  id: string;
  email: string;
  displayName: string | null;
}

type SendAsIdentityDb = {
  sendAsIdentity: {
    findUnique(a: unknown): Promise<{
      id: string;
      userId: string;
      email: string;
      displayName: string | null;
      verifiedAt: Date | null;
    } | null>;
  };
};

/**
 * Resolve a send-as identity for the compose path. Throws the app error the
 * caller converts to the HTTP response — the composer may stamp the address
 * as From only when the row exists, belongs to the caller, and is verified.
 */
export async function resolveSendAsIdentity(
  prisma: PrismaClient,
  userId: string,
  sendAsId: string,
): Promise<SendAsIdentityRef> {
  const identity = await (prisma as unknown as SendAsIdentityDb).sendAsIdentity.findUnique({
    where: { id: sendAsId },
  });
  if (!identity || identity.userId !== userId) {
    throw createAppError('Send-as address not found', 404, 'SEND_AS_NOT_FOUND');
  }
  if (!identity.verifiedAt) {
    throw createAppError(
      'This address is not verified yet — confirm the code sent to it first',
      403,
      'SEND_AS_UNVERIFIED',
    );
  }
  return { id: identity.id, email: identity.email, displayName: identity.displayName };
}

/**
 * fix/qm-accounts-import-corrective-3 (CODEX-REVIEW 6377798303): the send-time
 * re-authorization of the authoritative identity id persisted on the email
 * row (migration 0110). FAIL-CLOSED:
 * - unknown id, or an id belonging to another user → 403 SEND_AS_REVOKED;
 * - a row that exists but is no longer verified → 403 SEND_AS_REVOKED.
 *
 * The draft is NOT silently re-addressed to the account's own address — the
 * caller must surface this to the user so they pick a live identity (or
 * their own address) and resend. The returned email/displayName are the
 * identity's CURRENT values, so a renamed alias sends with the fresh name.
 * Throws the app error the caller converts to the HTTP response.
 */
export async function reauthorizeSendAsIdentity(
  prisma: PrismaClient,
  userId: string,
  sendAsId: string,
): Promise<SendAsIdentityRef> {
  const identity = await (prisma as unknown as SendAsIdentityDb).sendAsIdentity.findUnique({
    where: { id: sendAsId },
  });
  if (!identity || identity.userId !== userId) {
    throw createAppError(
      'This send-as address was revoked or no longer exists — pick your address or a live alias and send again',
      403,
      'SEND_AS_REVOKED',
    );
  }
  if (!identity.verifiedAt) {
    throw createAppError(
      'This send-as address is no longer verified — re-verify it before sending',
      403,
      'SEND_AS_REVOKED',
    );
  }
  return { id: identity.id, email: identity.email, displayName: identity.displayName };
}
