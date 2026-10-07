import { AppController, getGlobalCommandBus } from '@quant/agentic';
import type { VoiceCommand, CommandResult } from '@quant/agentic';

export interface VoiceActionContext {
  appId: string;
  userId?: string;
}

export interface VoiceActionResult {
  success: boolean;
  message: string;
  data?: unknown;
}

export type VoiceAction = (input: {
  params: Record<string, unknown>;
  context: VoiceActionContext;
}) => VoiceActionResult;

let controller: AppController | null = null;

export function getVoiceController(): AppController {
  if (!controller) {
    controller = new AppController();
  }
  return controller;
}

export function registerVoiceApp(appId: string, actions: Record<string, VoiceAction>): () => void {
  const ctrl = getVoiceController();

  ctrl.registerApp({
    id: appId,
    name: appId,
    supportedActions: Object.keys(actions),
    isActive: true,
  });

  return ctrl.subscribe(appId, async (command: VoiceCommand): Promise<CommandResult> => {
    const action = actions[command.action];

    if (!action) {
      return {
        success: false,
        commandId: command.id,
        app: appId,
        message: `Unsupported action: ${command.action}`,
      };
    }

    try {
      const result = action({ params: command.params, context: { appId, userId: command.userId } });
      return {
        success: true,
        commandId: command.id,
        app: appId,
        message: result.message,
        data: result.data,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Voice action failed';
      return {
        success: false,
        commandId: command.id,
        app: appId,
        message,
      };
    }
  });
}

export function dispatchCommand(
  command: Omit<VoiceCommand, 'id' | 'timestamp'>,
): Promise<CommandResult[]> {
  const bus = getGlobalCommandBus();
  const fullCommand = {
    ...command,
    id: generateCommandId(),
    timestamp: new Date().toISOString(),
  } as VoiceCommand;
  return bus.send(fullCommand);
}

function generateCommandId(): string {
  return `cmd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export const QUANTSYNC_VOICE_ACTIONS: Record<string, VoiceAction> = {
  navigate: ({ params }) => ({
    success: true,
    message: `Navigating to ${String(params.target ?? 'home')} in QuantSync`,
  }),
  create: ({ params }) => ({
    success: true,
    message: `Creating ${String(params.type ?? 'post')} in QuantSync`,
    data: { type: params.type ?? 'post' },
  }),
  search: ({ params }) => ({
    success: true,
    message: `Searching QuantSync for "${String(params.query ?? '')}"`,
    data: { query: params.query ?? '' },
  }),
  summarize: ({ params }) => ({
    success: true,
    message: `Summarizing ${String(params.target ?? 'feed')} in QuantSync`,
    data: { target: params.target ?? 'feed' },
  }),
};

export function registerQuantsyncVoice(): () => void {
  return registerVoiceApp('quantsync', QUANTSYNC_VOICE_ACTIONS);
}
