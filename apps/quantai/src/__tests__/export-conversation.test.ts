import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  toExportConversation,
  downloadExport,
  type ExportableConversation,
  type ExportableMessage,
} from '../lib/export-conversation';
import type { ExportResult } from '../services/conversation-export.service';

const conversation: ExportableConversation = {
  id: 'conv-1',
  title: 'My Chat',
  model: 'gpt-4',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T01:00:00.000Z',
};

function msg(overrides: Partial<ExportableMessage>): ExportableMessage {
  return {
    id: 'm1',
    role: 'user',
    content: 'hello',
    timestamp: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('toExportConversation', () => {
  it('maps conversation metadata and messages', () => {
    const result = toExportConversation(conversation, [
      msg({ id: 'u1', role: 'user', content: 'Hi there' }),
      msg({ id: 'a1', role: 'assistant', content: 'Hello!', model: 'gpt-4', tokens: 12 }),
    ]);

    expect(result.id).toBe('conv-1');
    expect(result.title).toBe('My Chat');
    expect(result.model).toBe('gpt-4');
    expect(result.messages).toHaveLength(2);
    expect(result.messages[1]).toMatchObject({
      id: 'a1',
      role: 'assistant',
      content: 'Hello!',
      model: 'gpt-4',
      tokens: 12,
    });
  });

  it('falls back to a default title when empty', () => {
    const result = toExportConversation({ ...conversation, title: '' }, []);
    expect(result.title).toBe('Conversation');
  });

  it('excludes pending, streaming, and empty messages', () => {
    const result = toExportConversation(conversation, [
      msg({ id: 'ok', content: 'keep me' }),
      msg({ id: 'pending', content: 'optimistic', pending: true }),
      msg({ id: 'streaming', content: 'half', isStreaming: true }),
      msg({ id: 'empty', content: '   ' }),
    ]);

    expect(result.messages.map((m) => m.id)).toEqual(['ok']);
  });

  it('excludes messages with unknown roles', () => {
    const result = toExportConversation(conversation, [
      msg({ id: 'good', role: 'assistant', content: 'valid' }),
      msg({ id: 'weird', role: 'tool', content: 'should be dropped' }),
    ]);

    expect(result.messages.map((m) => m.id)).toEqual(['good']);
  });
});

describe('downloadExport', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const result: ExportResult = {
    content: '{"a":1}',
    format: 'json',
    filename: 'chat.json',
    mimeType: 'application/json',
  };

  it('creates an anchor, clicks it, and revokes the object URL', () => {
    const click = vi.fn();
    const createUrl = vi.fn(() => 'blob:fake');
    const revokeUrl = vi.fn();
    const originalCreate = document.createElement.bind(document);

    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreate(tag) as HTMLElement;
      if (tag === 'a') {
        (el as HTMLAnchorElement).click = click;
      }
      return el;
    });
    // jsdom does not implement object URL APIs by default.
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = createUrl;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revokeUrl;

    downloadExport(result);

    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeUrl).toHaveBeenCalledWith('blob:fake');
  });
});
