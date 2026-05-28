import { describe, it, expect, vi } from 'vitest';
import { ContextRetriever } from '../grounding/context-retriever.js';
import type { ContextSource } from '../types.js';

describe('ContextRetriever', () => {
  it('invokes the search function with the query', async () => {
    const searchFn = vi.fn().mockResolvedValue([]);
    const retriever = new ContextRetriever(searchFn);
    await retriever.retrieve('meeting notes');
    expect(searchFn).toHaveBeenCalledWith('meeting notes');
  });

  it('returns formatted ContextSource results', async () => {
    const sources: ContextSource[] = [
      { app: 'quant-notes', type: 'note', snippet: 'Budget review at 3pm', timestamp: 1000 },
      { app: 'quant-mail', type: 'email', snippet: 'RE: Budget discussion', timestamp: 2000 },
    ];
    const retriever = new ContextRetriever(vi.fn().mockResolvedValue(sources));
    const results = await retriever.retrieve('budget');
    expect(results).toHaveLength(2);
    expect(results[0]!.app).toBe('quant-notes');
    expect(results[1]!.snippet).toContain('Budget discussion');
  });

  it('returns empty results with default search function', async () => {
    const retriever = new ContextRetriever();
    const results = await retriever.retrieve('anything');
    expect(results).toEqual([]);
  });

  it('handles search function returning empty array', async () => {
    const retriever = new ContextRetriever(vi.fn().mockResolvedValue([]));
    const results = await retriever.retrieve('no results');
    expect(results).toEqual([]);
  });
});
