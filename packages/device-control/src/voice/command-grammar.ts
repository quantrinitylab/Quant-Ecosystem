import type { DeviceIntent, GrammarPattern } from './types.js';

// Pattern ordering matters: Hindi/Hinglish patterns MUST come before English patterns.
// The Hindi "call kar" pattern would otherwise be swallowed by the generic English "call"
// pattern. Patterns are matched top-to-bottom; first match wins.
const patterns: GrammarPattern[] = [
  // Hindi/Hinglish patterns
  {
    id: 'hindi-call',
    pattern: '^call kar\\s+(.+)$',
    capability: 'phone',
    action: 'place',
    extract: (t) => ({ target: t.match(/^call kar\s+(.+)$/i)![1] }),
  },
  {
    id: 'hindi-message',
    pattern: '^message bhej\\s+(.+)$',
    capability: 'sms',
    action: 'send',
    extract: (t) => ({ target: t.match(/^message bhej\s+(.+)$/i)![1] }),
  },
  {
    id: 'hindi-navigate',
    pattern: '^ghar le chal$',
    capability: 'location',
    action: 'navigate',
    extract: () => ({ destination: 'home' }),
  },
  {
    id: 'hindi-alarm',
    pattern: '^alarm laga\\s+(.+)$',
    capability: 'alarm',
    action: 'set',
    extract: (t) => ({ time: t.match(/^alarm laga\s+(.+)$/i)![1] }),
  },
  // English patterns
  {
    id: 'call',
    pattern: '^call\\s+(.+)$',
    capability: 'phone',
    action: 'place',
    extract: (t) => ({ target: t.match(/^call\s+(.+)$/i)![1] }),
  },
  {
    id: 'text',
    pattern: '^(?:text|message)\\s+(\\S+)\\s+(.+)$',
    capability: 'sms',
    action: 'send',
    extract: (t) => {
      const m = t.match(/^(?:text|message)\s+(\S+)\s+(.+)$/i)!;
      return { target: m[1], message: m[2] };
    },
  },
  {
    id: 'text-short',
    pattern: '^(?:text|message)\\s+(\\S+)$',
    capability: 'sms',
    action: 'send',
    extract: (t) => ({ target: t.match(/^(?:text|message)\s+(\S+)$/i)![1] }),
  },
  {
    id: 'alarm',
    pattern: '^(?:set alarm|alarm)\\s+(.+)$',
    capability: 'alarm',
    action: 'set',
    extract: (t) => ({ time: t.match(/^(?:set alarm|alarm)\s+(.+)$/i)![1] }),
  },
  {
    id: 'navigate',
    pattern: '^(?:navigate to|take me to|directions to)\\s+(.+)$',
    capability: 'location',
    action: 'navigate',
    extract: (t) => ({
      destination: t.match(/^(?:navigate to|take me to|directions to)\s+(.+)$/i)![1],
    }),
  },
  {
    id: 'toggle-on',
    pattern: '^turn on\\s+(.+)$',
    capability: 'iot',
    action: 'toggle',
    extract: (t) => ({ device: t.match(/^turn on\s+(.+)$/i)![1], state: 'on' }),
  },
  {
    id: 'toggle-off',
    pattern: '^turn off\\s+(.+)$',
    capability: 'iot',
    action: 'toggle',
    extract: (t) => ({ device: t.match(/^turn off\s+(.+)$/i)![1], state: 'off' }),
  },
  {
    id: 'open',
    pattern: '^open\\s+(.+)$',
    capability: 'app',
    action: 'open',
    extract: (t) => ({ app: t.match(/^open\s+(.+)$/i)![1] }),
  },
  {
    id: 'play',
    pattern: '^play\\s+(.+)$',
    capability: 'media',
    action: 'play',
    extract: (t) => ({ media: t.match(/^play\s+(.+)$/i)![1] }),
  },
  {
    id: 'stop',
    pattern: '^(?:stop|pause)$',
    capability: 'media',
    action: 'pause',
    extract: () => ({}),
  },
  {
    id: 'search',
    pattern: '^(?:search|look up)\\s+(.+)$',
    capability: 'search',
    action: 'query',
    extract: (t) => ({ query: t.match(/^(?:search|look up)\s+(.+)$/i)![1] }),
  },
  {
    id: 'remind',
    pattern: '^remind me\\s+(.+)$',
    capability: 'reminder',
    action: 'set',
    extract: (t) => ({ task: t.match(/^remind me\s+(.+)$/i)![1] }),
  },
  {
    id: 'email',
    pattern: '^send email to\\s+(.+)$',
    capability: 'email',
    action: 'compose',
    extract: (t) => ({ to: t.match(/^send email to\s+(.+)$/i)![1] }),
  },
  {
    id: 'check',
    pattern: '^check\\s+(.+)$',
    capability: 'info',
    action: 'check',
    extract: (t) => ({ thing: t.match(/^check\s+(.+)$/i)![1] }),
  },
  {
    id: 'show',
    pattern: '^show\\s+(.+)$',
    capability: 'display',
    action: 'show',
    extract: (t) => ({ thing: t.match(/^show\s+(.+)$/i)![1] }),
  },
];

const compiledPatterns = patterns.map((p) => ({ ...p, regex: new RegExp(p.pattern, 'i') }));

export class CommandGrammar {
  match(text: string): DeviceIntent | null {
    const normalized = text.trim().toLowerCase();
    for (const p of compiledPatterns) {
      if (p.regex.test(normalized)) {
        const params = p.extract ? p.extract(normalized) : {};
        return { capability: p.capability, action: p.action, params };
      }
    }
    return null;
  }
}
