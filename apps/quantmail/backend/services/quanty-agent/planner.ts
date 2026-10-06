/**
 * quanty-agent/planner.ts — Natural-language command → ordered plan of tool steps.
 *
 * The QuantyPlanner interface is the seam: RuleBasedPlanner handles the common
 * commands today; an LLM-backed planner implementing the same interface can be
 * swapped in via createPlanner('llm') without touching the executor or routes.
 */

import { randomUUID } from 'node:crypto';
import type { QuantyStep, QuantyTool } from './types';
import { listTools } from './tool-registry';

/** A step before ids/status are assigned. */
export interface PlannedStep {
  toolName: string;
  label: string;
  args: Record<string, unknown>;
}

/** What plan() returns. */
export interface QuantyPlan {
  /** Human-readable summary shown to the user before/during execution. */
  summary: string;
  steps: PlannedStep[];
  /** True when the command could not be understood — executor reports it. */
  unmatched: boolean;
}

/** Planner seam — implement this to add an LLM planner later. */
export interface QuantyPlanner {
  plan(command: string): QuantyPlan;
}

/** Normalize a command for rule matching. */
function normalize(command: string): string {
  return command.toLowerCase().replace(/[?!.,]+/g, ' ').replace(/\s+/g, ' ').trim();
}

interface Rule {
  /** Keywords; all must appear (in any order) for the rule to fire. */
  match: string[];
  summary: string;
  steps: PlannedStep[];
}

/**
 * The 10 common commands the rule-based planner understands.
 * Each rule is deliberately narrow — unknown commands fall through to the
 * unmatched plan instead of guessing a destructive action.
 */
const RULES: Rule[] = [
  {
    match: ['archive', 'unread'],
    summary: 'Archive all unread emails',
    steps: [{ toolName: 'mail.archiveUnread', label: 'Archiving unread emails', args: {} }],
  },
  {
    match: ['mark', 'read'],
    summary: 'Mark all emails as read',
    steps: [{ toolName: 'mail.markAllRead', label: 'Marking everything as read', args: {} }],
  },
  {
    match: ['star', 'important'],
    summary: 'Star important emails',
    steps: [{ toolName: 'mail.starImportant', label: 'Starring important emails', args: { limit: 10 } }],
  },
  {
    match: ['summarize', 'thread'],
    summary: 'Summarize a thread',
    steps: [{ toolName: 'mail.summarizeThread', label: 'Summarizing thread', args: {} }],
  },
  {
    match: ['clean', 'inbox'],
    summary: 'Clean inbox: archive read mail, then mark the rest read',
    steps: [
      { toolName: 'mail.archiveUnread', label: 'Archiving unread emails', args: {} },
      { toolName: 'mail.markAllRead', label: 'Marking everything as read', args: {} },
    ],
  },
  {
    match: ['delete', 'spam'],
    summary: 'Delete spam (asks for confirmation first)',
    steps: [{ toolName: 'mail.deleteSpam', label: 'Deleting spam', args: {} }],
  },
  {
    match: ['create', 'event'],
    summary: 'Create a calendar event',
    steps: [{ toolName: 'calendar.createEvent', label: 'Creating calendar event', args: {} }],
  },
  {
    match: ['today', 'schedule'],
    summary: "Show today's schedule",
    steps: [{ toolName: 'calendar.listToday', label: "Listing today's events", args: {} }],
  },
  {
    match: ['list', 'repos'],
    summary: 'List repositories',
    steps: [{ toolName: 'git.listRepos', label: 'Listing repositories', args: {} }],
  },
  {
    match: ['find', 'contact'],
    summary: 'Find a contact',
    steps: [{ toolName: 'contacts.search', label: 'Searching contacts', args: {} }],
  },
];

/** Rule-based planner: keyword matching over the 10 common commands. */
export class RuleBasedPlanner implements QuantyPlanner {
  plan(command: string): QuantyPlan {
    const norm = ` ${normalize(command)} `;
    for (const rule of RULES) {
      const hits = rule.match.every((kw) => norm.includes(` ${kw}`));
      if (hits) {
        return { summary: rule.summary, steps: rule.steps, unmatched: false };
      }
    }
    return {
      summary: `I couldn't understand "${command}". Try: archive unread, mark all read, star important, clean inbox, delete spam, create event, today's schedule, list repos, find contact.`,
      steps: [],
      unmatched: true,
    };
  }
}

/**
 * LLM planner placeholder. Implements the interface so call sites never branch
 * on planner kind; today it delegates to the rule-based planner and is honest
 * about it. Wire a real model call here in the next phase.
 */
export class LlmPlanner implements QuantyPlanner {
  private fallback = new RuleBasedPlanner();
  plan(command: string): QuantyPlan {
    // TODO(llm-planner): call the model with listTools() as function schemas.
    return this.fallback.plan(command);
  }
}

/** Factory — the seam every caller uses. */
export function createPlanner(kind: 'rule' | 'llm' = 'rule'): QuantyPlanner {
  return kind === 'llm' ? new LlmPlanner() : new RuleBasedPlanner();
}

/**
 * Attach ids + pending status to planned steps, validating that every tool
 * exists in the registry. Unknown tool names are a planner bug — fail loudly.
 */
export function materializeSteps(plan: QuantyPlan, available?: QuantyTool[]): QuantyStep[] {
  const tools = available ?? listTools();
  const known = new Set(tools.map((t) => t.name));
  return plan.steps.map((s) => {
    if (!known.has(s.toolName)) {
      throw new Error(`Planner produced unknown tool "${s.toolName}"`);
    }
    return {
      id: randomUUID(),
      toolName: s.toolName,
      label: s.label,
      args: s.args,
      status: 'pending' as const,
    };
  });
}
