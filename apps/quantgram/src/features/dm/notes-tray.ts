// ============================================================================
// QuantNeon - Direct Messages (DMs) Notes Tray & Inbox Management Domain Logic
// Instagram 98-Screen Forensic Parity (Screens 22-26, 60-64)
// ============================================================================

import type { DmConversationSummary, DmParticipant } from '../../services/api-client';

export interface MusicTrackAttachment {
  id: string;
  title: string;
  artist: string;
  albumArtUrl?: string;
  durationMs?: number;
}

export interface UserNote {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  noteText: string; // Max 60 chars
  musicTrack?: MusicTrackAttachment;
  createdAt: string;
  expiresAt: string;
  isSelf: boolean;
}

export type DmFolderTab = 'primary' | 'general' | 'requests';

export interface DmRequestItem {
  id: string;
  conversationId: string;
  sender: DmParticipant;
  previewMessage: string;
  isSpam: boolean;
  receivedAt: string;
}

export const MAX_NOTE_LENGTH = 60;
export const NOTE_TTL_HOURS = 24;

/**
 * Validates text content for notes (max 60 characters).
 */
export function validateNoteText(text: string): {
  valid: boolean;
  error?: string;
  remainingChars: number;
} {
  const trimmed = text.trim();
  const charCount = trimmed.length;
  const remaining = MAX_NOTE_LENGTH - charCount;

  if (charCount === 0) {
    return { valid: false, error: 'Note cannot be empty', remainingChars: MAX_NOTE_LENGTH };
  }

  if (charCount > MAX_NOTE_LENGTH) {
    return {
      valid: false,
      error: `Note exceeds ${MAX_NOTE_LENGTH} character limit by ${charCount - MAX_NOTE_LENGTH} characters`,
      remainingChars: remaining,
    };
  }

  return { valid: true, remainingChars: remaining };
}

/**
 * Formats music track label for note bubble pills.
 */
export function formatMusicBadge(track: MusicTrackAttachment): string {
  return `${track.title} • ${track.artist}`;
}

/**
 * Adds or updates self user's note in the notes tray.
 */
export function upsertSelfNote(
  existingNotes: UserNote[],
  selfUser: { id: string; username: string; displayName: string; avatarUrl: string },
  noteText: string,
  musicTrack?: MusicTrackAttachment,
): { updatedNotes: UserNote[]; selfNote: UserNote } {
  const validation = validateNoteText(noteText);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const now = new Date();
  const expires = new Date(now.getTime() + NOTE_TTL_HOURS * 60 * 60 * 1000);

  const newSelfNote: UserNote = {
    id: `note-self-${Date.now()}`,
    userId: selfUser.id,
    username: selfUser.username,
    displayName: selfUser.displayName,
    avatarUrl: selfUser.avatarUrl,
    noteText: noteText.trim(),
    musicTrack,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    isSelf: true,
  };

  // Filter out any previous self note, place new note at index 0
  const filtered = existingNotes.filter((n) => !n.isSelf && n.userId !== selfUser.id);
  return {
    updatedNotes: [newSelfNote, ...filtered],
    selfNote: newSelfNote,
  };
}

/**
 * Clears self user's note.
 */
export function removeSelfNote(existingNotes: UserNote[], selfUserId: string): UserNote[] {
  return existingNotes.filter((n) => !n.isSelf && n.userId !== selfUserId);
}

/**
 * Filters conversations according to the active tab (Primary, General, Requests).
 */
export function filterConversationsByTab(
  conversations: DmConversationSummary[],
  tab: DmFolderTab,
  requestedConversationIds: Set<string>,
  generalConversationIds: Set<string>,
): DmConversationSummary[] {
  return conversations.filter((c) => {
    const isRequest = requestedConversationIds.has(c.id);
    const isGeneral = generalConversationIds.has(c.id);

    if (tab === 'requests') {
      return isRequest;
    }
    if (tab === 'general') {
      return !isRequest && isGeneral;
    }
    // Default: 'primary'
    return !isRequest && !isGeneral;
  });
}

/**
 * Filters incoming message requests between all and spam/hidden requests.
 */
export function filterDmRequests(
  requests: DmRequestItem[],
  view: 'all' | 'spam' | 'regular',
): DmRequestItem[] {
  if (view === 'spam') {
    return requests.filter((r) => r.isSpam);
  }
  if (view === 'regular') {
    return requests.filter((r) => !r.isSpam);
  }
  return requests;
}

/**
 * Accept a message request, moving it to primary conversations.
 */
export function acceptDmRequest(
  requests: DmRequestItem[],
  requestId: string,
): { remaining: DmRequestItem[]; accepted?: DmRequestItem } {
  const target = requests.find((r) => r.id === requestId);
  const remaining = requests.filter((r) => r.id !== requestId);
  return { remaining, accepted: target };
}

/**
 * Delete / dismiss a message request.
 */
export function dismissDmRequest(requests: DmRequestItem[], requestId: string): DmRequestItem[] {
  return requests.filter((r) => r.id !== requestId);
}

/**
 * Bulk delete all requests or all spam requests.
 */
export function bulkDeleteRequests(
  requests: DmRequestItem[],
  target: 'all' | 'spam_only',
): DmRequestItem[] {
  if (target === 'spam_only') {
    return requests.filter((r) => !r.isSpam);
  }
  return [];
}
