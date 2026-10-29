import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// The page imports the shared-ui barrel, whose Media components require
// @livekit/track-processors — absent from this checkout (pre-existing
// environmental gap, unrelated to this unit). Stub only the shell pieces
// the page references; ChatMessages itself never renders them.
vi.mock('@quant/shared-ui', () => ({
  AppShell: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Sidebar: () => <div />,
  AnimatedPage: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

import { ChatMessages } from '../../components/chat/ChatMessages';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const baseMessages = [
  { id: 'u1', role: 'user', content: 'Hello Quanty', timestamp: '2026-10-29T00:00:00Z' },
  {
    id: 'a1',
    role: 'assistant',
    content: 'Here is an answer.',
    timestamp: '2026-10-29T00:00:01Z',
  },
];

function renderThread(props: {
  isStreaming?: boolean;
  onFeedback?: (messageId: string, value: 'POSITIVE' | 'NEGATIVE') => void;
} = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(
      <ChatMessages
        messages={baseMessages}
        isStreaming={props.isStreaming ?? false}
        onFeedback={props.onFeedback ?? vi.fn()}
        onRegenerate={vi.fn()}
      />,
    );
  });
  return { container, root };
}

function cleanup(container: HTMLElement, root: Root) {
  act(() => {
    root.unmount();
  });
  container.remove();
}

function scrollContainer(container: HTMLElement): HTMLElement {
  const el = container.querySelector('[aria-label="Conversation"]');
  if (!el) throw new Error('Conversation scroll container not found');
  return el as HTMLElement;
}

function setScrollMetrics(
  el: HTMLElement,
  metrics: { scrollHeight: number; clientHeight: number; scrollTop: number },
) {
  Object.defineProperty(el, 'scrollHeight', { value: metrics.scrollHeight, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: metrics.clientHeight, configurable: true });
  Object.defineProperty(el, 'scrollTop', {
    value: metrics.scrollTop,
    configurable: true,
    writable: true,
  });
  act(() => {
    el.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
}

function jumpButton(container: HTMLElement): HTMLElement | null {
  return container.querySelector('[aria-label="Jump to latest"]');
}

describe('quantai-chat-thread-ergonomics', () => {
  let writeText: ReturnType<typeof vi.fn>;
  let scrollIntoView: ReturnType<typeof vi.fn>;
  const originalScrollIntoView = (
    window.HTMLElement.prototype as { scrollIntoView?: unknown }
  ).scrollIntoView;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    scrollIntoView = vi.fn();
    (window.HTMLElement.prototype as { scrollIntoView: unknown }).scrollIntoView = scrollIntoView;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalScrollIntoView === undefined) {
      delete (window.HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    } else {
      (window.HTMLElement.prototype as { scrollIntoView: unknown }).scrollIntoView =
        originalScrollIntoView;
    }
  });

  it('jump button is hidden when pinned to the bottom (initial state)', () => {
    const { container, root } = renderThread();
    try {
      expect(jumpButton(container)).toBeNull();
    } finally {
      cleanup(container, root);
    }
  });

  it('jump button appears when scrolled up and hides again when pinned', () => {
    const { container, root } = renderThread();
    try {
      const el = scrollContainer(container);
      setScrollMetrics(el, { scrollHeight: 1000, clientHeight: 200, scrollTop: 0 });
      const shown = jumpButton(container);
      expect(shown).not.toBeNull();
      expect(shown?.getAttribute('aria-label')).toBe('Jump to latest');
      expect(shown?.textContent).toBe('Jump to latest');
      // Right edge of the thread wrapper, above the composer region.
      expect(shown?.className).toContain('right-4');

      setScrollMetrics(el, { scrollHeight: 1000, clientHeight: 200, scrollTop: 800 });
      expect(jumpButton(container)).toBeNull();
    } finally {
      cleanup(container, root);
    }
  });

  it('clicking jump scrolls to the latest message and re-pins to bottom', () => {
    const { container, root } = renderThread();
    try {
      const el = scrollContainer(container);
      setScrollMetrics(el, { scrollHeight: 1000, clientHeight: 200, scrollTop: 0 });
      const button = jumpButton(container);
      expect(button).not.toBeNull();
      act(() => {
        button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(scrollIntoView).toHaveBeenCalled();
      const call = scrollIntoView.mock.calls[0]?.[0] as { block?: string } | undefined;
      expect(call?.block).toBe('end');
      // Re-pinned: the button disappears after the jump.
      expect(jumpButton(container)).toBeNull();
    } finally {
      cleanup(container, root);
    }
  });

  it('Copied toast appears above the composer region after a real copy, in normal flow', async () => {
    const { container, root } = renderThread();
    try {
      expect(container.textContent).not.toContain('Copied');
      const copyButton = container.querySelector('[aria-label="Copy message"]');
      expect(copyButton).not.toBeNull();
      await act(async () => {
        copyButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(writeText).toHaveBeenCalledWith('Here is an answer.');
      const toast = Array.from(container.querySelectorAll('[role="status"]')).find(
        (n) => n.textContent === 'Copied',
      );
      expect(toast).toBeDefined();
      // In-flow toast: never fixed/absolute, so it cannot cover the input.
      expect(toast!.className).not.toMatch(/\bfixed\b/);
      expect(toast!.className).not.toMatch(/\babsolute\b/);
      // DOM order: the toast sits after the scroll container (below the
      // thread, where the composer follows in the page layout).
      const scrollEl = scrollContainer(container);
      expect(
        Boolean(
          scrollEl.compareDocumentPosition(toast as Node) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      ).toBe(true);
    } finally {
      cleanup(container, root);
    }
  });

  it('no Copied toast when the clipboard write fails', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    const { container, root } = renderThread();
    try {
      const copyButton = container.querySelector('[aria-label="Copy message"]');
      await act(async () => {
        copyButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(container.textContent).not.toContain('Copied');
    } finally {
      cleanup(container, root);
    }
  });

  it('Feedback submitted toast appears after feedback, no stacking', async () => {
    const onFeedback = vi.fn();
    const { container, root } = renderThread({ onFeedback });
    try {
      const goodButton = container.querySelector('[aria-label="Good response"]');
      expect(goodButton).not.toBeNull();
      act(() => {
        goodButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(onFeedback).toHaveBeenCalledWith('a1', 'POSITIVE');
      expect(container.textContent).toContain('Feedback submitted');

      // A second confirmation replaces the first — toasts never stack.
      const copyButton = container.querySelector('[aria-label="Copy message"]');
      await act(async () => {
        copyButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(container.textContent).toContain('Copied');
      expect(container.textContent).not.toContain('Feedback submitted');
    } finally {
      cleanup(container, root);
    }
  });

  it('Copied toast auto-dismisses after a short delay', async () => {
    const { container, root } = renderThread();
    try {
      const copyButton = container.querySelector('[aria-label="Copy message"]');
      await act(async () => {
        copyButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(container.textContent).toContain('Copied');
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 2700));
      });
      expect(container.textContent).not.toContain('Copied');
    } finally {
      cleanup(container, root);
    }
  });

  it('working-status line is present iff isStreaming, with no fabricated detail', () => {
    const streaming = renderThread({ isStreaming: true });
    try {
      const line = Array.from(streaming.container.querySelectorAll('[role="status"]')).find(
        (n) => n.textContent === 'Working…',
      );
      expect(line).toBeDefined();
      // Generic wording only: no numbers, no percentages, no invented steps.
      expect(line!.textContent).toBe('Working…');
      expect(line!.textContent).not.toMatch(/\d|%|search|think|step/i);
    } finally {
      cleanup(streaming.container, streaming.root);
    }

    const idle = renderThread({ isStreaming: false });
    try {
      expect(idle.container.textContent).not.toContain('Working…');
    } finally {
      cleanup(idle.container, idle.root);
    }
  });
});
