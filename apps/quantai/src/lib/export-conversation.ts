// ============================================================================
// QuantAI - Conversation Export helpers
// Pure mapping from in-app chat state to the ConversationExportService input,
// plus a browser-only download trigger. Keeping the mapping pure makes it
// unit-testable without touching the DOM.
// ============================================================================

import type {
  ExportConversation,
  ExportMessage,
  ExportResult,
} from '../services/conversation-export.service';

export interface ExportableMessage {
  id: string;
  role: string;
  content: string;
  timestamp: string;
  model?: string;
  tokens?: number;
  pending?: boolean;
  isStreaming?: boolean;
}

export interface ExportableConversation {
  id: string;
  title: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}

const EXPORTABLE_ROLES = new Set(['user', 'assistant', 'system']);

/**
 * Map the live chat state into the shape ConversationExportService expects.
 * Skips messages that are still streaming, optimistic (pending), or empty so
 * exports never contain half-rendered or placeholder content.
 */
export function toExportConversation(
  conversation: ExportableConversation,
  messages: ExportableMessage[],
): ExportConversation {
  const exportMessages: ExportMessage[] = messages
    .filter(
      (m) =>
        !m.pending && !m.isStreaming && m.content.trim().length > 0 && EXPORTABLE_ROLES.has(m.role),
    )
    .map((m) => ({
      id: m.id,
      role: m.role as ExportMessage['role'],
      content: m.content,
      timestamp: m.timestamp,
      model: m.model,
      tokens: m.tokens,
    }));

  return {
    id: conversation.id,
    title: conversation.title || 'Conversation',
    model: conversation.model,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messages: exportMessages,
  };
}

/**
 * Trigger a client-side file download for an export result. No-op outside the
 * browser (SSR / tests) where document is unavailable.
 */
export function downloadExport(result: ExportResult): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
    return;
  }
  const blob = new Blob([result.content], { type: result.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = result.filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
