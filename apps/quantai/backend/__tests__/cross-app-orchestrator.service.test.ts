import { describe, it, expect, beforeEach } from 'vitest';
import {
  CrossAppOrchestrator,
  type AppConnectors,
  type CalendarEventReminder,
  type Permissions,
} from '../services/cross-app-orchestrator.service';

/**
 * Explicit unit-test fixture implementing AppConnectors with deterministic,
 * in-memory data. This is a TEST DOUBLE only — it is never wired into any
 * route. (F-002: the production DemoModeConnector, which served fabricated
 * data through real HTTP routes, was deleted.)
 */
class StubAppConnectors implements AppConnectors {
  mail = {
    async search() {
      return [
        {
          id: 'email-001',
          from: 'alice@example.com',
          subject: 'Q4 Budget Review',
          snippet: 'Hi, please review the attached Q4 budget proposal...',
          date: '2025-01-20T09:00:00.000Z',
        },
        {
          id: 'email-002',
          from: 'bob@example.com',
          subject: 'Project Alpha Update',
          snippet: 'The sprint is on track...',
          date: '2025-01-20T10:00:00.000Z',
        },
      ];
    },
    async draft() {
      return { draftId: 'draft-123' };
    },
  };

  chat = {
    async getMessages() {
      return [
        {
          id: 'msg-001',
          sender: 'alice',
          content: 'We need to follow up on the API integration by Friday.',
          timestamp: '2025-01-20T08:00:00.000Z',
        },
        {
          id: 'msg-002',
          sender: 'bob',
          content: 'Action item: update the auth module.',
          timestamp: '2025-01-20T08:05:00.000Z',
        },
      ];
    },
  };

  docs = {
    async create() {
      return { docId: 'doc-123' };
    },
  };

  calendar = {
    async getEvents() {
      return [
        {
          id: 'event-001',
          title: 'Daily Standup',
          start: '2025-01-20T09:00:00.000Z',
          end: '2025-01-20T09:15:00.000Z',
          attendees: ['alice@example.com', 'bob@example.com'],
        },
      ];
    },
    async createEvent(
      title: string,
      start: string,
      end: string,
      attendees: string[],
      reminders?: CalendarEventReminder[],
    ) {
      return { id: 'event-999', title, start, end, attendees, reminders };
    },
  };

  drive = {
    async search() {
      return [
        {
          id: 'file-001',
          name: 'quarterly-report.pdf',
          type: 'application/pdf',
          modifiedAt: '2025-01-19T09:00:00.000Z',
        },
      ];
    },
    async summarize(fileId: string) {
      return { fileId, summary: 'Quarterly performance metrics summary.' };
    },
  };

  code = {
    async listRepos() {
      return [
        {
          id: 'repo-001',
          name: 'quant-core',
          fullName: 'quant/quant-core',
          description: 'Core engine and microservices',
          defaultBranch: 'main',
          visibility: 'public',
        },
      ];
    },
    async getPullRequests() {
      return [
        {
          id: 'pr-001',
          number: 42,
          title: 'feat: add high performance streaming',
          status: 'OPEN',
          authorId: 'user-001',
          sourceBranch: 'feat/streaming',
          targetBranch: 'main',
        },
      ];
    },
    async reviewPullRequest(_owner: string, _name: string, number: number) {
      return {
        summary: `Automated AI review for PR #${number}: all checks passed with no detected secrets.`,
        riskLevel: 'LOW' as const,
        filesChanged: 3,
        findingsCount: 0,
        suggestions: ['Consider adding an integration test for edge case timeout.'],
      };
    },
  };
}

describe('CrossAppOrchestrator', () => {
  let orchestrator: CrossAppOrchestrator;
  let connectors: AppConnectors;
  let permissions: Permissions;

  beforeEach(() => {
    connectors = new StubAppConnectors();
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

    it('creates a calendar event with voice alert enabled and attaches call reminder', async () => {
      const result = await orchestrator.scheduleMeeting('user-1', {
        title: 'Quarterly Executive Review',
        attendees: ['exec@example.com'],
        preferredTime: '2025-01-22T15:00:00.000Z',
        enableVoiceAlert: true,
        voiceAlertMinutesBefore: 10,
      });

      expect(result.success).toBe(true);
      const res = result.result as any;
      expect(res.voiceAlertEnabled).toBe(true);
      expect(res.voiceAlertMinutesBefore).toBe(10);
      expect(res.reminders).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'call',
            minutesBefore: 10,
          }),
        ]),
      );
    });

    it('scheduleMeetingWithVoiceAlert creates event with voice alert enabled by default', async () => {
      const result = await orchestrator.scheduleMeetingWithVoiceAlert('user-1', {
        title: 'Urgent Ops Sync',
        attendees: ['oncall@example.com'],
        preferredTime: '2025-01-23T09:00:00.000Z',
      });

      expect(result.success).toBe(true);
      const res = result.result as any;
      expect(res.voiceAlertEnabled).toBe(true);
      expect(res.voiceAlertMinutesBefore).toBe(5);
      expect(res.reminders).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'call',
            minutesBefore: 5,
          }),
        ]),
      );
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
