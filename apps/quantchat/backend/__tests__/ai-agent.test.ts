import { describe, it, expect } from 'vitest';
import type { AIEngine } from '@quant/ai';
import {
  analyzeStyle,
  extractKeyTopics,
  detectLanguage,
  prioritizeNotifications,
  QuantAIAgent,
  type ChatMessage,
} from '../lib/ai-agent';

// ============================================================================
// QC-F-519 — QuantAIAgent's deterministic template fallback labelled
// hand-written canned output as AI-generated (isAIGenerated:true), and the
// auto-reply path delivered canned text to third parties as a REAL message
// in the user's name. The fallback is DELETED (QC-F-465 precedent): every
// AI method now fails honestly with 503 AI_UNAVAILABLE when real inference
// is unavailable (no engine / engine throws / empty content / empty parse).
// The ONLY exception is summarize with 0 messages — a factual empty result
// flagged isAIGenerated:false, never badged as AI.
//
// Negative control: on the original code the "AI unavailable" describe
// FAILS (methods resolve with canned results flagged isAIGenerated:true),
// the empty-parse cases FAIL (templates backfill the parse), and the
// 0-message case FAILS (isAIGenerated was true). The stub-engine success
// cases and the deterministic-helper controls PASS on both versions.
// ============================================================================

const convo: ChatMessage[] = [
  { sender: 'alice', content: 'hey are we still on for tonight?', isSelf: false },
  { sender: 'me', content: 'yeah for sure lol gonna be fun', isSelf: true },
  { sender: 'alice', content: 'awesome, what time works for dinner?', isSelf: false },
];

// --- Stable stub engines (module-level shapes; brief §8 band aakar) --------
function stubEngine(content: string): AIEngine {
  return { infer: async () => ({ content }) } as unknown as AIEngine;
}
function throwingEngine(): AIEngine {
  return {
    infer: async () => {
      throw new Error('provider down');
    },
  } as unknown as AIEngine;
}

const UNAVAILABLE = {
  statusCode: 503,
  code: 'AI_UNAVAILABLE',
  message: 'AI is unavailable right now',
};

async function expectUnavailable(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject(UNAVAILABLE);
}

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

describe('detectLanguage (12.6 helper — prepares real inference, kept)', () => {
  it('detects script-based languages', () => {
    expect(detectLanguage('こんにちは')).toBe('ja');
    expect(detectLanguage('Привет')).toBe('ru');
    expect(detectLanguage('你好世界')).toBe('zh');
  });

  it('detects latin languages via word hints', () => {
    expect(detectLanguage('hola amigo como estas')).toBe('es');
    expect(detectLanguage('the quick brown fox')).toBe('en');
  });
});

