import { describe, it, expect, beforeEach } from 'vitest';
import { AppController } from '../cross-app/app-controller.js';
import { CrossAppCommandBus } from '../cross-app/command-bus.js';
import type { ParsedIntent } from '../voice/voice-intent-parser.js';

describe('AppController', () => {
  let bus: CrossAppCommandBus;
  let controller: AppController;

  beforeEach(() => {
    bus = new CrossAppCommandBus();
    controller = new AppController(bus);
  });

  it('registers an app', () => {
    controller.registerApp({
      id: 'quantneon',
      name: 'Quant Neon',
      supportedActions: ['scroll', 'navigate'],
      isActive: false,
    });

    const active = controller.getActiveApp();
    expect(active).toBeNull();
  });

  it('registers an app and marks it active', () => {
    controller.registerApp({
      id: 'quantneon',
      name: 'Quant Neon',
      supportedActions: ['scroll', 'navigate'],
      isActive: true,
    });

    const active = controller.getActiveApp();
    expect(active).not.toBeNull();
    expect(active!.id).toBe('quantneon');
  });

  it('setActiveApp changes the active app and deactivates others', () => {
    controller.registerApp({
      id: 'quantneon',
      name: 'Quant Neon',
      supportedActions: ['scroll'],
      isActive: true,
    });
    controller.registerApp({
      id: 'quantsync',
      name: 'Quant Sync',
      supportedActions: ['navigate'],
      isActive: false,
    });

    controller.setActiveApp('quantsync');

    const active = controller.getActiveApp();
    expect(active).not.toBeNull();
    expect(active!.id).toBe('quantsync');
  });

  it('setActiveApp with unknown id does not throw', () => {
    expect(() => controller.setActiveApp('nonexistent')).not.toThrow();
    expect(controller.getActiveApp()).toBeNull();
  });

  it('executeIntent routes a scroll command to the correct app', async () => {
    const resultsPromise = new Promise<ParsedIntent>((resolve) => {
      controller.subscribe('quantneon', async (command) => {
        resolve({
          app: command.targetApp,
          action: command.action,
          params: command.params,
          confidence: 1,
          rawText: command.action,
        });
        return { success: true, commandId: command.id, app: command.targetApp, message: 'done' };
      });
    });

    const intent: ParsedIntent = {
      app: 'quantneon',
      action: 'scroll',
      params: { direction: 'down' },
      confidence: 0.95,
      rawText: 'scroll down',
    };

    const results = await controller.executeIntent(intent, 'user-1');

    expect(results.length).toBe(1);
    expect(results[0]!.success).toBe(true);
    expect(results[0]!.app).toBe('quantneon');

    const captured = await resultsPromise;
    expect(captured.action).toBe('scroll');
    expect(captured.params).toEqual({ direction: 'down' });
  });

  it('executeIntent routes a navigate command to quantsync', async () => {
    const resultsPromise = new Promise<{ target: string; action: string }>((resolve) => {
      controller.subscribe('quantsync', async (command) => {
        resolve({ target: command.targetApp, action: command.action });
        return { success: true, commandId: command.id, app: 'quantsync', message: 'done' };
      });
    });

    const intent: ParsedIntent = {
      app: 'quantsync',
      action: 'navigate',
      params: { screen: 'messages' },
      confidence: 0.92,
      rawText: 'open DMs in quant sync',
    };

    const results = await controller.executeIntent(intent, 'user-1');

    expect(results.length).toBe(1);
    expect(results[0]!.success).toBe(true);
    expect(results[0]!.app).toBe('quantsync');

    const captured = await resultsPromise;
    expect(captured.target).toBe('quantsync');
    expect(captured.action).toBe('navigate');
  });

  it('executeIntent returns an empty failure when no app handles the command', async () => {
    const intent: ParsedIntent = {
      app: 'unregistered',
      action: 'scroll',
      params: {},
      confidence: 0.9,
      rawText: 'scroll',
    };

    const results = await controller.executeIntent(intent, 'user-1');
    expect(results.length).toBe(1);
    expect(results[0]!.success).toBe(false);
  });

  it('executeIntent falls back to active app when intent.app is wildcard', async () => {
    controller.registerApp({
      id: 'quanttube',
      name: 'Quant Tube',
      supportedActions: ['search.query'],
      isActive: true,
    });

    const intent: ParsedIntent = {
      app: '*',
      action: 'search.query',
      params: { query: 'gaming' },
      confidence: 0.94,
      rawText: 'search gaming',
    };

    const resultsPromise = new Promise<string>((resolve) => {
      controller.subscribe('quanttube', async (command) => {
        resolve(command.targetApp);
        return { success: true, commandId: command.id, app: command.targetApp, message: 'done' };
      });
    });

    await controller.executeIntent(intent, 'user-1');
    const target = await resultsPromise;
    expect(target).toBe('quanttube');
  });

  it('blocks purchase intents via safety guardrail', async () => {
    const intent: ParsedIntent = {
      app: '*',
      action: 'purchase',
      params: {},
      confidence: 0.9,
      rawText: 'buy now',
    };

    const results = await controller.executeIntent(intent, 'user-1');
    expect(results.length).toBe(1);
    expect(results[0]!.success).toBe(false);
    expect(results[0]!.message).toContain('Blocked');
  });

  it('returns confirmation-required result for delete commands', async () => {
    const intent: ParsedIntent = {
      app: 'quantmail',
      action: 'email.delete',
      params: {},
      confidence: 0.9,
      rawText: 'delete email',
    };

    const results = await controller.executeIntent(intent, 'user-1');
    expect(results.length).toBe(1);
    expect(results[0]!.success).toBe(false);
    expect(results[0]!.message).toContain('Confirmation required');
  });

  it('skips confirmation when skipConfirmation option is set', async () => {
    controller.registerApp({
      id: 'quantsync',
      name: 'Quant Sync',
      supportedActions: ['message.send'],
      isActive: true,
    });

    controller.subscribe('quantsync', async (command) => {
      return { success: true, commandId: command.id, app: command.targetApp, message: 'sent' };
    });

    const intent: ParsedIntent = {
      app: 'quantsync',
      action: 'message.send',
      params: { text: 'hello' },
      confidence: 0.9,
      rawText: 'send message',
    };

    const results = await controller.executeIntent(intent, 'user-1', { skipConfirmation: true });
    expect(results.length).toBe(1);
    expect(results[0]!.success).toBe(true);
  });
});
