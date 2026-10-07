// ============================================================================
// QuantAI - Type Definitions
// Central AI hub types for assistant, device control, automation, models
// ============================================================================

export type AssistantMode = 'chat' | 'command' | 'creative' | 'analysis' | 'code';
export type ModelProvider = 'quant' | 'openai' | 'anthropic' | 'google' | 'meta' | 'custom';
export type ModelCapability = 'text' | 'vision' | 'audio' | 'code' | 'reasoning' | 'function-calling';
export type DeviceType = 'phone' | 'laptop' | 'tablet' | 'desktop' | 'wearable';
export type AutomationTrigger = 'schedule' | 'event' | 'condition' | 'webhook' | 'manual';
export type PluginStatus = 'installed' | 'available' | 'deprecated' | 'disabled';
export type TrainingStatus = 'preparing' | 'training' | 'evaluating' | 'completed' | 'failed';

export interface Assistant {
  id: string;
  name: string;
  personality: AssistantPersonality;
  capabilities: ModelCapability[];
  memory: ConversationMemory;
  tools: AssistantTool[];
  activeModel: string;
  contextWindow: number;
  maxTokens: number;
}

export interface AssistantPersonality {
  name: string;
  tone: 'professional' | 'casual' | 'friendly' | 'technical' | 'creative';
  traits: string[];
  systemPrompt: string;
  greeting: string;
}

export interface ConversationMemory {
  shortTerm: MemoryEntry[];
  longTerm: MemoryEntry[];
  maxShortTerm: number;
  maxLongTerm: number;
}

export interface MemoryEntry {
  id: string;
  content: string;
  type: 'fact' | 'preference' | 'context' | 'instruction';
  importance: number;
  createdAt: string;
  lastAccessed: string;
  accessCount: number;
}

export interface Conversation {
  id: string;
  userId: string;
  assistantId: string;
  messages: ConversationMessage[];
  context: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  title: string;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  attachments?: Attachment[];
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  metadata: { model: string; tokens: number; latency: number };
  createdAt: string;
}

export interface Attachment {
  type: 'image' | 'audio' | 'video' | 'file' | 'screen-capture';
  url: string;
  name: string;
  size: number;
  mimeType: string;
}

export interface AssistantTool {
  id: string;
  name: string;
  description: string;
  parameters: ToolParameter[];
  handler: string;
  category: string;
  requiresConfirmation: boolean;
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  default?: unknown;
}

export interface ToolCall {
  id: string;
  toolId: string;
  name: string;
  arguments: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export interface ToolResult {
  callId: string;
  output: unknown;
  error?: string;
  duration: number;
}

export interface Device {
  id: string;
  userId: string;
  name: string;
  type: DeviceType;
  os: string;
  osVersion: string;
  status: 'online' | 'offline' | 'locked' | 'busy';
  capabilities: DeviceCapability[];
  lastSeen: string;
  battery?: number;
  screenResolution?: { width: number; height: number };
}

export interface DeviceCapability {
  id: string;
  name: string;
  type: 'screen-read' | 'gesture' | 'notification' | 'app-control' | 'file-system' | 'clipboard' | 'system-command';
  enabled: boolean;
}

export interface DeviceCommand {
  id: string;
  deviceId: string;
  type: 'gesture' | 'type' | 'open-app' | 'screenshot' | 'scroll' | 'click' | 'key-press' | 'system';
  params: Record<string, unknown>;
  status: 'queued' | 'executing' | 'completed' | 'failed';
  result?: unknown;
  executedAt?: string;
}

export interface Automation {
  id: string;
  userId: string;
  name: string;
  description: string;
  trigger: AutomationTriggerConfig;
  actions: AutomationAction[];
  conditions: AutomationCondition[];
  isActive: boolean;
  executionCount: number;
  lastExecuted?: string;
  createdAt: string;
}

export interface AutomationTriggerConfig {
  type: AutomationTrigger;
  config: Record<string, unknown>;
  schedule?: string;
  event?: string;
  condition?: string;
  webhook?: { url: string; secret: string };
}

export interface AutomationAction {
  id: string;
  type: string;
  app?: string;
  params: Record<string, unknown>;
  order: number;
  retryOnFail: boolean;
  timeout: number;
}

export interface AutomationCondition {
  field: string;
  operator: 'equals' | 'not-equals' | 'contains' | 'gt' | 'lt' | 'exists';
  value: unknown;
}

export interface AIModel {
  id: string;
  name: string;
  provider: ModelProvider;
  version: string;
  capabilities: ModelCapability[];
  contextWindow: number;
  maxOutput: number;
  costPer1kTokens: { input: number; output: number };
  latencyMs: number;
  accuracy: number;
  isFineTuned: boolean;
  isPublic: boolean;
  status: 'active' | 'deprecated' | 'training';
}

export interface Plugin {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  category: string;
  status: PluginStatus;
  capabilities: string[];
  config: Record<string, unknown>;
  apiEndpoint?: string;
  webhookUrl?: string;
  installCount: number;
  rating: number;
}

export interface TrainingJob {
  id: string;
  userId: string;
  modelId: string;
  name: string;
  status: TrainingStatus;
  dataset: { name: string; size: number; format: string; samples: number };
  hyperparams: { epochs: number; learningRate: number; batchSize: number; warmupSteps: number };
  metrics: { loss: number; accuracy: number; evalLoss: number };
  progress: number;
  startedAt: string;
  completedAt?: string;
  outputModelId?: string;
}

export interface EcosystemApp {
  id: string;
  name: string;
  aiEnabled: boolean;
  aiFeatures: string[];
  aiUsage: { requests: number; tokens: number; cost: number };
  aiModel: string;
  config: Record<string, unknown>;
}

export interface AnalyticsData {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  averageLatency: number;
  errorRate: number;
  topModels: { model: string; requests: number }[];
  dailyUsage: { date: string; requests: number; tokens: number }[];
}

export interface RouteDefinition {
  method: string;
  path: string;
  handler: (req: any, res: any) => Promise<void>;
  middleware?: any[];
  requiresAuth?: boolean;
}
