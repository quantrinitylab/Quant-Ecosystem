import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerTool,
  registerTools,
  getTool,
  listTools,
  listToolsByApp,
  listToolNames,
  clearTools,
  registerBuiltinTools,
  builtinMailTools,
} from '../services/quanty-agent/tool-registry';
import type { QuantyTool } from '../services/quanty-agent/types';

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

  it('registerBuiltinTools registers mail/git/calendar/drive/contacts tools', () => {
    registerBuiltinTools();
    const names = listToolNames();
    expect(names).toContain('mail.archiveUnread');
    expect(names).toContain('mail.deleteSpam');
    expect(names).toContain('git.listRepos');
    expect(names).toContain('calendar.createEvent');
    expect(names).toContain('drive.listFiles');
    expect(names).toContain('contacts.search');

    const spam = getTool('mail.deleteSpam');
    expect(spam?.destructive).toBe(true);
    expect(spam?.reversible).toBe(false);
    expect(getTool('mail.archiveUnread')?.destructive).toBe(false);
  });

  it('builtin mail tools validate required args', async () => {
    clearTools();
    registerTools(builtinMailTools());
    const summarize = getTool('mail.summarizeThread')!;
    const ctx = { userId: 'u', taskId: 't', prisma: null, signal: new AbortController().signal, audit: () => {} };
    const bad = await summarize.handler({}, ctx);
    expect(bad.ok).toBe(false);
    const good = await summarize.handler({ threadId: 'th-1' }, ctx);
    expect(good.ok).toBe(true);
  });
});
