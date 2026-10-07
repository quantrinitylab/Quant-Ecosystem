export { AppController, type AppRegistration } from './app-controller.js';
export {
  CrossAppCommandBus,
  getGlobalCommandBus,
  VoiceCommandSchema,
  CommandResultSchema,
  type VoiceCommand,
  type CommandResult,
  type CommandHandler,
} from './command-bus.js';
