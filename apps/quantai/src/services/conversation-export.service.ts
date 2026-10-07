// ============================================================================
// QuantAI - Conversation Export Service
// Export conversations in multiple formats
// ============================================================================

export interface ExportMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  model?: string;
  tokens?: number;
}

export interface ExportConversation {
  id: string;
  title: string;
  messages: ExportMessage[];
  model: string;
  createdAt: string;
  updatedAt: string;
}

export type ExportFormat = 'json' | 'markdown' | 'text' | 'csv';

export interface ExportResult {
  content: string;
  format: ExportFormat;
  filename: string;
  mimeType: string;
}

export class ConversationExportService {
  export(conversation: ExportConversation, format: ExportFormat): ExportResult {
    switch (format) {
      case 'json':
        return this.exportJSON(conversation);
      case 'markdown':
        return this.exportMarkdown(conversation);
      case 'text':
        return this.exportText(conversation);
      case 'csv':
        return this.exportCSV(conversation);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  getSupportedFormats(): { format: ExportFormat; label: string; mimeType: string }[] {
    return [
      { format: 'json', label: 'JSON', mimeType: 'application/json' },
      { format: 'markdown', label: 'Markdown', mimeType: 'text/markdown' },
      { format: 'text', label: 'Plain Text', mimeType: 'text/plain' },
      { format: 'csv', label: 'CSV', mimeType: 'text/csv' },
    ];
  }

  private exportJSON(conversation: ExportConversation): ExportResult {
    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      conversation: {
        id: conversation.id,
        title: conversation.title,
        model: conversation.model,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        messageCount: conversation.messages.length,
        messages: conversation.messages.map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
          model: m.model || null,
          tokens: m.tokens || null,
        })),
      },
    };

    return {
      content: JSON.stringify(data, null, 2),
      format: 'json',
      filename: `${this.sanitizeFilename(conversation.title)}.json`,
      mimeType: 'application/json',
    };
  }

  private exportMarkdown(conversation: ExportConversation): ExportResult {
    const lines: string[] = [];
    lines.push(`# ${conversation.title}`);
    lines.push('');
    lines.push(`**Model:** ${conversation.model}`);
    lines.push(`**Created:** ${conversation.createdAt}`);
    lines.push(`**Messages:** ${conversation.messages.length}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    for (const msg of conversation.messages) {
      const roleLabel =
        msg.role === 'user' ? '**You**' : msg.role === 'assistant' ? '**Assistant**' : '**System**';
      const time = new Date(msg.timestamp).toLocaleString();
      lines.push(`### ${roleLabel} _${time}_`);
      lines.push('');
      lines.push(msg.content);
      lines.push('');
      if (msg.model) {
        lines.push(`_Model: ${msg.model}${msg.tokens ? ` | Tokens: ${msg.tokens}` : ''}_`);
        lines.push('');
      }
      lines.push('---');
      lines.push('');
    }

    return {
      content: lines.join('\n'),
      format: 'markdown',
      filename: `${this.sanitizeFilename(conversation.title)}.md`,
      mimeType: 'text/markdown',
    };
  }

  private exportText(conversation: ExportConversation): ExportResult {
    const lines: string[] = [];
    lines.push(`Conversation: ${conversation.title}`);
    lines.push(`Model: ${conversation.model}`);
    lines.push(`Date: ${conversation.createdAt}`);
    lines.push('='.repeat(60));
    lines.push('');

    for (const msg of conversation.messages) {
      const roleLabel =
        msg.role === 'user' ? 'You' : msg.role === 'assistant' ? 'Assistant' : 'System';
      lines.push(`[${roleLabel}] ${new Date(msg.timestamp).toLocaleString()}`);
      lines.push(msg.content);
      lines.push('');
    }

    return {
      content: lines.join('\n'),
      format: 'text',
      filename: `${this.sanitizeFilename(conversation.title)}.txt`,
      mimeType: 'text/plain',
    };
  }

  private exportCSV(conversation: ExportConversation): ExportResult {
    const lines: string[] = [];
    lines.push('role,timestamp,content,model,tokens');

    for (const msg of conversation.messages) {
      const escapedContent = `"${msg.content.replace(/"/g, '""')}"`;
      lines.push(
        `${msg.role},${msg.timestamp},${escapedContent},${msg.model || ''},${msg.tokens || ''}`,
      );
    }

    return {
      content: lines.join('\n'),
      format: 'csv',
      filename: `${this.sanitizeFilename(conversation.title)}.csv`,
      mimeType: 'text/csv',
    };
  }

  private sanitizeFilename(name: string): string {
    return (
      name
        .replace(/[^a-zA-Z0-9\s\-_]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 50)
        .toLowerCase() || 'conversation'
    );
  }
}
