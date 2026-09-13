// ============================================================================
// QuantMail — Offline Drafting & Zero-Latency Local Drafts Cache (Task QM-01)
//
// Allows composing, auto-saving, and reading email drafts completely offline
// via IndexedDB. Syncs to server when connectivity is restored.
// ============================================================================
import { mailDatabase, STORE_DRAFTS, createId } from './client';

export interface OfflineDraft {
  id: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  replyToId?: string;
  forwardFromId?: string;
  updatedAt: number;
  isDirty?: boolean;
}

export async function saveOfflineDraft(
  draft: Omit<OfflineDraft, 'id' | 'updatedAt'> & { id?: string },
): Promise<OfflineDraft> {
  const id = draft.id || createId('draft');
  const record: OfflineDraft = {
    ...draft,
    id,
    updatedAt: Date.now(),
    isDirty: true,
  };
  await mailDatabase.put(STORE_DRAFTS, record);
  return record;
}

export async function getOfflineDraft(id: string): Promise<OfflineDraft | null> {
  const result = await mailDatabase.get<OfflineDraft>(STORE_DRAFTS, id);
  return result ?? null;
}

export async function listOfflineDrafts(): Promise<OfflineDraft[]> {
  const all = await mailDatabase.getAll<OfflineDraft>(STORE_DRAFTS);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteOfflineDraft(id: string): Promise<void> {
  await mailDatabase.delete(STORE_DRAFTS, id);
}

export async function clearOfflineDrafts(): Promise<void> {
  await mailDatabase.clear(STORE_DRAFTS);
}
