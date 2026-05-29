// ============================================================================
// QuantAI - Tool Call Types
// Types for agentic tool execution, status tracking, and response parsing
// ============================================================================

export type ToolCallStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ToolCall {
  id: string;
  name: string;
  status: ToolCallStatus;
  arguments: Record<string, unknown>;
  result?: unknown;
  duration?: number;
  error?: string;
}

export interface AgenticResponse {
  content: string;
  toolCalls: ToolCall[];
  reasoning?: string;
  model?: string;
}

export const TOOL_ICONS: Record<string, string> = {
  web_search: '🔍',
  code_execute: '💻',
  file_read: '📄',
  file_write: '✏️',
  api_call: '🌐',
  database_query: '🗄️',
  image_generate: '🎨',
  email_send: '📧',
  calendar_check: '📅',
  default: '⚙️',
};
