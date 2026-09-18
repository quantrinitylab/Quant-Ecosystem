// ============================================================================
// QuantAI - Agent Mode & Artifact Types (Claude Code + Codex + Canvas Parity)
// ============================================================================

export type AgentStepTool =
  | 'read_file'
  | 'write_file'
  | 'bash'
  | 'diff'
  | 'git'
  | 'test'
  | 'mcp'
  | string;

export type AgentStepStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface AgentExecutionStep {
  id: string;
  title: string;
  tool: AgentStepTool;
  status: AgentStepStatus;
  arguments?: Record<string, unknown>;
  result?: unknown;
  diff?: string;
  durationMs?: number;
  output?: string;
}

export interface AgentExecutionGoal {
  id: string;
  title: string;
  description?: string;
  status: AgentStepStatus;
  steps: AgentExecutionStep[];
  thoughtChain?: string[];
  createdAt: string;
}

export interface TerminalLogEntry {
  id: string;
  type: 'input' | 'output' | 'error' | 'system' | 'info';
  content: string;
  timestamp: string;
}

export interface CanvasArtifact {
  id: string;
  title: string;
  type: 'component' | 'code' | 'markdown';
  language: string;
  code: string;
  markdown?: string;
  previewHtml?: string;
  createdAt: string;
}
