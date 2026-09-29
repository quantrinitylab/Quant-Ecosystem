import { describe, it, expect } from 'vitest';
import { registerQuantneonVoice, dispatchCommand } from './voice-registration';

describe('QuantNeon voice registration', () => {
  it('registers the quantneon app and executes a navigate action', async () => {
    registerQuantneonVoice();

    const results = await dispatchCommand({
      source: 'agent',
      targetApp: 'quantneon',
      action: 'navigate',
      params: { target: 'reels' },
      userId: 'user-1',
    });

    expect(results.length).toBeGreaterThan(0);
    const result = results[0];
    expect(result?.success).toBe(true);
    expect(result?.message).toContain('reels');
    expect(result?.app).toBe('quantneon');
  });

  it('executes create, search and summarize actions', async () => {
    registerQuantneonVoice();

    const createResults = await dispatchCommand({
      source: 'agent',
      targetApp: 'quantneon',
      action: 'create',
      params: { type: 'reel' },
      userId: 'user-1',
    });
    expect(createResults[0]?.success).toBe(true);
    expect(createResults[0]?.data).toEqual({ type: 'reel' });

    const searchResults = await dispatchCommand({
      source: 'agent',
      targetApp: 'quantneon',
      action: 'search',
      params: { query: 'AR filters' },
      userId: 'user-1',
    });
    expect(searchResults[0]?.success).toBe(true);
    expect(searchResults[0]?.message).toContain('AR filters');

    const summarizeResults = await dispatchCommand({
      source: 'agent',
      targetApp: 'quantneon',
      action: 'summarize',
      params: { target: 'feed' },
      userId: 'user-1',
    });
    expect(summarizeResults[0]?.success).toBe(true);
    expect(summarizeResults[0]?.message).toContain('feed');
  });
});
