import { describe, it, expect } from 'vitest';
import {
  runExtractionEval,
  ruleExtractorAdapter,
  llmExtractorAdapter,
  formatExtractionDashboard,
} from '../eval/extraction-eval';
import { LlmExtractionModel } from '../adapters/llm-extraction-model';

// A fake, subject-aware LLM: correctly attributes third-party/hypothetical/past.
function fakeSubjectAwareLlm(): LlmExtractionModel {
  const facts = (content: string): unknown[] => {
    const c = content.toLowerCase();
    if (c.includes('i live in patna'))
      return [{ slot: 'residence', value: 'Patna', subject: 'user', confidence: 0.9 }];
    if (c.includes('i work at openai'))
      return [{ slot: 'employer', value: 'OpenAI', subject: 'user', confidence: 0.9 }];
    if (c.includes('favorite language is rust'))
      return [{ slot: 'favourite:language', value: 'Rust', subject: 'user', confidence: 0.85 }];
    if (c.includes('brother lives in delhi'))
      return [{ slot: 'residence', value: 'Delhi', subject: 'brother', confidence: 0.8 }];
    if (c.includes('friend john works at google'))
      return [{ slot: 'employer', value: 'Google', subject: 'friend John', confidence: 0.8 }];
    if (c.includes('wish i lived in japan')) return [];
    if (c.includes('used to be interstellar'))
      return [
        {
          slot: 'favourite:movie',
          value: 'Interstellar',
          subject: 'user',
          temporal: 'past',
          confidence: 0.7,
        },
      ];
    return [];
  };
  const fetchImpl = (async (_url: string, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? '{}') as {
      messages: Array<{ role: string; content: string }>;
    };
    const userMsg = body.messages.find((m) => m.role === 'user')?.content ?? '';
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ facts: facts(userMsg) }) } }],
        usage: { total_tokens: 120 },
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
  return new LlmExtractionModel({ apiKey: 'sk-test', model: 'fake', fetch: fetchImpl });
}

describe('extraction quality eval', () => {
  it('scores the rule extractor and prints the dashboard', async () => {
    const rule = await runExtractionEval(ruleExtractorAdapter());
    const llm = await runExtractionEval(llmExtractorAdapter(fakeSubjectAwareLlm(), 'llm:fake'));

    // eslint-disable-next-line no-console
    console.log(formatExtractionDashboard([rule, llm]));

    // Rule extractor hallucinates on third-party ("John works at Google" is
    // stored user-owned by EntityExtractor) → precision < 1, ≥1 hallucination.
    expect(rule.hallucinations).toBeGreaterThanOrEqual(1);
    expect(rule.candidatePrecision).toBeLessThan(1);
    // Rule confidence is 1.0 but accuracy < 1 → overconfident → ECE > 0.
    expect(rule.ece).toBeGreaterThan(0);
  });

  it('subject-aware LLM avoids the third-party hallucination', async () => {
    const llm = await runExtractionEval(llmExtractorAdapter(fakeSubjectAwareLlm(), 'llm:fake'));
    // John/Google → subject-scoped (not user-owned) → not counted as user candidate.
    expect(llm.hallucinations).toBe(0);
    expect(llm.candidatePrecision).toBe(1);
    // Real recall on the user facts it should catch.
    expect(llm.candidateRecall).toBe(1);
    // It reports token cost (fake usage 120/turn).
    expect(llm.totalTokens).toBeGreaterThan(0);
  });

  it('computes a Brier score and average confidence', async () => {
    const llm = await runExtractionEval(llmExtractorAdapter(fakeSubjectAwareLlm(), 'llm:fake'));
    expect(llm.brier).toBeGreaterThanOrEqual(0);
    expect(llm.avgConfidence).toBeGreaterThan(0);
    expect(llm.avgConfidence).toBeLessThanOrEqual(1);
  });
});
