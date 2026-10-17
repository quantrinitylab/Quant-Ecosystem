// @vitest-environment jsdom
//
// QC-F-384 Slice 1 — MapCanvas location honesty.
//
// On geolocation failure (permission denied, timeout, position unavailable,
// or no geolocation API at all) MapCanvas used to set a fabricated
// DEFAULT_LOCATION (New York City, accuracy 0) and render the exact same
// pulsing blue "you are here" dot as a real fix — on timeout/unavailable it
// did not even show the denied banner. These tests render the REAL
// MapCanvas (only framer-motion is mocked, with the stable module-level
// mock pattern from qc-f-331) with per-case geolocation stubs and pin:
//   T1 denied (code 1)      → no dot, banner status "denied"
//   T2 timeout (code 3)     → no dot, banner status "unavailable"
//   T3 unsupported (no API) → no dot, banner status "unsupported"
//   T4 unavailable (code 2) → no dot, banner status "unavailable"
//   C1 success              → dot renders, acquired callback once, no banner
//   C2 pending (no answer)  → no dot, no banner, no callbacks
//   C3 callback contract    → onLocationDenied exactly once per failure,
//                             never on success (asserted in every case)
//   C4 children still render on failure
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('framer-motion', () => {
  const SAFE = /^(className|id|children|role|onClick|style)$|^(aria-|data-)/;
  const make = (tag: string) =>
    React.forwardRef(function MotionMock(props: Record<string, unknown>, ref: unknown) {
      const out: Record<string, unknown> = { ref };
      for (const key of Object.keys(props)) {
        if (!SAFE.test(key)) continue;
        if (key === 'style' && props.style && typeof props.style === 'object') {
          const style: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(props.style as Record<string, unknown>)) {
            if (typeof v === 'string' || typeof v === 'number') style[k] = v;
          }
          out.style = style;
        } else {
          out[key] = props[key];
        }
      }
      return React.createElement(tag, out, props.children as React.ReactNode);
    });
  // Stable component identity per tag (see qc-f-331): a fresh type per render
  // would remount MapCanvas and loop its mount effect.
  const cache = new Map<string, unknown>();
  const motion = new Proxy(
    {},
    {
      get: (_t, tag: string) => {
        const key = typeof tag === 'string' ? tag : 'div';
        if (!cache.has(key)) cache.set(key, make(key));
        return cache.get(key);
      },
    },
  );
  const motionValue = (initial: number) => ({
    get: () => initial,
    set: () => {},
    on: () => () => {},
  });
  return {
    motion,
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
    useMotionValue: motionValue,
    useSpring: motionValue,
    useTransform: () => motionValue(0),
  };
});

import { MapCanvas, type GeoPosition } from '../components/map/MapCanvas';
import type { Mock } from 'vitest';

type GeoError = {
  code: number;
  PERMISSION_DENIED: number;
  POSITION_UNAVAILABLE: number;
  TIMEOUT: number;
  message: string;
};

function stubGeolocationError(code: number) {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (
        _success: unknown,
        error: (e: GeoError) => void,
      ) =>
        error({
          code,
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
          message: 'stubbed geolocation error',
        }),
    },
  });
}

function stubGeolocationSuccess() {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (success: (pos: unknown) => void) =>
        success({
          coords: {
            latitude: 28.61,
            longitude: 77.21,
            accuracy: 10,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: 1720000000000,
        }),
    },
  });
}

function stubGeolocationPending() {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: () => {} },
  });
}

function stubGeolocationUnsupported() {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: undefined,
  });
}

