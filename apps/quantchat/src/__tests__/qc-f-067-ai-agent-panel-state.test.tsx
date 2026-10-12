// @vitest-environment jsdom
//
// QC-F-067 — AIAgentPanel state restore.
//
// Pre-fix the panel always mounted OFF (useState(initialEnabled) with the
// thread page passing no initialEnabled, and no read endpoint existed), so
// a user who had enabled auto-reply saw it OFF on every visit while the
// backend held a different (global, in-memory) truth. The panel now
// restores the caller's persisted per-user state on mount via
// GET /api/ai/auto-reply/state (injectable fetcher), and a failed restore
// never flips the visible switch.
import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AIAgentPanel } from '../components/chat/AIAgentPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  root = null;
  container?.remove();
  container = null;
});

async function renderPanel(props: React.ComponentProps<typeof AIAgentPanel>) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<AIAgentPanel {...props} />);
  });
  // Flush the mount effect's promise resolution.
  await act(async () => {
    await Promise.resolve();
  });
  return container;
}

const switchEl = () =>
  container!.querySelector<HTMLButtonElement>('button[role="switch"]')!;

describe('QC-F-067 AIAgentPanel state restore', () => {
  it('restores persisted ON state on mount', async () => {
    const fetchAutoReplyState = vi.fn(async () => ({ enabled: true }));
    await renderPanel({
      conversationId: 'conv-1',
      fetchAutoReplyState,
      toggleAutoReply: vi.fn(),
    });
    expect(fetchAutoReplyState).toHaveBeenCalledWith({ conversationId: 'conv-1' });
    expect(switchEl().getAttribute('aria-checked')).toBe('true');
  });

  it('restores persisted OFF state on mount', async () => {
    await renderPanel({
      conversationId: 'conv-1',
      initialEnabled: true,
      fetchAutoReplyState: async () => ({ enabled: false }),
      toggleAutoReply: vi.fn(),
    });
    expect(switchEl().getAttribute('aria-checked')).toBe('false');
  });

  it('a failed restore never flips the visible switch', async () => {
    await renderPanel({
      conversationId: 'conv-1',
      fetchAutoReplyState: async () => {
        throw new Error('offline');
      },
      toggleAutoReply: vi.fn(),
    });
    expect(switchEl().getAttribute('aria-checked')).toBe('false');
  });

  it('toggle still goes through the injected toggle and reports back', async () => {
    const toggleAutoReply = vi.fn(async () => ({ enabled: true, cancelledCount: 0 }));
    const onToggle = vi.fn();
    await renderPanel({
      conversationId: 'conv-1',
      fetchAutoReplyState: async () => ({ enabled: false }),
      toggleAutoReply,
      onToggle,
    });
    await act(async () => {
      switchEl().click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(toggleAutoReply).toHaveBeenCalledWith({ conversationId: 'conv-1', enabled: true });
    expect(switchEl().getAttribute('aria-checked')).toBe('true');
    expect(onToggle).toHaveBeenCalledWith(true, 0);
  });
});