describe('prioritizeNotifications (12.5 — deterministic, no AI claim, kept)', () => {
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

// ---------------------------------------------------------------------------
// T-519-1: every AI method rejects 503 AI_UNAVAILABLE in all three failure
// shapes — (F-a) no engine, (F-b) engine throws, (F-c) engine returns
// empty/whitespace content. No result object is ever produced.
// ---------------------------------------------------------------------------
describe('QuantAIAgent — AI unavailable fails honestly (QC-F-519, T-519-1)', () => {
  const failingAgents: Array<[string, QuantAIAgent]> = [
    ['no engine', new QuantAIAgent()],
    ['throwing engine', new QuantAIAgent(throwingEngine())],
    ['empty-content engine', new QuantAIAgent(stubEngine('   '))],
  ];

  for (const [label, agent] of failingAgents) {
    it(`autoReply rejects (${label})`, async () => {
      await expectUnavailable(
        agent.autoReply({ conversationId: 'c1', incomingMessage: 'hi there', context: convo }, 'user1'),
      );
    });

    it(`summarize (non-empty) rejects (${label})`, async () => {
      await expectUnavailable(agent.summarize({ conversationId: 'c1', messages: convo }, 'user1'));
    });

    it(`suggestions rejects (${label})`, async () => {
      await expectUnavailable(
        agent.suggestions({ conversationId: 'c1', messages: convo, draft: 'din' }, 'user1'),
      );
    });

    it(`translate rejects (${label})`, async () => {
      await expectUnavailable(agent.translate({ text: 'hello', targetLanguage: 'fr' }, 'user1'));
    });

    it(`generateContent rejects (${label})`, async () => {
      await expectUnavailable(
        agent.generateContent({ type: 'caption', context: 'beach day', count: 3 }, 'user1'),
      );
    });
  }
});

// ---------------------------------------------------------------------------
// T-519-2 (C2): a REAL inference reply that parses to zero usable lines is
// still a failure — the deleted canned banks must not backfill it.
// ---------------------------------------------------------------------------
describe('QuantAIAgent — empty parse is a failure, not a canned backfill (T-519-2)', () => {
  it('suggestions rejects when the AI reply parses to no lines', async () => {
    const agent = new QuantAIAgent(stubEngine('1.\n2.'));
    await expectUnavailable(agent.suggestions({ conversationId: 'c1', messages: convo }, 'user1'));
  });

  it('generateContent rejects when the AI reply parses to no lines', async () => {
    const agent = new QuantAIAgent(stubEngine('1.\n2.'));
    await expectUnavailable(
      agent.generateContent({ type: 'caption', context: 'beach day', count: 3 }, 'user1'),
    );
  });
});

// ---------------------------------------------------------------------------
// T-519-3: the single honest-empty exception — summarize with 0 messages
// resolves factually with isAIGenerated:false, even with no engine at all.
// ---------------------------------------------------------------------------
describe('QuantAIAgent — summarize honest-empty exception (T-519-3)', () => {
  it('0 messages resolves unflagged even with no engine', async () => {
    const agent = new QuantAIAgent();
    const res = await agent.summarize({ conversationId: 'c1', messages: [] }, 'user1');
    expect(res).toEqual({
      summary: 'No messages to summarize yet.',
      keyTopics: [],
      messageCount: 0,
      isAIGenerated: false,
    });
  });
});

// ---------------------------------------------------------------------------
// T-519-4: the real-inference path is unchanged — results carry
// isAIGenerated:true, confidence 0.9 where it always did, caps hold.
// ---------------------------------------------------------------------------
describe('QuantAIAgent — real inference path unchanged (T-519-4)', () => {
  it('autoReply returns the AI reply flagged, confidence 0.9', async () => {
    const agent = new QuantAIAgent(stubEngine('sounds perfect, see you at 8'));
    const res = await agent.autoReply(
      { conversationId: 'c1', incomingMessage: 'hi there', context: convo },
      'user1',
    );
    expect(res).toEqual({
      content: 'sounds perfect, see you at 8',
      isAIGenerated: true,
      confidence: 0.9,
    });
  });

  it('summarize returns the AI summary with real key topics', async () => {
    const agent = new QuantAIAgent(stubEngine('Alice and me planned dinner tonight.'));
    const res = await agent.summarize({ conversationId: 'c1', messages: convo }, 'user1');
    expect(res.summary).toBe('Alice and me planned dinner tonight.');
    expect(res.messageCount).toBe(3);
    expect(res.isAIGenerated).toBe(true);
    expect(res.keyTopics).toEqual(extractKeyTopics(convo));
  });

  it('suggestions parses lines and caps at 3', async () => {
    const agent = new QuantAIAgent(stubEngine('One\nTwo\nThree\nFour'));
    const res = await agent.suggestions({ conversationId: 'c1', messages: convo }, 'user1');
    expect(res.suggestions).toEqual(['One', 'Two', 'Three']);
    expect(res.isAIGenerated).toBe(true);
  });

  it('translate returns the AI translation flagged, confidence 0.9', async () => {
    const agent = new QuantAIAgent(stubEngine('bonjour'));
    const res = await agent.translate({ text: 'hello', targetLanguage: 'fr' }, 'user1');
    expect(res.translatedText).toBe('bonjour');
    expect(res.detectedSourceLanguage).toBe('en');
    expect(res.targetLanguage).toBe('fr');
    expect(res.isAIGenerated).toBe(true);
    expect(res.confidence).toBe(0.9);
  });

  it('generateContent honours the requested count', async () => {
    const agent = new QuantAIAgent(stubEngine('Cap one\nCap two\nCap three'));
    const res = await agent.generateContent(
      { type: 'caption', context: 'beach day', count: 2 },
      'user1',
    );
    expect(res.suggestions).toEqual(['Cap one', 'Cap two']);
    expect(res.type).toBe('caption');
    expect(res.isAIGenerated).toBe(true);
  });
});
