import type {
  AppContext,
  ContextAdapter,
  CrossAppHostServiceConfig,
  HostingConfig,
} from '../types.js';

const DEFAULT_HOSTING_CONFIGS: Record<AppContext, HostingConfig> = {
  chat_embed: {
    appContext: 'chat_embed',
    maxWidth: 320,
    maxHeight: 240,
    interactionModel: 'tap',
    audioEnabled: false,
    videoEnabled: false,
    overlayMode: true,
    autoplay: false,
  },
  feed_embed: {
    appContext: 'feed_embed',
    maxWidth: 480,
    maxHeight: 360,
    interactionModel: 'swipe',
    audioEnabled: false,
    videoEnabled: true,
    overlayMode: false,
    autoplay: true,
  },
  fullscreen: {
    appContext: 'fullscreen',
    maxWidth: 1920,
    maxHeight: 1080,
    interactionModel: 'full',
    audioEnabled: true,
    videoEnabled: true,
    overlayMode: false,
    autoplay: false,
  },
  meeting_icebreaker: {
    appContext: 'meeting_icebreaker',
    maxWidth: 800,
    maxHeight: 600,
    interactionModel: 'turn_based',
    audioEnabled: true,
    videoEnabled: true,
    overlayMode: true,
    autoplay: false,
  },
  random_match: {
    appContext: 'random_match',
    maxWidth: 960,
    maxHeight: 540,
    interactionModel: 'split_screen',
    audioEnabled: true,
    videoEnabled: true,
    overlayMode: false,
    autoplay: true,
  },
};

export class CrossAppHostService {
  private adapters = new Map<AppContext, ContextAdapter>();
  private gameCapabilities = new Map<string, Set<AppContext>>();

  constructor(_config: CrossAppHostServiceConfig) {
    // Config reserved for future use
  }

  getHostingConfig(appContext: AppContext): HostingConfig {
    const config = DEFAULT_HOSTING_CONFIGS[appContext];
    if (!config) {
      throw new Error(`Unknown app context: ${appContext}`);
    }
    return { ...config };
  }

  adaptGame(gameId: string, appContext: AppContext): HostingConfig {
    const adapter = this.adapters.get(appContext);
    if (adapter) {
      return adapter.adapt(gameId);
    }

    // Fall back to default hosting config
    return this.getHostingConfig(appContext);
  }

  registerContextAdapter(appContext: AppContext, adapter: ContextAdapter): void {
    this.adapters.set(appContext, adapter);
  }

  registerGameContexts(gameId: string, supportedContexts: AppContext[]): void {
    this.gameCapabilities.set(gameId, new Set(supportedContexts));
  }

  getAvailableContexts(gameId: string): AppContext[] {
    const supported = this.gameCapabilities.get(gameId);
    if (supported) {
      return (Object.keys(DEFAULT_HOSTING_CONFIGS) as AppContext[]).filter((ctx) =>
        supported.has(ctx),
      );
    }

    // If no capabilities registered, return all contexts (backwards compatible)
    return Object.keys(DEFAULT_HOSTING_CONFIGS) as AppContext[];
  }
}
