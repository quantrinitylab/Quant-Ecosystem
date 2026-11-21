// @vitest-environment jsdom
// ============================================================================
// QC-F-138 — camera tab par capture kiya photo/video chup-chaap GAYAB
//
// The camera page's handlers built a download <a> they never clicked and
// revoked the object URL immediately: every capture vanished while the UI
// behaved as if it had succeeded. The fix keeps the blob in state and opens
// CapturePreview with real destinations (chat snap send via the data-URL
// transport, POST /memories, device download with the missing .click()).
//
// This suite pins:
//   1. Page wiring: handlers keep the capture; the dead discard code is gone;
//      the objectUrl has a single revoke owner and the Viewfinder can pause.
//   2. Preview behaviour: send payload shape (F-019 snap pattern), failure
//      keeps the preview with a retry path, oversize media is honestly
//      blocked (never faked as sent), Memories posts the real endpoint,
//      device save actually clicks, My Story is honestly disabled.
//   3. apiClient.createMemory posts to /memories (the real backend route).
//
// Api mocks are module-level hoisted objects with stable identities
// (calls-page-auth pattern).
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({
  getConversations: vi.fn(),
  sendMessage: vi.fn(),
  createMemory: vi.fn(),
}));

vi.mock('../services/api-client', () => ({
  apiClient: {
    getConversations: apiMocks.getConversations,
    sendMessage: apiMocks.sendMessage,
    createMemory: apiMocks.createMemory,
  },
}));

import { CapturePreview, type CapturedMedia } from '../app/camera/CapturePreview';
import { MAX_SENDABLE_BYTES, formatBytes } from '../app/camera/capture-send';
import type { Conversation } from '../types';

function readAppSource(relFromApp: string): string {
  const candidates = [
    resolve(process.cwd(), relFromApp),
    resolve(process.cwd(), 'apps/quantchat', relFromApp),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`Could not locate source file: ${relFromApp}`);
  return readFileSync(found, 'utf8');
}

const CONV = {
  id: 'conv-1',
  name: 'Asha Verma',
  participants: [],
} as unknown as Conversation;

