/**
 * quanty-agent/tool-registry.ts — Central registry of tools Quanty can invoke.
 *
 * Tools are registered per app surface (mail, git, calendar, drive, contacts).
 * The planner only sees registered tools; the executor only runs registered tools.
 */

import type { QuantyTool, QuantyToolApp } from './types';

const tools = new Map<string, QuantyTool>();

/**
 * Register a tool. Throws if a tool with the same name is already registered —
 * duplicate registrations are a wiring bug, not something to silently merge.
 */
export function registerTool(tool: QuantyTool): void {
  if (!tool.name || typeof tool.name !== 'string') {
    throw new Error('QuantyTool must have a non-empty name');
  }
  if (tools.has(tool.name)) {
    throw new Error(`QuantyTool "${tool.name}" is already registered`);
  }
  if (typeof tool.handler !== 'function') {
    throw new Error(`QuantyTool "${tool.name}" must have a handler function`);
  }
  tools.set(tool.name, tool);
}

/** Register several tools at once. */
export function registerTools(list: QuantyTool[]): void {
  for (const tool of list) registerTool(tool);
}

/** Look up a tool by name. Returns undefined when unknown. */
export function getTool(name: string): QuantyTool | undefined {
  return tools.get(name);
}

/** All registered tools, sorted by name for deterministic planning. */
export function listTools(): QuantyTool[] {
  return [...tools.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Tools for one app surface only. */
export function listToolsByApp(app: QuantyToolApp): QuantyTool[] {
  return listTools().filter((t) => t.app === app);
}

/** Names only — cheap capability listing for the planner/LLM prompt. */
export function listToolNames(): string[] {
  return listTools().map((t) => t.name);
}

/** Clear the registry. Intended for tests only. */
export function clearTools(): void {
  tools.clear();
}

/**
 * Built-in mail tools. Handlers are intentionally thin wrappers that validate
 * args and return structured results; real implementations call the existing
 * EmailService/ThreadService via ctx. For now the handlers are stubs that
 * describe what they would do — service wiring lands in the next phase.
 */
export function builtinMailTools(): QuantyTool[] {
  const ok = (summary: string, data?: unknown) => ({ ok: true, summary, data });
  return [
    {
      name: 'mail.archiveUnread',
      app: 'mail',
      description: 'Archive all unread emails in the inbox.',
      parameters: {},
      destructive: false,
      reversible: true,
      handler: async (_args, ctx) => {
        ctx.audit({ kind: 'step.done', toolName: 'mail.archiveUnread', detail: 'stub: would archive unread' });
        return ok('Archived unread emails (stub)', { archived: 0 });
      },
    },
    {
      name: 'mail.markAllRead',
      app: 'mail',
      description: 'Mark all unread emails as read.',
      parameters: {},
      destructive: false,
      reversible: false,
      handler: async (_args, ctx) => {
        ctx.audit({ kind: 'step.done', toolName: 'mail.markAllRead', detail: 'stub' });
        return ok('Marked all as read (stub)', { marked: 0 });
      },
    },
    {
      name: 'mail.starImportant',
      app: 'mail',
      description: 'Star emails that look important (from known contacts, flagged keywords).',
      parameters: {
        limit: { type: 'number', description: 'Max emails to star', default: 10 },
      },
      destructive: false,
      reversible: true,
      handler: async (args, ctx) => {
        const limit = typeof args.limit === 'number' ? args.limit : 10;
        ctx.audit({ kind: 'step.done', toolName: 'mail.starImportant', detail: `limit=${limit}` });
        return ok(`Starred important emails (stub, limit ${limit})`, { starred: 0 });
      },
    },
    {
      name: 'mail.summarizeThread',
      app: 'mail',
      description: 'Summarize an email thread by id.',
      parameters: {
        threadId: { type: 'string', description: 'Thread id to summarize', required: true },
      },
      destructive: false,
      reversible: false,
      handler: async (args, ctx) => {
        const threadId = String(args.threadId ?? '');
        if (!threadId) return { ok: false, summary: 'threadId is required' };
        ctx.audit({ kind: 'step.done', toolName: 'mail.summarizeThread', detail: threadId });
        return ok(`Summarized thread ${threadId} (stub)`, { threadId, summary: '' });
      },
    },
    {
      name: 'mail.deleteSpam',
      app: 'mail',
      description: 'Permanently delete emails in the spam folder.',
      parameters: {},
      destructive: true,
      reversible: false,
      handler: async (_args, ctx) => {
        ctx.audit({ kind: 'step.done', toolName: 'mail.deleteSpam', detail: 'stub' });
        return ok('Deleted spam (stub)', { deleted: 0 });
      },
    },
    {
      name: 'mail.search',
      app: 'mail',
      description: 'Search emails and return matching ids.',
      parameters: {
        query: { type: 'string', description: 'Search query', required: true },
        limit: { type: 'number', description: 'Max results', default: 10 },
      },
      destructive: false,
      reversible: false,
      handler: async (args, ctx) => {
        const query = String(args.query ?? '');
        if (!query) return { ok: false, summary: 'query is required' };
        ctx.audit({ kind: 'step.done', toolName: 'mail.search', detail: query });
        return ok(`Searched "${query}" (stub)`, { query, ids: [] });
      },
    },
  ];
}

/** Built-in QuantGit tools (stubs; real git wiring lands next phase). */
export function builtinGitTools(): QuantyTool[] {
  const ok = (summary: string, data?: unknown) => ({ ok: true, summary, data });
  return [
    {
      name: 'git.listRepos',
      app: 'git',
      description: 'List the user\'s repositories.',
      parameters: {},
      destructive: false,
      reversible: false,
      handler: async (_args, ctx) => {
        ctx.audit({ kind: 'step.done', toolName: 'git.listRepos', detail: 'stub' });
        return ok('Listed repositories (stub)', { repos: [] });
      },
    },
    {
      name: 'git.summarizePRs',
      app: 'git',
      description: 'Summarize open pull requests.',
      parameters: {
        repo: { type: 'string', description: 'Repository slug', required: true },
      },
      destructive: false,
      reversible: false,
      handler: async (args, ctx) => {
        const repo = String(args.repo ?? '');
        if (!repo) return { ok: false, summary: 'repo is required' };
        ctx.audit({ kind: 'step.done', toolName: 'git.summarizePRs', detail: repo });
        return ok(`Summarized PRs for ${repo} (stub)`, { repo, prs: [] });
      },
    },
  ];
}

/** Built-in calendar tools (stubs). */
export function builtinCalendarTools(): QuantyTool[] {
  const ok = (summary: string, data?: unknown) => ({ ok: true, summary, data });
  return [
    {
      name: 'calendar.createEvent',
      app: 'calendar',
      description: 'Create a calendar event.',
      parameters: {
        title: { type: 'string', description: 'Event title', required: true },
        start: { type: 'string', description: 'ISO start datetime', required: true },
        end: { type: 'string', description: 'ISO end datetime' },
      },
      destructive: false,
      reversible: true,
      handler: async (args, ctx) => {
        const title = String(args.title ?? '');
        const start = String(args.start ?? '');
        if (!title || !start) return { ok: false, summary: 'title and start are required' };
        ctx.audit({ kind: 'step.done', toolName: 'calendar.createEvent', detail: title });
        return ok(`Created event "${title}" (stub)`, { title, start });
      },
    },
    {
      name: 'calendar.listToday',
      app: 'calendar',
      description: "List today's events.",
      parameters: {},
      destructive: false,
      reversible: false,
      handler: async (_args, ctx) => {
        ctx.audit({ kind: 'step.done', toolName: 'calendar.listToday', detail: 'stub' });
        return ok("Listed today's events (stub)", { events: [] });
      },
    },
  ];
}

/** Built-in drive tools (stubs). */
export function builtinDriveTools(): QuantyTool[] {
  const ok = (summary: string, data?: unknown) => ({ ok: true, summary, data });
  return [
    {
      name: 'drive.listFiles',
      app: 'drive',
      description: 'List files in Drive, optionally filtered by query.',
      parameters: {
        query: { type: 'string', description: 'Filename search query' },
      },
      destructive: false,
      reversible: false,
      handler: async (args, ctx) => {
        ctx.audit({ kind: 'step.done', toolName: 'drive.listFiles', detail: String(args.query ?? '') });
        return ok('Listed files (stub)', { files: [] });
      },
    },
  ];
}

/** Built-in contacts tools (stubs). */
export function builtinContactsTools(): QuantyTool[] {
  const ok = (summary: string, data?: unknown) => ({ ok: true, summary, data });
  return [
    {
      name: 'contacts.search',
      app: 'contacts',
      description: 'Search contacts by name or email.',
      parameters: {
        query: { type: 'string', description: 'Search query', required: true },
      },
      destructive: false,
      reversible: false,
      handler: async (args, ctx) => {
        const query = String(args.query ?? '');
        if (!query) return { ok: false, summary: 'query is required' };
        ctx.audit({ kind: 'step.done', toolName: 'contacts.search', detail: query });
        return ok(`Searched contacts for "${query}" (stub)`, { query, contacts: [] });
      },
    },
  ];
}

/** Register every built-in tool. Call once at backend boot. */
export function registerBuiltinTools(): void {
  registerTools([
    ...builtinMailTools(),
    ...builtinGitTools(),
    ...builtinCalendarTools(),
    ...builtinDriveTools(),
    ...builtinContactsTools(),
  ]);
}
