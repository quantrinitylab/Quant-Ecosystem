/**
 * Account-liveness verdict for authentication flows.
 *
 * `deletedAt` is the User soft-delete tombstone (packages/database/prisma/
 * schema.prisma): the row still claims its unique email/username, but the
 * account no longer exists for authentication purposes. `user.repository.ts`
 * `softDelete()` sets `deletedAt` AND `status: 'DEACTIVATED'` together; an
 * admin may also SUSPEND/DEACTIVATE a live row without tombstoning it.
 *
 * Verdicts:
 * - 'deleted'     — tombstoned. Callers MUST treat this exactly like a missing
 *                   row (same code, same message, same HTTP status) so the
 *                   tombstone cannot be probed for existence.
 * - 'suspended'   — admin-suspended live row. An honest ACCOUNT_SUSPENDED.
 * - 'deactivated' — admin-deactivated live row. An honest ACCOUNT_DEACTIVATED.
 * - 'ok'          — anything else on a non-tombstoned row (ACTIVE,
 *                   PENDING_VERIFICATION, ...). PENDING_VERIFICATION is
 *                   deliberately live: address proof gates individual actions,
 *                   not the session itself.
 */
export type AccountLiveness = 'ok' | 'deleted' | 'suspended' | 'deactivated';

export function accountLiveness(
  user: { deletedAt?: Date | string | null; status?: string | null } | null | undefined,
): AccountLiveness {
  if (!user) return 'ok'; // callers handle missing rows themselves
  if (user.deletedAt) return 'deleted';
  const status = typeof user.status === 'string' ? user.status.toUpperCase() : '';
  if (status === 'SUSPENDED') return 'suspended';
  if (status === 'DEACTIVATED') return 'deactivated';
  return 'ok';
}
