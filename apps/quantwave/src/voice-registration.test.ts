import { describe, it, expect } from 'vitest';
import { registerQuantsyncVoice, dispatchCommand } from './voice-registration';

describe('QuantSync voice registration', () => {
  it('registers the quantsync app and executes a navigate action', async () => {
    registerQuantsyncVoice();

    const results = await dispatchCommand({
      source: 'agent',
      targetApp: 'quantsync',
      action: 'navigate',
      params: { target: 'messages' },
      userId: 'user-1',
    });

    expect(results.length).toBeGreaterThan(0);
    const result = results[0];
    expect(result?.success).toBe(true);
    expect(result?.message).toContain('messages');
    expect(result?.app).toBe('quantsync');
  });

  it('executes create, search and summarize actions', async () => {
    registerQuantsyncVoice();

    const createResults = await dispatchCommand({
      source: 'agent',
      targetApp: 'quantsync',
      action: 'create',
      params: { type: 'thread' },
      userId: 'user-1',
    });
    expect(createResults[0]?.success).toBe(true);
    expect(createResults[0]?.data).toEqual({ type: 'thread' });

    const searchResults = await dispatchCommand({
      source: 'agent',
      targetApp: 'quantsync',
      action: 'search',
      params: { query: 'trending' },
      userId: 'user-1',
    });
    expect(searchResults[0]?.success).toBe(true);
    expect(searchResults[0]?.message).toContain('trending');

    const summarizeResults = await dispatchCommand({
      source: 'agent',
      targetApp: 'quantsync',
      action: 'summarize',
      params: { target: 'notifications' },
      userId: 'user-1',
    });
    expect(summarizeResults[0]?.success).toBe(true);
    expect(summarizeResults[0]?.message).toContain('notifications');
  });
});
