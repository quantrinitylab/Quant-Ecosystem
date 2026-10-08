import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerTool,
  registerTools,
  getTool,
  listTools,
  listToolsByApp,
  listToolNames,
  clearTools,
  registerRealTools,
} from '../services/quanty-agent/tool-registry';
import type { QuantyTool } from '../services/quanty-agent/types';
import type { QuantyMailToolsDeps } from '../services/quanty-agent/tools/mail-tools';

function makeTool(name: string, app: QuantyTool['app'] = 'core'): QuantyTool {
  return {
    name,
    app,
    description: `test tool ${name}`,
    parameters: {},
    destructive: false,
    reversible: false,
    handler: async () => ({ ok: true, summary: 'done' }),
  };
}

/** Minimal mock deps — real tools are registered, but no service is ever invoked. */
function mockDeps(): QuantyMailToolsDeps {
  return {
    prisma: {
      emailFolder: { findFirst: vi.fn(), create: vi.fn() },
      email: { updateMany: vi.fn(), findMany: vi.fn(), count: vi.fn() },
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

describe('quanty-agent tool-registry', () => {
  beforeEach(() => {
    clearTools();
  });

  it('registers and retrieves a tool', () => {
    registerTool(makeTool('mail.archiveUnread', 'mail'));
    expect(getTool('mail.archiveUnread')?.description).toBe('test tool mail.archiveUnread');
  });

  it('returns undefined for unknown tools', () => {
    expect(getTool('nope.notReal')).toBeUndefined();
  });

  it('throws on duplicate registration', () => {
    registerTool(makeTool('a.b'));
    expect(() => registerTool(makeTool('a.b'))).toThrow(/already registered/);
  });

  it('throws when the tool has no handler', () => {
    const bad = makeTool('x.y') as unknown as Record<string, unknown>;
    delete bad.handler;
    expect(() => registerTool(bad as unknown as QuantyTool)).toThrow(/handler/);
  });

  it('lists tools sorted by name and filters by app', () => {
    registerTools([makeTool('mail.b', 'mail'), makeTool('git.a', 'git'), makeTool('mail.a', 'mail')]);
    expect(listToolNames()).toEqual(['git.a', 'mail.a', 'mail.b']);
    expect(listToolsByApp('mail').map((t) => t.name)).toEqual(['mail.a', 'mail.b']);
    expect(listToolsByApp('git')).toHaveLength(1);
  });

  it('registerRealTools registers the REAL mail + git tools (no stubs)', () => {
    registerRealTools(mockDeps());
    const names = listToolNames();

    // Mail primitives (adapted from the real mail-tools).
    for (const n of [
      'mail.searchEmails', 'mail.archiveThread', 'mail.unarchiveThread', 'mail.starThread',
      'mail.pinThread', 'mail.markRead', 'mail.deleteThread', 'mail.snoozeThread',
      'mail.sendEmail', 'mail.createDraft', 'mail.summarizeThread', 'mail.listUnread',
    ]) {
      expect(names, `expected real tool ${n}`).toContain(n);
    }
    // Mail composites.
    for (const n of [
      'mail.archiveUnread', 'mail.markAllRead', 'mail.starImportant', 'mail.deleteSpam', 'mail.summarizeLatest',
    ]) {
      expect(names, `expected composite tool ${n}`).toContain(n);
    }
    // Git tools (adapted from the real git-tools).
    for (const n of [
      'git.listRepos', 'git.createRepo', 'git.listPrs', 'git.getPrDiff', 'git.mergePr',
      'git.createIssue', 'git.listIssues', 'git.closeIssue', 'git.listActions',
      'git.getRepoStats', 'git.summarizePr',
    ]) {
      expect(names, `expected real tool ${n}`).toContain(n);
    }
    // Nothing from the old stub era: calendar/contacts have no tools yet.
    expect(names.some((n) => n.startsWith('calendar.') || n.startsWith('contacts.'))).toBe(false);
    // Drive tools register only when an AIEngine is provided (QM-M39-011);
    // mockDeps() omits it, so none are registered here.
    expect(names.some((n) => n.startsWith('drive.'))).toBe(false);
    expect(listTools()).toHaveLength(12 + 5 + 11);
  });

  it('registerRealTools registers the REAL drive tools when an AIEngine is provided (QM-M39-011)', () => {
    registerRealTools({ ...mockDeps(), aiEngine: { infer: vi.fn() } as any });
    const names = listToolNames();
    for (const n of [
      'drive.searchFiles',
      'drive.suggestDestination',
      'drive.summarizeFile',
      'drive.organizeFile',
    ]) {
      expect(names, `expected real tool ${n}`).toContain(n);
    }
    expect(listToolsByApp('drive')).toHaveLength(4);
    expect(listTools()).toHaveLength(12 + 5 + 11 + 4);
    // The move tool is destructive: the agent layer must confirm first.
    expect(getTool('drive.organizeFile')?.destructive).toBe(true);
    // Read-only drive tools run without a prompt.
    expect(getTool('drive.searchFiles')?.destructive).toBe(false);
    expect(getTool('drive.suggestDestination')?.destructive).toBe(false);
    expect(getTool('drive.summarizeFile')?.destructive).toBe(false);
  });

  it('marks confirmation-gated tools destructive (real consent, no auto-resolve)', () => {
    registerRealTools(mockDeps());
    // These require the user to tap "Haan, karo" before the executor runs them.
    expect(getTool('mail.sendEmail')?.destructive).toBe(true);
    expect(getTool('mail.deleteThread')?.destructive).toBe(true);
    expect(getTool('mail.deleteSpam')?.destructive).toBe(true);
    expect(getTool('git.mergePr')?.destructive).toBe(true);
    // Read-only tools run without a prompt.
    expect(getTool('mail.searchEmails')?.destructive).toBe(false);
    expect(getTool('mail.listUnread')?.destructive).toBe(false);
    expect(getTool('git.listRepos')?.destructive).toBe(false);
  });

  it('every registered tool has a real async handler', async () => {
    registerRealTools(mockDeps());
    for (const tool of listTools()) {
      expect(typeof tool.handler, tool.name).toBe('function');
      expect(tool.description.length, tool.name).toBeGreaterThan(0);
    }
  });

  it('registerRealTools throws when registered twice (boot exactly once)', () => {
    registerRealTools(mockDeps());
    expect(() => registerRealTools(mockDeps())).toThrow(/already registered/);
  });
});
