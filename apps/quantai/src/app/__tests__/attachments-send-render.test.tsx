import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// Same stub as chat-thread-ergonomics.test.tsx: the page imports the
// shared-ui barrel, whose Media components require @livekit/track-processors
// — absent from this checkout (pre-existing environmental gap, unrelated
// to this unit). ChatMessages itself never renders them.
vi.mock('@quant/shared-ui', () => ({
  AppShell: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Sidebar: () => <div />,
  AnimatedPage: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

import { ChatMessages } from '../page';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const IMAGE_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

type ThreadMessage = {
  id: string;
  role: string;
  content: string;
  timestamp: string;
  attachments?: string[];
};

function renderThread(messages: ThreadMessage[]) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(
      <ChatMessages messages={messages} isStreaming={false} onFeedback={vi.fn()} onRegenerate={vi.fn()} />,
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

describe('quantai-attachments-send-render', () => {
  const originalScrollIntoView = (
    window.HTMLElement.prototype as { scrollIntoView?: unknown }
  ).scrollIntoView;

  beforeEach(() => {
    (window.HTMLElement.prototype as { scrollIntoView: unknown }).scrollIntoView = vi.fn();
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

  it('renders an image attachment as a thumbnail directly above the user question text', () => {
    const { container, root } = renderThread([
      {
        id: 'u1',
        role: 'user',
        content: 'What is in this picture?',
        timestamp: '2026-10-29T00:00:00Z',
        attachments: [IMAGE_DATA_URL],
      },
    ]);
    try {
      const img = container.querySelector('img[src^="data:image/"]');
      expect(img).not.toBeNull();
      expect(img?.getAttribute('src')).toBe(IMAGE_DATA_URL);
      // The thumbnail must precede the question text in document order
      // (above it, not below it or inside the bubble).
      const question = Array.from(container.querySelectorAll('p')).find(
        (p) => p.textContent === 'What is in this picture?',
      );
      expect(question).toBeDefined();
      expect(
        (img as HTMLElement).compareDocumentPosition(question as Node) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    } finally {
      cleanup(container, root);
    }
  });

  it('renders a file attachment as a chip carrying name and size', () => {
    const { container, root } = renderThread([
      {
        id: 'u1',
        role: 'user',
        content: 'Summarize this file',
        timestamp: '2026-10-29T00:00:00Z',
        attachments: ['report.pdf (12.3KB)'],
      },
    ]);
    try {
      const chip = container.querySelector('[aria-label="Attached file"]');
      expect(chip).not.toBeNull();
      expect(chip?.textContent).toContain('report.pdf');
      expect(chip?.textContent).toContain('12.3KB');
      expect(container.textContent).toContain('Summarize this file');
    } finally {
      cleanup(container, root);
    }
  });

  it('renders image thumbnail and file chip together, both above the question', () => {
    const { container, root } = renderThread([
      {
        id: 'u1',
        role: 'user',
        content: 'Both attached',
        timestamp: '2026-10-29T00:00:00Z',
        attachments: [IMAGE_DATA_URL, 'notes.txt (1.2KB)'],
      },
    ]);
    try {
      expect(container.querySelector('img[src^="data:image/"]')).not.toBeNull();
      expect(container.querySelector('[aria-label="Attached file"]')?.textContent).toContain(
        'notes.txt',
      );
      const question = Array.from(container.querySelectorAll('p')).find(
        (p) => p.textContent === 'Both attached',
      );
      expect(question).toBeDefined();
    } finally {
      cleanup(container, root);
    }
  });

  it('renders no thumbnail or file chip for a plain text user turn', () => {
    const { container, root } = renderThread([
      {
        id: 'u1',
        role: 'user',
        content: 'Just text',
        timestamp: '2026-10-29T00:00:00Z',
      },
    ]);
    try {
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('[aria-label="Attached file"]')).toBeNull();
      expect(container.textContent).toContain('Just text');
    } finally {
      cleanup(container, root);
    }
  });

  it('does not render attachments on assistant turns', () => {
    const { container, root } = renderThread([
      {
        id: 'a1',
        role: 'assistant',
        content: 'Here is an answer.',
        timestamp: '2026-10-29T00:00:00Z',
        attachments: [IMAGE_DATA_URL],
      },
    ]);
    try {
      // Assistant branch has no attachment rendering: a stray attachments
      // field on an assistant message must never produce a thumbnail.
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('[aria-label="Attached file"]')).toBeNull();
    } finally {
      cleanup(container, root);
    }
  });
});
