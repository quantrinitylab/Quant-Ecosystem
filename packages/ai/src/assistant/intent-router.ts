// ============================================================================
// Universal AI Assistant - Intent Router
// ============================================================================

import type { QuantApp } from '@quant/common';
import type { AIEngine } from '../core/engine';
import type { ToolRegistry } from './tool-registry';
import type { AssistantContext, IntentRouterResult } from './types';

/** Keyword mapping for fallback intent classification */
const KEYWORD_MAP: Record<string, { app: QuantApp; tool: string }> = {
  message: { app: 'quantchat', tool: 'sendMessage' },
  chat: { app: 'quantchat', tool: 'sendMessage' },
  group: { app: 'quantchat', tool: 'createGroupChat' },
  contact: { app: 'quantchat', tool: 'searchContacts' },
  email: { app: 'quantmail', tool: 'composeEmail' },
  mail: { app: 'quantmail', tool: 'composeEmail' },
  inbox: { app: 'quantmail', tool: 'searchEmails' },
  summarize: { app: 'quantmail', tool: 'summarizeThread' },
  image: { app: 'quantai', tool: 'generateImage' },
  translate: { app: 'quantai', tool: 'translateText' },
  code: { app: 'quantai', tool: 'analyzeCode' },
  post: { app: 'quantsync', tool: 'createPost' },
  video: { app: 'quantube', tool: 'searchVideos' },
  playlist: { app: 'quantube', tool: 'createPlaylist' },
  photo: { app: 'quantneon', tool: 'editPhoto' },
  filter: { app: 'quantneon', tool: 'applyFilter' },
  match: { app: 'quantmax', tool: 'findMatches' },
  campaign: { app: 'quantads', tool: 'createCampaign' },
  analytics: { app: 'quantads', tool: 'getAnalytics' },
};

/**
 * IntentRouter classifies user messages into specific app tools.
 * Uses the AIEngine for LLM-based classification with keyword-based fallback.
 */
export class IntentRouter {
  private engine: AIEngine;
  private registry: ToolRegistry;

  constructor(engine: AIEngine, registry: ToolRegistry) {
    this.engine = engine;
    this.registry = registry;
  }

  /**
   * Parse user intent from a natural language message.
   * Attempts LLM-based classification, falling back to keyword matching.
   */
  async parseIntent(message: string, context: AssistantContext): Promise<IntentRouterResult> {
    try {
      return await this.classifyWithAI(message, context);
    } catch {
      return this.classifyWithKeywords(message, context);
    }
  }

  /**
   * Use the AI engine to classify intent
   */
  private async classifyWithAI(
    message: string,
    context: AssistantContext,
  ): Promise<IntentRouterResult> {
    const toolDescriptions = this.registry.getToolDescriptionsForPrompt();

    const systemPrompt = `You are an intent classifier for the Quant ecosystem.
Given a user message, determine which app and tool should handle it.
${toolDescriptions}

Respond ONLY with valid JSON in this exact format:
{"targetApp": "<app_name>", "toolName": "<tool_name>", "confidence": <0.0-1.0>, "parsedArgs": {<extracted_arguments>}}

Current app context: ${context.currentApp}
User ID: ${context.userId}`;

    const response = await this.engine.infer({
      prompt: message,
      systemPrompt,
      userId: context.userId,
      app: context.currentApp,
      feature: 'intent_routing',
      temperature: 0.1,
      maxTokens: 200,
    });

    const parsed = JSON.parse(response.content) as IntentRouterResult;

    // Validate the result references a real tool
    const tool = this.registry.findTool(parsed.targetApp, parsed.toolName);
    if (!tool) {
      return this.classifyWithKeywords(message, context);
    }

    return parsed;
  }

  /**
   * Keyword-based fallback classification
   */
  private classifyWithKeywords(message: string, _context: AssistantContext): IntentRouterResult {
    const lowerMessage = message.toLowerCase();

    for (const [keyword, mapping] of Object.entries(KEYWORD_MAP)) {
      if (lowerMessage.includes(keyword)) {
        const tool = this.registry.findTool(mapping.app, mapping.tool);
        if (tool) {
          const parsedArgs = this.extractArgs(message, tool.name);
          return {
            targetApp: mapping.app,
            toolName: mapping.tool,
            confidence: 0.6,
            parsedArgs,
          };
        }
      }
    }

    // Default fallback to current app's first tool or quantai
    return {
      targetApp: 'quantai',
      toolName: 'analyzeCode',
      confidence: 0.3,
      parsedArgs: { input: message },
    };
  }

  /**
   * Extract arguments from the message based on common patterns
   */
  private extractArgs(message: string, _toolName: string): Record<string, unknown> {
    const args: Record<string, unknown> = { input: message };

    // Extract "to <name>" pattern
    const toMatch = message.match(/\bto\s+(\w+)/i);
    if (toMatch) {
      args['recipient'] = toMatch[1];
    }

    // Extract quoted content
    const quotedMatch = message.match(/"([^"]+)"/);
    if (quotedMatch) {
      args['content'] = quotedMatch[1];
    }

    // Extract "saying <content>" pattern
    const sayingMatch = message.match(/\bsaying\s+(.+)$/i);
    if (sayingMatch && !args['content']) {
      args['content'] = sayingMatch[1];
    }

    return args;
  }
}
