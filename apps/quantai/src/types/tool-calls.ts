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
  read_file: '📄',
  write_file: '✏️',
  bash: '💻',
  diff: '🔀',
  git: '🌿',
  test: '🧪',
  api_call: '🌐',
  database_query: '🗄️',
  image_generate: '🎨',
  email_send: '📧',
  calendar_check: '📅',
  quantmail_search: '📧',
  quantmail_send: '📤',
  quantdrive_upload: '📁',
  quantdrive_search: '🔍',
  quantcalendar_event: '📅',
  quantchat_message: '💬',
  mcp: '🔌',
  default: '⚙️',
};
