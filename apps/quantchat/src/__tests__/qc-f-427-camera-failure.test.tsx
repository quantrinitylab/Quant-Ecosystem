// @vitest-environment jsdom
// ============================================================================
// QC-F-427 — Web camera page: failure haalatein dead-end NAHI
// ============================================================================
// initializeCamera ka purana catch sirf NotAllowedError/NotFoundError ko
// 'denied' banata tha; baaki har failure (NotReadableError = camera dusri
// app me band, OverconstrainedError, AbortError, gair-DOMException,
// mediaDevices hi NAHI) 'prompt' par atka reh kar hamesha ka
// "Initializing camera..." spinner dikhata tha — na wajah, na retry.
// NotFoundError ko bhi permission ki jhoothi wajah + Chrome help-link
// milta tha, aur PermissionDenied koi prop NAHI leta tha (Try again NAHI).
// Fix (band Slice-1): har failure ek asal terminal kind — denied /
// no-camera / busy / unsupported / error — apni sachhi copy ke saath;
// PermissionDenied ko { failure, onRetry } props, role="alert", >=44px
// Try again jo initializeCamera(facingMode) dobara bulata hai; flip-failure
// bhi usi screen par aata hai (khaali viewfinder NAHI).
// NC signature (original code par, brief §5): T1/T2/T4/T5/T6/T7/T8/T10
// FAIL, T3 sirf Try-again assert par FAIL, T9 control-PASS — kul
// 9 FAIL / 1 PASS.
// Harness: ghar ki shaili — createRoot + act + stable module-level mocks;
// PermissionDenied ASAL render hota hai (usi ki copy parkhni hai),
// baaki bacche pehchaan-yogya stubs.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const routerMocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => routerMocks,
}));

vi.mock('@quant/shared-ui', () => ({
  BottomNav: () => <div data-testid="bottom-nav-stub" />,
}));

vi.mock('../app/camera/Viewfinder', () => ({
  Viewfinder: () => <div data-testid="viewfinder-stub" />,
}));

vi.mock('../app/camera/CaptureButton', () => ({
  CaptureButton: () => <div data-testid="capture-stub" />,
}));

vi.mock('../app/camera/CameraControls', () => ({
  CameraControls: ({ onFlipCamera }: { onFlipCamera: () => void }) => (
    <button type="button" data-testid="flip-stub" onClick={() => void onFlipCamera()}>
      Flip
    </button>
  ),
}));

vi.mock('../app/camera/ARLensCarousel', () => ({
  ARLensCarousel: () => <div data-testid="lens-stub" />,
}));

import CameraPage from '../app/camera/page';

const getUserMedia = vi.fn();

function fakeStream() {
  return {
    getTracks: () => [{ stop: vi.fn() }],
    getVideoTracks: () => [],
  } as unknown as MediaStream;
}

function domError(name: string) {
  return new DOMException(`fake ${name}`, name);
}

async function settle(ms = 20) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  await settle(20);
}

