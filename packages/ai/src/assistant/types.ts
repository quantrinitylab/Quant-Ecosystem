// ============================================================================
// Universal AI Assistant - Types and Interfaces
// ============================================================================

import type { QuantApp } from '@quant/common';
import type { ConversationMessage } from '../types';

/** AI Tool parameter definition */
export interface AIToolParameter {
  type: string;
  description: string;
  required: boolean;
  enum?: string[];
}

/** AI Tool result */
export interface AIToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  displayMessage: string;
}

/** AI Tool definition */
export interface AITool {
  name: string;
  description: string;
  parameters: Record<string, AIToolParameter>;
  handler: (args: Record<string, unknown>, context: AssistantContext) => Promise<AIToolResult>;
}

/** App capability - tools available for a specific app */
export interface AppCapability {
  app: QuantApp;
  tools: AITool[];
}

/** Intent router classification result */
export interface IntentRouterResult {
  targetApp: QuantApp;
  toolName: string;
  confidence: number;
  parsedArgs: Record<string, unknown>;
}

/** Assistant context for processing messages */
export interface AssistantContext {
  userId: string;
  currentApp: QuantApp;
  conversationHistory: ConversationMessage[];
  crossAppState: Record<string, unknown>;
}

/** Assistant response after processing a message */
export interface AssistantResponse {
  message: string;
  action?: AIToolResult;
  suggestions?: string[];
}
