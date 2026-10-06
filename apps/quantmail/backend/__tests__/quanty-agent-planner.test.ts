import { describe, it, expect, beforeEach } from 'vitest';
import {
  RuleBasedPlanner,
  LlmPlanner,
  createPlanner,
  materializeSteps,
} from '../services/quanty-agent/planner';
import { clearTools, registerBuiltinTools } from '../services/quanty-agent/tool-registry';

describe('quanty-agent planner', () => {
  beforeEach(() => {
    clearTools();
    registerBuiltinTools();
  });

  const cases: Array<[string, string[]]> = [
    ['archive all my unread emails', ['mail.archiveUnread']],
    ['please mark everything as read', ['mail.markAllRead']],
    ['star the important ones', ['mail.starImportant']],
    ['summarize this thread', ['mail.summarizeThread']],
    ['clean up my inbox', ['mail.archiveUnread', 'mail.markAllRead']],
    ['delete all spam', ['mail.deleteSpam']],
    ['create an event for tomorrow', ['calendar.createEvent']],
    ["what's on my schedule today?", ['calendar.listToday']],
    ['list my repos', ['git.listRepos']],
    ['find the contact for Priya', ['contacts.search']],
  ];

  it.each(cases)('plans "%s"', (command, expectedTools) => {
    const planner = new RuleBasedPlanner();
    const plan = planner.plan(command);
    expect(plan.unmatched).toBe(false);
    expect(plan.steps.map((s) => s.toolName)).toEqual(expectedTools);
    expect(plan.summary.length).toBeGreaterThan(0);
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

  it('materializeSteps assigns ids and pending status', () => {
    const plan = new RuleBasedPlanner().plan('clean up my inbox');
    const steps = materializeSteps(plan);
    expect(steps).toHaveLength(2);
    expect(steps[0].id).toBeTruthy();
    expect(steps[0].id).not.toBe(steps[1].id);
    expect(steps.every((s) => s.status === 'pending')).toBe(true);
  });

  it('materializeSteps throws on unknown tools', () => {
    expect(() =>
      materializeSteps({ summary: 'x', unmatched: false, steps: [{ toolName: 'nope.nope', label: 'x', args: {} }] }),
    ).toThrow(/unknown tool/);
  });
});
