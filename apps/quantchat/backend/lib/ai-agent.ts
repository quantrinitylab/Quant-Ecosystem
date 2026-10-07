// ============================================================================
// QuantChat - Quant AI Agent core library (Task 12)
//
// Implements the Quant_AI_Agent capabilities (Requirement 11):
//   - 12.1 Contextual auto-reply that mirrors the user's communication style
//   - 12.2 Conversation summarization (≤50 messages)
//   - 12.3 Reply suggestions (ALWAYS ≤ 3)
//   - 12.5 Notification prioritization + low-priority daily digest batching
//   - 12.6 Translation with source-language auto-detection
//   - 12.7 Content creation (caption / story-text / reel-description)
//   - 12.8 AI-generated labelling invariant (isAIGenerated:true on all output)
//   - 12.9 Auto-reply cancellation manager
//
// Every operation prefers the real @quant/ai inference pipeline when an AIEngine
// is supplied AND a provider is configured; otherwise it falls back to fully
// deterministic templates so the routes remain functional without live ML.
// ============================================================================

import { z } from 'zod';
import type { AIEngine } from '@quant/ai';

// ----------------------------------------------------------------------------
// Shared message shape + schemas
// ----------------------------------------------------------------------------

export const ChatMessageSchema = z.object({
  sender: z.string(),
  content: z.string(),
  /** True when this message was authored by the requesting user (style sample). */
  isSelf: z.boolean().optional(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const AutoReplyInputSchema = z.object({
  conversationId: z.string().min(1),
  incomingMessage: z.string().min(1),
  // Recent conversation context, oldest → newest. Capped to 50 for relevance.
  context: z.array(ChatMessageSchema).max(50).optional().default([]),
});
export type AutoReplyInput = z.infer<typeof AutoReplyInputSchema>;

export const SummarizeInputSchema = z.object({
  conversationId: z.string().min(1),
  messages: z.array(ChatMessageSchema).max(50),
});
export type SummarizeInput = z.infer<typeof SummarizeInputSchema>;

export const SuggestionsInputSchema = z.object({
  conversationId: z.string().min(1),
  messages: z.array(ChatMessageSchema).max(50).optional().default([]),
  draft: z.string().optional(),
});
export type SuggestionsInput = z.infer<typeof SuggestionsInputSchema>;

export const TranslateInputSchema = z.object({
  text: z.string().min(1),
  targetLanguage: z.string().min(2),
});
export type TranslateInput = z.infer<typeof TranslateInputSchema>;

export const CONTENT_TYPES = ['caption', 'story-text', 'reel-description'] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const GenerateContentInputSchema = z.object({
  type: z.enum(CONTENT_TYPES),
  context: z.string().min(1),
  count: z.number().int().min(1).max(5).optional().default(3),
});
export type GenerateContentInput = z.infer<typeof GenerateContentInputSchema>;

export const NotificationItemSchema = z.object({
  id: z.string(),
  category: z.string(),
  title: z.string().optional().default(''),
  body: z.string().optional().default(''),
});
export type NotificationItem = z.infer<typeof NotificationItemSchema>;

export const PrioritizeInputSchema = z.object({
  notifications: z.array(NotificationItemSchema),
});
export type PrioritizeInput = z.infer<typeof PrioritizeInputSchema>;

// ----------------------------------------------------------------------------
// Result shapes
// ----------------------------------------------------------------------------

export interface AutoReplyResult {
  content: string;
  isAIGenerated: true;
  confidence: number;
}

export interface SummaryResult {
  summary: string;
  keyTopics: string[];
  messageCount: number;
  isAIGenerated: true;
}

export interface SuggestionsResult {
  suggestions: string[]; // ALWAYS ≤ 3
  isAIGenerated: true;
}

export interface TranslationResult {
  translatedText: string;
  detectedSourceLanguage: string;
  targetLanguage: string;
  isAIGenerated: true;
  confidence: number;
}

export interface GeneratedContentResult {
  type: ContentType;
  suggestions: string[];
  isAIGenerated: true;
}

export interface PrioritizedNotifications {
  highPriority: Array<NotificationItem & { priority: 'high' }>;
  digest: {
    count: number;
    items: Array<NotificationItem & { priority: 'low' }>;
    summary: string;
  };
}

// ----------------------------------------------------------------------------
// Style analysis (deterministic) — used to mirror the user's voice
// ----------------------------------------------------------------------------

export interface StyleProfile {
  usesEmoji: boolean;
  emoji: string;
  avgLength: number;
  casual: boolean;
  exclaims: boolean;
  lowercase: boolean;
}

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u2764\u2728]/u;
const CASUAL_TOKENS = ['lol', 'haha', 'lmao', 'omg', 'yeah', 'yep', 'nah', 'gonna', 'wanna', 'u'];

function firstEmoji(text: string): string | null {
  const match = text.match(EMOJI_RE);
  return match ? match[0] : null;
}

/** Derive a deterministic style profile from the user's own messages. */
export function analyzeStyle(samples: ChatMessage[]): StyleProfile {
  const own = samples.filter((m) => m.isSelf);
  const pool = own.length > 0 ? own : samples;

  if (pool.length === 0) {
    return {
      usesEmoji: false,
      emoji: '',
      avgLength: 0,
      casual: false,
      exclaims: false,
      lowercase: false,
    };
  }

  let emojiCount = 0;
  let exclaimCount = 0;
  let lowercaseCount = 0;
  let casualCount = 0;
  let totalLength = 0;
  let detectedEmoji = '';

  for (const m of pool) {
    const text = m.content;
    totalLength += text.length;
    const e = firstEmoji(text);
    if (e) {
      emojiCount++;
      if (!detectedEmoji) detectedEmoji = e;
    }
    if (text.includes('!')) exclaimCount++;
    const letters = text.replace(/[^a-zA-Z]/g, '');
    if (letters.length > 0 && letters === letters.toLowerCase()) lowercaseCount++;
    const lower = text.toLowerCase();
    if (CASUAL_TOKENS.some((t) => new RegExp(`\\b${t}\\b`).test(lower))) casualCount++;
  }

  const half = pool.length / 2;
  return {
    usesEmoji: emojiCount > 0,
    emoji: detectedEmoji || '\u2728',
    avgLength: Math.round(totalLength / pool.length),
    casual: casualCount >= 1 || lowercaseCount > half,
    exclaims: exclaimCount > half,
    lowercase: lowercaseCount > half,
  };
}

function applyStyle(base: string, style: StyleProfile): string {
  let out = base;
  if (style.lowercase) out = out.toLowerCase();
  if (style.exclaims) out = out.replace(/\.?$/, '!');
  if (style.usesEmoji && style.emoji) out = `${out} ${style.emoji}`.trim();
  return out;
}

// ----------------------------------------------------------------------------
// Deterministic template generators (fallbacks)
// ----------------------------------------------------------------------------

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'to',
  'of',
  'in',
  'on',
  'at',
  'for',
  'with',
  'about',
  'as',
  'by',
  'from',
  'i',
  'you',
  'he',
  'she',
  'it',
  'we',
  'they',
  'me',
  'him',
  'her',
  'them',
  'my',
  'your',
  'this',
  'that',
  'these',
  'those',
  'do',
  'does',
  'did',
  'have',
  'has',
  'had',
  'will',
  'would',
  'can',
  'could',
  'should',
  'so',
  'just',
  'not',
  'no',
  'yes',
  'ok',
  'okay',
  'im',
  'its',
  'how',
  'what',
  'when',
  'where',
  'who',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/** Rank meaningful tokens by frequency; deterministic tie-break by first seen. */
export function extractKeyTopics(messages: ChatMessage[], limit = 5): string[] {
  const counts = new Map<string, number>();
  const order = new Map<string, number>();
  let seq = 0;
  for (const m of messages) {
    for (const tok of tokenize(m.content)) {
      counts.set(tok, (counts.get(tok) ?? 0) + 1);
      if (!order.has(tok)) order.set(tok, seq++);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || order.get(a[0])! - order.get(b[0])!)
    .slice(0, limit)
    .map(([word]) => word);
}

export function templateSummary(input: SummarizeInput): SummaryResult {
  const { messages } = input;
  const keyTopics = extractKeyTopics(messages);
  const participants = [...new Set(messages.map((m) => m.sender))];
  const last = messages[messages.length - 1];

  let summary: string;
  if (messages.length === 0) {
    summary = 'No messages to summarize yet.';
  } else {
    const who =
      participants.length <= 1
        ? (participants[0] ?? 'the user')
        : `${participants.slice(0, -1).join(', ')} and ${participants[participants.length - 1]}`;
    const topicPart = keyTopics.length > 0 ? ` about ${keyTopics.slice(0, 3).join(', ')}` : '';
    const lastPart = last ? ` Most recent: "${truncate(last.content, 80)}".` : '';
    summary = `Conversation between ${who}${topicPart} across ${messages.length} message${
      messages.length === 1 ? '' : 's'
    }.${lastPart}`;
  }

  return { summary, keyTopics, messageCount: messages.length, isAIGenerated: true };
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}\u2026` : text;
}

function isQuestion(text: string): boolean {
  return (
    /\?\s*$/.test(text.trim()) ||
    /^\s*(what|how|when|where|why|who|can|could|do|does|are|is)\b/i.test(text)
  );
}

export function templateAutoReply(input: AutoReplyInput): AutoReplyResult {
  const style = analyzeStyle(input.context);
  const incoming = input.incomingMessage.trim();

  let base: string;
  if (isQuestion(incoming)) {
    base = 'Good question, let me get back to you on that.';
  } else if (/\b(thanks|thank you|thx)\b/i.test(incoming)) {
    base = "You're welcome.";
  } else if (/\b(sorry|apolog)/i.test(incoming)) {
    base = 'No worries at all.';
  } else if (/\b(hi|hey|hello|yo)\b/i.test(incoming)) {
    base = 'Hey, good to hear from you.';
  } else if (/\b(bye|later|gtg|goodnight|good night)\b/i.test(incoming)) {
    base = 'Talk soon, take care.';
  } else {
    base = 'Got it, thanks for letting me know.';
  }

  return {
    content: applyStyle(base, style),
    isAIGenerated: true,
    confidence: input.context.length > 0 ? 0.55 : 0.4,
  };
}

export function templateSuggestions(input: SuggestionsInput): string[] {
  const last =
    [...input.messages].reverse().find((m) => !m.isSelf) ??
    input.messages[input.messages.length - 1];
  const text = last?.content ?? '';

  let suggestions: string[];
  if (isQuestion(text)) {
    suggestions = [
      'Yes, definitely!',
      'Let me think about it.',
      "I'm not sure, what do you think?",
    ];
  } else if (/\b(thanks|thank you)\b/i.test(text)) {
    suggestions = ['Anytime!', 'No problem at all.', 'Glad to help.'];
  } else if (/\b(hi|hey|hello)\b/i.test(text)) {
    suggestions = ['Hey there!', 'Hi! How are you?', "What's up?"];
  } else if (/\b(meet|plan|tonight|tomorrow|weekend)\b/i.test(text)) {
    suggestions = ['Sounds good to me!', 'What time works?', 'Let me check my schedule.'];
  } else {
    suggestions = ['Got it!', 'Sounds good.', 'Tell me more.'];
  }

  // Property 31 invariant: never return more than 3 suggestions.
  return suggestions.slice(0, 3);
}

export function templateContent(input: GenerateContentInput): string[] {
  const topics = extractKeyTopics([{ sender: 'ctx', content: input.context }], 3);
  const subject = topics[0] ?? (input.context.split(/\s+/).slice(0, 3).join(' ') || 'this moment');

  const banks: Record<ContentType, string[]> = {
    caption: [
      `Living for ${subject}. \u2728`,
      `When ${subject} just hits different.`,
      `${capitalize(subject)} vibes only.`,
      `Caught in the moment: ${subject}.`,
      `No caption needed, but here's one about ${subject}.`,
    ],
    'story-text': [
      `Today was all about ${subject} \uD83D\uDC7D`,
      `A little ${subject} to brighten your feed.`,
      `Swipe up for more ${subject}!`,
      `${capitalize(subject)} season is officially open.`,
      `POV: you found the best ${subject}.`,
    ],
    'reel-description': [
      `Everything you need to know about ${subject} in 30 seconds.`,
      `Watch till the end for the ${subject} twist!`,
      `${capitalize(subject)} like you've never seen before.`,
      `Saving this ${subject} reel for later? Same.`,
      `Tag someone who needs to see this ${subject} moment.`,
    ],
  };

  return banks[input.type].slice(0, input.count);
}

