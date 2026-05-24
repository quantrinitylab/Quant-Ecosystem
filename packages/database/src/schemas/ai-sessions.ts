// ============================================================================
// Database Schema - AI Sessions (QuantAI)
// ============================================================================

/** AI conversation session schema */
export interface AISessionSchema {
  id: string;
  userId: string;
  title: string;
  model: string;
  systemPrompt: string | null;
  messages: AIMessageSchema[];
  totalTokensUsed: number;
  totalCost: number;
  tags: string[];
  isArchived: boolean;
  isPinned: boolean;
  sourceApp: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** AI message within a session */
export interface AIMessageSchema {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system' | 'function';
  content: string;
  attachments: AIAttachment[];
  functionCall: AIFunctionCall | null;
  tokenCount: number;
  model: string;
  latencyMs: number;
  feedback: 'positive' | 'negative' | null;
  createdAt: string;
}

/** AI message attachment */
export interface AIAttachment {
  type: 'image' | 'document' | 'code' | 'audio';
  url: string;
  filename: string;
  mimeType: string;
}

/** AI function call */
export interface AIFunctionCall {
  name: string;
  arguments: Record<string, unknown>;
  result: string | null;
}

/** AI model configuration */
export interface AIModelConfigSchema {
  id: string;
  modelId: string;
  name: string;
  provider: string;
  version: string;
  capabilities: string[];
  contextWindow: number;
  maxOutputTokens: number;
  inputCostPer1kTokens: number;
  outputCostPer1kTokens: number;
  isAvailable: boolean;
  rateLimitPerMinute: number;
  rateLimitPerDay: number;
  createdAt: string;
  updatedAt: string;
}

/** AI usage analytics */
export interface AIUsageSchema {
  id: string;
  userId: string;
  sessionId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  latencyMs: number;
  sourceApp: string;
  feature: string;
  createdAt: string;
}

/** AI prompt template */
export interface AIPromptTemplateSchema {
  id: string;
  name: string;
  description: string;
  category: string;
  template: string;
  variables: TemplateVariable[];
  model: string;
  temperature: number;
  maxTokens: number;
  isPublic: boolean;
  usageCount: number;
  rating: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Template variable */
export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  description: string;
  required: boolean;
  defaultValue: string | null;
  options: string[] | null;
}

/** AI device control command log */
export interface AIDeviceCommandSchema {
  id: string;
  userId: string;
  sessionId: string;
  deviceId: string;
  deviceType: string;
  command: string;
  parameters: Record<string, unknown>;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  result: string | null;
  errorMessage: string | null;
  executionTimeMs: number | null;
  createdAt: string;
  completedAt: string | null;
}

/** Connected device schema */
export interface ConnectedDeviceSchema {
  id: string;
  userId: string;
  name: string;
  type: DeviceType;
  manufacturer: string;
  model: string;
  firmware: string;
  capabilities: string[];
  status: 'online' | 'offline' | 'pairing' | 'error';
  lastSeenAt: string;
  connectionType: 'wifi' | 'bluetooth' | 'zigbee' | 'zwave' | 'matter';
  roomId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Device types */
export type DeviceType =
  | 'light'
  | 'thermostat'
  | 'lock'
  | 'camera'
  | 'speaker'
  | 'display'
  | 'appliance'
  | 'sensor'
  | 'switch'
  | 'plug'
  | 'blinds'
  | 'vacuum'
  | 'tv'
  | 'other';

/** AI fine-tuning job */
export interface AIFineTuningJobSchema {
  id: string;
  userId: string;
  baseModel: string;
  fineTunedModelId: string | null;
  trainingDataUrl: string;
  validationDataUrl: string | null;
  hyperparameters: Record<string, number>;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  trainedTokens: number | null;
  trainingLoss: number | null;
  validationLoss: number | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const AI_SESSIONS_TABLE = {
  tableName: 'ai_sessions',
  columns: [
    { name: 'id', type: 'UUID', primaryKey: true },
    { name: 'user_id', type: 'UUID', nullable: false, references: 'users(id)' },
    { name: 'title', type: 'VARCHAR(200)', nullable: false },
    { name: 'model', type: 'VARCHAR(50)', nullable: false },
    { name: 'system_prompt', type: 'TEXT', nullable: true },
    { name: 'total_tokens_used', type: 'INTEGER DEFAULT 0', nullable: false },
    { name: 'total_cost', type: 'DECIMAL(10,6) DEFAULT 0', nullable: false },
    { name: 'tags', type: "JSONB DEFAULT '[]'", nullable: false },
    { name: 'is_archived', type: 'BOOLEAN DEFAULT FALSE', nullable: false },
    { name: 'is_pinned', type: 'BOOLEAN DEFAULT FALSE', nullable: false },
    { name: 'source_app', type: 'VARCHAR(20)', nullable: false },
    { name: 'created_at', type: 'TIMESTAMPTZ DEFAULT NOW()', nullable: false },
    { name: 'updated_at', type: 'TIMESTAMPTZ DEFAULT NOW()', nullable: false },
    { name: 'deleted_at', type: 'TIMESTAMPTZ', nullable: true },
  ],
  indexes: [
    { name: 'idx_ai_sessions_user', columns: ['user_id', 'created_at'] },
    { name: 'idx_ai_sessions_model', columns: ['model'] },
    { name: 'idx_ai_sessions_source', columns: ['source_app'] },
  ],
} as const;
