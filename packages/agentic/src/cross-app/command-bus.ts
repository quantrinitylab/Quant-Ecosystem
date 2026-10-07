import { z } from 'zod';

/**
 * Cross-App Command Bus
 *
 * A central pub/sub system that lets the Quant AI agent send commands
 * to any app in the ecosystem, and lets apps report results back.
 *
 * Uses BroadcastChannel when available, falls back to window.postMessage.
 */

export const VoiceCommandSchema = z.object({
  id: z.string(),
  source: z.enum(['voice', 'text', 'agent']).default('voice'),
  targetApp: z.string(), // 'quantneon', 'quantsync', 'quanttube', '*'
  action: z.string(), // 'scroll', 'navigate', 'play', 'pause', 'next'
  params: z.record(z.unknown()).default({}),
  userId: z.string(),
  timestamp: z
    .string()
    .datetime()
    .default(() => new Date().toISOString()),
  requireConfirmation: z.boolean().optional(),
});

export const CommandResultSchema = z.object({
  success: z.boolean(),
  commandId: z.string(),
  app: z.string(),
  message: z.string(),
  data: z.unknown().optional(),
});

export type VoiceCommand = z.infer<typeof VoiceCommandSchema>;
export type CommandResult = z.infer<typeof CommandResultSchema>;

export type CommandHandler = (command: VoiceCommand) => Promise<CommandResult> | CommandResult;

const COMMAND_CHANNEL_NAME = 'quant-cross-app-commands';

export class CrossAppCommandBus extends EventTarget {
  private handlers: Map<string, Set<CommandHandler>> = new Map();
  private broadcastChannel: BroadcastChannel | null = null;

  constructor() {
    super();

    if (typeof window !== 'undefined') {
      const globalWindow = window as Window & { BroadcastChannel?: typeof BroadcastChannel };

      if (globalWindow.BroadcastChannel) {
        this.broadcastChannel = new globalWindow.BroadcastChannel(COMMAND_CHANNEL_NAME);
        this.broadcastChannel.onmessage = (event) => {
          this.handleIncomingMessage(event.data);
        };
      } else {
        globalWindow.addEventListener('message', (event: MessageEvent) => {
          // Only accept commands from the same origin to prevent cross-origin injection.
          if (event.origin !== globalWindow.location.origin) return;
          if (event.data && event.data.__quantCommand === true) {
            this.handleIncomingMessage(event.data.payload);
          }
        });
      }
    }
  }

  /**
   * Register a handler for a specific app or wildcard '*'.
   */
  subscribe(appId: string, handler: CommandHandler): () => void {
    if (!this.handlers.has(appId)) {
      this.handlers.set(appId, new Set());
    }

    const appHandlers = this.handlers.get(appId)!;
    appHandlers.add(handler);

    return () => {
      appHandlers.delete(handler);
      if (appHandlers.size === 0) {
        this.handlers.delete(appId);
      }
    };
  }

  /**
   * Send a command to the target app(s).
   */
  async send(command: VoiceCommand): Promise<CommandResult[]> {
    const validated = VoiceCommandSchema.parse(command);

    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({ type: 'command', payload: validated });
    } else if (typeof window !== 'undefined') {
      window.postMessage(
        { __quantCommand: true, type: 'command', payload: validated },
        window.location.origin,
      );
    }

    return this.executeLocalHandlers(validated);
  }

  private async executeLocalHandlers(command: VoiceCommand): Promise<CommandResult[]> {
    const targetHandlers = this.getTargetHandlers(command.targetApp);

    if (targetHandlers.length === 0) {
      return [
        {
          success: false,
          commandId: command.id,
          app: command.targetApp,
          message: `No app registered to handle commands for ${command.targetApp}`,
        },
      ];
    }

    const results: CommandResult[] = [];
    for (const handler of targetHandlers) {
      try {
        const result = await handler(command);
        results.push(CommandResultSchema.parse(result));
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown handler error';
        results.push({
          success: false,
          commandId: command.id,
          app: command.targetApp,
          message,
        });
      }
    }

    return results;
  }

  private getTargetHandlers(targetApp: string): CommandHandler[] {
    const wildcard = this.handlers.get('*') || new Set();
    const specific = this.handlers.get(targetApp) || new Set();
    return [...wildcard, ...specific];
  }

  private handleIncomingMessage(data: unknown): void {
    if (!data || typeof data !== 'object') return;

    const message = data as { type?: string; payload?: unknown };
    if (message.type !== 'command') return;

    const parseResult = VoiceCommandSchema.safeParse(message.payload);
    if (!parseResult.success) return;

    // Execute local handlers in response to broadcasted commands.
    void this.executeLocalHandlers(parseResult.data);
  }

  /**
   * Destroy the bus and release resources.
   */
  destroy(): void {
    this.handlers.clear();
    this.broadcastChannel?.close();
    this.broadcastChannel = null;
  }
}

let globalBus: CrossAppCommandBus | null = null;

export function getGlobalCommandBus(): CrossAppCommandBus {
  if (!globalBus) {
    globalBus = new CrossAppCommandBus();
  }
  return globalBus;
}