function capitalize(text: string): string {
  return text.length === 0 ? text : text[0]!.toUpperCase() + text.slice(1);
}

// ----------------------------------------------------------------------------
// Language detection + template translation (deterministic fallback)
// ----------------------------------------------------------------------------

const LANG_WORD_HINTS: Record<string, string[]> = {
  es: ['hola', 'gracias', 'por favor', 'como', 'estas', 'bien', 'amigo', 'que', 'donde', 'cuando'],
  fr: ['bonjour', 'merci', 'oui', 'non', 'comment', 'vous', 'salut', 'ça va', 'pourquoi'],
  de: ['hallo', 'danke', 'bitte', 'guten', 'wie', 'gut', 'nicht', 'und', 'ist', 'das'],
  it: ['ciao', 'grazie', 'prego', 'come', 'bene', 'amico', 'perché'],
  pt: ['olá', 'obrigado', 'obrigada', 'por favor', 'como', 'bem', 'amigo'],
};

export function detectLanguage(text: string): string {
  if (/[\u4e00-\u9fff]/.test(text)) return 'zh';
  if (/[\u3040-\u30ff]/.test(text)) return 'ja';
  if (/[\uac00-\ud7af]/.test(text)) return 'ko';
  if (/[\u0600-\u06ff]/.test(text)) return 'ar';
  if (/[\u0400-\u04ff]/.test(text)) return 'ru';
  if (/[\u0900-\u097f]/.test(text)) return 'hi';

  const lower = ` ${text.toLowerCase()} `;
  let best = 'en';
  let bestScore = 0;
  for (const [lang, hints] of Object.entries(LANG_WORD_HINTS)) {
    let score = 0;
    for (const hint of hints) {
      if (lower.includes(` ${hint} `) || lower.includes(`${hint} `)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = lang;
    }
  }
  return best;
}

// Minimal phrase dictionary for the deterministic translation fallback.
const PHRASE_TABLE: Record<string, Record<string, string>> = {
  es: {
    hello: 'hola',
    hi: 'hola',
    thanks: 'gracias',
    'thank you': 'gracias',
    yes: 'sí',
    no: 'no',
    'good morning': 'buenos días',
    'how are you': 'cómo estás',
  },
  fr: {
    hello: 'bonjour',
    hi: 'salut',
    thanks: 'merci',
    'thank you': 'merci',
    yes: 'oui',
    no: 'non',
    'good morning': 'bonjour',
    'how are you': 'comment ça va',
  },
  de: {
    hello: 'hallo',
    hi: 'hallo',
    thanks: 'danke',
    'thank you': 'danke',
    yes: 'ja',
    no: 'nein',
    'good morning': 'guten morgen',
    'how are you': 'wie geht es dir',
  },
};

export function templateTranslate(input: TranslateInput): TranslationResult {
  const detected = detectLanguage(input.text);
  const target = input.targetLanguage.slice(0, 2).toLowerCase();

  // Already in target language → return as-is with high confidence.
  if (detected === target) {
    return {
      translatedText: input.text,
      detectedSourceLanguage: detected,
      targetLanguage: target,
      isAIGenerated: true,
      confidence: 0.95,
    };
  }

  const table = PHRASE_TABLE[target];
  let translated = input.text;
  let matched = false;
  if (table) {
    const lowered = input.text
      .toLowerCase()
      .trim()
      .replace(/[.!?]+$/, '');
    if (table[lowered]) {
      translated = table[lowered]!;
      matched = true;
    } else {
      // Word-by-word best-effort substitution.
      translated = input.text.replace(/[a-zA-Z]+/g, (word) => {
        const hit = table[word.toLowerCase()];
        if (hit) matched = true;
        return hit ?? word;
      });
    }
  }

  if (!matched) {
    // Deterministic, clearly-labelled fallback so callers still get output.
    translated = `[${target}] ${input.text}`;
  }

  return {
    translatedText: translated,
    detectedSourceLanguage: detected,
    targetLanguage: target,
    isAIGenerated: true,
    confidence: matched ? 0.6 : 0.3,
  };
}

// ----------------------------------------------------------------------------
// Notification prioritization (deterministic)
// ----------------------------------------------------------------------------

const HIGH_PRIORITY_CATEGORIES = new Set(['CALLS', 'MESSAGES', 'STREAKS', 'SYSTEM']);

export function prioritizeNotifications(input: PrioritizeInput): PrioritizedNotifications {
  const highPriority: PrioritizedNotifications['highPriority'] = [];
  const lowItems: PrioritizedNotifications['digest']['items'] = [];

  for (const n of input.notifications) {
    if (HIGH_PRIORITY_CATEGORIES.has(n.category.toUpperCase())) {
      highPriority.push({ ...n, priority: 'high' });
    } else {
      lowItems.push({ ...n, priority: 'low' });
    }
  }

  const categories = [...new Set(lowItems.map((i) => i.category.toLowerCase()))];
  const summary =
    lowItems.length === 0
      ? 'No low-priority notifications to digest.'
      : `Daily digest: ${lowItems.length} update${lowItems.length === 1 ? '' : 's'}${
          categories.length > 0 ? ` (${categories.join(', ')})` : ''
        }.`;

  return {
    highPriority,
    digest: { count: lowItems.length, items: lowItems, summary },
  };
}

// ----------------------------------------------------------------------------
// QuantAIAgent — orchestrates real @quant/ai with deterministic fallback
// ----------------------------------------------------------------------------

export class QuantAIAgent {
  constructor(private readonly ai?: AIEngine) {}

  private async tryInfer(
    prompt: string,
    systemPrompt: string,
    userId: string,
    feature: string,
    temperature = 0.7,
  ): Promise<string | null> {
    if (!this.ai) return null;
    try {
      const res = await this.ai.infer({
        prompt,
        systemPrompt,
        userId,
        app: 'quantchat',
        feature,
        temperature,
      } as Parameters<AIEngine['infer']>[0]);
      const content = res.content?.trim();
      return content && content.length > 0 ? content : null;
    } catch {
      // No provider configured / inference failed → fall back to templates.
      return null;
    }
  }

  async autoReply(input: AutoReplyInput, userId: string): Promise<AutoReplyResult> {
    const style = analyzeStyle(input.context);
    const convoText = input.context.map((m) => `${m.sender}: ${m.content}`).join('\n');
    const styleHint = `Match this style — ${style.casual ? 'casual' : 'neutral'}, ${
      style.usesEmoji ? 'uses emoji' : 'no emoji'
    }, average length ${style.avgLength} chars.`;

    const aiContent = await this.tryInfer(
      `Recent conversation:\n${convoText}\n\nIncoming message: "${input.incomingMessage}"\n\n${styleHint}\nWrite a single short reply on the user's behalf. Reply only with the message text.`,
      "You reply to chat messages on the user's behalf, mirroring their communication style. Keep it short and natural.",
      userId,
      'auto-reply',
      0.6,
    );

    if (aiContent) {
      return { content: aiContent, isAIGenerated: true, confidence: 0.9 };
    }
    return templateAutoReply(input);
  }

  async summarize(input: SummarizeInput, userId: string): Promise<SummaryResult> {
    const fallback = templateSummary(input);
    if (input.messages.length === 0) return fallback;

    const convoText = input.messages.map((m) => `${m.sender}: ${m.content}`).join('\n');
    const aiContent = await this.tryInfer(
      `Summarize this conversation in 1-2 sentences:\n\n${convoText}`,
      'You write concise, neutral summaries of chat conversations.',
      userId,
      'summarize',
      0.3,
    );

    if (aiContent) {
      return {
        summary: aiContent,
        keyTopics: fallback.keyTopics,
        messageCount: input.messages.length,
        isAIGenerated: true,
      };
    }
    return fallback;
  }

  async suggestions(input: SuggestionsInput, userId: string): Promise<SuggestionsResult> {
    const convoText = input.messages.map((m) => `${m.sender}: ${m.content}`).join('\n');
    const draftPart = input.draft ? `\nThe user is currently typing: "${input.draft}".` : '';
    const aiContent = await this.tryInfer(
      `Conversation:\n${convoText}${draftPart}\n\nSuggest up to 3 short reply options, one per line, no numbering.`,
      'You write short, natural chat reply suggestions.',
      userId,
      'suggestions',
      0.7,
    );

    let suggestions: string[];
    if (aiContent) {
      suggestions = aiContent
        .split('\n')
        .map((line) => line.replace(/^[\d]+[.)\s]+|^[-*\u2022]\s*/, '').trim())
        .filter((line) => line.length > 0)
        .slice(0, 3);
      if (suggestions.length === 0) suggestions = templateSuggestions(input);
    } else {
      suggestions = templateSuggestions(input);
    }

    // Property 31 invariant: hard cap at 3.
    return { suggestions: suggestions.slice(0, 3), isAIGenerated: true };
  }

  async translate(input: TranslateInput, userId: string): Promise<TranslationResult> {
    const detected = detectLanguage(input.text);
    const target = input.targetLanguage.slice(0, 2).toLowerCase();

    const aiContent = await this.tryInfer(
      `Translate the following text to ${target}. Reply with only the translation.\n\n"${input.text}"`,
      'You are a precise translator.',
      userId,
      'translate',
      0.2,
    );

    if (aiContent) {
      return {
        translatedText: aiContent,
        detectedSourceLanguage: detected,
        targetLanguage: target,
        isAIGenerated: true,
        confidence: 0.9,
      };
    }
    return templateTranslate(input);
  }

  async generateContent(
    input: GenerateContentInput,
    userId: string,
  ): Promise<GeneratedContentResult> {
    const labels: Record<ContentType, string> = {
      caption: 'photo captions',
      'story-text': 'story text overlays',
      'reel-description': 'reel descriptions',
    };
    const aiContent = await this.tryInfer(
      `Generate ${input.count} short ${labels[input.type]} based on: "${input.context}". One per line, no numbering.`,
      'You are a creative social-media copywriter for a Gen-Z messaging app with an alien aesthetic.',
      userId,
      'generate-content',
      0.9,
    );

    let suggestions: string[];
    if (aiContent) {
      suggestions = aiContent
        .split('\n')
        .map((line) => line.replace(/^[\d]+[.)\s]+|^[-*\u2022]\s*/, '').trim())
        .filter((line) => line.length > 0)
        .slice(0, input.count);
      if (suggestions.length === 0) suggestions = templateContent(input);
    } else {
      suggestions = templateContent(input);
    }

    return { type: input.type, suggestions, isAIGenerated: true };
  }
}
