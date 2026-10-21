// ============================================================================
// QuantDrive — universal-search deep-link resolver (?file=<id>).
//
// Resolves a drive file id into the DriveItem shape the in-page file preview
// needs. The metadata comes from the real GET /api/drive/files/:id/details
// endpoint (the same aggregated identity endpoint the FileDetailsPanel
// reads). Errors are honest: a 404/403/500 surfaces the backend's message,
// a folder is rejected because it has no file preview, and an incomplete
// payload is reported instead of inventing a file.
// ============================================================================

import { apiFetchRaw } from '@quant/api-client';

/** Minimal DriveItem shape the drive-page preview funnel needs. */
export interface DeepLinkFileItem {
  id: string;
  name: string;
  type: 'file';
  mimeType: string;
  size: number;
  modifiedAt: string;
  scanStatus: string | null;
  scanReason: string | null;
}

interface DetailsPayload {
  id?: string;
  name?: string;
  type?: string;
  mimeType?: string;
  size?: number;
  modifiedAt?: string | null;
  scan?: { status?: string; reason?: string | null } | null;
  message?: string;
  error?: string;
}

export async function fetchDeepLinkFileItem(fileId: string): Promise<DeepLinkFileItem> {
  const res = await apiFetchRaw(`/api/drive/files/${encodeURIComponent(fileId)}/details`);
  const data = (await res.json().catch(() => ({}))) as DetailsPayload;
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `Could not open file (${res.status})`);
  }
  if (data.type === 'folder') {
    throw new Error(
      `"${data.name || 'This item'}" is a folder, which has no file preview.`,
    );
  }
  if (!data.id || !data.name) {
    throw new Error('The file details came back incomplete, so the preview cannot open.');
  }
  return {
    id: data.id,
    name: data.name,
    type: 'file',
    mimeType: data.mimeType || 'application/octet-stream',
    size: typeof data.size === 'number' ? data.size : 0,
    modifiedAt: data.modifiedAt || '',
    scanStatus: data.scan?.status ?? null,
    scanReason: data.scan?.reason ?? null,
  };
}
