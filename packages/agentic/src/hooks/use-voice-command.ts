import {
  getGlobalCommandBus,
  type VoiceCommand,
  type CommandResult,
  type CommandHandler,
} from '../cross-app/command-bus.js';

export function useVoiceCommand(
  appId: string,
  handler: (command: VoiceCommand) => Promise<CommandResult> | CommandResult,
): { unsubscribe: () => void } {
  const bus = getGlobalCommandBus();
  const unsubscribe = bus.subscribe(appId, handler as CommandHandler);

  return { unsubscribe };
}
