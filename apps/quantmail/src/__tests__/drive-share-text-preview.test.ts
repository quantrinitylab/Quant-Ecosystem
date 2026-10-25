/**
 * fix/qm-drive-share-text-preview — share page text-preview lifecycle.
 *
 * Regression for the self-cancelling effect in
 * apps/quantmail/src/app/drive/share/[token]/page.tsx: the old effect
 * depended on `textPreviewState`, the state it set to 'loading', so its own
 * cleanup cancelled the fetch and a text share could hang on
 * "Loading preview…" forever. It also fetched protected bytes before any
 * password existed and offered no wrong-password → corrected-password retry.
 *
 * These tests pin the replacement contract in text-preview.ts:
 *  - decideTextPreview returns 'locked' (no request) while a password-
 *    protected file has no submitted password;
 *  - fetchTextPreview never downloads past the cap: a Content-Length over
 *    the cap short-circuits with no body read, and a streamed body is
 *    cancelled at the cap instead of buffered-then-sliced;
 *  - 401/403 surfaces as 'wrong-password' so the UI can offer the retry path.
 * Source guards pin the component side: the effect must not list
 * `textPreviewState` in its dependencies, and Unlock/Retry copy must exist.
 */
import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  decideTextPreview,
  fetchTextPreview,
} from '../app/drive/share/[token]/text-preview';
import { TEXT_PREVIEW_MAX_BYTES } from '../app/drive/share/[token]/share-resolve';

const MAX = 256;

function streamResponse(
  chunks: string[],
  opts: { ok?: boolean; status?: number; errorCode?: string } = {},
) {
  const encoder = new TextEncoder();
  const encoded = chunks.map((c) => encoder.encode(c));
  let index = 0;
  let cancelled = false;
  let reads = 0;
  const body = {
    cancel: vi.fn(async () => {
      cancelled = true;
    }),
    getReader: () => ({
      read: async () => {
        if (cancelled) return { done: true, value: undefined };
        if (index >= encoded.length) return { done: true, value: undefined };
        reads += 1;
        return { done: false, value: encoded[index++] };
      },
      cancel: async () => {
        cancelled = true;
      },
    }),
  };
  return {
    response: {
      ok: opts.ok ?? true,
      status: opts.status ?? 200,
      headers: { get: () => null },
      body,
      text: async () => chunks.join(''),
      json: async () =>
        opts.errorCode ? { error: { code: opts.errorCode } } : {},
    } as unknown as Response,
    state: () => ({ cancelled, reads }),
  };
}

describe('decideTextPreview (no pre-unlock byte request)', () => {
  it('returns locked for a password file with no submitted password', () => {
    expect(
      decideTextPreview({
        previewKind: 'text',
        requiresPassword: true,
        submittedPassword: null,
        size: 100,
        maxBytes: MAX,
      }),
    ).toBe('locked');
  });

  it('returns fetch once a password has been submitted', () => {
    expect(
      decideTextPreview({
        previewKind: 'text',
        requiresPassword: true,
        submittedPassword: 'corrected-password',
        size: 100,
        maxBytes: MAX,
      }),
    ).toBe('fetch');
  });

  it('returns fetch for a non-password file with no submitted password', () => {
    expect(
      decideTextPreview({
        previewKind: 'text',
        requiresPassword: false,
        submittedPassword: null,
        size: 100,
        maxBytes: MAX,
      }),
    ).toBe('fetch');
  });

  it('returns too-large for a known size over the cap without any fetch', () => {
    expect(
      decideTextPreview({
        previewKind: 'text',
        requiresPassword: false,
        submittedPassword: null,
        size: MAX + 1,
        maxBytes: MAX,
      }),
    ).toBe('too-large');
  });

  it('returns not-text for non-text preview kinds', () => {
    expect(
      decideTextPreview({
        previewKind: 'image',
        requiresPassword: false,
        submittedPassword: null,
        size: 100,
        maxBytes: MAX,
      }),
    ).toBe('not-text');
  });

  it('does not gate on unknown size — the stream cap still bounds the fetch', () => {
    expect(
      decideTextPreview({
        previewKind: 'text',
        requiresPassword: false,
        submittedPassword: null,
        size: null,
        maxBytes: MAX,
      }),
    ).toBe('fetch');
  });
});

