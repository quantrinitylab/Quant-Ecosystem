// ============================================================================
// QuantDrive — link-share dialog data layer (QM-M39-006, screen 22)
// Scope/audience/expiry link sharing. Every function hits a real API and
// throws the backend's own message on failure; nothing here invents state.
// ============================================================================

import { apiFetchRaw } from '@quant/api-client';

export type LinkScope = 'anyone' | 'org' | 'specific';
export type LinkRole = 'viewer' | 'editor';

export interface DriveLinkEntry {
  id: string;
  role: string;
  scope: LinkScope;
  /** Honest human-readable audience, e.g. "Anyone with the link" or "a@x.com, b@y.com". */
  audience: string;
  audienceEmails: string[];
  audienceOrgs: string[];
  requiresPassword: boolean;
  /**
   * QM-M39-006 (hide-download-action): owner hid the download action for
   * viewers on this link. Wire field keeps the legacy name
   * `disableDownload` (migration 0111); it hides the button only, it is
   * NOT copy protection.
   */
  disableDownload: boolean;
  expiresAt: string | null;
  expired: boolean;
  createdAt: string;
  shareUrl: string;
}

export interface LinkFormValues {
  scope: LinkScope;
  audienceEmails: string[];
  role: LinkRole;
  /** YYYY-MM-DD from the date picker, or null for "no expiry". */
  expiresDate: string | null;
  /**
   * QM-M39-006 (hide-download-action): applies to viewer-role links only.
   * Optional — callers that never set it get the backend default (false),
   * so compose-time link creation stays download-enabled. The server
   * normalizes editor+true to false; hiding the button is NOT copy
   * protection.
   */
  disableDownload?: boolean;
}

async function readError(res: Response, fallback: string): Promise<Error> {
  const data = await res.json().catch(() => ({} as Record<string, unknown>));
  const message =
    typeof data?.message === 'string' && data.message
      ? data.message
      : typeof data?.error === 'string' && data.error
        ? data.error
        : fallback;
  return new Error(message);
}

export async function fetchDriveLinks(fileId: string): Promise<DriveLinkEntry[]> {
  const res = await apiFetchRaw(`/api/drive/files/${encodeURIComponent(fileId)}/links`);
  if (!res.ok) throw await readError(res, 'Could not load share links');
  const data = (await res.json().catch(() => ({}))) as { links?: DriveLinkEntry[] };
  return Array.isArray(data.links) ? data.links : [];
}

export async function createDriveLink(
  fileId: string,
  values: LinkFormValues,
): Promise<DriveLinkEntry> {
  const res = await apiFetchRaw('/api/drive/shares/link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileId,
      role: values.role,
      scope: values.scope,
      audienceEmails: values.audienceEmails,
      expiresAt: values.expiresDate,
      disableDownload: values.disableDownload,
    }),
  });
  if (!res.ok) throw await readError(res, 'Could not create share link');
  const data = (await res.json().catch(() => ({}))) as { share?: DriveLinkEntry };
  if (!data.share?.shareUrl) throw new Error('Server did not return a share link');
  return data.share;
}

export async function updateDriveLink(
  linkId: string,
  values: LinkFormValues,
): Promise<DriveLinkEntry> {
  const res = await apiFetchRaw('/api/drive/shares/link', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: linkId,
      role: values.role,
      scope: values.scope,
      audienceEmails: values.audienceEmails,
      expiresAt: values.expiresDate,
      disableDownload: values.disableDownload,
    }),
  });
  if (!res.ok) throw await readError(res, 'Could not update share link');
  const data = (await res.json().catch(() => ({}))) as { share?: DriveLinkEntry };
  if (!data.share) throw new Error('Server did not return the updated link');
  return data.share;
}

export async function revokeDriveLink(linkId: string): Promise<void> {
  const res = await apiFetchRaw(`/api/drive/shares/link?id=${encodeURIComponent(linkId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw await readError(res, 'Could not revoke share link');
}
