export interface EmbedOptions {
  theme?: 'light' | 'dark';
  primaryColor?: string;
  position?: 'bottom-right' | 'bottom-left';
}

export class EmbeddableChatbotService {
  private allowedOriginsMap: Map<string, Set<string>> = new Map();

  constructor() {
    // Default allowed origins for testing or development
    this.allowedOriginsMap.set(
      'bot-default',
      new Set(['*', 'https://quantmail.in', 'http://localhost:3000', 'http://localhost:3004']),
    );
  }

  public registerAllowedOrigins(botId: string, origins: string[]): void {
    this.allowedOriginsMap.set(botId, new Set(origins));
  }

  public generateEmbedSnippet(botId: string, options: EmbedOptions = {}): string {
    const theme = options.theme ?? 'light';
    const primaryColor = options.primaryColor ?? '#2563eb';
    const position = options.position ?? 'bottom-right';

    // Generates embed script tag matching MagicAI / modern widget embed specification
    const scriptUrl = 'https://quantmail.in/embed/quantai.js';
    return `<script src="${scriptUrl}" data-bot-id="${botId}" data-theme="${theme}" data-primary-color="${primaryColor}" data-position="${position}" async></script>`;
  }

  public verifyEmbedOrigin(botId: string, origin: string): boolean {
    const allowedOrigins =
      this.allowedOriginsMap.get(botId) ?? this.allowedOriginsMap.get('bot-default');
    if (!allowedOrigins) {
      return true; // default allow if not explicitly restricted
    }

    if (allowedOrigins.has('*')) {
      return true;
    }

    try {
      const parsedOrigin = new URL(origin).origin;
      for (const allowed of allowedOrigins) {
        if (allowed === '*' || allowed === parsedOrigin || allowed === origin) {
          return true;
        }
      }
    } catch {
      // If origin is not a full URL string, check direct match
      if (allowedOrigins.has(origin)) {
        return true;
      }
    }

    return false;
  }
}

export const embeddableChatbotService = new EmbeddableChatbotService();
