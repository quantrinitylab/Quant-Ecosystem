import { randomUUID } from 'node:crypto';
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
  return `cmd_${randomUUID()}`;
}

export const QUANTUBE_VOICE_ACTIONS: Record<string, VoiceAction> = {
  navigate: ({ params }) => ({
    success: true,
    message: `Navigating QuantTube to ${String(params.target ?? 'home')}`,
  }),
  create: ({ params }) => ({
    success: true,
    message: `Starting upload for ${String(params.type ?? 'video')} in QuantTube`,
    data: { type: params.type ?? 'video' },
  }),
  search: ({ params }) => ({
    success: true,
    message: `Searching QuantTube for "${String(params.query ?? '')}"`,
    data: { query: params.query ?? '' },
  }),
  summarize: ({ params }) => ({
    success: true,
    message: `Summarizing video ${String(params.target ?? 'current')} in QuantTube`,
    data: { target: params.target ?? 'current' },
  }),
};

export function registerQuantubeVoice(): () => void {
  return registerVoiceApp('quantube', QUANTUBE_VOICE_ACTIONS);
}
