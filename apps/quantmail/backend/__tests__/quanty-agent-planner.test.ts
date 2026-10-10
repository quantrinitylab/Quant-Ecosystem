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
    // QM-M39-011: registers the real drive.* tools so drive rules materialize.
    aiEngine: { infer: vi.fn() } as any,
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
    // Git read-only PR commands.
    ['show open PRs in quantmail', ['git.listPrs']],
    ['summarize PR 5 in quantmail', ['git.summarizePr']],
    // QM-M39-011: drive file-workspace commands.
    ['find files quarterly report', ['drive.searchFiles']],
    ['search my files for invoices', ['drive.searchFiles']],
    ['read the file notes.txt', ['drive.readFile']],
    ['summarize file notes.txt', ['drive.summarizeFile']],
    ['where should invoice.pdf go', ['drive.suggestDestination']],
    ['organize file budget.xlsx', ['drive.suggestDestination']],
    ['move budget.xlsx to its folder', ['drive.organizeFile']],
    // Contacts tools (real ContactService-backed implementations).
    ['find the contact for Priya', ['contacts.searchContacts']],
    ["find John's contact", ['contacts.searchContacts']],
    ['search contacts for Priya Sharma', ['contacts.searchContacts']],
    ['add Priya Sharma, priya@example.com', ['contacts.addContact']],
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

  it('honestly declines commands for tools that do not exist (calendar)', () => {
    // Calendar tools are not wired yet — the planner must NOT plan them
    // (that would be planning against a stub).
    for (const command of ['create an event for tomorrow', "what's on my schedule today?"]) {
      const plan = new RuleBasedPlanner().plan(command);
      expect(plan.unmatched).toBe(true);
    }
    expect(listToolNames().some((n) => n.startsWith('calendar.'))).toBe(false);
    // Contacts tools ARE wired now — the planner routes to real implementations.
    expect(listToolNames().some((n) => n.startsWith('contacts.'))).toBe(true);
  });

  it('extracts the free-text argument for contacts commands', () => {
    const planner = new RuleBasedPlanner();
    expect(planner.plan('find the contact for Priya').steps[0].args).toEqual({ q: 'priya' });
    expect(planner.plan("find John's contact").steps[0].args).toEqual({ q: "john's" });
    expect(planner.plan('add Priya Sharma, priya@example.com').steps[0].args).toEqual({
      name: 'priya sharma',
      email: 'priya@example.com',
    });
  });

  it('does not plan a contact add from a command without an email', () => {
    // "add" prefixes "address" — without an email-shaped token the guard
    // keeps this unmatched instead of planning against garbage.
    const plan = new RuleBasedPlanner().plan('show my address book');
    expect(plan.unmatched).toBe(true);
  });

  it('contact add materializes as a destructive (confirmation-gated) step', () => {
    const steps = materializeSteps(new RuleBasedPlanner().plan('add Priya Sharma, priya@example.com'));
    expect(steps).toHaveLength(1);
    expect(steps[0].toolName).toBe('contacts.addContact');
    expect(steps[0].destructive).toBe(true);
    expect(getTool('contacts.addContact')?.destructive).toBe(true);
    // Read-only contacts tools run without a prompt.
    expect(getTool('contacts.searchContacts')?.destructive).toBe(false);
    expect(getTool('contacts.getContact')?.destructive).toBe(false);
  });

  it('extracts the free-text argument for git commands', () => {
    const planner = new RuleBasedPlanner();
    expect(planner.plan('show open PRs in quantmail').steps[0].args).toEqual({
      repo: 'quantmail',
      state: 'open',
    });
    expect(planner.plan('summarize PR 5 in quantmail').steps[0].args).toEqual({
      repo: 'quantmail',
      prNumber: 5,
    });
  });

  it('never plans destructive git tools (merge_pr, create_repo) from casual NL', () => {
    const planner = new RuleBasedPlanner();
    for (const command of ['merge PR 5', 'merge my pull request', 'create a repo called demo']) {
      expect(planner.plan(command).unmatched, `"${command}"`).toBe(true);
    }
  });

  it('read-file and git PR steps materialize as non-destructive', () => {
    const readSteps = materializeSteps(new RuleBasedPlanner().plan('read the file notes.txt'));
    expect(readSteps).toHaveLength(1);
    expect(readSteps[0].toolName).toBe('drive.readFile');
    expect(readSteps[0].destructive).toBe(false);
    const prSteps = materializeSteps(new RuleBasedPlanner().plan('show open PRs in quantmail'));
    expect(prSteps).toHaveLength(1);
    expect(prSteps[0].toolName).toBe('git.listPrs');
    expect(prSteps[0].destructive).toBe(false);
  });

  it('extracts the free-text argument for drive commands', () => {
    const planner = new RuleBasedPlanner();
    expect(planner.plan('find files quarterly report').steps[0].args).toEqual({
      query: 'quarterly report',
    });
    expect(planner.plan('summarize file notes.txt').steps[0].args).toEqual({
      fileName: 'notes.txt',
    });
    expect(planner.plan('where should invoice.pdf go').steps[0].args).toEqual({
      fileName: 'invoice.pdf',
    });
    expect(planner.plan('read the file notes.txt').steps[0].args).toEqual({
      fileName: 'notes.txt',
    });
    expect(planner.plan('move budget.xlsx to its folder').steps[0].args).toEqual({
      fileName: 'budget.xlsx',
    });
  });

  it('drive organize materializes as a destructive (confirmation-gated) step', () => {
    const steps = materializeSteps(new RuleBasedPlanner().plan('move budget.xlsx to its folder'));
    expect(steps).toHaveLength(1);
    expect(steps[0].toolName).toBe('drive.organizeFile');
    expect(steps[0].destructive).toBe(true);
    expect(getTool('drive.organizeFile')?.destructive).toBe(true);
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
