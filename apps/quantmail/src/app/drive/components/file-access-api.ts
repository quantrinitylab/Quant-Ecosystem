// ============================================================================
// QuantDrive — File access viewer data layer (QM-M39-005, screen 21)
// Read-only: who currently has access to a file — collaborators with roles and
// public link shares with scope/audience/expiry. All data comes from real
// backend endpoints; nothing here invents access state.
// ============================================================================

import { apiFetchRaw } from '@quant/api-client';

export interface FileShareEntry {
  id: string;
  email: string;
  permission: 'view' | 'edit' | 'admin';
  status: string;
  createdAt: string;
}

export interface FileLinkEntry {
  id: string;
  role: string;
  audience: string;
  requiresPassword: boolean;
  expiresAt: string | null;
  expired: boolean;
  createdAt: string;
  shareUrl: string;
}

export interface FileAccessData {
  shares: FileShareEntry[];
  links: FileLinkEntry[];
}

async function getJson<T>(path: string, what: string): Promise<T> {
  const res = await apiFetchRaw(path);
  const data = (await res.json().catch(() => ({}))) as {
    message?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `Could not load ${what} (${res.status})`);
  }
  return data as T;
}

/**
 * Loads the current access state for a file: its collaborators and its public
 * link shares. Throws with the backend's message when the viewer has no right
 * to see it (e.g. a non-owner gets 403).
 */
export async function fetchFileAccess(fileId: string): Promise<FileAccessData> {
  const encoded = encodeURIComponent(fileId);
  const [sharesData, linksData] = await Promise.all([
    getJson<{ shares?: FileShareEntry[] }>(`/api/drive/files/${encoded}/share`, 'sharing info'),
    getJson<{ links?: FileLinkEntry[] }>(`/api/drive/files/${encoded}/links`, 'link info'),
  ]);
  return {
    shares: sharesData.shares ?? [],
    links: linksData.links ?? [],
  };
}