describe('fetchTextPreview (published size policy)', () => {
  it('streams a small file fully, untruncated', async () => {
    const { response } = streamResponse(['hello ', 'world']);
    const result = await fetchTextPreview('https://example.invalid/preview', {
      fetchImpl: async () => response,
      maxBytes: MAX,
    });
    expect(result).toEqual({ status: 'ok', text: 'hello world', truncated: false });
  });

  it('cancels the stream at the cap and never reads the tail', async () => {
    const { response, state } = streamResponse(['a'.repeat(200), 'b'.repeat(200), 'c'.repeat(200)]);
    const result = await fetchTextPreview('https://example.invalid/preview', {
      fetchImpl: async () => response,
      maxBytes: MAX,
    });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.truncated).toBe(true);
      expect(result.text.length).toBeLessThanOrEqual(MAX);
    }
    // The third chunk was never read: the tail was not downloaded.
    expect(state().reads).toBe(2);
    expect(state().cancelled).toBe(true);
  });

  it('short-circuits on a Content-Length over the cap without reading the body', async () => {
    const { response, state } = streamResponse(['x'.repeat(10)]);
    const oversized = {
      ...response,
      headers: { get: (name: string) => (name === 'content-length' ? String(MAX + 1) : null) },
    } as unknown as Response;
    const result = await fetchTextPreview('https://example.invalid/preview', {
      fetchImpl: async () => oversized,
      maxBytes: MAX,
    });
    expect(result).toEqual({ status: 'too-large' });
    expect(state().reads).toBe(0);
  });

  it('maps 401/403 to wrong-password so the UI can offer the retry path', async () => {
    for (const status of [401, 403]) {
      const { response } = streamResponse([], { ok: false, status });
      const result = await fetchTextPreview('https://example.invalid/preview', {
        fetchImpl: async () => response,
        maxBytes: MAX,
      });
      expect(result).toEqual({ status: 'wrong-password' });
    }
  });

  it('does not mislabel a quarantined file as a wrong password', async () => {
    const { response } = streamResponse([], {
      ok: false,
      status: 403,
      errorCode: 'FILE_QUARANTINED',
    });
    const result = await fetchTextPreview('https://example.invalid/preview', {
      fetchImpl: async () => response,
      maxBytes: MAX,
    });
    expect(result).toEqual({ status: 'error' });
  });

  it('maps other failures to error, and an aborted signal to aborted', async () => {
    const { response } = streamResponse([], { ok: false, status: 500 });
    const failed = await fetchTextPreview('https://example.invalid/preview', {
      fetchImpl: async () => response,
      maxBytes: MAX,
    });
    expect(failed).toEqual({ status: 'error' });

    const controller = new AbortController();
    controller.abort();
    const { response: okResponse } = streamResponse(['ok']);
    const aborted = await fetchTextPreview('https://example.invalid/preview', {
      fetchImpl: async () => okResponse,
      signal: controller.signal,
      maxBytes: MAX,
    });
    expect(aborted).toEqual({ status: 'aborted' });
  });

  it('uses the real 256 KiB preview cap from share-resolve', () => {
    expect(TEXT_PREVIEW_MAX_BYTES).toBe(256 * 1024);
  });
});

describe('share page effect (no self-cancel, retry path present)', () => {
  const pageSource = fs.readFileSync(
    path.join(__dirname, '../app/drive/share/[token]/page.tsx'),
    'utf-8',
  );

  it('never lists textPreviewState in the preview effect dependencies', () => {
    expect(pageSource).not.toContain('}, [previewKind, textPreviewState');
    expect(pageSource).toContain('submittedPassword, previewAttempt');
  });

  it('cancels in-flight previews with AbortController on unmount/retry', () => {
    expect(pageSource).toContain('new AbortController()');
    expect(pageSource).toContain('controller.abort()');
  });

  it('renders locked, wrong-password and retry UI instead of a dead error', () => {
    expect(pageSource).toContain('Unlock preview');
    expect(pageSource).toContain('Retry preview');
    expect(pageSource).toContain("didn&apos;t unlock this file");
  });

  it('no longer buffers the preview with res.text() in the page component', () => {
    expect(pageSource).not.toContain('await res.text()');
  });
});
