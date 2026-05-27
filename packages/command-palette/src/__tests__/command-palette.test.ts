import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommandRegistry } from '../command-registry';
import { CommandExecutor } from '../command-executor';
import { FuzzyMatcher } from '../fuzzy-matcher';
import type { Command, CommandContext } from '../types';

function createCommand(overrides: Partial<Command> = {}): Command {
  return {
    id: overrides.id ?? 'cmd_1',
    name: overrides.name ?? 'Send Message',
    description: overrides.description ?? 'Send a chat message',
    category: overrides.category ?? 'send',
    app: overrides.app ?? 'quantchat',
    keywords: overrides.keywords ?? ['message', 'chat', 'send'],
    handler:
      overrides.handler ??
      vi.fn().mockResolvedValue({
        success: true,
        data: null,
        message: 'Message sent',
        executedAt: Date.now(),
      }),
    permissions: overrides.permissions,
  };
}

const defaultContext: CommandContext = {
  userId: 'user1',
  currentApp: 'quantchat',
  permissions: ['messages:write', 'messages:read'],
};

describe('CommandRegistry', () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    registry = new CommandRegistry();
  });

  it('registers a command and finds it by id', () => {
    const cmd = createCommand({ id: 'cmd_send' });
    registry.register(cmd);

    const found = registry.findById('cmd_send');
    expect(found).toBeDefined();
    expect(found!.name).toBe('Send Message');
  });

  it('lists commands by category', () => {
    registry.register(createCommand({ id: 'cmd_1', category: 'send' }));
    registry.register(createCommand({ id: 'cmd_2', category: 'find' }));
    registry.register(createCommand({ id: 'cmd_3', category: 'send' }));

    const sendCommands = registry.listByCategory('send');
    expect(sendCommands).toHaveLength(2);
  });

  it('lists commands by app', () => {
    registry.register(createCommand({ id: 'cmd_1', app: 'quantchat' }));
    registry.register(createCommand({ id: 'cmd_2', app: 'quantmail' }));

    const chatCommands = registry.listByApp('quantchat');
    expect(chatCommands).toHaveLength(1);
  });

  it('unregisters a command', () => {
    registry.register(createCommand({ id: 'cmd_1' }));
    const removed = registry.unregister('cmd_1');
    expect(removed).toBe(true);
    expect(registry.findById('cmd_1')).toBeUndefined();
  });
});

describe('FuzzyMatcher', () => {
  let registry: CommandRegistry;
  let matcher: FuzzyMatcher;

  beforeEach(() => {
    registry = new CommandRegistry();
    matcher = new FuzzyMatcher(registry);

    registry.register(
      createCommand({ id: 'cmd_send', name: 'Send Message', keywords: ['message', 'chat'] }),
    );
    registry.register(
      createCommand({
        id: 'cmd_email',
        name: 'Compose Email',
        keywords: ['email', 'mail'],
        category: 'send',
        app: 'quantmail',
      }),
    );
    registry.register(
      createCommand({
        id: 'cmd_find',
        name: 'Find Document',
        keywords: ['search', 'document', 'find'],
        category: 'find',
      }),
    );
  });

  it('matches exact keyword with highest score', () => {
    const results = matcher.match('message');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.command.id).toBe('cmd_send');
  });

  it('matches partial input in name', () => {
    const results = matcher.match('compose');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.command.id).toBe('cmd_email');
  });

  it('returns empty for no matches', () => {
    const results = matcher.match('zzzzxyz');
    expect(results).toHaveLength(0);
  });

  it('respects limit parameter', () => {
    const results = matcher.match('send', 1);
    expect(results).toHaveLength(1);
  });
});

describe('CommandExecutor', () => {
  let registry: CommandRegistry;
  let executor: CommandExecutor;

  beforeEach(() => {
    registry = new CommandRegistry();
    executor = new CommandExecutor(registry);
  });

  it('executes a command successfully', async () => {
    const handler = vi.fn().mockResolvedValue({
      success: true,
      data: { messageId: 'msg_1' },
      message: 'Message sent',
      executedAt: Date.now(),
    });
    registry.register(createCommand({ id: 'cmd_send', handler }));

    const result = await executor.execute('cmd_send', defaultContext, { text: 'Hello' });
    expect(result.success).toBe(true);
    expect(result.message).toBe('Message sent');
    expect(handler).toHaveBeenCalledWith(defaultContext, { text: 'Hello' });
  });

  it('returns error for non-existent command', async () => {
    const result = await executor.execute('nonexistent', defaultContext);
    expect(result.success).toBe(false);
    expect(result.message).toContain('Command not found');
  });

  it('denies execution when permissions are missing', async () => {
    registry.register(createCommand({ id: 'cmd_admin', permissions: ['admin:manage'] }));

    const result = await executor.execute('cmd_admin', defaultContext);
    expect(result.success).toBe(false);
    expect(result.message).toContain('Permission denied');
  });

  it('logs command executions', async () => {
    registry.register(createCommand({ id: 'cmd_log' }));
    await executor.execute('cmd_log', defaultContext);

    const logs = executor.getExecutionLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]!.commandId).toBe('cmd_log');
    expect(logs[0]!.success).toBe(true);
  });
});
