import { describe, it, expect } from 'vitest';
import { registerQuantubeVoice, dispatchCommand } from './voice-registration';

describe('QuantTube voice registration', () => {
  it('registers the quantube app and executes a navigate action', async () => {
    registerQuantubeVoice();

    const results = await dispatchCommand({
      source: 'agent',
      targetApp: 'quantube',
      action: 'navigate',
      params: { target: 'library' },
      userId: 'user-1',
    });

    expect(results.length).toBeGreaterThan(0);
    const result = results[0];
    expect(result?.success).toBe(true);
    expect(result?.message).toContain('library');
    expect(result?.app).toBe('quantube');
  });

  it('executes create, search and summarize actions', async () => {
    registerQuantubeVoice();

    const createResults = await dispatchCommand({
      source: 'agent',
      targetApp: 'quantube',
      action: 'create',
      params: { type: 'clip' },
      userId: 'user-1',
    });
    expect(createResults[0]?.success).toBe(true);
    expect(createResults[0]?.data).toEqual({ type: 'clip' });

    const searchResults = await dispatchCommand({
      source: 'agent',
      targetApp: 'quantube',
      action: 'search',
      params: { query: 'gaming' },
      userId: 'user-1',
    });
    expect(searchResults[0]?.success).toBe(true);
    expect(searchResults[0]?.message).toContain('gaming');

    const summarizeResults = await dispatchCommand({
      source: 'agent',
      targetApp: 'quantube',
      action: 'summarize',
      params: { target: 'live-stream' },
      userId: 'user-1',
    });
    expect(summarizeResults[0]?.success).toBe(true);
    expect(summarizeResults[0]?.message).toContain('live-stream');
  });
});
