import { createAppError } from '@quant/server-core';
import type {
  AppConnectors,
  EmailResult,
  DraftResult,
  ChatMessage,
  DocResult,
  CalendarEvent,
  FileResult,
  FileSummary,
} from './cross-app-orchestrator.service';

type FetchImpl = typeof fetch;

export interface HttpConnectorUrls {
  mail?: string;
  chat?: string;
  docs?: string;
  calendar?: string;
  drive?: string;
}

export interface HttpAppConnectorsOptions {
  /** The end user's bearer token, forwarded to each sibling backend for per-app authorization. */
  token: string;
  /** Backend base URLs. Falls back to the QUANT*_BACKEND_URL env vars. */
  urls?: HttpConnectorUrls;
  /** Injectable fetch (defaults to global fetch) for testability. */
  fetchImpl?: FetchImpl;
}

function envUrls(): HttpConnectorUrls {
  const mailUrl = process.env['QUANTMAIL_BACKEND_URL'];
  return {
    mail: mailUrl,
    chat: process.env['QUANTCHAT_BACKEND_URL'],
    docs: process.env['QUANTDOCS_BACKEND_URL'] || mailUrl,
    calendar: process.env['QUANTCALENDAR_BACKEND_URL'] || mailUrl,
    drive: process.env['QUANTDRIVE_BACKEND_URL'] || mailUrl,
  };
}

/**
 * Real cross-app connectors that call the sibling Quant app backends over HTTP,
 * forwarding the authenticated user's bearer token (each app independently
 * authorizes the request). When a required backend URL is not configured the
 * connector fails CLOSED with a clear 503 — it never fabricates data. This is
 * the production counterpart to DemoModeConnector.
 */
export class HttpAppConnectors implements AppConnectors {
  private readonly token: string;
  private readonly urls: HttpConnectorUrls;
  private readonly fetchImpl: FetchImpl;

  constructor(options: HttpAppConnectorsOptions) {
    this.token = options.token;
    this.urls = { ...envUrls(), ...options.urls };
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private baseUrl(app: keyof HttpConnectorUrls): string {
    const url = this.urls[app];
    if (!url) {
      throw createAppError(
        `Cross-app orchestration unavailable: ${app} backend is not configured`,
        503,
        'BACKEND_NOT_CONFIGURED',
      );
    }
    return url.replace(/\/$/, '');
  }

  private async call<T>(
    app: keyof HttpConnectorUrls,
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...((init.headers as Record<string, string> | undefined) ?? {}),
    };
    if (this.token) headers['authorization'] = `Bearer ${this.token}`;

    const res = await this.fetchImpl(`${this.baseUrl(app)}${path}`, { ...init, headers });
    if (!res.ok) {
      throw createAppError(
        `${app} backend request failed (${res.status})`,
        502,
        'UPSTREAM_REQUEST_FAILED',
      );
    }

    const body = (await res.json()) as unknown;
    // Tolerate both `{ success, data }` envelopes and raw payloads.
    if (body && typeof body === 'object' && 'data' in (body as Record<string, unknown>)) {
      return (body as { data: T }).data;
    }
    return body as T;
  }

  private asArray(value: unknown): Array<Record<string, unknown>> {
    if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      for (const key of ['items', 'results', 'emails', 'messages', 'events', 'files']) {
        if (Array.isArray(obj[key])) return obj[key] as Array<Record<string, unknown>>;
      }
    }
    return [];
  }

  private str(obj: Record<string, unknown>, ...keys: string[]): string {
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === 'string') return v;
    }
    return '';
  }

  mail = {
    search: async (query: string): Promise<EmailResult[]> => {
      const data = await this.call<unknown>('mail', `/emails?q=${encodeURIComponent(query)}`);
      return this.asArray(data).map((e) => ({
        id: this.str(e, 'id'),
        from: this.str(e, 'from', 'fromAddress', 'sender'),
        subject: this.str(e, 'subject'),
        snippet: this.str(e, 'snippet', 'preview', 'bodyPreview'),
        date: this.str(e, 'date', 'receivedAt', 'createdAt'),
      }));
    },
    draft: async (to: string, subject: string, body: string): Promise<DraftResult> => {
      const data = await this.call<Record<string, unknown>>('mail', '/emails/draft', {
        method: 'POST',
        body: JSON.stringify({ to, subject, body }),
      });
      return { draftId: this.str(data, 'draftId', 'id') };
    },
  };

  chat = {
    getMessages: async (conversationId: string, limit: number): Promise<ChatMessage[]> => {
      const data = await this.call<unknown>(
        'chat',
        `/conversations/${encodeURIComponent(conversationId)}/messages?limit=${limit}`,
      );
      return this.asArray(data).map((m) => ({
        id: this.str(m, 'id'),
        sender: this.str(m, 'sender', 'senderId', 'authorId', 'userId'),
        content: this.str(m, 'content', 'body', 'text'),
        timestamp: this.str(m, 'timestamp', 'createdAt'),
      }));
    },
  };

  docs = {
    create: async (title: string, content: string): Promise<DocResult> => {
      const data = await this.call<Record<string, unknown>>('docs', '/documents', {
        method: 'POST',
        body: JSON.stringify({ title, content }),
      });
      return { docId: this.str(data, 'docId', 'id') };
    },
  };

  calendar = {
    getEvents: async (date: string): Promise<CalendarEvent[]> => {
      const data = await this.call<unknown>('calendar', `/events?date=${encodeURIComponent(date)}`);
      return this.asArray(data).map((ev) => ({
        id: this.str(ev, 'id'),
        title: this.str(ev, 'title', 'summary'),
        start: this.str(ev, 'start', 'startTime'),
        end: this.str(ev, 'end', 'endTime'),
        attendees: Array.isArray(ev['attendees'])
          ? (ev['attendees'] as unknown[]).map((a) =>
              typeof a === 'string' ? a : this.str(a as Record<string, unknown>, 'email'),
            )
          : [],
      }));
    },
    createEvent: async (
      title: string,
      start: string,
      end: string,
      attendees: string[],
    ): Promise<CalendarEvent> => {
      const data = await this.call<Record<string, unknown>>('calendar', '/events', {
        method: 'POST',
        body: JSON.stringify({ title, start, end, startTime: start, endTime: end, attendees }),
      });
      return {
        id: this.str(data, 'id'),
        title: this.str(data, 'title', 'summary') || title,
        start: this.str(data, 'start', 'startTime') || start,
        end: this.str(data, 'end', 'endTime') || end,
        attendees,
      };
    },
  };

  drive = {
    search: async (query: string): Promise<FileResult[]> => {
      const data = await this.call<unknown>('drive', `/files?q=${encodeURIComponent(query)}`);
      return this.asArray(data).map((f) => ({
        id: this.str(f, 'id'),
        name: this.str(f, 'name', 'filename'),
        type: this.str(f, 'type', 'mimeType', 'contentType'),
        modifiedAt: this.str(f, 'modifiedAt', 'updatedAt'),
      }));
    },
    summarize: async (fileId: string): Promise<FileSummary> => {
      const data = await this.call<Record<string, unknown>>(
        'drive',
        `/files/${encodeURIComponent(fileId)}/summarize`,
        { method: 'POST' },
      );
      return { fileId, summary: this.str(data, 'summary') };
    },
  };
}