describe('QC-F-427 camera failure terminal states', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    getUserMedia.mockReset();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  async function renderPage() {
    await act(async () => {
      root.render(<CameraPage />);
    });
    await settle(20);
  }

  function tryAgainButton() {
    return [...container.querySelectorAll('button')].find(
      (b) => (b.textContent ?? '').trim() === 'Try again',
    );
  }

  function text() {
    return container.textContent ?? '';
  }

  it('T1. NotReadableError — "Camera is busy" + Try again, spinner NAHI', async () => {
    getUserMedia.mockRejectedValue(domError('NotReadableError'));
    await renderPage();
    expect(text()).toContain('Camera is busy');
    expect(text()).toContain('being used by another app or tab');
    expect(tryAgainButton(), 'Try again button').toBeTruthy();
    expect(text()).not.toContain('Initializing camera...');
  });

  it('T2. NotFoundError — "No camera found", permission copy/link NAHI, Try again hai', async () => {
    getUserMedia.mockRejectedValue(domError('NotFoundError'));
    await renderPage();
    expect(text()).toContain('No camera found');
    expect(text()).not.toContain('Camera access is required');
    expect(text()).not.toContain('browser settings');
    expect(text()).not.toContain('permissions');
    expect(text()).not.toContain('Learn how to enable');
    expect(tryAgainButton(), 'Try again button').toBeTruthy();
    expect(text()).not.toContain('Initializing camera...');
  });

  it('T3. NotAllowedError — denied copy + help-link barkarar, Try again NAYA', async () => {
    getUserMedia.mockRejectedValue(domError('NotAllowedError'));
    await renderPage();
    expect(text()).toContain('Camera access is required');
    expect(text()).toContain('camera and microphone access');
    expect(text()).toContain('Learn how to enable');
    expect(tryAgainButton(), 'Try again button (purane code par NAHI tha)').toBeTruthy();
  });

  it('T4. OverconstrainedError — "Couldn\'t start the camera" + Try again, spinner NAHI', async () => {
    getUserMedia.mockRejectedValue(domError('OverconstrainedError'));
    await renderPage();
    expect(text()).toContain("Couldn't start the camera");
    expect(tryAgainButton(), 'Try again button').toBeTruthy();
    expect(text()).not.toContain('Initializing camera...');
  });

  it('T5. AbortError aur aam Error dono — "Couldn\'t start the camera" + Try again, spinner NAHI', async () => {
    getUserMedia.mockRejectedValue(domError('AbortError'));
    await renderPage();
    expect(text()).toContain("Couldn't start the camera");
    expect(tryAgainButton(), 'AbortError par Try again').toBeTruthy();
    expect(text()).not.toContain('Initializing camera...');

    await act(async () => {
      root.unmount();
    });
    container.remove();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    getUserMedia.mockReset();
    getUserMedia.mockRejectedValue(new Error('boom'));
    await renderPage();
    expect(text()).toContain("Couldn't start the camera");
    expect(tryAgainButton(), 'gair-DOMException par Try again').toBeTruthy();
    expect(text()).not.toContain('Initializing camera...');
  });

  it('T6. mediaDevices undefined — "Camera isn\'t available here" + Try again, spinner NAHI', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: undefined,
    });
    await renderPage();
    expect(text()).toContain("Camera isn't available here");
    expect(tryAgainButton(), 'Try again button').toBeTruthy();
    expect(text()).not.toContain('Initializing camera...');
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('T7. Retry ke baad success (busy se) — dusri call, failure gayab, viewfinder render', async () => {
    getUserMedia
      .mockRejectedValueOnce(domError('NotReadableError'))
      .mockResolvedValue(fakeStream());
    await renderPage();
    expect(text()).toContain('Camera is busy');
    const btn = tryAgainButton();
    expect(btn, 'Try again button').toBeTruthy();
    await click(btn!);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(text()).not.toContain('Camera is busy');
    expect(text()).not.toContain('Initializing camera...');
    expect(container.querySelector('[data-testid="viewfinder-stub"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="capture-stub"]')).not.toBeNull();
  });

  it('T8. Retry ke baad success (denied se) — granted viewfinder; dusri call facingMode user', async () => {
    getUserMedia
      .mockRejectedValueOnce(domError('NotAllowedError'))
      .mockResolvedValue(fakeStream());
    await renderPage();
    expect(text()).toContain('Camera access is required');
    const btn = tryAgainButton();
    expect(btn, 'Try again button').toBeTruthy();
    await click(btn!);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    const secondCall = getUserMedia.mock.calls[1][0] as {
      video: { facingMode: string };
    };
    expect(secondCall.video.facingMode).toBe('user');
    expect(text()).not.toContain('Camera access is required');
    expect(container.querySelector('[data-testid="viewfinder-stub"]')).not.toBeNull();
  });

  it('T9. control — pehli call hi success: viewfinder, koi failure title NAHI, spinner NAHI', async () => {
    getUserMedia.mockResolvedValue(fakeStream());
    await renderPage();
    expect(container.querySelector('[data-testid="viewfinder-stub"]')).not.toBeNull();
    expect(text()).not.toContain('Camera is busy');
    expect(text()).not.toContain('No camera found');
    expect(text()).not.toContain('Camera access is required');
    expect(text()).not.toContain("Couldn't start the camera");
    expect(text()).not.toContain('Initializing camera...');
  });

  it('T10. Flip-failure — granted ke baad flip reject: busy failure screen, khaali viewfinder NAHI', async () => {
    getUserMedia
      .mockResolvedValueOnce(fakeStream())
      .mockRejectedValue(domError('NotReadableError'));
    await renderPage();
    expect(container.querySelector('[data-testid="viewfinder-stub"]')).not.toBeNull();
    const flip = container.querySelector('[data-testid="flip-stub"]');
    expect(flip, 'flip stub').not.toBeNull();
    await click(flip!);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(text()).toContain('Camera is busy');
    expect(tryAgainButton(), 'flip-failure par Try again').toBeTruthy();
    expect(container.querySelector('[data-testid="viewfinder-stub"]')).toBeNull();
  });
});
