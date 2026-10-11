// @vitest-environment jsdom
// ============================================================================
// QM-SCREEN-005 R2 — usePhishingCheck contract pins.
//
// The thread views' sender-safety scan must: fire the real backend AI scan per
// inbound message (lazily), never show an all-clear on failure, never scan when
// disabled (outbound messages), dedup concurrent mounts, and retry honestly
// after a transient failure (failures are not cached).
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';

// Silence React 19's "not configured to support act(...)" warning under vitest.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot, type Root } from 'react-dom/client';

const detectPhishingMock = vi.hoisted(() => vi.fn());
vi.mock('../services/api-client', () => ({
  apiClient: { detectPhishing: detectPhishingMock },
}));

import {
  usePhishingCheck,
  __resetPhishingCheckCacheForTests,
  type PhishingCheckResult,
} from '../hooks/usePhishingCheck';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function mountHarness(emailId: string | undefined, enabled: boolean) {
  const seen: PhishingCheckResult[] = [];
  function Harness() {
    const result = usePhishingCheck(emailId, { enabled });
    seen.push(result);
    return React.createElement('div', { 'data-status': result.status });
  }
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container!);
    root.render(React.createElement(Harness));
  });
  return { seen, el: () => container!.firstElementChild as HTMLElement };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  __resetPhishingCheckCacheForTests();
  detectPhishingMock.mockReset();
});

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

describe('usePhishingCheck', () => {
  it('stays idle and fires no request when disabled (outbound messages)', () => {
    const { seen, el } = mountHarness('m-outbound', false);
    expect(detectPhishingMock).not.toHaveBeenCalled();
    expect(el().dataset.status).toBe('idle');
    expect(seen.at(-1)!.status).toBe('idle');
  });

  it('stays idle when there is no message id', () => {
    const { el } = mountHarness(undefined, true);
    expect(detectPhishingMock).not.toHaveBeenCalled();
    expect(el().dataset.status).toBe('idle');
  });

  it('fires the real scan once per message and reports a warning', async () => {
    detectPhishingMock.mockResolvedValue({
      success: true,
      data: { emailId: 'm1', isPhishing: true, confidence: 92, indicators: ['urgent tone'] },
    });
    const { seen, el } = mountHarness('m1', true);
    expect(el().dataset.status).toBe('loading');
    await act(async () => {});
    expect(detectPhishingMock).toHaveBeenCalledTimes(1);
    expect(detectPhishingMock).toHaveBeenCalledWith('m1');
    expect(el().dataset.status).toBe('warning');
    const last = seen.at(-1)!;
    expect(last.isPhishing).toBe(true);
    expect(last.confidence).toBe(92);
    expect(last.indicators).toEqual(['urgent tone']);
  });

  it('reports clear when the backend finds nothing', async () => {
    detectPhishingMock.mockResolvedValue({
      success: true,
      data: { emailId: 'm2', isPhishing: false, confidence: 4, indicators: [] },
    });
    const { el } = mountHarness('m2', true);
    await act(async () => {});
    expect(el().dataset.status).toBe('clear');
  });

  it('reports unavailable — never an all-clear — when the scan fails', async () => {
    detectPhishingMock.mockResolvedValue({
      success: false,
      error: { code: 'AI_UNAVAILABLE', message: 'AI service down', statusCode: 503 },
    });
    const { seen, el } = mountHarness('m3', true);
    await act(async () => {});
    expect(el().dataset.status).toBe('unavailable');
    const last = seen.at(-1)!;
    expect(last.isPhishing).toBe(false);
    expect(last.status).not.toBe('clear');
    expect(last.errorCode).toBe('AI_UNAVAILABLE');
  });

  it('reports unavailable when the transport throws', async () => {
    detectPhishingMock.mockRejectedValue(new Error('network down'));
    const { el } = mountHarness('m4', true);
    await act(async () => {});
    expect(el().dataset.status).toBe('unavailable');
  });

  it('dedups concurrent mounts for the same message into one request', async () => {
    const gate = deferred<{ success: boolean; data: unknown }>();
    detectPhishingMock.mockReturnValue(gate.promise);
    const a = mountHarness('m5', true);
    const b = mountHarness('m5', true);
    expect(a.el().dataset.status).toBe('loading');
    expect(b.el().dataset.status).toBe('loading');
    await act(async () => {
      gate.resolve({
        success: true,
        data: { emailId: 'm5', isPhishing: false, confidence: 1, indicators: [] },
      });
    });
    expect(detectPhishingMock).toHaveBeenCalledTimes(1);
    expect(a.el().dataset.status).toBe('clear');
    expect(b.el().dataset.status).toBe('clear');
  });

  it('does not cache failures: a later mount retries the scan', async () => {
    detectPhishingMock.mockRejectedValueOnce(new Error('flaky'));
    detectPhishingMock.mockResolvedValueOnce({
      success: true,
      data: { emailId: 'm6', isPhishing: false, confidence: 2, indicators: [] },
    });
    const first = mountHarness('m6', true);
    await act(async () => {});
    expect(first.el().dataset.status).toBe('unavailable');

    // Remount (fresh component tree) retries honestly instead of serving
    // the cached failure.
    if (root) {
      act(() => root!.unmount());
      root = null;
    }
    container?.remove();
    const second = mountHarness('m6', true);
    await act(async () => {});
    expect(detectPhishingMock).toHaveBeenCalledTimes(2);
    expect(second.el().dataset.status).toBe('clear');
  });

  it('reuses the cached scan on remount without refiring', async () => {
    detectPhishingMock.mockResolvedValue({
      success: true,
      data: { emailId: 'm7', isPhishing: true, confidence: 88, indicators: [] },
    });
    const first = mountHarness('m7', true);
    await act(async () => {});
    expect(first.el().dataset.status).toBe('warning');
    if (root) {
      act(() => root!.unmount());
      root = null;
    }
    container?.remove();
    const second = mountHarness('m7', true);
    // Cached result renders synchronously — no loading flicker, no refire.
    expect(second.el().dataset.status).toBe('warning');
    expect(detectPhishingMock).toHaveBeenCalledTimes(1);
  });

});
