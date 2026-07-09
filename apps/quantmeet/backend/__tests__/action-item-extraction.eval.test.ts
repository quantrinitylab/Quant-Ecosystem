// ============================================================================
// Action-item extraction — measured baseline (issue #29 remainder)
//
// The commitments bridge (#31) fires only for items with resolved assignees —
// and the current parser NEVER produces one, even when the model's output
// clearly states who owns the task and by when. This eval freezes that fact
// as a measured baseline, exactly like safety-eval froze the 0% injection
// detection: better extraction must MOVE these numbers, not claim victory.
//
// Deterministic: the "model" is scripted with realistic LLM output. The
// variable under measurement is the PARSER (model output → ActionItem).
// ============================================================================

import { describe, it, expect } from 'vitest';
import { ActionItemsService } from '../services/action-items.service';
import type { TranscriptSegment } from '../services/transcript.service';

export const EXTRACTION_CORPUS_VERSION = 'meet-extract-v1';

interface ExpectedItem {
  titleIncludes: string;
  /** Display name the model output clearly assigns — null if unassigned. */
  assignee: string | null;
  /** Whether the model output clearly states a due date. */
  hasDueDate: boolean;
}

interface ExtractionCase {
  id: string;
  /** What a realistic LLM returns for this transcript. */
  modelOutput: string[];
  expected: ExpectedItem[];
}

const cases: ExtractionCase[] = [
  {
    id: 'assigned-with-due',
    modelOutput: ['Title: Send the launch deck | Assignee: Sanjeev | Due: Friday | Priority: high'],
    expected: [{ titleIncludes: 'launch deck', assignee: 'Sanjeev', hasDueDate: true }],
  },
  {
    id: 'two-owners',
    modelOutput: [
      'Title: Book the venue | Assignee: Priya | Due: 2026-07-15 | Priority: medium',
      'Title: Draft the invite | Assignee: Sanjeev | Due: none | Priority: low',
    ],
    expected: [
      { titleIncludes: 'venue', assignee: 'Priya', hasDueDate: true },
      { titleIncludes: 'invite', assignee: 'Sanjeev', hasDueDate: false },
    ],
  },
  {
    id: 'unassigned',
    modelOutput: ['Title: Investigate the latency spike | Assignee: none | Due: none'],
    expected: [{ titleIncludes: 'latency', assignee: null, hasDueDate: false }],
  },
  {
    id: 'prose-format',
    modelOutput: ['- Priya will follow up with legal by Tuesday about the contract'],
    expected: [{ titleIncludes: 'legal', assignee: 'Priya', hasDueDate: true }],
  },
];

const transcript: TranscriptSegment[] = [
  { participantId: 'p1', text: 'meeting talk', timestamp: 0 } as unknown as TranscriptSegment,
];

const fakePrisma = {
  meetingActionItem: {
    create: async () => ({}),
    findMany: async () => [],
    update: async () => ({}),
  },
};

async function runEval() {
  let titleHits = 0;
  let assigneeHits = 0;
  let assigneeTotal = 0;
  let dueHits = 0;
  let dueTotal = 0;
  let total = 0;

  for (const c of cases) {
    const svc = new ActionItemsService(fakePrisma as never, {
      generateText: async () => c.modelOutput.join('\n'),
    });
    const items = await svc.extractActionItems(transcript);

    for (const exp of c.expected) {
      total++;
      const match = items.find((i) =>
        i.title.toLowerCase().includes(exp.titleIncludes.toLowerCase()),
      );
      if (match) titleHits++;
      if (exp.assignee !== null) {
        assigneeTotal++;
        if (match?.assignee?.toLowerCase() === exp.assignee.toLowerCase()) assigneeHits++;
      }
      if (exp.hasDueDate) {
        dueTotal++;
        if (match?.dueDate) dueHits++;
      }
    }
  }

  return {
    titleRecall: titleHits / total,
    assigneeRecall: assigneeTotal ? assigneeHits / assigneeTotal : 1,
    dueDateRecall: dueTotal ? dueHits / dueTotal : 1,
    total,
    assigneeTotal,
    dueTotal,
  };
}

describe('action-item extraction baseline (meet-extract-v1)', () => {
  it('prints the extraction quality dashboard', async () => {
    const r = await runEval();
    console.log(`corpus: ${EXTRACTION_CORPUS_VERSION}`);
    console.log('=== Action-Item Extraction (parser baseline) ===');
    console.log(
      `title recall     ${(r.titleRecall * 100).toFixed(1)}%  (${r.total} expected items)`,
    );
    console.log(
      `assignee recall  ${(r.assigneeRecall * 100).toFixed(1)}%  (${r.assigneeTotal} assigned in model output)`,
    );
    console.log(
      `dueDate recall   ${(r.dueDateRecall * 100).toFixed(1)}%  (${r.dueTotal} dated in model output)`,
    );
    expect(r.total).toBeGreaterThan(0);
  });

  it('regression floor: titles are at least captured', async () => {
    const r = await runEval();
    expect(r.titleRecall).toBeGreaterThanOrEqual(0.75); // line-per-item parser keeps titles
  });

  it('honest gap: the parser DISCARDS assignees the model clearly provides (0%)', async () => {
    const r = await runEval();
    // The commitments bridge (#31) cannot fire until this number moves.
    // Better extraction must change THIS assertion with a corpus bump +
    // decision-log row — not claim improvement by intuition.
    expect(r.assigneeRecall).toBe(0);
  });

  it('honest gap: the parser discards due dates too (0%)', async () => {
    const r = await runEval();
    expect(r.dueDateRecall).toBe(0);
  });
});
