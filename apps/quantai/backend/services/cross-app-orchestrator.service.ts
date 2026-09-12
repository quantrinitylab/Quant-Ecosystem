export interface EmailResult {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
}

export interface DraftResult {
  draftId: string;
}

export interface ChatMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: string;
}

export interface DocResult {
  docId: string;
}

export interface CalendarEventReminder {
  type: string;
  minutesBefore: number;
  label?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  attendees: string[];
  reminders?: CalendarEventReminder[];
}

export interface FileResult {
  id: string;
  name: string;
  type: string;
  modifiedAt: string;
}

export interface FileSummary {
  fileId: string;
  summary: string;
}

export interface CodeRepoResult {
  id: string;
  name: string;
  fullName: string;
  description: string;
  defaultBranch: string;
  visibility: string;
}

export interface PullRequestResult {
  id: string;
  number: number;
  title: string;
  status: string;
  authorId: string;
  sourceBranch: string;
  targetBranch: string;
}

export interface AiReviewResult {
  summary: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  filesChanged: number;
  findingsCount: number;
  suggestions: string[];
}

export interface AppConnectors {
  mail: {
    search(query: string): Promise<EmailResult[]>;
    draft(to: string, subject: string, body: string): Promise<DraftResult>;
  };
  chat: {
    getMessages(conversationId: string, limit: number): Promise<ChatMessage[]>;
  };
  docs: {
    create(title: string, content: string): Promise<DocResult>;
  };
  calendar: {
    getEvents(date: string): Promise<CalendarEvent[]>;
    createEvent(
      title: string,
      start: string,
      end: string,
      attendees: string[],
      reminders?: CalendarEventReminder[],
    ): Promise<CalendarEvent>;
  };
  drive: {
    search(query: string): Promise<FileResult[]>;
    summarize(fileId: string): Promise<FileSummary>;
  };
  code: {
    listRepos(): Promise<CodeRepoResult[]>;
    getPullRequests(owner: string, name: string): Promise<PullRequestResult[]>;
    reviewPullRequest(owner: string, name: string, number: number): Promise<AiReviewResult>;
  };
}

export interface Citation {
  source: string;
  app: string;
  id: string;
}

export interface OrchestrationResult<T = unknown> {
  success: boolean;
  result: T;
  citations: Citation[];
}

export interface ScheduleMeetingParams {
  title: string;
  attendees: string[];
  preferredTime: string;
  durationMinutes?: number;
  location?: string;
  enableVoiceAlert?: boolean;
  voiceAlertMinutesBefore?: number;
  reminders?: CalendarEventReminder[];
}

export interface Permissions {
  [userId: string]: string[];
}

export class CrossAppOrchestrator {
  private connectors: AppConnectors;
  private permissions: Permissions;

  constructor(connectors: AppConnectors, permissions: Permissions) {
    this.connectors = connectors;
    this.permissions = permissions;
  }

  private checkPermission(userId: string, app: string): boolean {
    const userPerms = this.permissions[userId];
    if (!userPerms) return false;
    return userPerms.includes(app) || userPerms.includes('*');
  }

  private assertPermission(userId: string, ...apps: string[]): void {
    for (const app of apps) {
      if (!this.checkPermission(userId, app)) {
        throw new Error(`Permission denied: user '${userId}' lacks access to '${app}'`);
      }
    }
  }

  async summarizeDay(userId: string): Promise<OrchestrationResult> {
    this.assertPermission(userId, 'calendar', 'mail');

    const today = new Date().toISOString().split('T')[0]!;
    const [events, emails] = await Promise.all([
      this.connectors.calendar.getEvents(today),
      this.connectors.mail.search('inbox:today'),
    ]);

    const citations: Citation[] = [
      ...events.map((e) => ({ source: e.title, app: 'calendar', id: e.id })),
      ...emails.map((e) => ({ source: e.subject, app: 'mail', id: e.id })),
    ];

    return {
      success: true,
      result: {
        date: today,
        eventCount: events.length,
        events: events.map((e) => ({
          title: e.title,
          start: e.start,
          end: e.end,
          attendees: e.attendees,
        })),
        emailCount: emails.length,
        emails: emails.map((e) => ({
          from: e.from,
          subject: e.subject,
          snippet: e.snippet,
        })),
        summary: `You have ${events.length} events and ${emails.length} emails today.`,
      },
      citations,
    };
  }

  async draftReply(userId: string, emailId: string): Promise<OrchestrationResult> {
    this.assertPermission(userId, 'mail');

    const emails = await this.connectors.mail.search(`id:${emailId}`);
    const original = emails[0];

    if (!original) {
      return {
        success: false,
        result: { error: 'Email not found' },
        citations: [],
      };
    }

    const replyBody = `Thank you for your email regarding "${original.subject}". I have reviewed your message and will get back to you shortly.`;
    const draft = await this.connectors.mail.draft(
      original.from,
      `Re: ${original.subject}`,
      replyBody,
    );

    return {
      success: true,
      result: {
        draftId: draft.draftId,
        to: original.from,
        subject: `Re: ${original.subject}`,
        body: replyBody,
      },
      citations: [{ source: original.subject, app: 'mail', id: original.id }],
    };
  }

