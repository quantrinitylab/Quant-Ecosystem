// @vitest-environment jsdom
//
// QC-F-409 — AvatarGenerator camera path was fully dead: the preview <video>
// only renders once `cameraActive` is true, but startCamera tried to attach
// the stream to videoRef BEFORE setCameraActive(true) — the element did not
// exist yet, the `if (videoRef.current)` guard silently skipped, and no
// second attach path existed. The preview stayed black, and Capture drew
// that stream-less element into a 480x480 black canvas frame that was sent
// to the backend as if it were a real face photo (the user then got the
// misleading "clearer face photo" error).
//
// Fix (AvatarGenerator.tsx only):
//   * startCamera no longer attaches; a single attach effect keyed on
//     cameraActive connects streamRef -> video.srcObject + play() AFTER
//     the element mounts.
//   * captureFromCamera refuses to fabricate a photo when there is no live
//     stream or no decoded frame (videoWidth/videoHeight <= 0): it shows an
//     honest "warming up" error, produces NO imageDataUri, and keeps the
//     camera running.
//
// Harness: stable module-level mocks only (the F-391/F-408 pattern). The
// fake MediaStream/track, canvas 2d context and toDataURL are jsdom
// browser-primitive stubs — jsdom has no camera/canvas rasteriser; what is
// under test is the component's own attach timing and capture guard, not
// the stubs. useAvatar mutations are counting stubs (no network).
//
// Negative control (verified on the pre-fix component in the build run):
//   T1 FAIL (video.srcObject stays null, play never called),
//   T2 FAIL (black-frame capture succeeds silently: img appears, no alert,
//            camera stopped).
//   T3/T4/T5/T6 PASS on both (controls: real-frame capture, upload path,
//   camera-blocked error, unmount cleanup already worked).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ─── Stable hoisted fakes ──────────────────────────────────────────────────
const harness = vi.hoisted(() => {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] };
  return {
    track,
    stream,
    getUserMedia: vi.fn(),
    play: vi.fn(async () => undefined),
    drawImage: vi.fn(),
    frame: { width: 0, height: 0 },
    dataUrl: 'data:image/jpeg;base64,FAKEFRAME',
    generate: {
      mutateAsync: vi.fn(async (_uri: string) => ({ variants: [] })),
      isPending: false,
      isSuccess: false,
    },
    select: {
      mutateAsync: vi.fn(async (_v: unknown) => undefined),
      isPending: false,
      isSuccess: false,
    },
  };
});

vi.mock('../hooks/useAvatar', () => ({
  useGenerateAvatar: () => harness.generate,
  useSelectAvatar: () => harness.select,
  AvatarGenerationError: class AvatarGenerationError extends Error {},
}));

vi.mock('framer-motion', () => {
  const SAFE = /^(className|id|children|role|onClick|style)$|^(aria-|data-)/;
  // Component identities MUST be cached per tag (stable-mock rule — a fresh
  // component type per render remounts the subtree and wipes state).
  const cache = new Map<string, React.ComponentType<Record<string, unknown>>>();
  const make = (tag: string) => {
    let comp = cache.get(tag);
    if (!comp) {
      comp = React.forwardRef(function MotionMock(props: Record<string, unknown>, ref: unknown) {
        const out: Record<string, unknown> = { ref };
        for (const key of Object.keys(props)) {
          if (SAFE.test(key)) out[key] = props[key];
        }
        return React.createElement(tag, out, props.children as React.ReactNode);
      }) as React.ComponentType<Record<string, unknown>>;
      cache.set(tag, comp);
    }
    return comp;
  };
  const motion = new Proxy(
    {},
    { get: (_t, tag: string) => make(typeof tag === 'string' ? tag : 'div') },
  );
  return {
    motion,
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
  };
});

import { AvatarGenerator } from '../components/profile/AvatarGenerator';

