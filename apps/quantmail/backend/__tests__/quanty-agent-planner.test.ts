import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  RuleBasedPlanner,
  LlmPlanner,
  createPlanner,
  materializeSteps,
} from '../services/quanty-agent/planner';
import { clearTools, getTool, listToolNames, registerRealTools } from '../services/quanty-agent/tool-registry';
import type { QuantyMailToolsDeps } from '../services/quanty-agent/tools/mail-tools';

/** Minimal mock deps — real tools are registered, but no service is ever invoked. */
function mockDeps(): QuantyMailToolsDeps {
  return {
    prisma: {
      emailFolder: { findFirst: vi.fn(), create: vi.fn() },
      email: { updateMany: vi.fn(), findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    } as any,
    emailService: {
      search: vi.fn(),
      batchArchive: vi.fn(),
      batchStar: vi.fn(),
      batchMarkRead: vi.fn(),
      batchDelete: vi.fn(),
      sendEmail: vi.fn(),
      compose: vi.fn(),
    } as any,
    threadService: {
      getThread: vi.fn(),
      snoozeThread: vi.fn(),
    } as any,
    summarizeService: null,
  };
}

describe('quanty-agent planner', () => {
  beforeEach(() => {
    clearTools();
    registerRealTools(mockDeps());
  });

  const cases: Array<[string, string[]]> = [
    ['archive all my unread emails', ['mail.archiveUnread']],
    ['please mark everything as read', ['mail.markAllRead']],
    ['star the important ones', ['mail.starImportant']],
    ['summarize my latest email', ['mail.summarizeLatest']],
    ['clean up my inbox', ['mail.archiveUnread', 'mail.markAllRead']],
    ['delete all spam', ['mail.deleteSpam']],
    ['list my repos', ['git.listRepos']],
  ];

  it.each(cases)('plans "%s"', (command, expectedTools) => {
    const planner = new RuleBasedPlanner();
    const plan = planner.plan(command);
    expect(plan.unmatched).toBe(false);
    expect(plan.steps.map((s) => s.toolName)).toEqual(expectedTools);
    expect(plan.summary.length).toBeGreaterThan(0);
    // Every planned tool must resolve to a REAL registered tool (never a stub).
    for (const name of expectedTools) {
      expect(getTool(name), `tool ${name} should be registered`).toBeDefined();
    }
  });

  it('returns an unmatched plan for gibberish', () => {
    const plan = new RuleBasedPlanner().plan('blorpt the flibberwidget now');
    expect(plan.unmatched).toBe(true);
    expect(plan.steps).toEqual([]);
    expect(plan.summary).toContain("couldn't understand");
  });

  it('never plans a destructive tool from a vague command', () => {
    const plan = new RuleBasedPlanner().plan('do something with my mail');
    expect(plan.unmatched).toBe(true);
  });

  it('honestly declines commands for tools that do not exist (calendar/contacts)', () => {
    // Calendar/contacts tools are not wired yet — the planner must NOT plan
    // them (that would be planning against a stub).
    for (const command of ['create an event for tomorrow', "what's on my schedule today?", 'find the contact for Priya']) {
      const plan = new RuleBasedPlanner().plan(command);
      expect(plan.unmatched).toBe(true);
    }
    expect(listToolNames().some((n) => n.startsWith('calendar.') || n.startsWith('contacts.'))).toBe(false);
  });

  it('LlmPlanner implements the same interface (delegates for now)', () => {
    const plan = new LlmPlanner().plan('archive unread');
    expect(plan.unmatched).toBe(false);
    expect(plan.steps[0].toolName).toBe('mail.archiveUnread');
  });

  it('createPlanner factory returns the requested kind', () => {
    expect(createPlanner('rule')).toBeInstanceOf(RuleBasedPlanner);
    expect(createPlanner('llm')).toBeInstanceOf(LlmPlanner);
    expect(createPlanner()).toBeInstanceOf(RuleBasedPlanner);
  });

  it('materializeSteps assigns ids, pending status and the destructive flag', () => {
    const plan = new RuleBasedPlanner().plan('delete all spam');
    const steps = materializeSteps(plan);
    expect(steps).toHaveLength(1);
    expect(steps[0].id).toBeTruthy();
    expect(steps[0].status).toBe('pending');
    // deleteSpam requires confirmation -> the consent UI reads this flag.
    expect(steps[0].destructive).toBe(true);
    expect(getTool('mail.deleteSpam')?.destructive).toBe(true);
  });

  it('materializeSteps throws on unknown tools', () => {
    expect(() =>
      materializeSteps({ summary: 'x', unmatched: false, steps: [{ toolName: 'nope.nope', label: 'x', args: {} }] }),
    ).toThrow(/unknown tool/);
  });
});
