import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationExportService } from '../services/conversation-export.service';
import type { ExportConversation } from '../services/conversation-export.service';

const mockConversation: ExportConversation = {
  id: 'conv-1',
  title: 'Test Conversation',
  model: 'gpt-4',
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T01:00:00Z',
  messages: [
    {
      id: 'msg-1',
      role: 'user',
      content: 'Hello, how are you?',
      timestamp: '2025-01-01T00:00:00Z',
      tokens: 8,
    },
    {
      id: 'msg-2',
      role: 'assistant',
      content: 'I am doing well, thank you!',
      timestamp: '2025-01-01T00:00:01Z',
      model: 'gpt-4',
      tokens: 12,
    },
    {
      id: 'msg-3',
      role: 'user',
      content: 'Tell me about TypeScript.',
      timestamp: '2025-01-01T00:01:00Z',
      tokens: 6,
    },
    {
      id: 'msg-4',
      role: 'assistant',
      content: 'TypeScript is a typed superset of JavaScript.',
      timestamp: '2025-01-01T00:01:01Z',
      model: 'gpt-4',
      tokens: 15,
    },
  ],
};

describe('ConversationExportService', () => {
  let service: ConversationExportService;

  beforeEach(() => {
    service = new ConversationExportService();
  });

  describe('export JSON', () => {
    it('exports valid JSON', () => {
      const result = service.export(mockConversation, 'json');
      expect(result.format).toBe('json');
      expect(result.mimeType).toBe('application/json');
      expect(result.filename).toContain('.json');

      const parsed = JSON.parse(result.content);
      expect(parsed.version).toBe('1.0');
      expect(parsed.conversation.title).toBe('Test Conversation');
      expect(parsed.conversation.messages).toHaveLength(4);
    });

    it('includes metadata', () => {
      const result = service.export(mockConversation, 'json');
      const parsed = JSON.parse(result.content);
      expect(parsed.exportedAt).toBeDefined();
      expect(parsed.conversation.messageCount).toBe(4);
    });
  });

  describe('export Markdown', () => {
    it('exports valid markdown', () => {
      const result = service.export(mockConversation, 'markdown');
      expect(result.format).toBe('markdown');
      expect(result.mimeType).toBe('text/markdown');
      expect(result.filename).toContain('.md');
      expect(result.content).toContain('# Test Conversation');
      expect(result.content).toContain('**You**');
      expect(result.content).toContain('**Assistant**');
    });

    it('includes message content', () => {
      const result = service.export(mockConversation, 'markdown');
      expect(result.content).toContain('Hello, how are you?');
      expect(result.content).toContain('TypeScript is a typed superset');
    });
  });

  describe('export Text', () => {
    it('exports plain text', () => {
      const result = service.export(mockConversation, 'text');
      expect(result.format).toBe('text');
      expect(result.mimeType).toBe('text/plain');
      expect(result.filename).toContain('.txt');
      expect(result.content).toContain('Conversation: Test Conversation');
      expect(result.content).toContain('[You]');
      expect(result.content).toContain('[Assistant]');
    });
  });

  describe('export CSV', () => {
    it('exports valid CSV', () => {
      const result = service.export(mockConversation, 'csv');
      expect(result.format).toBe('csv');
      expect(result.mimeType).toBe('text/csv');
      expect(result.filename).toContain('.csv');

      const lines = result.content.split('\n');
      expect(lines[0]).toBe('role,timestamp,content,model,tokens');
      expect(lines.length).toBe(5);
    });

    it('escapes quotes in content', () => {
      const convWithQuotes: ExportConversation = {
        ...mockConversation,
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'He said "hello"',
            timestamp: '2025-01-01T00:00:00Z',
          },
        ],
      };

      const result = service.export(convWithQuotes, 'csv');
      expect(result.content).toContain('""hello""');
    });
  });

  describe('getSupportedFormats', () => {
    it('returns all supported formats', () => {
      const formats = service.getSupportedFormats();
      expect(formats).toHaveLength(4);
      expect(formats.map((f) => f.format)).toEqual(['json', 'markdown', 'text', 'csv']);
    });
  });

  describe('filename sanitization', () => {
    it('sanitizes special characters', () => {
      const conv: ExportConversation = {
        ...mockConversation,
        title: 'Test/Conversation: Special <chars>!',
      };
      const result = service.export(conv, 'json');
      expect(result.filename).not.toContain('/');
      expect(result.filename).not.toContain(':');
      expect(result.filename).not.toContain('<');
    });

    it('uses default name for empty title', () => {
      const conv: ExportConversation = { ...mockConversation, title: '' };
      const result = service.export(conv, 'json');
      expect(result.filename).toBe('conversation.json');
    });
  });
});
