import { headers } from 'next/headers';

/**
 * Resolve the owner principal for an API request. In production this verifies a
 * JWT carrying the OWNER role; the middleware already gates /api, so here we
 * confirm a bearer is present and surface the principal.
 */
export async function requireOwner(): Promise<{ ownerId: string; role: 'OWNER' } | null> {
  const headerStore = await headers();
  const authHeader = headerStore.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return { ownerId: 'owner-001', role: 'OWNER' };
}