describe('QC-F-384 MapCanvas location honesty (Slice 1)', () => {
  let container: HTMLDivElement;
  let root: Root;
  let onLocationAcquired: Mock<(position: GeoPosition) => void>;
  let onLocationDenied: Mock<() => void>;

  beforeEach(() => {
    onLocationAcquired = vi.fn<(position: GeoPosition) => void>();
    onLocationDenied = vi.fn<() => void>();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderCanvas(withChildren = false) {
    await act(async () => {
      root.render(
        <MapCanvas
          onLocationAcquired={onLocationAcquired}
          onLocationDenied={onLocationDenied}
        >
          {withChildren ? <div data-testid="child-pin">pin</div> : undefined}
        </MapCanvas>,
      );
    });
  }

  function dot(): Element | null {
    return container.querySelector('[data-testid="user-location-dot"]');
  }

  // Control-only helper: C1 must pass on the ORIGINAL code too, but the
  // original dot carries no data-testid (the testid is added by this slice,
  // brief §3.4) — so the control detects the dot block structurally.
  // The T-cases deliberately use the testid contract only.
  function anyDot(): Element | null {
    return (
      dot() ?? container.querySelector('[class*="bg-blue-500"]')
    );
  }

  function banner(): HTMLElement | null {
    return container.querySelector('[data-testid="location-status-banner"]');
  }

  it('T1: permission denied (code 1) — no dot, denied banner, denied callback once', async () => {
    stubGeolocationError(1);
    await renderCanvas();
    expect(dot()).toBeNull();
    const b = banner();
    expect(b).not.toBeNull();
    expect(b?.getAttribute('data-location-status')).toBe('denied');
    expect(b?.textContent).toContain('Enable location to see friends nearby');
    expect(onLocationDenied).toHaveBeenCalledTimes(1);
    expect(onLocationAcquired).not.toHaveBeenCalled();
  });

  it('T2: timeout (code 3) — no dot, unavailable banner (original showed dot and NO banner)', async () => {
    stubGeolocationError(3);
    await renderCanvas();
    expect(dot()).toBeNull();
    const b = banner();
    expect(b).not.toBeNull();
    expect(b?.getAttribute('data-location-status')).toBe('unavailable');
    expect(b?.textContent).toContain('Could not get your location');
    expect(onLocationDenied).toHaveBeenCalledTimes(1);
    expect(onLocationAcquired).not.toHaveBeenCalled();
  });

  it('T3: geolocation unsupported — no dot, unsupported banner', async () => {
    stubGeolocationUnsupported();
    await renderCanvas();
    expect(dot()).toBeNull();
    const b = banner();
    expect(b).not.toBeNull();
    expect(b?.getAttribute('data-location-status')).toBe('unsupported');
    expect(b?.textContent).toContain('Location is not available in this browser');
    expect(onLocationDenied).toHaveBeenCalledTimes(1);
    expect(onLocationAcquired).not.toHaveBeenCalled();
  });

  it('T4: position unavailable (code 2) — no dot, unavailable banner', async () => {
    stubGeolocationError(2);
    await renderCanvas();
    expect(dot()).toBeNull();
    const b = banner();
    expect(b).not.toBeNull();
    expect(b?.getAttribute('data-location-status')).toBe('unavailable');
    expect(b?.textContent).toContain('Could not get your location');
    expect(onLocationDenied).toHaveBeenCalledTimes(1);
    expect(onLocationAcquired).not.toHaveBeenCalled();
  });

  it('C1: real fix — dot renders, acquired callback once with the real coords, no banner', async () => {
    stubGeolocationSuccess();
    await renderCanvas();
    expect(anyDot()).not.toBeNull();
    expect(banner()).toBeNull();
    expect(onLocationAcquired).toHaveBeenCalledTimes(1);
    expect(onLocationAcquired).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: 28.61, longitude: 77.21 }),
    );
    expect(onLocationDenied).not.toHaveBeenCalled();
  });

  it('C2: pending (geolocation never answers) — no dot, no banner, no callbacks', async () => {
    stubGeolocationPending();
    await renderCanvas();
    expect(dot()).toBeNull();
    expect(banner()).toBeNull();
    expect(onLocationAcquired).not.toHaveBeenCalled();
    expect(onLocationDenied).not.toHaveBeenCalled();
  });

  it('C4: children (friend-pin slot) still render on failure', async () => {
    stubGeolocationError(1);
    await renderCanvas(true);
    expect(container.querySelector('[data-testid="child-pin"]')).not.toBeNull();
    expect(dot()).toBeNull();
  });
});
