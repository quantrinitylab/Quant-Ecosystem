import { PhoneFreeController } from './phone-free/phone-free-controller.js';
import {
  IntentRouter,
  ToolExecutor,
  type ToolDefinition,
  type ToolResult,
  type ToolExecutionContext,
} from '@quant/quant-tools';

export class AgenticSession {
  private router: IntentRouter;
  private executor: ToolExecutor;
  private phoneFreeController: PhoneFreeController;
  private sessionId: string;

  constructor(tools: ToolDefinition[]) {
    this.router = new IntentRouter(tools);
    this.executor = new ToolExecutor();
    this.phoneFreeController = new PhoneFreeController();
    this.sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  startSession(config?: { voiceOnly?: boolean }): void {
    this.phoneFreeController.activate();
    if (config?.voiceOnly) {
      this.phoneFreeController.enableVoiceOnlySession();
    }
  }

  registerHandler(
    toolId: string,
    handler: (params: Record<string, unknown>) => Promise<unknown>,
  ): void {
    this.executor.registerHandler(toolId, handler);
  }

  async executeVoiceCommand(
    text: string,
  ): Promise<{ success: boolean; toolId: string; appId: string; data: unknown; error?: string }> {
    const matches = this.router.route(text);

    if (matches.length === 0) {
      return {
        success: false,
        toolId: '',
        appId: '',
        data: null,
        error: 'No matching tool found for voice command',
      };
    }

    const topMatch = matches[0];

    if (!topMatch) {
      return {
        success: false,
        toolId: '',
        appId: '',
        data: null,
        error: 'No matching tool found for voice command',
      };
    }

    const context: ToolExecutionContext = {
      userId: 'voice-user',
      sessionId: this.sessionId,
      permissions: 3,
      dryRun: false,
    };

    const result: ToolResult = await this.executor.executeSingle(
      topMatch.toolId,
      topMatch.extractedParams,
      context,
    );

    this.phoneFreeController.getContextualResponse(topMatch.appId, text);

    return {
      success: result.success,
      toolId: topMatch.toolId,
      appId: topMatch.appId,
      data: result.data,
      error: result.error,
    };
  }

  getSessionSummary(): {
    duration: number;
    commandsExecuted: number;
    appsUsed: string[];
    continuityDevice: string | null;
  } {
    return this.phoneFreeController.getSessionSummary();
  }

  isActive(): boolean {
    return this.phoneFreeController.isActive();
  }

  endSession(): void {
    this.phoneFreeController.deactivate();
  }
}
