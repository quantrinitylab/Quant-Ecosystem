export interface VoiceToolBridgeConfig {
  maxTier: number;
  confirmationCallback?: (tool: string, params: Record<string, unknown>) => Promise<boolean>;
  enabledApps: string[];
}

export interface VoiceToolResult {
  success: boolean;
  toolId: string;
  appId: string;
  result: unknown;
  spokenResponse: string;
  error?: string;
}

interface ToolRoute {
  toolId: string;
  appId: string;
  tier: number;
  description: string;
  keywords: string[];
  extractParams: (transcript: string) => Record<string, unknown>;
  generateResponse: (result: unknown) => string;
}

export class VoiceToolBridge {
  private readonly config: VoiceToolBridgeConfig;
  private readonly routes: ToolRoute[];

  constructor(config: VoiceToolBridgeConfig) {
    this.config = config;
    this.routes = this.buildRoutes();
  }

  async handleVoiceCommand(transcript: string, _userId: string): Promise<VoiceToolResult | null> {
    const lower = transcript.toLowerCase().trim();
    const route = this.routes.find((r) => r.keywords.some((kw) => lower.includes(kw)));

    if (!route) {
      return null;
    }

    if (!this.config.enabledApps.includes(route.appId)) {
      return null;
    }

    const params = route.extractParams(transcript);

    if (this.requiresConfirmation(route.toolId)) {
      if (this.config.confirmationCallback) {
        const confirmed = await this.config.confirmationCallback(route.toolId, params);
        if (!confirmed) {
          return {
            success: false,
            toolId: route.toolId,
            appId: route.appId,
            result: null,
            spokenResponse: 'Action cancelled.',
            error: 'User declined confirmation',
          };
        }
      }
    }

    return this.executeFromVoice(route.toolId, params, _userId);
  }

  async executeFromVoice(
    toolId: string,
    params: Record<string, unknown>,
    _userId: string,
  ): Promise<VoiceToolResult> {
    const route = this.routes.find((r) => r.toolId === toolId);
    if (!route) {
      return {
        success: false,
        toolId,
        appId: 'unknown',
        result: null,
        spokenResponse: 'I could not find that tool.',
        error: 'Tool not found',
      };
    }

    if (route.tier > this.config.maxTier) {
      return {
        success: false,
        toolId,
        appId: route.appId,
        result: null,
        spokenResponse: 'You do not have permission for that action.',
        error: 'Insufficient tier',
      };
    }

    const result = { executed: true, toolId, params };
    return {
      success: true,
      toolId,
      appId: route.appId,
      result,
      spokenResponse: route.generateResponse(params),
    };
  }

  requiresConfirmation(toolId: string): boolean {
    const route = this.routes.find((r) => r.toolId === toolId);
    if (!route) return false;
    return route.tier >= 2;
  }

  getAvailableTools(): { toolId: string; appId: string; description: string }[] {
    return this.routes
      .filter((r) => this.config.enabledApps.includes(r.appId) && r.tier <= this.config.maxTier)
      .map((r) => ({
        toolId: r.toolId,
        appId: r.appId,
        description: r.description,
      }));
  }

  getSupportedApps(): string[] {
    const apps = new Set(this.routes.map((r) => r.appId));
    return [...apps].filter((a) => this.config.enabledApps.includes(a));
  }

  private buildRoutes(): ToolRoute[] {
    return [
      {
        toolId: 'quantmail.send',
        appId: 'quantmail',
        tier: 2,
        description: 'Send an email',
        keywords: ['send an email', 'send email', 'email to'],
        extractParams: (t) => {
          const toMatch = t.match(/to\s+(\w+)/i);
          const aboutMatch = t.match(/about\s+(.+)/i);
          return {
            to: toMatch?.[1] ?? 'unknown',
            subject: aboutMatch?.[1] ?? 'No subject',
          };
        },
        generateResponse: (params) => {
          const p = params as Record<string, unknown>;
          return `Email sent to ${String(p['to'])} about ${String(p['subject'])}.`;
        },
      },
      {
        toolId: 'quantdrive.search',
        appId: 'quantdrive',
        tier: 1,
        description: 'Search files in drive',
        keywords: ['search for', 'find file', 'search in drive', 'look for'],
        extractParams: (t) => {
          const queryMatch = t.match(/(?:search for|find file|look for)\s+(.+?)(?:\s+in\s+|$)/i);
          return { query: queryMatch?.[1] ?? t };
        },
        generateResponse: (params) => {
          const p = params as Record<string, unknown>;
          return `Found results for ${String(p['query'])} in your drive.`;
        },
      },
      {
        toolId: 'quantcalendar.create',
        appId: 'quantcalendar',
        tier: 2,
        description: 'Create a calendar event',
        keywords: ['create event', 'schedule meeting', 'add to calendar', 'set reminder'],
        extractParams: (t) => {
          const titleMatch = t.match(/(?:called|named|titled)\s+(.+?)(?:\s+at\s+|\s+on\s+|$)/i);
          const timeMatch = t.match(/(?:at|on)\s+(.+)/i);
          return {
            title: titleMatch?.[1] ?? 'New event',
            time: timeMatch?.[1] ?? 'today',
          };
        },
        generateResponse: (params) => {
          const p = params as Record<string, unknown>;
          return `Event "${String(p['title'])}" scheduled for ${String(p['time'])}.`;
        },
      },
      {
        toolId: 'quantchat.send',
        appId: 'quantchat',
        tier: 1,
        description: 'Send a chat message',
        keywords: ['send message', 'message to', 'tell'],
        extractParams: (t) => {
          const toMatch = t.match(/(?:to|tell)\s+(\w+)/i);
          const msgMatch = t.match(/(?:saying|that)\s+(.+)/i);
          return {
            to: toMatch?.[1] ?? 'unknown',
            message: msgMatch?.[1] ?? '',
          };
        },
        generateResponse: (params) => {
          const p = params as Record<string, unknown>;
          return `Message sent to ${String(p['to'])}.`;
        },
      },
      {
        toolId: 'quantneon.post',
        appId: 'quantneon',
        tier: 2,
        description: 'Post to social feed',
        keywords: ['post a reel', 'post to neon', 'share on neon', 'publish'],
        extractParams: (t) => {
          const contentMatch = t.match(/(?:post|share|publish)\s+(.+)/i);
          return { content: contentMatch?.[1] ?? '' };
        },
        generateResponse: () => 'Posted to your Neon feed.',
      },
      {
        toolId: 'quantphotos.search',
        appId: 'quantphotos',
        tier: 1,
        description: 'Search photos',
        keywords: ['find photo', 'search photo', 'show me photos'],
        extractParams: (t) => {
          const queryMatch = t.match(
            /(?:find|search|show me)\s+(?:photos?\s+(?:of|from|with))?\s*(.+)/i,
          );
          return { query: queryMatch?.[1] ?? t };
        },
        generateResponse: (params) => {
          const p = params as Record<string, unknown>;
          return `Found photos matching ${String(p['query'])}.`;
        },
      },
    ];
  }
}
