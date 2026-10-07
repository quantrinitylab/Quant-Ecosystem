// ============================================================================
// Universal AI Assistant - Main Orchestrator
// ============================================================================

import type { AIEngine } from '../core/engine';
import { ToolRegistry } from './tool-registry';
import { IntentRouter } from './intent-router';
import { ActionExecutor } from './action-executor';
import type { AIToolResult, AssistantContext, AssistantResponse } from './types';

import { getQuantchatTools } from './tools/quantchat-tools';
import { getQuantmailTools } from './tools/quantmail-tools';
import { getQuantaiTools } from './tools/quantai-tools';
import { getQuantsyncTools } from './tools/quantsync-tools';
import { getQuantubeTools } from './tools/quantube-tools';
import { getQuantneonTools } from './tools/quantneon-tools';
import { getQuantmaxTools } from './tools/quantmax-tools';
import { getQuantadsTools } from './tools/quantads-tools';

/**
 * UniversalAssistant is the main AI assistant orchestrator.
 * It routes user messages to the appropriate app tools and generates responses.
 */
export class UniversalAssistant {
  private readonly _engine: AIEngine;
  private registry: ToolRegistry;
  private intentRouter: IntentRouter;
  private actionExecutor: ActionExecutor;

  constructor(engine: AIEngine) {
    this._engine = engine;
    this.registry = new ToolRegistry();
    this.intentRouter = new IntentRouter(this._engine, this.registry);
    this.actionExecutor = new ActionExecutor(this.registry);

    this.registerDefaultTools();
  }

  /**
   * Register built-in tools for all Quant apps
   */
  private registerDefaultTools(): void {
    this.registry.registerApp('quantchat', getQuantchatTools());
    this.registry.registerApp('quantmail', getQuantmailTools());
    this.registry.registerApp('quantai', getQuantaiTools());
    this.registry.registerApp('quantsync', getQuantsyncTools());
    this.registry.registerApp('quantube', getQuantubeTools());
    this.registry.registerApp('quantneon', getQuantneonTools());
    this.registry.registerApp('quantmax', getQuantmaxTools());
    this.registry.registerApp('quantads', getQuantadsTools());
  }

  /**
   * Process a user message through the full assistant pipeline.
   * Flow: parse intent -> execute action -> generate response
   */
  async processMessage(message: string, context: AssistantContext): Promise<AssistantResponse> {
    // Step 1: Parse intent
    const intent = await this.intentRouter.parseIntent(message, context);

    // Step 2: Execute action if confidence is sufficient
    let actionResult: AIToolResult | undefined = undefined;
    if (intent.confidence >= 0.5) {
      actionResult = await this.actionExecutor.execute(
        intent.targetApp,
        intent.toolName,
        intent.parsedArgs,
        context,
      );
    }

    // Step 3: Generate natural language response
    const responseMessage = this.generateResponse(intent.toolName, actionResult);

    // Step 4: Generate suggestions
    const suggestions = this.generateSuggestions(intent.targetApp, intent.toolName);

    return {
      message: responseMessage,
      action: actionResult,
      suggestions,
    };
  }

  /**
   * Get the tool registry for external access
   */
  getRegistry(): ToolRegistry {
    return this.registry;
  }

  /**
   * Generate a natural language response based on the action result
   */
  private generateResponse(
    _toolName: string,
    actionResult?: { success: boolean; displayMessage: string },
  ): string {
    if (!actionResult) {
      return "I'm not quite sure what you need. Could you be more specific?";
    }

    if (actionResult.success) {
      return actionResult.displayMessage;
    }

    return `I encountered an issue: ${actionResult.displayMessage}`;
  }

  /**
   * Generate follow-up suggestions based on the action taken
   */
  private generateSuggestions(app: string, toolName: string): string[] {
    const suggestionMap: Record<string, string[]> = {
      sendMessage: ['Send another message', 'Create a group chat', 'Search contacts'],
      composeEmail: ['Search emails', 'Summarize thread', 'Send another email'],
      generateImage: ['Translate text', 'Analyze code', 'Generate another image'],
      searchVideos: ['Create playlist', 'Search more videos'],
      createPost: ['Search content', 'Create another post'],
    };

    return suggestionMap[toolName] || [`Do more with ${app}`];
  }
}