function makeCaptured(overrides: Partial<CapturedMedia> = {}): CapturedMedia {
  return {
    blob: new Blob([new Uint8Array(2048)], { type: 'image/jpeg' }),
    kind: 'photo',
    objectUrl: 'blob:qc-f-138-test',
    sizeBytes: 2048,
    lensId: null,
    lensName: null,
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;
let onDiscard: Mock<() => void>;
let onDone: Mock<(message: string) => void>;

async function renderPreview(captured: CapturedMedia) {
  await act(async () => {
    root.render(
      <CapturePreview captured={captured} onDiscard={onDiscard} onDone={onDone} />,
    );
  });
}

function buttonByText(text: string): HTMLButtonElement {
  const btn = Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(text),
  );
  if (!btn) throw new Error(`Button not found: ${text}`);
  return btn as HTMLButtonElement;
}

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  onDiscard = vi.fn();
  onDone = vi.fn();
  apiMocks.getConversations.mockResolvedValue({ success: true, data: [CONV] });
  apiMocks.sendMessage.mockResolvedValue({ success: true, data: { id: 'm1' } });
  apiMocks.createMemory.mockResolvedValue({ success: true, data: { id: 'mem1' } });
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

describe('QC-F-138 — page wiring (source)', () => {
  const page = readAppSource('src/app/camera/page.tsx');

  it('capture handlers keep the blob in state instead of discarding it', () => {
    expect(page).toContain('setCaptured');
    expect(page).toContain("keepCapture(blob, 'photo')");
    expect(page).toContain("keepCapture(blob, 'video')");
  });

  it('the dead discard code is gone (no un-clicked download link, no instant revoke)', () => {
    expect(page).not.toContain("Don't auto-download, just log");
    expect(page).not.toContain("document.createElement('a')");
    expect(page).not.toContain('In a real app, this would save to gallery');
    expect(page).not.toContain('In a real app, this would navigate to editor');
  });

  it('objectUrl revoke has a single owner (ref) plus discard/unmount paths', () => {
    expect(page).toContain('capturedUrlRef');
    expect(page).toContain('URL.revokeObjectURL(capturedUrlRef.current)');
  });

  it('preview renders on capture and the viewfinder pauses under it', () => {
    expect(page).toContain('<CapturePreview');
    expect(page).toContain('paused={!!captured}');
    const viewfinder = readAppSource('src/app/camera/Viewfinder.tsx');
    expect(viewfinder).toContain('paused?: boolean');
    expect(viewfinder).toContain('pausedRef');
  });

  it('apiClient.createMemory posts to the real /memories route', () => {
    const client = readAppSource('src/services/api-client.ts');
    expect(client).toContain('async createMemory(');
    expect(client).toContain("this.post('/memories', request)");
  });
});

describe('QC-F-138 — CapturePreview behaviour', () => {
  it('send: picker lists real conversations and sends the F-019 snap payload', async () => {
    await renderPreview(makeCaptured());
    await click(buttonByText('Send to…'));
    await flush();
    await click(buttonByText('Asha Verma'));
    await flush();

    expect(apiMocks.sendMessage).toHaveBeenCalledTimes(1);
    const payload = apiMocks.sendMessage.mock.calls[0][0];
    expect(payload.conversationId).toBe('conv-1');
    expect(payload.type).toBe('snap_photo');
    expect(payload.disappearMode).toBe('after_view');
    expect(payload.metadata).toEqual({ snap: { durationSec: 10 } });
    expect(payload.mediaUrl.startsWith('data:image/jpeg')).toBe(true);
    expect(payload.content).toBe('Photo Snap');
    expect(onDone).toHaveBeenCalledWith('Sent to Asha Verma');
  });

  it('send: caption becomes the message content', async () => {
    await renderPreview(makeCaptured());
    const input = container.querySelector('input[aria-label="Caption"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set;
    await act(async () => {
      setter?.call(input, 'Dilli ki subah');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flush();
    expect(input.value).toBe('Dilli ki subah');
    await click(buttonByText('Send to…'));
    await flush();
    await click(buttonByText('Asha Verma'));
    await flush();
    expect(apiMocks.sendMessage.mock.calls[0][0].content).toBe('Dilli ki subah');
  });

  it('send: keep-in-chat uses a plain media type and no disappearMode', async () => {
    await renderPreview(makeCaptured());
    await click(buttonByText('Keep in chat'));
    await click(buttonByText('Send to…'));
    await flush();
    await click(buttonByText('Asha Verma'));
    await flush();
    const payload = apiMocks.sendMessage.mock.calls[0][0];
    expect(payload.type).toBe('image');
    expect(payload.disappearMode).toBeUndefined();
  });

  it('send failure keeps the preview, shows the error, and retry can succeed', async () => {
    apiMocks.sendMessage.mockResolvedValueOnce({
      success: false,
      error: { code: 'X', message: 'Network down', statusCode: 0 },
    });
    await renderPreview(makeCaptured());
    await click(buttonByText('Send to…'));
    await flush();
    await click(buttonByText('Asha Verma'));
    await flush();

    expect(onDone).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="capture-preview"]')).not.toBeNull();
    expect(container.textContent).toContain('Network down');

    // Retry against the same conversation now succeeds.
    await click(buttonByText('Asha Verma'));
    await flush();
    expect(apiMocks.sendMessage).toHaveBeenCalledTimes(2);
    expect(onDone).toHaveBeenCalledWith('Sent to Asha Verma');
  });

  it('memories: saves through POST /memories with the real wire shape', async () => {
    await renderPreview(makeCaptured());
    await click(buttonByText('Save to Memories'));
    await flush();
    expect(apiMocks.createMemory).toHaveBeenCalledTimes(1);
    const payload = apiMocks.createMemory.mock.calls[0][0];
    expect(payload.mediaType).toBe('PHOTO');
    expect(payload.mediaUrl.startsWith('data:image/jpeg')).toBe(true);
    expect(onDone).toHaveBeenCalledWith('Saved to Memories');
  });

  it('device save: the download link is actually clicked', async () => {
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    try {
      await renderPreview(makeCaptured());
      await click(buttonByText('Save to device'));
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(container.textContent).toContain('Saved to device ✓');
      // The capture is NOT consumed by a device save — preview stays.
      expect(onDone).not.toHaveBeenCalled();
      expect(onDiscard).not.toHaveBeenCalled();
    } finally {
      clickSpy.mockRestore();
    }
  });

  it('oversize video: send and memories are honestly blocked, device save stays open', async () => {
    const big = new Blob([new Uint8Array(MAX_SENDABLE_BYTES + 1)], { type: 'video/webm' });
    await renderPreview(
      makeCaptured({ blob: big, kind: 'video', sizeBytes: big.size }),
    );
    expect(buttonByText('Send to…').disabled).toBe(true);
    expect(buttonByText('Save to Memories').disabled).toBe(true);
    expect(buttonByText('Save to device').disabled).toBe(false);
    expect(container.textContent).toContain('QC-F-063');
    expect(apiMocks.sendMessage).not.toHaveBeenCalled();
  });

  it('oversize photo: send attempt that cannot shrink far enough fails honestly, nothing is sent', async () => {
    const big = new Blob([new Uint8Array(MAX_SENDABLE_BYTES + 50_000)], {
      type: 'image/jpeg',
    });
    await renderPreview(makeCaptured({ blob: big, sizeBytes: big.size }));
    await click(buttonByText('Send to…'));
    await flush();
    await click(buttonByText('Asha Verma'));
    await flush();
    // jsdom has no createImageBitmap, so no step-down is possible here; the
    // honest outcome is an error and NO send call — never a fake success.
    expect(apiMocks.sendMessage).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(container.textContent).toContain('too large to send');
  });

  it('my story: honestly disabled with the reason shown', async () => {
    await renderPreview(makeCaptured());
    const storyBtn = buttonByText('My Story');
    expect(storyBtn.disabled).toBe(true);
    expect(container.textContent).toContain('coming with QC-F-063');
  });

  it('discard: ✕ calls onDiscard (page revokes and returns to viewfinder)', async () => {
    await renderPreview(makeCaptured());
    const discard = container.querySelector(
      'button[aria-label="Discard and retake"]',
    ) as HTMLButtonElement;
    await click(discard);
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('size honesty: the capture size is shown on the preview', async () => {
    await renderPreview(makeCaptured({ sizeBytes: 2048 }));
    expect(container.textContent).toContain(formatBytes(2048));
  });
});
