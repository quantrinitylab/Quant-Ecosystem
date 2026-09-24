import { describe, it, expect } from 'vitest';
import {
  validateNoteText,
  formatMusicBadge,
  upsertSelfNote,
  removeSelfNote,
  filterConversationsByTab,
  filterDmRequests,
  acceptDmRequest,
  dismissDmRequest,
  bulkDeleteRequests,
  type UserNote,
  type DmRequestItem,
  MAX_NOTE_LENGTH,
} from '../features/dm/notes-tray';
import type { DmConversationSummary } from '../services/api-client';

describe('DMs Notes Tray & Spam Filter Domain Logic (Instagram 98-Screen Parity)', () => {
  describe('validateNoteText', () => {
    it('validates standard note length and calculates remaining characters', () => {
      const result = validateNoteText('Coding the Quant Tripartite Swarm 🚀');
      expect(result.valid).toBe(true);
      expect(result.remainingChars).toBe(
        MAX_NOTE_LENGTH - 'Coding the Quant Tripartite Swarm 🚀'.length,
      );
      expect(result.error).toBeUndefined();
    });

    it('rejects empty or whitespace-only notes', () => {
      const result = validateNoteText('   ');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Note cannot be empty');
      expect(result.remainingChars).toBe(60);
    });

    it('rejects notes exceeding 60 characters with clear difference count', () => {
      const longNote = 'A'.repeat(65);
      const result = validateNoteText(longNote);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Note exceeds 60 character limit by 5 characters');
      expect(result.remainingChars).toBe(-5);
    });
  });

  describe('formatMusicBadge', () => {
    it('formats title and artist cleanly for pill badge', () => {
      const formatted = formatMusicBadge({
        id: 'track-1',
        title: 'Starboy',
        artist: 'The Weeknd ft. Daft Punk',
      });
      expect(formatted).toBe('Starboy • The Weeknd ft. Daft Punk');
    });
  });

  describe('upsertSelfNote & removeSelfNote', () => {
    const mockSelf = {
      id: 'usr-self',
      username: 'quant_builder',
      displayName: 'Quant Builder',
      avatarUrl: 'https://example.com/avatar.png',
    };

    const initialNotes: UserNote[] = [
      {
        id: 'note-friend-1',
        userId: 'usr-friend',
        username: 'alice',
        displayName: 'Alice',
        avatarUrl: 'https://example.com/alice.png',
        noteText: 'Chilling at the beach 🏖️',
        createdAt: '2026-09-24T12:00:00Z',
        expiresAt: '2026-09-25T12:00:00Z',
        isSelf: false,
      },
    ];

    it('adds self note at the start of the list with 24h expiration', () => {
      const { updatedNotes, selfNote } = upsertSelfNote(
        initialNotes,
        mockSelf,
        'Deploying v1.4.0 🚀',
        { id: 't1', title: 'Midnight City', artist: 'M83' },
      );

      expect(updatedNotes).toHaveLength(2);
      expect(updatedNotes[0].isSelf).toBe(true);
      expect(updatedNotes[0].noteText).toBe('Deploying v1.4.0 🚀');
      expect(updatedNotes[0].musicTrack?.title).toBe('Midnight City');
      expect(selfNote.userId).toBe(mockSelf.id);

      const created = new Date(selfNote.createdAt).getTime();
      const expires = new Date(selfNote.expiresAt).getTime();
      const diffHours = (expires - created) / (1000 * 60 * 60);
      expect(diffHours).toBeCloseTo(24, 0.1);
    });

    it('replaces an existing self note without creating duplicates', () => {
      const { updatedNotes: firstPass } = upsertSelfNote(initialNotes, mockSelf, 'First note');
      expect(firstPass).toHaveLength(2);

      const { updatedNotes: secondPass } = upsertSelfNote(firstPass, mockSelf, 'Updated note ⚡');
      expect(secondPass).toHaveLength(2);
      expect(secondPass[0].noteText).toBe('Updated note ⚡');
    });

    it('removes self note when cleared', () => {
      const { updatedNotes } = upsertSelfNote(initialNotes, mockSelf, 'To be removed');
      const cleared = removeSelfNote(updatedNotes, mockSelf.id);
      expect(cleared).toHaveLength(1);
      expect(cleared[0].isSelf).toBe(false);
    });
  });

  describe('filterConversationsByTab', () => {
    const mockConversations: DmConversationSummary[] = [
      {
        id: 'c1',
        isGroup: false,
        name: null,
        unreadCount: 0,
        participants: [],
        lastMessage: null,
        lastMessageAt: '2026-09-24T12:00:00Z',
      },
      {
        id: 'c2',
        isGroup: false,
        name: null,
        unreadCount: 2,
        participants: [],
        lastMessage: null,
        lastMessageAt: '2026-09-24T12:05:00Z',
      },
      {
        id: 'c3',
        isGroup: false,
        name: null,
        unreadCount: 1,
        participants: [],
        lastMessage: null,
        lastMessageAt: '2026-09-24T12:10:00Z',
      },
    ];

    const requests = new Set(['c3']);
    const general = new Set(['c2']);

    it('filters primary conversations (not requests, not general)', () => {
      const primary = filterConversationsByTab(mockConversations, 'primary', requests, general);
      expect(primary.map((c) => c.id)).toEqual(['c1']);
    });

    it('filters general conversations', () => {
      const gen = filterConversationsByTab(mockConversations, 'general', requests, general);
      expect(gen.map((c) => c.id)).toEqual(['c2']);
    });

    it('filters request conversations', () => {
      const req = filterConversationsByTab(mockConversations, 'requests', requests, general);
      expect(req.map((c) => c.id)).toEqual(['c3']);
    });
  });

  describe('filterDmRequests & actions', () => {
    const mockRequests: DmRequestItem[] = [
      {
        id: 'r1',
        conversationId: 'c-req-1',
        sender: { id: 'u1', username: 'bob', displayName: 'Bob', avatarUrl: null },
        previewMessage: 'Hey are you attending the conference?',
        isSpam: false,
        receivedAt: '2026-09-24T10:00:00Z',
      },
      {
        id: 'r2',
        conversationId: 'c-req-2',
        sender: { id: 'u2', username: 'crypto_bot', displayName: 'Crypto Rich', avatarUrl: null },
        previewMessage: 'Claim 10,000 free tokens here: http://scam.link',
        isSpam: true,
        receivedAt: '2026-09-24T10:15:00Z',
      },
    ];

    it('filters requests by spam vs regular', () => {
      expect(filterDmRequests(mockRequests, 'all')).toHaveLength(2);
      expect(filterDmRequests(mockRequests, 'spam')).toHaveLength(1);
      expect(filterDmRequests(mockRequests, 'spam')[0].id).toBe('r2');
      expect(filterDmRequests(mockRequests, 'regular')).toHaveLength(1);
      expect(filterDmRequests(mockRequests, 'regular')[0].id).toBe('r1');
    });

    it('accepts a request', () => {
      const { remaining, accepted } = acceptDmRequest(mockRequests, 'r1');
      expect(remaining).toHaveLength(1);
      expect(accepted?.id).toBe('r1');
    });

    it('dismisses a request', () => {
      const remaining = dismissDmRequest(mockRequests, 'r2');
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe('r1');
    });

    it('bulk deletes spam or all requests', () => {
      const keptRegular = bulkDeleteRequests(mockRequests, 'spam_only');
      expect(keptRegular).toHaveLength(1);
      expect(keptRegular[0].isSpam).toBe(false);

      const emptied = bulkDeleteRequests(mockRequests, 'all');
      expect(emptied).toHaveLength(0);
    });
  });
});
