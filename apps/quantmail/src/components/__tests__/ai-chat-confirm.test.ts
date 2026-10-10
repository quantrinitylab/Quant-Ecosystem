import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveAiChatConfirmation } from '../ai-chat-confirm';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('resolveAiChatConfirmation', () => {
  it('returns the executed run on approval', async () => {
    const toolExecution = {
      toolName: 'create_repository',
      callId: 'call_1',
      status: 'succeeded',
      label: 'Created repository "demo"',
      input: {},
      durationMs: 120,
    };
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(200, { success: true, data: { toolExecution } }),
    ) as unknown as typeof fetch;

    const resolution = await resolveAiChatConfirmation('confirm_1', true);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/ai/chat/confirm',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ confirmationId: 'confirm_1', approved: true }),
      }),
    );
    expect(resolution).toEqual({ ok: true, approved: true, toolExecution });
  });

  it('returns the declined run on cancel', async () => {
    const toolExecution = {
      toolName: 'create_repository',
      callId: 'call_1',
      status: 'failed',
      label: 'Declined: Create repository "demo" (private)',
      input: {},
      error: { code: 'CONFIRMATION_DENIED', message: 'The action was not approved.' },
      durationMs: 0,
    };
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(200, { success: true, data: { toolExecution } }),
    ) as unknown as typeof fetch;

    const resolution = await resolveAiChatConfirmation('confirm_1', false);

    expect(resolution.ok).toBe(true);
    if (resolution.ok) {
      expect(resolution.approved).toBe(false);
      expect(resolution.toolExecution.status).toBe('failed');
    }
  });

  it('maps a 404 to an honest expired/already-used note', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(404, {
        success: false,
        error: { code: 'CONFIRMATION_NOT_FOUND', message: 'Confirmation not found or expired' },
      }),
    ) as unknown as typeof fetch;

    const resolution = await resolveAiChatConfirmation('stale_id', true);

    expect(resolution).toEqual({
      ok: false,
      reason: 'not-found',
      note: 'This confirmation expired or was already used — nothing was executed.',
    });
  });

  it('maps a network failure to an honest still-pending note', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const resolution = await resolveAiChatConfirmation('confirm_1', true);

    expect(resolution.ok).toBe(false);
    if (!resolution.ok) {
      expect(resolution.reason).toBe('error');
      expect(resolution.note).toContain('nothing was executed');
    }
  });

  it('carries the backend message on other failures', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(500, {
        success: false,
        error: { code: 'AI_UNAVAILABLE', message: 'provider exploded' },
      }),
    ) as unknown as typeof fetch;

    const resolution = await resolveAiChatConfirmation('confirm_1', true);

    expect(resolution.ok).toBe(false);
    if (!resolution.ok) {
      expect(resolution.note).toContain('provider exploded');
      expect(resolution.note).toContain('nothing was executed');
    }
  });
});
