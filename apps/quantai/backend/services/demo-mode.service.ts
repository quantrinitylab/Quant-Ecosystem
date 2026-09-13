import type {
  AppConnectors,
  EmailResult,
  DraftResult,
  ChatMessage,
  DocResult,
  CalendarEvent,
  CalendarEventReminder,
  FileResult,
  FileSummary,
  CodeRepoResult,
  PullRequestResult,
  AiReviewResult,
} from './cross-app-orchestrator.service';

export class DemoModeConnector implements AppConnectors {
  mail = {
    async search(_query: string): Promise<EmailResult[]> {
      return [
        {
          id: 'email-001',
          from: 'alice@example.com',
          subject: 'Q4 Budget Review',
          snippet: 'Hi, please review the attached Q4 budget proposal before our meeting...',
          date: new Date().toISOString(),
        },
        {
          id: 'email-002',
          from: 'bob@example.com',
          subject: 'Project Alpha Update',
          snippet: 'The sprint is on track. We completed 8 out of 10 stories this week...',
          date: new Date().toISOString(),
        },
        {
          id: 'email-003',
          from: 'alice@example.com',
          subject: 'Team Offsite Planning',
          snippet: 'I have booked the venue for next month. Please confirm your attendance...',
          date: new Date().toISOString(),
        },
      ];
    },

    async draft(_to: string, _subject: string, _body: string): Promise<DraftResult> {
      return { draftId: `draft-${Date.now()}` };
    },
  };

  chat = {
    async getMessages(_conversationId: string, _limit: number): Promise<ChatMessage[]> {
      return [
        {
          id: 'msg-001',
          sender: 'alice',
          content: 'We need to follow up on the API integration by Friday.',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          id: 'msg-002',
          sender: 'bob',
          content: 'I will handle the backend changes. Action item: update the auth module.',
          timestamp: new Date(Date.now() - 3000000).toISOString(),
        },
        {
          id: 'msg-003',
          sender: 'charlie',
          content: 'Sounds good. The deadline for the design review is next Tuesday.',
          timestamp: new Date(Date.now() - 2400000).toISOString(),
        },
        {
          id: 'msg-004',
          sender: 'alice',
          content: 'Also a todo: we need to update the documentation before release.',
          timestamp: new Date(Date.now() - 1800000).toISOString(),
        },
        {
          id: 'msg-005',
          sender: 'bob',
          content: 'Project Alpha is looking great overall. No blockers on my end.',
          timestamp: new Date(Date.now() - 1200000).toISOString(),
        },
      ];
    },
  };

  docs = {
    async create(_title: string, _content: string): Promise<DocResult> {
      return { docId: `doc-${Date.now()}` };
    },
  };

  calendar = {
    async getEvents(_date: string): Promise<CalendarEvent[]> {
      const baseDate = new Date();
      baseDate.setHours(9, 0, 0, 0);

      return [
        {
          id: 'event-001',
          title: 'Daily Standup',
          start: new Date(baseDate.getTime()).toISOString(),
          end: new Date(baseDate.getTime() + 900000).toISOString(),
          attendees: ['alice@example.com', 'bob@example.com', 'charlie@example.com'],
        },
        {
          id: 'event-002',
          title: 'Design Review',
          start: new Date(baseDate.getTime() + 3600000).toISOString(),
          end: new Date(baseDate.getTime() + 7200000).toISOString(),
          attendees: ['alice@example.com', 'dave@example.com'],
        },
        {
          id: 'event-003',
          title: '1:1 with Manager',
          start: new Date(baseDate.getTime() + 14400000).toISOString(),
          end: new Date(baseDate.getTime() + 16200000).toISOString(),
          attendees: ['alice@example.com', 'manager@example.com'],
        },
      ];
    },

    async createEvent(
      title: string,
      start: string,
      end: string,
      attendees: string[],
      reminders?: CalendarEventReminder[],
    ): Promise<CalendarEvent> {
      return {
        id: `event-${Date.now()}`,
        title,
        start,
        end,
        attendees,
        reminders,
      };
    },
  };

  drive = {
    async search(_query: string): Promise<FileResult[]> {
      return [
        {
          id: 'file-001',
          name: 'quarterly-report.pdf',
          type: 'application/pdf',
          modifiedAt: new Date(Date.now() - 86400000).toISOString(),
        },
        {
          id: 'file-002',
          name: 'design-spec.docx',
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          modifiedAt: new Date(Date.now() - 172800000).toISOString(),
        },
      ];
    },

    async summarize(_fileId: string): Promise<FileSummary> {
      return {
        fileId: _fileId,
        summary:
          'This document covers the quarterly performance metrics, including revenue growth of 15%, user acquisition targets, and strategic priorities for the next quarter. Key highlights include the successful launch of three new features and a 20% reduction in customer churn.',
      };
    },
  };

  code = {
    async listRepos(): Promise<CodeRepoResult[]> {
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

    async getPullRequests(_owner: string, _name: string): Promise<PullRequestResult[]> {
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

    async reviewPullRequest(
      _owner: string,
      _name: string,
      number: number,
    ): Promise<AiReviewResult> {
      return {
        summary: `Automated AI review for PR #${number}: all checks passed with no detected secrets.`,
        riskLevel: 'LOW',
        filesChanged: 3,
        findingsCount: 0,
        suggestions: ['Consider adding an integration test for edge case timeout.'],
      };
    },
  };
}
