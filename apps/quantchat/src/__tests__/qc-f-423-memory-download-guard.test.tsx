// @vitest-environment jsdom
// ============================================================================
// QC-F-423 — MemoryViewer Download scheme guard (web regression tests)
//
// The create-side gate (backend MemoryService.create) stops NEW bad URLs,
// but rows stored before it (or seeded outside it) can still carry an
// arbitrary mediaUrl, and the viewer's Download handler copied it verbatim
// into an anchor href and clicked it — `javascript:` / `data:text/html`
// execute in page context on that click.
//
// Closed rule: Download only ever follows the shapes the vault's own
// writer accepts — https: URLs and inline image/video data URLs. Any
// other scheme is a no-op: no anchor is created or clicked.
//
// Negative control (proven in build-QC-F-423.md): on the pre-fix viewer
// T-423-W1's dangerous URL IS clicked (the anchor spy records it); the two
// controls pass on both trees by design. Anchor clicks are intercepted at
// HTMLAnchorElement.prototype — a module-level stable spy, restored after
// each test; no navigation ever happens.
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { MemoryViewer } from '../app/memories/components/MemoryViewer';
import type { Memory } from '../hooks/useMemories';

function makeMemory(mediaUrl: string): Memory {
  return {
    id: 'mem-423',
    userId: 'user-1',
    mediaUrl,
    mediaType: 'PHOTO',
    caption: 'qc-f-423 fixture',
    location: null,
    createdAt: '2026-10-20T00:00:00.000Z',
    deletedAt: null,
    isPrivate: false,
  };
}

async function flush(times = 5) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

describe('QC-F-423 MemoryViewer Download scheme guard', () => {
  let container: HTMLDivElement;
  let root: Root;
  let clickedHrefs: string[];
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clickedHrefs = [];
    clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        clickedHrefs.push(this.href);
      });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    clickSpy.mockRestore();
  });

  async function renderAndDownload(mediaUrl: string) {
    act(() => {
      root.render(
        <MemoryViewer
          memory={makeMemory(mediaUrl)}
          onClose={() => {}}
          onDelete={() => {}}
          onMoveToPrivate={() => {}}
          onMoveToPublic={() => {}}
        />,
      );
    });
    await flush(2);
    const buttons = Array.from(container.querySelectorAll('button'));
    const download = buttons.find((b) => (b.textContent ?? '').includes('Download'));
    expect(download).toBeDefined();
    act(() => {
      download?.click();
    });
    await flush(1);
  }

  it('T-423-W1 NC: a stored javascript: URL is never clicked (no anchor navigation at all)', async () => {
    await renderAndDownload('javascript:alert(1)');
    expect(clickedHrefs).toEqual([]);
  });

  it('T-423-W1b NC: a stored data:text/html URL is never clicked either', async () => {
    await renderAndDownload('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==');
    expect(clickedHrefs).toEqual([]);
  });

  it('T-423-W2 control: an https: memory URL downloads (anchor clicked with the exact URL)', async () => {
    const url = 'https://quantchat-media.s3.amazonaws.com/user-1/media_abc/photo.jpg';
    await renderAndDownload(url);
    expect(clickedHrefs).toEqual([url]);
  });

  it('T-423-W3 control: an inline data:image URL (the shipped capture shape) downloads', async () => {
    const url = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//';
    await renderAndDownload(url);
    expect(clickedHrefs).toEqual([url]);
  });
});
