import { describe, it, expect, vi } from 'vitest';
import {
  VoiceCommandRouter,
  type PendingCommandStore,
  type PendingCommand,
} from '../voice/voice-command-router.js';
import type { AppController } from '../cross-app/app-controller.js';
import type { CommandResult } from '../cross-app/command-bus.js';
import type { ParsedIntent } from '../voice/voice-intent-parser.js';

function makeController(results: CommandResult[]): {
  controller: AppController;
  executeIntent: ReturnType<typeof vi.fn>;
} {
  const executeIntent = vi.fn().mockResolvedValue(results);
  const controller = { executeIntent } as unknown as AppController;
  return { controller, executeIntent };
}

const intent: ParsedIntent = {
  app: 'quantmail',
  action: 'ai.summarize',
  params: {},
  confidence: 0.9,
  rawText: 'summarize email',
};

describe('VoiceCommandRouter.confirm - dual mode', () => {
  describe('real pending-command store (injected)', () => {
    it('resolves a pending command and executes it with confirmation bypassed', async () => {
      const ok: CommandResult[] = [
        { success: true, commandId: 'cmd-1', app: 'quantmail', message: 'done' },
      ];
      const { controller, executeIntent } = makeController(ok);
      const pending: PendingCommand = { commandId: 'cmd-1', intent, userId: 'user-7' };
      const store: PendingCommandStore = { resolve: vi.fn().mockResolvedValue(pending) };

      const router = new VoiceCommandRouter(controller, undefined, store);
      expect(router.isPendingStoreConfigured()).toBe(true);

      const result = await router.confirm('cmd-1', 'user-7');
      expect(result).toEqual(ok);
      expect(store.resolve).toHaveBeenCalledWith('cmd-1');
      expect(executeIntent).toHaveBeenCalledWith(intent, 'user-7', { skipConfirmation: true });
    });

    it('returns an explicit failure when the pending command is unknown', async () => {
      const { controller, executeIntent } = makeController([]);
      const store: PendingCommandStore = { resolve: vi.fn().mockResolvedValue(null) };

      const router = new VoiceCommandRouter(controller, undefined, store);
      const result = await router.confirm('missing', 'user-1');

      expect(result[0]?.success).toBe(false);
      expect(result[0]?.message).toContain('No pending command');
      expect(executeIntent).not.toHaveBeenCalled();
    });

    it('falls back (and warns) when the store throws', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { controller } = makeController([]);
      const store: PendingCommandStore = {
        resolve: vi.fn().mockRejectedValue(new Error('store down')),
      };

      const router = new VoiceCommandRouter(controller, undefined, store);
      const result = await router.confirm('cmd-1', 'user-1');

      expect(result[0]?.success).toBe(false);
      expect(result[0]?.message).toContain('unavailable');
      expect(warn).toHaveBeenCalledOnce();
      warn.mockRestore();
    });
  });

  describe('fallback path', () => {
    it('returns an explicit non-confirming failure when no store is configured', async () => {
      const { controller, executeIntent } = makeController([]);
      const router = new VoiceCommandRouter(controller, undefined); // no store, no env

      expect(router.isPendingStoreConfigured()).toBe(false);
      const result = await router.confirm('cmd-1', 'user-1');

      expect(result[0]?.success).toBe(false);
      expect(result[0]?.message).toContain('no command store configured');
      expect(executeIntent).not.toHaveBeenCalled();
    });
  });
});