  async scheduleMeeting(
    userId: string,
    params: ScheduleMeetingParams,
  ): Promise<OrchestrationResult> {
    this.assertPermission(userId, 'calendar');

    const preferredDate = params.preferredTime.split('T')[0] ?? params.preferredTime;
    const existingEvents = await this.connectors.calendar.getEvents(preferredDate);

    const hasConflict = existingEvents.some(
      (e) => e.start <= params.preferredTime && e.end > params.preferredTime,
    );

    const start = params.preferredTime;
    const durationMinutes = params.durationMinutes ?? 60;
    const endDate = new Date(start);
    endDate.setMinutes(endDate.getMinutes() + durationMinutes);
    const end = endDate.toISOString();

    const reminders: CalendarEventReminder[] = [...(params.reminders ?? [])];
    const voiceAlertEnabled = Boolean(
      params.enableVoiceAlert || params.voiceAlertMinutesBefore !== undefined,
    );
    const voiceMinutes = params.voiceAlertMinutesBefore ?? 5;

    if (voiceAlertEnabled && !reminders.some((r) => r.type === 'call')) {
      reminders.push({
        type: 'call',
        minutesBefore: voiceMinutes,
        label: `${voiceMinutes} minutes before`,
      });
    }

    const event = await this.connectors.calendar.createEvent(
      params.title,
      start,
      end,
      params.attendees,
      reminders,
    );

    return {
      success: true,
      result: {
        eventId: event.id,
        title: params.title,
        start,
        end,
        attendees: params.attendees,
        hadConflict: hasConflict,
        voiceAlertEnabled,
        voiceAlertMinutesBefore: voiceAlertEnabled ? voiceMinutes : undefined,
        reminders: event.reminders ?? reminders,
      },
      citations: [{ source: params.title, app: 'calendar', id: event.id }],
    };
  }

  async scheduleMeetingWithVoiceAlert(
    userId: string,
    params: Omit<ScheduleMeetingParams, 'enableVoiceAlert'>,
  ): Promise<OrchestrationResult> {
    return this.scheduleMeeting(userId, {
      ...params,
      enableVoiceAlert: true,
    });
  }

  async searchAndSummarize(userId: string, query: string): Promise<OrchestrationResult> {
    this.assertPermission(userId, 'drive');

    const files = await this.connectors.drive.search(query);

    if (files.length === 0) {
      return {
        success: true,
        result: { query, filesFound: 0, summary: null },
        citations: [],
      };
    }

    const topFile = files[0]!;
    const fileSummary = await this.connectors.drive.summarize(topFile.id);

    return {
      success: true,
      result: {
        query,
        filesFound: files.length,
        file: { id: topFile.id, name: topFile.name, type: topFile.type },
        summary: fileSummary.summary,
      },
      citations: [{ source: topFile.name, app: 'drive', id: topFile.id }],
    };
  }

  async chatFollowup(userId: string, conversationId: string): Promise<OrchestrationResult> {
    this.assertPermission(userId, 'chat', 'docs');

    const messages = await this.connectors.chat.getMessages(conversationId, 50);

    const actionItems = messages
      .filter(
        (m) =>
          m.content.toLowerCase().includes('action') ||
          m.content.toLowerCase().includes('todo') ||
          m.content.toLowerCase().includes('follow up') ||
          m.content.toLowerCase().includes('deadline'),
      )
      .map((m) => m.content);

    const docContent = actionItems.length > 0 ? actionItems.join('\n- ') : 'No action items found';

    const doc = await this.connectors.docs.create(
      `Follow-ups from conversation ${conversationId}`,
      `# Action Items\n\n- ${docContent}`,
    );

    return {
      success: true,
      result: {
        conversationId,
        messagesAnalyzed: messages.length,
        actionItemsFound: actionItems.length,
        docId: doc.docId,
      },
      citations: [
        { source: `Conversation ${conversationId}`, app: 'chat', id: conversationId },
        { source: 'Follow-up document', app: 'docs', id: doc.docId },
      ],
    };
  }

  async listUserRepositories(userId: string): Promise<OrchestrationResult<CodeRepoResult[]>> {
    this.assertPermission(userId, 'code');
    const repos = await this.connectors.code.listRepos();
    return {
      success: true,
      result: repos,
      citations: repos.map((r) => ({ source: r.fullName, app: 'code', id: r.id })),
    };
  }

  async reviewPullRequest(
    userId: string,
    owner: string,
    name: string,
    number: number,
  ): Promise<OrchestrationResult<AiReviewResult>> {
    this.assertPermission(userId, 'code');
    const report = await this.connectors.code.reviewPullRequest(owner, name, number);
    return {
      success: true,
      result: report,
      citations: [
        {
          source: `PR #${number} in ${owner}/${name}`,
          app: 'code',
          id: `${owner}/${name}#${number}`,
        },
      ],
    };
  }
}
