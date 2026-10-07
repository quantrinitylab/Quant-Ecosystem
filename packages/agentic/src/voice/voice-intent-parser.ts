import { z } from 'zod';

/**
 * Voice Intent Parser
 *
 * Converts natural language voice commands into structured app intents.
 * Uses pattern matching for speed; can fall back to LLM for complex commands.
 */

export const ParsedIntentSchema = z.object({
  app: z.string(), // target app id or '*'
  action: z.string(),
  params: z.record(z.unknown()).default({}),
  confidence: z.number().min(0).max(1),
  rawText: z.string(),
});

export type ParsedIntent = z.infer<typeof ParsedIntentSchema>;

interface IntentPattern {
  patterns: RegExp[];
  appGroupIndices?: (number | undefined)[];
  app: string;
  action: string;
  params: (
    matches: RegExpMatchArray,
    text: string,
    patternIndex: number,
  ) => Record<string, unknown>;
  confidence: number;
}

const APP_ALIASES: Record<string, string> = {
  'quant neon': 'quantneon',
  quantneon: 'quantneon',
  neon: 'quantneon',
  'quant sync': 'quantsync',
  quantsync: 'quantsync',
  sync: 'quantsync',
  'quant tube': 'quantube',
  quanttube: 'quantube',
  quantube: 'quantube',
  tube: 'quantube',
  'quant chat': 'quantchat',
  quantchat: 'quantchat',
  chat: 'quantchat',
  'quant mail': 'quantmail',
  quantmail: 'quantmail',
  mail: 'quantmail',
  email: 'quantmail',
  'quant docs': 'quantdocs',
  quantdocs: 'quantdocs',
  docs: 'quantdocs',
  'quant calendar': 'quantcalendar',
  quantcalendar: 'quantcalendar',
  calendar: 'quantcalendar',
  'quant drive': 'quantdrive',
  quantdrive: 'quantdrive',
  drive: 'quantdrive',
  'quant meet': 'quantmeet',
  quantmeet: 'quantmeet',
  meet: 'quantmeet',
};

const ACTION_ALIASES: Record<string, string> = {
  scroll: 'scroll',
  swipe: 'scroll',
  move: 'scroll',
  'scroll down': 'scroll',
  'scroll up': 'scroll',
  open: 'navigate',
  go: 'navigate',
  show: 'navigate',
  check: 'navigate',
  navigate: 'navigate',
  play: 'media.play',
  pause: 'media.pause',
  stop: 'media.stop',
  next: 'media.next',
  previous: 'media.previous',
  'next video': 'media.next',
  'previous video': 'media.previous',
  like: 'social.like',
  unlike: 'social.unlike',
  share: 'social.share',
  post: 'social.post',
  send: 'message.send',
  reply: 'message.reply',
  summarize: 'ai.summarize',
  draft: 'ai.draft',
  archive: 'email.archive',
  delete: 'email.delete',
  search: 'search.query',
  find: 'search.query',
};

const PATTERNS: IntentPattern[] = [
  // Scroll reels/feed in app
  {
    patterns: [
      /^(?:scroll|swipe)\s+(?:down|up)?\s*(?:the\s+)?(?:(reels|feed|posts|videos|timeline)\s+)?(?:in\s+|on\s+)?([\w\s]+)$/i,
      /^(?:scroll|swipe)\s+(?:in\s+|on\s+)?([\w\s]+?)(?:\s+(?:feed|reels|posts|videos))?$/i,
    ],
    appGroupIndices: [2, 1],
    app: 'quantneon',
    action: 'scroll',
    params: (matches, text, patternIndex) => {
      const type = (patternIndex === 0 ? matches[1] : undefined) || detectFeedType(text);
      const direction = text.includes('up') ? 'up' : 'down';
      return { type, direction };
    },
    confidence: 0.95,
  },
  // Open/navigate to screen in app
  {
    patterns: [
      /^(?:open|go\s+to|show|check)\s+(?:the\s+)?([\w\s]+?)\s+(?:in\s+|on\s+)?([\w\s]+)$/i,
      /^(?:open|go\s+to|show)\s+([\w\s]+?)\s+(?:and\s+)?(?:show\s+)?([\w\s]+)$/i,
    ],
    appGroupIndices: [2, 1],
    app: 'quantsync',
    action: 'navigate',
    params: (matches, _text, patternIndex) => ({
      screen: normalizeScreen((patternIndex === 0 ? matches[1] : matches[2]) || 'home'),
    }),
    confidence: 0.92,
  },
  // Play/pause media
  {
    patterns: [
      /^(?:play|pause|stop)\s+(?:the\s+)?(?:video|music|song|podcast)?$/i,
      /^(?:play|pause|stop)\s+(?:the\s+)?(?:video|music|song|podcast)\s+(?:in\s+|on\s+)?([\w\s]+)$/i,
    ],
    appGroupIndices: [undefined, 1],
    app: '*',
    action: 'media.play',
    params: (_matches, text) => {
      if (text.includes('pause')) return { state: 'pause' };
      if (text.includes('stop')) return { state: 'stop' };
      return { state: 'play' };
    },
    confidence: 0.94,
  },
  // Next/previous media
  {
    patterns: [
      /^(?:play\s+)?(next|previous)\s+(?:video|song|track|reel|post)?$/i,
      /^(?:go\s+to\s+)?(next|previous)\s+(?:in\s+|on\s+)?([\w\s]+)$/i,
    ],
    appGroupIndices: [undefined, 2],
    app: '*',
    action: 'media.next',
    params: (matches) => ({ direction: matches[1] || 'next' }),
    confidence: 0.93,
  },
  // Search
  {
    patterns: [
      /^(?:search|find)\s+(?:for\s+)?["']?([^"']+)["']?\s+(?:in\s+|on\s+)?([\w\s]+)$/i,
      /^(?:search|find)\s+(?:in\s+|on\s+)?([\w\s]+?)\s+(?:for\s+)?["']?([^"']+)["']?$/i,
    ],
    appGroupIndices: [2, 1],
    app: '*',
    action: 'search.query',
    params: (matches, _text, patternIndex) => ({
      query: (patternIndex === 0 ? matches[1] : matches[2]) || '',
    }),
    confidence: 0.94,
  },
  // Like/share
  {
    patterns: [
      /^(like|unlike|share)\s+(?:this\s+)?(?:post|video|reel|photo)?$/i,
      /^(like|unlike|share)\s+(?:the\s+)?(?:post|video|reel|photo)\s+(?:in\s+|on\s+)?([\w\s]+)$/i,
    ],
    appGroupIndices: [undefined, 2],
    app: '*',
    action: 'social.like',
    params: (matches) => {
      const action = matches[1] || 'like';
      if (action === 'unlike') return { action: 'unlike' };
      if (action === 'share') return { action: 'share' };
      return { action: 'like' };
    },
    confidence: 0.9,
  },
  // Email actions
  {
    patterns: [
      /^(?:summarize|draft|reply\s+to|archive|delete)\s+(?:the\s+)?(next|last|this)?\s*(?:email|mail|message)$/i,
      /^(?:summarize|draft|reply\s+to|archive|delete)\s+(?:the\s+)?(next|last|this)?\s*(?:email|mail|message)\s+(?:in\s+quantmail)?$/i,
    ],
    app: 'quantmail',
    action: 'ai.summarize',
    params: (_matches, text) => {
      if (text.includes('draft')) return { action: 'draft' };
      if (text.includes('reply')) return { action: 'reply' };
      if (text.includes('archive')) return { action: 'archive' };
      if (text.includes('delete')) return { action: 'delete' };
      return { action: 'summarize' };
    },
    confidence: 0.93,
  },
  // Generic app-only command
  {
    patterns: [/^(?:open|launch|go\s+to)\s+([\w\s]+)$/i, /^(?:switch\s+to|show)\s+([\w\s]+)$/i],
    appGroupIndices: [1, 1],
    app: '*',
    action: 'navigate',
    params: () => ({ screen: 'home' }),
    confidence: 0.88,
  },
];

