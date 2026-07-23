import { UnifiedAIService } from '@quant/ai/unified-ai-service';
import { AppController } from '../cross-app/app-controller.js';
import { VoiceIntentParser, type ParsedIntent } from './voice-intent-parser.js';
import type { CommandResult } from '../cross-app/command-bus.js';

/**
 * Voice Command Router
 *
 * High-level orchestrator that takes raw voice/text input,
 * parses it into an intent, optionally confirms with LLM,
 * and routes it to the appropriate app via AppController.
 */

export interface VoiceCommandInput {
  transcript: string;
  userId: string;
  useLLM?: boolean;
  skipConfirmation?: boolean;
}

/** A command that was blocked pending explicit user confirmation. */
export interface PendingCommand {
  commandId: string;
  intent: ParsedIntent;
  userId: string;
}

/**
 * Pluggable store for commands that were blocked pending confirmation. A real
 * implementation persists pending commands (so a later `confirm` call can look
 * them up and execute them); tests can supply a fake to exercise the real-mode
 * path without touching the network.
 */
export interface PendingCommandStore {
  /** Resolve a previously blocked command by id, or null if unknown/expired. */
  resolve(commandId: string): Promise<PendingCommand | null>;
}

/**
 * Real pending-command store backed by a configured HTTP service. Enabled by
 * AGENT_COMMAND_STORE_URL (optionally AGENT_COMMAND_STORE_API_KEY). Looks up a
 * pending command by id so it can be confirmed and executed.
 */
export class HttpPendingCommandStore implements PendingCommandStore {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string,
  ) {}

  async resolve(commandId: string): Promise<PendingCommand | null> {
    const res = await fetch(
      `${this.baseUrl.replace(/\/$/, '')}/pending-commands/${encodeURIComponent(commandId)}`,
      {
        headers: {
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
        },
      },
    );
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new Error(`pending-command store responded ${res.status}`);
    }
    const body = (await res.json()) as {
      commandId?: string;
      userId?: string;
      intent?: ParsedIntent;
    };
    if (!body.intent || !body.userId) {
      return null;
    }
    return {
      commandId: body.commandId ?? commandId,
      userId: body.userId,
      intent: body.intent,
    };
  }
}

export class VoiceCommandRouter {
  private parser: VoiceIntentParser;
  private controller: AppController;
  private aiService: UnifiedAIService;
  private pendingStore: PendingCommandStore | null;

  constructor(
    controller: AppController,
    aiService?: UnifiedAIService,
    pendingStore?: PendingCommandStore,
  ) {
    this.parser = new VoiceIntentParser();
    this.controller = controller;
    this.aiService = aiService ?? new UnifiedAIService();
    this.pendingStore = pendingStore ?? VoiceCommandRouter.createPendingStoreFromEnv();
  }

  private static createPendingStoreFromEnv(): PendingCommandStore | null {
    const url = process.env['AGENT_COMMAND_STORE_URL'];
    if (url) {
      return new HttpPendingCommandStore(url, process.env['AGENT_COMMAND_STORE_API_KEY']);
    }
    return null;
  }

  /** Whether a real pending-command store is wired up. */
  isPendingStoreConfigured(): boolean {
    return this.pendingStore !== null;
  }

  /**
   * Process a raw voice command end-to-end.
   */
  async handle(input: VoiceCommandInput): Promise<CommandResult[]> {
    const intent = this.parser.parse(input.transcript);

    if (input.useLLM && intent.confidence < 0.7) {
      const refined = await this.refineWithLLM(input.transcript, intent);
      return this.controller.executeIntent(refined, input.userId, {
        skipConfirmation: input.skipConfirmation,
      });
    }

    return this.controller.executeIntent(intent, input.userId, {
      skipConfirmation: input.skipConfirmation,
    });
  }

  /**
   * Confirm a previously blocked command (ask permission).
   *
   * When a pending-command store is configured, the command is looked up and,
   * if found, executed (with confirmation bypassed). Otherwise the router
   * degrades to an informative failure result (no store to resolve from).
   */
  async confirm(commandId: string, _userId: string): Promise<CommandResult[]> {
    if (this.pendingStore) {
      try {
        const pending = await this.pendingStore.resolve(commandId);
        if (!pending) {
          return [
            {
              success: false,
              commandId,
              app: '*',
              message: `No pending command found for id ${commandId}`,
            },
          ];
        }
        return this.controller.executeIntent(pending.intent, pending.userId, {
          skipConfirmation: true,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console
        console.warn(
          `[voice-command-router] pending-command store failed for ${commandId}: ${message}`,
        );
      }
    }

    // Fallback: no store configured (or store error) — cannot resolve the
    // pending command, so report an explicit, non-confirming failure.
    return [
      {
        success: false,
        commandId,
        app: '*',
        message: 'Pending command confirmation is unavailable (no command store configured)',
      },
    ];
  }

  private async refineWithLLM(
    transcript: string,
    fallbackIntent: ParsedIntent,
  ): Promise<ParsedIntent> {
    try {
      const result = await this.aiService.generateText(
        `Parse this voice command into JSON with keys: app, action, params.
Available apps: quantneon, quantsync, quanttube, quantchat, quantmail, quantdocs, quantcalendar.
Command: "${transcript}"

Respond only with JSON.`,
        {
          systemPrompt:
            'You are a voice command parser for a multi-app ecosystem. Return only valid JSON.',
          temperature: 0.1,
          maxTokens: 256,
        },
      );

      const parsed = JSON.parse(result.content) as Record<string, unknown>;
      return {
        app: String(parsed.app || fallbackIntent.app),
        action: String(parsed.action || fallbackIntent.action),
        params:
          typeof parsed.params === 'object' && parsed.params !== null
            ? (parsed.params as Record<string, unknown>)
            : fallbackIntent.params,
        confidence: 0.85,
        rawText: transcript,
      };
    } catch {
      return fallbackIntent;
    }
  }
}