// ─── Browser-primitive stubs (jsdom gaps) ──────────────────────────────────
function installBrowserStubs() {
  Object.defineProperty(window.navigator, 'mediaDevices', {
    value: { getUserMedia: harness.getUserMedia },
    configurable: true,
  });
  Object.defineProperty(window.HTMLMediaElement.prototype, 'play', {
    value: harness.play,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window.HTMLVideoElement.prototype, 'videoWidth', {
    get: () => harness.frame.width,
    configurable: true,
  });
  Object.defineProperty(window.HTMLVideoElement.prototype, 'videoHeight', {
    get: () => harness.frame.height,
    configurable: true,
  });
  Object.defineProperty(window.HTMLCanvasElement.prototype, 'getContext', {
    value: (type: string) => (type === '2d' ? { drawImage: harness.drawImage } : null),
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window.HTMLCanvasElement.prototype, 'toDataURL', {
    value: () => harness.dataUrl,
    configurable: true,
    writable: true,
  });
}

// ─── Render helpers ────────────────────────────────────────────────────────
let container: HTMLDivElement;
let root: Root;

async function flush(times = 3) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

async function renderGenerator() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<AvatarGenerator userId="user-1" />);
  });
  await flush();
}

function buttonByText(text: string): HTMLButtonElement {
  const btn = Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === text,
  );
  if (!btn) throw new Error(`button "${text}" not found; buttons: ${Array.from(container.querySelectorAll('button')).map((b) => b.textContent?.trim()).join(' | ')}`);
  return btn as HTMLButtonElement;
}

async function clickButton(text: string) {
  const btn = buttonByText(text);
  await act(async () => {
    btn.click();
  });
  await flush();
}

async function openCamera() {
  await clickButton('Open camera');
}

beforeEach(() => {
  vi.clearAllMocks();
  harness.frame.width = 0;
  harness.frame.height = 0;
  harness.getUserMedia.mockResolvedValue(harness.stream);
  installBrowserStubs();
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root.unmount();
    });
  }
  container?.remove();
});

describe('QC-F-409 AvatarGenerator camera path', () => {
  it('T1: stream is attached to the preview <video> AFTER it mounts, and play() is called', async () => {
    await renderGenerator();
    await openCamera();
    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect((video as HTMLVideoElement).srcObject).toBe(harness.stream);
    expect(harness.play).toHaveBeenCalled();
  });

  it('T2: capture with no decoded frame is refused honestly — no fake photo, camera keeps running', async () => {
    await renderGenerator();
    await openCamera();
    // Frame never arrives (videoWidth/videoHeight stay 0, as on the broken path).
    await clickButton('Capture');
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toMatch(/warming up/i);
    // No fabricated photo was produced.
    expect(container.querySelector('img[alt="Selected face"]')).toBeNull();
    expect(harness.drawImage).not.toHaveBeenCalled();
    // Camera is still running so the user can retry.
    expect(harness.track.stop).not.toHaveBeenCalled();
    expect(() => buttonByText('Capture')).not.toThrow();
  });

  it('T3 (control): capture with a real frame produces the photo and stops the camera', async () => {
    harness.frame.width = 640;
    harness.frame.height = 480;
    await renderGenerator();
    await openCamera();
    await clickButton('Capture');
    const img = container.querySelector('img[alt="Selected face"]') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img?.src).toBe(harness.dataUrl);
    expect(harness.drawImage).toHaveBeenCalled();
    expect(harness.track.stop).toHaveBeenCalled();
  });

  it('T4 (control): upload path still sets the photo without touching the camera', async () => {
    await renderGenerator();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['face-bytes'], 'face.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush(5);
    const img = container.querySelector('img[alt="Selected face"]') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img?.src).toMatch(/^data:image\/png/);
    expect(harness.getUserMedia).not.toHaveBeenCalled();
  });

  it('T5 (control): blocked camera shows the honest upload-instead error', async () => {
    harness.getUserMedia.mockRejectedValue(new Error('denied'));
    await renderGenerator();
    await openCamera();
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toMatch(/Camera access was blocked\. Upload a photo instead\./);
    expect(container.querySelector('video')).toBeNull();
  });

  it('T6 (control): unmounting stops the camera tracks', async () => {
    await renderGenerator();
    await openCamera();
    await act(async () => {
      root.unmount();
    });
    expect(harness.track.stop).toHaveBeenCalled();
    // afterEach would double-unmount; guard by replacing root with a no-op.
    root = { unmount: () => undefined } as unknown as Root;
  });
});
