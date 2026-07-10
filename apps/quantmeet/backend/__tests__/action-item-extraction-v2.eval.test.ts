// ============================================================================
// Action-item extraction — meet-extract-v2 (corpus expansion, issue #29)
//
// v1 (4 cases) proved the structured format works. v2 stresses the parser
// with what real models and real meetings actually produce: shuffled keys,
// alias keys (Owner/Due Date), numbered bullets, markdown bold, prose
// variants, hinglish, and no-item transcripts. Scenarios that the current
// parser is NOT expected to handle are marked knownHard and measured
// honestly — they are the map for MEET-T-002+, not hidden failures.
//
// v1 remains untouched (baselines are read-only); v2 is a NEW corpus.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { ActionItemsService } from '../services/action-items.service';
import type { TranscriptSegment } from '../services/transcript.service';

export const EXTRACTION_CORPUS_VERSION_V2 = 'meet-extract-v2';

interface ExpectedItem {
  titleIncludes: string;
  assignee: string | null;
  hasDueDate: boolean;
}

interface ExtractionCase {
  id: string;
  modelOutput: string[];
  expected: ExpectedItem[];
  knownHard?: boolean;
}

const cases: ExtractionCase[] = [
  // ── Structured variants the parser SHOULD handle ─────────────────────────
  {
    id: 'canonical',
    modelOutput: ['Title: Ship the beta | Assignee: Sanjeev | Due: Friday | Priority: high'],
    expected: [{ titleIncludes: 'beta', assignee: 'Sanjeev', hasDueDate: true }],
  },
  {
    id: 'shuffled-keys',
    modelOutput: [
      'Assignee: Priya | Title: Review the contract | Priority: medium | Due: 2026-07-20',
    ],
    expected: [{ titleIncludes: 'contract', assignee: 'Priya', hasDueDate: true }],
  },
  {
    id: 'due-date-alias',
    modelOutput: [
      'Title: Update the runbook | Assignee: Sanjeev | Due Date: Monday | Priority: low',
    ],
    expected: [{ titleIncludes: 'runbook', assignee: 'Sanjeev', hasDueDate: true }],
  },
  {
    id: 'none-fields',
    modelOutput: ['Title: Investigate flaky test | Assignee: none | Due: none | Priority: medium'],
    expected: [{ titleIncludes: 'flaky', assignee: null, hasDueDate: false }],
  },
  {
    id: 'extra-whitespace',
    modelOutput: [
      'Title:   Fix the login bug   |  Assignee:  Priya  |  Due:  tomorrow  | Priority: urgent',
    ],
    expected: [{ titleIncludes: 'login bug', assignee: 'Priya', hasDueDate: true }],
  },
  {
    id: 'multiple-items',
    modelOutput: [
      'Title: Draft the announcement | Assignee: Sanjeev | Due: Thursday | Priority: high',
      'Title: Set up the webinar | Assignee: Priya | Due: none | Priority: medium',
      'Title: Collect FAQs | Assignee: none | Due: none | Priority: low',
    ],
    expected: [
      { titleIncludes: 'announcement', assignee: 'Sanjeev', hasDueDate: true },
      { titleIncludes: 'webinar', assignee: 'Priya', hasDueDate: false },
      { titleIncludes: 'FAQs', assignee: null, hasDueDate: false },
    ],
  },
  // ── Prose variants ────────────────────────────────────────────────────────
  {
    id: 'prose-simple',
    modelOutput: ['- Sanjeev will prepare the demo environment by Wednesday'],
    expected: [{ titleIncludes: 'demo environment', assignee: 'Sanjeev', hasDueDate: true }],
  },
  {
    id: 'prose-no-date',
    modelOutput: ['- Priya will sync with the design team'],
    expected: [{ titleIncludes: 'design team', assignee: 'Priya', hasDueDate: false }],
  },
  {
    id: 'prose-numbered',
    modelOutput: ['1. Sanjeev will file the compliance report by month end'],
    expected: [{ titleIncludes: 'compliance', assignee: 'Sanjeev', hasDueDate: true }],
    // promoted out of known-hard by MEET-T-002 (numbered-bullet strip)
  },
  {
    id: 'markdown-bold',
    modelOutput: [
      '**Title: Publish the changelog | Assignee: Priya | Due: Friday | Priority: low**',
    ],
    expected: [{ titleIncludes: 'changelog', assignee: 'Priya', hasDueDate: true }],
    // promoted out of known-hard by MEET-T-002 (markdown-bold strip)
  },
  {
    id: 'prose-needs-to',
    modelOutput: ['- Sanjeev needs to renew the SSL certificates by July 20'],
    expected: [{ titleIncludes: 'SSL', assignee: 'Sanjeev', hasDueDate: true }],
    // promoted out of known-hard by MEET-T-002 ('needs to'/'should' aliases)
  },
  // ── Hinglish (the user base speaks this) ─────────────────────────────────
  {
    id: 'hinglish-karega',
    modelOutput: ['- Priya kal tak legal se baat karegi'],
    expected: [{ titleIncludes: 'legal', assignee: 'Priya', hasDueDate: true }],
    knownHard: true,
  },
  {
    id: 'hinglish-structured',
    modelOutput: [
      'Title: Vendor ko payment bhejna | Assignee: Sanjeev | Due: kal | Priority: high',
    ],
    expected: [{ titleIncludes: 'payment', assignee: 'Sanjeev', hasDueDate: true }],
  },
  // ── Noise / control ──────────────────────────────────────────────────────
  {
    id: 'no-items',
    modelOutput: [],
    expected: [],
  },
  {
    id: 'chatter-line',
    modelOutput: ['No action items were discussed in this meeting.'],
    expected: [], // an honest model preamble should NOT become a task
    // promoted out of known-hard by MEET-T-002 (chatter guard)
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

interface ScenarioResult {
  id: string;
  pass: boolean;
  knownHard: boolean;
  failures: string[];
}

async function runEval() {
  const results: ScenarioResult[] = [];
  let titleHits = 0;
  let titleTotal = 0;
  let assigneeHits = 0;
  let assigneeTotal = 0;
  let dueHits = 0;
  let dueTotal = 0;
  let phantomItems = 0;

  for (const c of cases) {
    const svc = new ActionItemsService(fakePrisma as never, {
      generateText: async () => c.modelOutput.join('\n'),
    });
    const items = c.modelOutput.length ? await svc.extractActionItems(transcript) : [];
    const failures: string[] = [];

    for (const exp of c.expected) {
      titleTotal++;
      const match = items.find((i) =>
        i.title.toLowerCase().includes(exp.titleIncludes.toLowerCase()),
      );
      if (match) titleHits++;
      else failures.push(`missing title ~"${exp.titleIncludes}"`);

      if (exp.assignee !== null) {
        assigneeTotal++;
        if (match?.assignee?.toLowerCase() === exp.assignee.toLowerCase()) assigneeHits++;
        else failures.push(`assignee ${match?.assignee ?? 'null'} ≠ ${exp.assignee}`);
      }
      if (exp.hasDueDate) {
        dueTotal++;
        if (match?.dueDate) dueHits++;
        else failures.push(`missing dueDate`);
      }
    }
    // Phantom detection: expected zero items but got some.
    if (c.expected.length === 0 && items.length > 0) {
      phantomItems += items.length;
      failures.push(`${items.length} phantom item(s)`);
    }

    results.push({
      id: c.id,
      pass: failures.length === 0,
      knownHard: c.knownHard ?? false,
      failures,
    });
  }

  return {
    results,
    titleRecall: titleTotal ? titleHits / titleTotal : 1,
    assigneeRecall: assigneeTotal ? assigneeHits / assigneeTotal : 1,
    dueDateRecall: dueTotal ? dueHits / dueTotal : 1,
    phantomItems,
  };
}

describe('action-item extraction — meet-extract-v2', () => {
  it('prints the v2 dashboard', async () => {
    const r = await runEval();
    console.log(`corpus: ${EXTRACTION_CORPUS_VERSION_V2}`);
    console.log('=== Action-Item Extraction v2 ===');
    for (const s of r.results) {
      console.log(
        `${s.pass ? '✓' : '✗'} ${s.id.padEnd(20)} ${s.knownHard ? 'known-hard' : ''} ${s.failures.join('; ')}`,
      );
    }
    console.log(
      `title ${(r.titleRecall * 100).toFixed(1)}% · assignee ${(r.assigneeRecall * 100).toFixed(1)}% · due ${(r.dueDateRecall * 100).toFixed(1)}% · phantoms ${r.phantomItems}`,
    );
    expect(r.results.length).toBe(cases.length);
  });

  it('regression gates: non-known-hard scenarios must all pass', async () => {
    const r = await runEval();
    const failing = r.results.filter((s) => !s.knownHard && !s.pass);
    expect(failing.map((s) => s.id)).toEqual([]);
  });

  it('honest gaps: known-hard scenarios are measured, not hidden', async () => {
    const r = await runEval();
    const knownHard = r.results.filter((s) => s.knownHard);
    expect(knownHard.length).toBeGreaterThan(0);
    // If any known-hard starts passing, celebrate and promote it out of
    // known-hard deliberately (MEET-T-00N with a documented decision).
  });
});
