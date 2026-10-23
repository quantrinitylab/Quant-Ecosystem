// ============================================================================
// QuantMail Drive — DriveAISearchManager operator handling tests.
//
// The semantic-NL default must keep working: operators are parsed out of the
// query and forwarded as structured filters alongside the residual free text,
// and pure-operator / owner-scoped queries route to the metadata search
// endpoint that can actually honor them.
// ============================================================================

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  DriveAISearchBar,
  DriveAISearchManager,
} from '../components/drive/DriveAISearchBar';

type ApiFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function mockApiFetch(handler: (url: string, init?: RequestInit) => unknown): ApiFetch {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input);
    const payload = handler(url, init);
    return {
      ok: true,
      status: 200,
      json: async () => payload,
    } as Response;
  }) as unknown as ApiFetch;
}

describe('DriveAISearchManager search operators', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps the semantic default: plain text posts query+limit only', async () => {
    const apiFetch = mockApiFetch(() => ({ results: [] }));
    const manager = new DriveAISearchManager({ apiFetch, debounceMs: 0 });

    await manager.search('quarterly report');

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [url, init] = (apiFetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/drive/ai/search');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ query: 'quarterly report', limit: 10 });
  });

  it('strips operators from the semantic query and forwards them as filters', async () => {
    const apiFetch = mockApiFetch(() => ({ results: [] }));
    const manager = new DriveAISearchManager({ apiFetch, debounceMs: 0 });

    await manager.search('type:pdf owner:me before:2025-01-01 quarterly report');

    const [url, init] = (apiFetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/drive/ai/search');
    const body = JSON.parse(init.body as string);
    expect(body.query).toBe('quarterly report');
    expect(body.limit).toBe(10);
    expect(body.filters).toEqual({
      type: 'pdf',
      before: '2025-01-01',
    });
  });

  it('routes a pure-operator query (no free text) to the metadata search endpoint', async () => {
    const apiFetch = mockApiFetch(() => ({ files: [] }));
    const manager = new DriveAISearchManager({ apiFetch, debounceMs: 0 });

    await manager.search('type:pdf');

    const [url] = (apiFetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/drive/search?type=pdf');
  });

  it('routes owner:shared through the metadata search even in semantic mode', async () => {
    const apiFetch = mockApiFetch(() => ({ files: [] }));
    const manager = new DriveAISearchManager({
      apiFetch,
      debounceMs: 0,
      initialSemantic: true,
    });

    await manager.search('owner:shared budget');

    const [url] = (apiFetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toContain('/api/drive/search?');
    expect(String(url)).toContain('owner=shared');
    expect(String(url)).toContain('q=budget');
  });

  it('passes before:/after:/name: as metadata params in name mode', async () => {
    const apiFetch = mockApiFetch(() => ({ files: [] }));
    const manager = new DriveAISearchManager({
      apiFetch,
      debounceMs: 0,
      initialSemantic: false,
    });

    await manager.search('name:budget after:2024-01-01');

    const [url] = (apiFetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const params = new URLSearchParams(String(url).split('?')[1]);
    expect(params.get('name')).toBe('budget');
    expect(params.get('after')).toBe('2024-01-01');
    expect(params.get('q')).toBeNull();
  });

  it('maps metadata search results without inventing a match score', async () => {
    const apiFetch = mockApiFetch(() => ({
      files: [{ id: 'f1', name: 'Budget.pdf', mimeType: 'application/pdf' }],
    }));
    const manager = new DriveAISearchManager({ apiFetch, debounceMs: 0 });

    const results = await manager.search('type:pdf');

    expect(results).toHaveLength(1);
    expect(results[0].fileId).toBe('f1');
    // No relevance score from the metadata endpoint → badge stays hidden.
    expect(results[0].score).toBeNull();
  });

  it('removeSearchOperator drops one operator and re-searches the rest', async () => {
    const apiFetch = mockApiFetch(() => ({ results: [] }));
    const manager = new DriveAISearchManager({ apiFetch, debounceMs: 0 });
    manager.setQuery('type:pdf owner:me report');
    await vi.advanceTimersByTimeAsync(0);
    (apiFetch as unknown as ReturnType<typeof vi.fn>).mockClear();

    manager.removeSearchOperator('type');

    expect(manager.getState().query).toBe('owner:me report');
  });
});

describe('DriveAISearchBar operator chips', () => {
  it('renders removable operator chips when the query carries operators', () => {
    const manager = new DriveAISearchManager({
      initialQuery: 'type:pdf before:2025-01-01 report',
      debounceMs: 0,
    });
    const html = renderToStaticMarkup(
      <DriveAISearchBar onSelectFile={() => {}} manager={manager} />,
    );
    expect(html).toContain('data-testid="drive-search-operator-chips"');
    expect(html).toContain('type:pdf');
    expect(html).toContain('before:2025-01-01');
  });

  it('renders no operator chips for a plain-text query', () => {
    const manager = new DriveAISearchManager({
      initialQuery: 'quarterly report',
      debounceMs: 0,
    });
    const html = renderToStaticMarkup(
      <DriveAISearchBar onSelectFile={() => {}} manager={manager} />,
    );
    expect(html).not.toContain('data-testid="drive-search-operator-chips"');
  });
});
