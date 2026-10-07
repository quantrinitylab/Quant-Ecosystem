import { describe, it, expect } from 'vitest';
import {
  analyzeStyle,
  extractKeyTopics,
  templateSummary,
  templateAutoReply,
  templateSuggestions,
  templateContent,
  templateTranslate,
  detectLanguage,
  prioritizeNotifications,
  QuantAIAgent,
  type ChatMessage,
} from '../lib/ai-agent';

const convo: ChatMessage[] = [
  { sender: 'alice', content: 'hey are we still on for tonight?', isSelf: false },
  { sender: 'me', content: 'yeah for sure lol gonna be fun', isSelf: true },
  { sender: 'alice', content: 'awesome, what time works for dinner?', isSelf: false },
];

describe('analyzeStyle', () => {
  it('detects casual lowercase style from the user own messages', () => {
    const style = analyzeStyle(convo);
    expect(style.casual).toBe(true);
    expect(style.lowercase).toBe(true);
  });

  it('returns a neutral profile when there are no samples', () => {
    const style = analyzeStyle([]);
    expect(style.avgLength).toBe(0);
    expect(style.usesEmoji).toBe(false);
  });
});

describe('extractKeyTopics', () => {
  it('returns frequency-ranked meaningful tokens without stopwords', () => {
    const topics = extractKeyTopics(convo);
    expect(topics).not.toContain('are');
    expect(topics).not.toContain('we');
    expect(topics.length).toBeLessThanOrEqual(5);
  });

  it('is deterministic', () => {
    expect(extractKeyTopics(convo)).toEqual(extractKeyTopics(convo));
  });
});

describe('templateSummary (12.2)', () => {
  it('reports the exact message count and key topics', () => {
    const res = templateSummary({ conversationId: 'c1', messages: convo });
    expect(res.messageCount).toBe(3);
    expect(res.isAIGenerated).toBe(true);
    expect(Array.isArray(res.keyTopics)).toBe(true);
  });

  it('handles an empty conversation gracefully', () => {
    const res = templateSummary({ conversationId: 'c1', messages: [] });
    expect(res.messageCount).toBe(0);
    expect(res.summary).toMatch(/no messages/i);
  });
});

describe('templateAutoReply (12.1)', () => {
  it('mirrors a casual lowercase style', () => {
    const res = templateAutoReply({
      conversationId: 'c1',
      incomingMessage: 'what time works for dinner?',
      context: convo,
    });
    expect(res.isAIGenerated).toBe(true);
    expect(res.content).toBe(res.content.toLowerCase()); // lowercase style applied
    expect(res.confidence).toBeGreaterThan(0);
  });
});

describe('templateSuggestions (12.3 — Property 31)', () => {
  it('NEVER returns more than 3 suggestions', () => {
    for (const text of ['what time?', 'thanks!', 'hey', 'random text here', 'lets meet tonight']) {
      const res = templateSuggestions({
        conversationId: 'c1',
        messages: [{ sender: 'alice', content: text }],
      });
      expect(res.length).toBeLessThanOrEqual(3);
    }
  });
});

describe('templateContent (12.7)', () => {
  it('produces the requested count for each content type', () => {
    for (const type of ['caption', 'story-text', 'reel-description'] as const) {
      const out = templateContent({ type, context: 'sunset over the mountains', count: 3 });
      expect(out.length).toBe(3);
      expect(out.every((s) => s.length > 0)).toBe(true);
    }
  });
});

describe('detectLanguage + templateTranslate (12.6)', () => {
  it('detects script-based languages', () => {
    expect(detectLanguage('こんにちは')).toBe('ja');
    expect(detectLanguage('Привет')).toBe('ru');
    expect(detectLanguage('你好世界')).toBe('zh');
  });

  it('detects latin languages via word hints', () => {
    expect(detectLanguage('hola amigo como estas')).toBe('es');
    expect(detectLanguage('the quick brown fox')).toBe('en');
  });

  it('translates known phrases and always returns the target + source', () => {
    const res = templateTranslate({ text: 'hello', targetLanguage: 'es' });
    expect(res.translatedText).toBe('hola');
    expect(res.detectedSourceLanguage).toBe('en');
    expect(res.targetLanguage).toBe('es');
    expect(res.isAIGenerated).toBe(true);
  });

  it('returns text unchanged with high confidence when already in target language', () => {
    const res = templateTranslate({ text: 'the quick brown fox', targetLanguage: 'en' });
    expect(res.translatedText).toBe('the quick brown fox');
    expect(res.confidence).toBeGreaterThan(0.9);
  });
});

describe('prioritizeNotifications (12.5)', () => {
  it('separates high-priority items from a batched low-priority digest', () => {
    const res = prioritizeNotifications({
      notifications: [
        { id: '1', category: 'CALLS', title: 'Incoming call', body: '' },
        { id: '2', category: 'MESSAGES', title: 'New message', body: '' },
        { id: '3', category: 'REELS', title: 'New reel', body: '' },
        { id: '4', category: 'STORIES', title: 'New story', body: '' },
      ],
    });
    expect(res.highPriority.map((n) => n.id).sort()).toEqual(['1', '2']);
    expect(res.digest.count).toBe(2);
    expect(res.digest.items.every((i) => i.priority === 'low')).toBe(true);
  });

  it('produces an empty digest when there are no low-priority items', () => {
    const res = prioritizeNotifications({
      notifications: [{ id: '1', category: 'CALLS', title: 'call', body: '' }],
    });
    expect(res.digest.count).toBe(0);
  });
});

describe('QuantAIAgent fallback (Property 33 — AI label invariant)', () => {
  // No AIEngine injected → every method must use deterministic templates and
  // still flag output as AI-generated.
  const agent = new QuantAIAgent();

  it('autoReply falls back and is flagged AI-generated', async () => {
    const res = await agent.autoReply(
      { conversationId: 'c1', incomingMessage: 'hi there', context: convo },
      'user1',
    );
    expect(res.isAIGenerated).toBe(true);
    expect(res.content.length).toBeGreaterThan(0);
  });

  it('summarize is flagged AI-generated', async () => {
    const res = await agent.summarize({ conversationId: 'c1', messages: convo }, 'user1');
    expect(res.isAIGenerated).toBe(true);
  });

  it('suggestions are flagged AI-generated and capped at 3', async () => {
    const res = await agent.suggestions(
      { conversationId: 'c1', messages: convo, draft: 'din' },
      'user1',
    );
    expect(res.isAIGenerated).toBe(true);
    expect(res.suggestions.length).toBeLessThanOrEqual(3);
  });

  it('translate is flagged AI-generated', async () => {
    const res = await agent.translate({ text: 'hello', targetLanguage: 'fr' }, 'user1');
    expect(res.isAIGenerated).toBe(true);
    expect(res.translatedText).toBe('bonjour');
  });

  it('generateContent is flagged AI-generated', async () => {
    const res = await agent.generateContent(
      { type: 'caption', context: 'beach day', count: 3 },
      'user1',
    );
    expect(res.isAIGenerated).toBe(true);
    expect(res.suggestions.length).toBe(3);
  });
});
