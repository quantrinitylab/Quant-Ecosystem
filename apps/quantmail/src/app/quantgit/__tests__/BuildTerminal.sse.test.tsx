// @vitest-environment jsdom
// ============================================================================
// BuildTerminal SSE protocol regression test (fix/qm-quantgit-sse-events).
//
// The backend (backend/routes/ci-logs.ts) emits ONLY named SSE events
// (`event: connected`, `event: log`, `event: end`). Per the SSE spec,
// EventSource.onmessage fires ONLY for unnamed (default) events — so a client
// that registers only onopen/onmessage/onerror silently drops every log line.
// These tests drive the REAL component with a fake EventSource and assert it
// registers addEventListener('log'/'end'/'connected') and that named frames
// actually land in the log buffer / status badge.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BuildTerminal } from '../components/BuildTerminal';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type SseListener = (event: Event) => void;

// Minimal EventSource double: records addEventListener registrations and lets
// the test dispatch named/unnamed frames the way a browser SSE parser would.
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  listeners = new Map<string, SseListener[]>();
  onopen: SseListener | null = null;
  onmessage: SseListener | null = null;
  onerror: SseListener | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, callback: SseListener | null): void {
    if (!callback) return;
    const list = this.listeners.get(type) ?? [];
    list.push(callback);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, callback: SseListener | null): void {
    const list = this.listeners.get(type);
    if (!list || !callback) return;
    this.listeners.set(
      type,
      list.filter((cb) => cb !== callback),
    );
  }

  /** Dispatch a named frame to its addEventListener callbacks (like the browser does). */
  dispatchNamed(type: 'connected' | 'log' | 'end', data: string): void {
    const event = { data } as unknown as Event;
    for (const cb of this.listeners.get(type) ?? []) {
      cb(event);
    }
  }

  /** Dispatch an unnamed (default) frame — fires onmessage only, per the SSE spec. */
  dispatchUnnamed(data: string): void {
    const event = { data } as unknown as Event;
    if (this.onmessage) this.onmessage(event);
  }

  close(): void {
    this.closed = true;
  }
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function mountTerminal(buildId = 'build-900'): Promise<FakeEventSource> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<BuildTerminal buildId={buildId} autoConnect={true} />);
  });
  const es = FakeEventSource.instances[FakeEventSource.instances.length - 1];
  expect(es).toBeDefined();
  return es;
}

function bufferText(): string {
  return (
    container?.querySelector('[data-testid="terminal-buffer"]')?.textContent ?? ''
  );
}

beforeEach(() => {
  FakeEventSource.instances = [];
  (globalThis as { EventSource?: unknown }).EventSource = FakeEventSource;
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  delete (globalThis as { EventSource?: unknown }).EventSource;
});

describe('BuildTerminal SSE named-event protocol', () => {
  it('registers addEventListener for the named events the backend emits (log/end/connected)', async () => {
    const es = await mountTerminal();

    // Pre-fix regression: the client registered ONLY onopen/onmessage/onerror,
    // so named frames (`event: log`, `event: end`) never reached any handler.
    expect(es.listeners.has('log')).toBe(true);
    expect(es.listeners.has('end')).toBe(true);
    expect(es.listeners.has('connected')).toBe(true);
  });

  it('appends log lines from named `log` events to the buffer', async () => {
    const es = await mountTerminal();

    await act(async () => {
      es.dispatchNamed('log', JSON.stringify({ seq: 1, line: 'Step 1/2: checkout' }));
      es.dispatchNamed('log', JSON.stringify({ seq: 2, line: 'Step 2/2: tests pass' }));
    });

    expect(bufferText()).toContain('Step 1/2: checkout');
    expect(bufferText()).toContain('Step 2/2: tests pass');
  });

  it('marks the stream completed when a named `end` event arrives', async () => {
    const es = await mountTerminal();

    await act(async () => {
      es.dispatchNamed('log', JSON.stringify({ seq: 1, line: 'running' }));
      es.dispatchNamed('end', JSON.stringify({ buildId: 'build-900', completed: true }));
    });

    // Status badge flips to completed and the stream is closed exactly once.
    expect(container?.textContent).toContain('COMPLETED');
    expect(es.closed).toBe(true);
  });

  it('marks completed once when a log frame carries isEnd (no duplicate close)', async () => {
    const es = await mountTerminal();

    await act(async () => {
      es.dispatchNamed('log', JSON.stringify({ seq: 9, line: 'done', isEnd: true }));
      // The backend then emits `event: end` — must not re-fire the banner.
      es.dispatchNamed('end', JSON.stringify({ buildId: 'build-900', completed: true }));
    });

    expect(container?.textContent).toContain('COMPLETED');
    expect(es.closed).toBe(true);
  });

  it('marks failed when a log frame carries status failed', async () => {
    const es = await mountTerminal();

    await act(async () => {
      es.dispatchNamed('log', JSON.stringify({ seq: 3, line: 'ERR boom', status: 'failed' }));
    });

    expect(container?.textContent).toContain('FAILED');
    expect(es.closed).toBe(true);
  });

  it('still handles unnamed (default) SSE messages via the onmessage fallback', async () => {
    const es = await mountTerminal();

    await act(async () => {
      es.dispatchUnnamed(JSON.stringify({ line: 'edge-stripped event field' }));
    });

    expect(bufferText()).toContain('edge-stripped event field');
  });

  it('appends non-JSON payloads as raw lines instead of dropping them', async () => {
    const es = await mountTerminal();

    await act(async () => {
      es.dispatchNamed('log', 'plain text line without json');
    });

    expect(bufferText()).toContain('plain text line without json');
  });
});
