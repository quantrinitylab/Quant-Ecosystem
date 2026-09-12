import { describe, it, expect, beforeEach } from 'vitest';
import { CrossAppOrchestrator, type Permissions } from '../services/cross-app-orchestrator.service';
import { DemoModeConnector } from '../services/demo-mode.service';

describe('CrossAppOrchestrator', () => {
  let orchestrator: CrossAppOrchestrator;
  let connectors: DemoModeConnector;
  let permissions: Permissions;

  beforeEach(() => {
    connectors = new DemoModeConnector();
    permissions = {
      'user-1': ['mail', 'chat', 'docs', 'calendar', 'drive', 'code'],
      'user-2': ['mail', 'calendar'],
      'admin-user': ['*'],
    };
    orchestrator = new CrossAppOrchestrator(connectors, permissions);
  });

  describe('summarizeDay', () => {
    it('returns a structured day summary with events and emails', async () => {
      const result = await orchestrator.summarizeDay('user-1');

      expect(result.success).toBe(true);
      expect(result.result).toHaveProperty('events');
      expect(result.result).toHaveProperty('emails');
      expect(result.result).toHaveProperty('eventCount');
      expect(result.result).toHaveProperty('emailCount');
      expect(result.result).toHaveProperty('summary');
      expect(result.citations.length).toBeGreaterThan(0);
    });

    it('includes citations from calendar and mail apps', async () => {
      const result = await orchestrator.summarizeDay('user-1');

      const calendarCitations = result.citations.filter((c) => c.app === 'calendar');
      const mailCitations = result.citations.filter((c) => c.app === 'mail');

      expect(calendarCitations.length).toBeGreaterThan(0);
      expect(mailCitations.length).toBeGreaterThan(0);
    });

    it('denies access when user lacks calendar permission', async () => {
      const restrictedPerms: Permissions = {
        'user-limited': ['mail'],
      };
      const restricted = new CrossAppOrchestrator(connectors, restrictedPerms);

      await expect(restricted.summarizeDay('user-limited')).rejects.toThrow(
        /Permission denied.*calendar/,
      );
    });
  });

  describe('draftReply', () => {
    it('returns a draft reply with source citation', async () => {
      const result = await orchestrator.draftReply('user-1', 'email-001');

      expect(result.success).toBe(true);
      expect(result.result).toHaveProperty('draftId');
      expect(result.result).toHaveProperty('to');
      expect(result.result).toHaveProperty('subject');
      expect(result.result).toHaveProperty('body');
      expect(result.citations).toHaveLength(1);
      expect(result.citations[0]!.app).toBe('mail');
    });

    it('denies access when user lacks mail permission', async () => {
      const restrictedPerms: Permissions = {
        'user-no-mail': ['calendar', 'drive'],
      };
      const restricted = new CrossAppOrchestrator(connectors, restrictedPerms);

      await expect(restricted.draftReply('user-no-mail', 'email-001')).rejects.toThrow(
        /Permission denied.*mail/,
      );
    });
  });

  describe('scheduleMeeting', () => {
    it('creates a calendar event and returns confirmation', async () => {
      const result = await orchestrator.scheduleMeeting('user-1', {
        title: 'Sprint Planning',
        attendees: ['alice@example.com', 'bob@example.com'],
        preferredTime: '2025-01-20T14:00:00.000Z',
      });

      expect(result.success).toBe(true);
      expect(result.result).toHaveProperty('eventId');
      expect(result.result).toHaveProperty('title', 'Sprint Planning');
      expect(result.result).toHaveProperty('attendees');
      expect(result.result).toHaveProperty('hadConflict');
      expect(result.citations).toHaveLength(1);
      expect(result.citations[0]!.app).toBe('calendar');
    });

    it('works with user who has only calendar permission', async () => {
      const result = await orchestrator.scheduleMeeting('user-2', {
        title: 'Quick Sync',
        attendees: ['bob@example.com'],
        preferredTime: '2025-01-21T10:00:00.000Z',
      });

      expect(result.success).toBe(true);
      expect(result.result).toHaveProperty('eventId');
    });
  });

  describe('searchAndSummarize', () => {
    it('searches drive and returns file summary with citation', async () => {
      const result = await orchestrator.searchAndSummarize('user-1', 'quarterly report');

      expect(result.success).toBe(true);
      expect(result.result).toHaveProperty('query', 'quarterly report');
      expect(result.result).toHaveProperty('filesFound');
      expect(result.result).toHaveProperty('file');
      expect(result.result).toHaveProperty('summary');
      expect(result.citations).toHaveLength(1);
      expect(result.citations[0]!.app).toBe('drive');
    });

    it('denies access when user lacks drive permission', async () => {
      const restrictedPerms: Permissions = {
        'user-no-drive': ['mail', 'chat'],
      };
      const restricted = new CrossAppOrchestrator(connectors, restrictedPerms);

      await expect(restricted.searchAndSummarize('user-no-drive', 'test')).rejects.toThrow(
        /Permission denied.*drive/,
      );
    });
  });

  describe('chatFollowup', () => {
    it('reads chat messages and creates a follow-up doc', async () => {
      const result = await orchestrator.chatFollowup('user-1', 'conv-123');

      expect(result.success).toBe(true);
      expect(result.result).toHaveProperty('conversationId', 'conv-123');
      expect(result.result).toHaveProperty('messagesAnalyzed');
      expect(result.result).toHaveProperty('actionItemsFound');
      expect(result.result).toHaveProperty('docId');
      expect(result.citations.length).toBeGreaterThanOrEqual(2);
    });

    it('includes citations from both chat and docs apps', async () => {
      const result = await orchestrator.chatFollowup('user-1', 'conv-456');

      const chatCitations = result.citations.filter((c) => c.app === 'chat');
      const docsCitations = result.citations.filter((c) => c.app === 'docs');

      expect(chatCitations).toHaveLength(1);
      expect(docsCitations).toHaveLength(1);
    });

    it('denies access when user lacks chat permission', async () => {
      const restrictedPerms: Permissions = {
        'user-no-chat': ['mail', 'drive'],
      };
      const restricted = new CrossAppOrchestrator(connectors, restrictedPerms);

      await expect(restricted.chatFollowup('user-no-chat', 'conv-123')).rejects.toThrow(
        /Permission denied.*chat/,
      );
    });
  });

  describe('listUserRepositories', () => {
    it('lists repositories with citations', async () => {
      const result = await orchestrator.listUserRepositories('user-1');

      expect(result.success).toBe(true);
      expect(Array.isArray(result.result)).toBe(true);
      expect(result.result.length).toBeGreaterThan(0);
      expect(result.result[0]).toHaveProperty('name', 'quant-core');
      expect(result.citations.length).toBeGreaterThan(0);
      expect(result.citations[0]!.app).toBe('code');
    });

    it('denies access when user lacks code permission', async () => {
      const restricted = new CrossAppOrchestrator(connectors, { 'user-limited': ['mail'] });
      await expect(restricted.listUserRepositories('user-limited')).rejects.toThrow(
        /Permission denied.*code/,
      );
    });
  });

  describe('reviewPullRequest', () => {
    it('triggers automated AI review on pull request and returns structured report', async () => {
      const result = await orchestrator.reviewPullRequest('user-1', 'quant', 'quant-core', 42);

      expect(result.success).toBe(true);
      expect(result.result).toHaveProperty('riskLevel', 'LOW');
      expect(result.result).toHaveProperty('summary');
      expect(result.result.summary).toContain('Automated AI review for PR #42');
      expect(result.result.suggestions).toContain(
        'Consider adding an integration test for edge case timeout.',
      );
      expect(result.citations).toHaveLength(1);
      expect(result.citations[0]!.app).toBe('code');
    });

    it('denies access when user lacks code permission', async () => {
      const restricted = new CrossAppOrchestrator(connectors, { 'user-limited': ['mail'] });
      await expect(
        restricted.reviewPullRequest('user-limited', 'quant', 'quant-core', 42),
      ).rejects.toThrow(/Permission denied.*code/);
    });
  });

  describe('permissions', () => {
    it('denies all access for unknown users', async () => {
      await expect(orchestrator.summarizeDay('unknown-user')).rejects.toThrow(/Permission denied/);
    });

    it('allows wildcard permission access', async () => {
      const result = await orchestrator.summarizeDay('admin-user');
      expect(result.success).toBe(true);
    });
  });
});