export class VoiceIntentParser {
  /**
   * Parse a voice/text command into a structured intent.
   */
  parse(text: string): ParsedIntent {
    const normalized = text.toLowerCase().trim();

    for (const pattern of PATTERNS) {
      for (let patternIndex = 0; patternIndex < pattern.patterns.length; patternIndex++) {
        const regex = pattern.patterns[patternIndex];
        if (!regex) continue;
        const match = normalized.match(regex);
        if (match) {
          const appGroupIndex = pattern.appGroupIndices?.[patternIndex];
          const app = extractApp(match, normalized, appGroupIndex) || pattern.app;
          const params = pattern.params(match, normalized, patternIndex);
          return ParsedIntentSchema.parse({
            app,
            action: pattern.action,
            params,
            confidence: pattern.confidence,
            rawText: text,
          });
        }
      }
    }

    // Fallback: try to extract app and action heuristically.
    const fallback = this.fallbackParse(normalized, text);
    if (fallback) {
      return fallback;
    }

    return ParsedIntentSchema.parse({
      app: '*',
      action: 'unknown',
      params: { text },
      confidence: 0.3,
      rawText: text,
    });
  }

  private fallbackParse(normalized: string, rawText: string): ParsedIntent | null {
    const app = detectApp(normalized);
    const action = detectAction(normalized);

    if (app && action) {
      return ParsedIntentSchema.parse({
        app,
        action,
        params: { text: rawText },
        confidence: 0.6,
        rawText,
      });
    }

    return null;
  }
}

function extractApp(
  match: RegExpMatchArray,
  text: string,
  appGroupIndex: number | undefined,
): string | null {
  const rawApp =
    appGroupIndex !== undefined ? match[appGroupIndex]?.trim().toLowerCase() : undefined;
  if (rawApp && APP_ALIASES[rawApp]) {
    return APP_ALIASES[rawApp];
  }

  // If pattern did not capture app, try global detection.
  return detectApp(text);
}

function detectApp(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [alias, appId] of Object.entries(APP_ALIASES)) {
    if (lower.includes(alias)) {
      return appId;
    }
  }
  return null;
}

function detectAction(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [alias, action] of Object.entries(ACTION_ALIASES)) {
    if (lower.includes(alias)) {
      return action;
    }
  }
  return null;
}

function detectFeedType(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('reels')) return 'reels';
  if (lower.includes('videos')) return 'videos';
  if (lower.includes('posts')) return 'posts';
  if (lower.includes('timeline')) return 'timeline';
  return 'feed';
}

function normalizeScreen(screen: string): string {
  const lower = screen.trim().toLowerCase();
  if (lower.includes('dm') || lower.includes('message') || lower.includes('chat'))
    return 'messages';
  if (lower.includes('home') || lower.includes('feed')) return 'feed';
  if (lower.includes('profile')) return 'profile';
  if (lower.includes('notification')) return 'notifications';
  if (lower.includes('setting')) return 'settings';
  if (lower.includes('explore') || lower.includes('discover')) return 'explore';
  return lower.replace(/\s+/g, '_');
}
