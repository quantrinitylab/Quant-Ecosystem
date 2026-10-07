import {
  CrossAppCommandBus,
  getGlobalCommandBus,
  type VoiceCommand,
  type CommandResult,
} from './command-bus.js';
import { VoiceSafetyGuardrail } from '../safety/voice-safety.js';
import type { ParsedIntent } from '../voice/voice-intent-parser.js';

/**
 * App Controller
 *
 * Routes parsed voice intents to the correct app via the command bus.
 * Maintains an active app registry and enforces safety guardrails.
 */

export interface AppRegistration {
  id: string;
  name: string;
  supportedActions: string[];
  isActive: boolean;
}

export class AppController {
  private bus: CrossAppCommandBus;
  private safety: VoiceSafetyGuardrail;
  private registry: Map<string, AppRegistration> = new Map();
  private activeApp: string | null = null;

  constructor(bus?: CrossAppCommandBus, safety?: VoiceSafetyGuardrail) {
    this.bus = bus ?? getGlobalCommandBus();
    this.safety = safety ?? new VoiceSafetyGuardrail();
  }

  /**
   * Register an app that can receive commands.
   */
  registerApp(app: AppRegistration): void {
    this.registry.set(app.id, app);
    if (app.isActive) {
      this.activeApp = app.id;
    }
  }

  /**
   * Mark an app as the currently active app.
   */
  setActiveApp(appId: string): void {
    if (this.registry.has(appId)) {
      const app = this.registry.get(appId)!;
      app.isActive = true;
      this.activeApp = appId;

      // Deactivate others.
      for (const [id, otherApp] of this.registry) {
        if (id !== appId) {
          otherApp.isActive = false;
        }
      }
    }
  }

  /**
   * Get the currently active app, or null if none set.
   */
  getActiveApp(): AppRegistration | null {
    if (!this.activeApp) return null;
    return this.registry.get(this.activeApp) || null;
  }

  /**
   * Execute a parsed intent by routing it to the target app.
   */
  async executeIntent(
    intent: ParsedIntent,
    userId: string,
    options: { skipConfirmation?: boolean } = {},
  ): Promise<CommandResult[]> {
    const safetyDecision = this.safety.check(intent);

    if (!safetyDecision.allowed) {
      return [
        {
          success: false,
          commandId: generateCommandId(),
          app: intent.app,
          message: `Blocked: ${safetyDecision.reason}`,
        },
      ];
    }

    const targetApp = this.resolveTargetApp(intent);

    const command: VoiceCommand = {
      id: generateCommandId(),
      source: 'voice',
      targetApp,
      action: intent.action,
      params: intent.params,
      userId,
      timestamp: new Date().toISOString(),
      requireConfirmation: safetyDecision.requireConfirmation && !options.skipConfirmation,
    };

    if (command.requireConfirmation) {
      return [
        {
          success: false,
          commandId: command.id,
          app: targetApp,
          message: 'Confirmation required before executing this command',
          data: { command, reason: safetyDecision.reason },
        },
      ];
    }

    return this.bus.send(command);
  }

  /**
   * Send a raw command directly. Used after user confirmation.
   */
  async executeCommand(command: VoiceCommand): Promise<CommandResult[]> {
    return this.bus.send(command);
  }

  /**
   * Subscribe a handler for a specific app.
   */
  subscribe(
    appId: string,
    handler: (command: VoiceCommand) => Promise<CommandResult> | CommandResult,
  ): () => void {
    return this.bus.subscribe(appId, handler);
  }

  private resolveTargetApp(intent: ParsedIntent): string {
    if (intent.app && intent.app !== '*') {
      return intent.app;
    }

    // Fall back to active app.
    if (this.activeApp) {
      return this.activeApp;
    }

    // Last resort: return wildcard.
    return '*';
  }
}

function generateCommandId(): string {
  return `cmd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
