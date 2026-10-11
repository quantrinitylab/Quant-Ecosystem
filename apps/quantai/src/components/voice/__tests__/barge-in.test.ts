// ============================================================================
// F-045 — Auto-Interrupt (VAD) barge-in: detector, mic-level math, playback
// stop, barge-in watch hook, and the honest settings copy in VoiceModeModal.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { useState } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  BARGE_IN_THRESHOLD,
  BARGE_IN_HOLD_MS,
  createBargeInDetector,
  computeMicLevel,
  stopAssistantPlayback,
  useBargeInWatch,
} from '../barge-in';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// ---------------------------------------------------------------------------
// 1. Detector: threshold + debounce logic
// ---------------------------------------------------------------------------
describe('createBargeInDetector', () => {
  it('fires after the level stays above threshold for the full hold window', () => {
    const onInterrupt = vi.fn();
    const d = createBargeInDetector(BARGE_IN_THRESHOLD, BARGE_IN_HOLD_MS, onInterrupt);
    d.push(0.9, 0);
    d.push(0.9, 250);
    expect(onInterrupt).not.toHaveBeenCalled();
    d.push(0.9, 499);
    expect(onInterrupt).not.toHaveBeenCalled();
    d.push(0.9, 500);
    expect(onInterrupt).toHaveBeenCalledTimes(1);
  });

  it('fires at the exact threshold boundary', () => {
    const onInterrupt = vi.fn();
    const d = createBargeInDetector(BARGE_IN_THRESHOLD, BARGE_IN_HOLD_MS, onInterrupt);
    d.push(BARGE_IN_THRESHOLD, 0);
    d.push(BARGE_IN_THRESHOLD, BARGE_IN_HOLD_MS);
    expect(onInterrupt).toHaveBeenCalledTimes(1);
  });

  it('never fires while the level stays below threshold', () => {
    const onInterrupt = vi.fn();
    const d = createBargeInDetector(BARGE_IN_THRESHOLD, BARGE_IN_HOLD_MS, onInterrupt);
    for (let t = 0; t <= 5000; t += 100) d.push(BARGE_IN_THRESHOLD - 0.01, t);
    expect(onInterrupt).not.toHaveBeenCalled();
  });

  it('ignores sub-500ms bursts: a dip resets the hold window', () => {
    const onInterrupt = vi.fn();
    const d = createBargeInDetector(BARGE_IN_THRESHOLD, BARGE_IN_HOLD_MS, onInterrupt);
    // Loud burst for 300ms, then silence — the window must restart.
    d.push(0.9, 0);
    d.push(0.9, 300);
    d.push(0.05, 301);
    // Loud again from t=400: fires at 900, not at 500.
    d.push(0.9, 400);
    d.push(0.9, 899);
    expect(onInterrupt).not.toHaveBeenCalled();
    d.push(0.9, 900);
    expect(onInterrupt).toHaveBeenCalledTimes(1);
  });

  it('fires exactly once even if the level stays high afterwards', () => {
    const onInterrupt = vi.fn();
    const d = createBargeInDetector(BARGE_IN_THRESHOLD, BARGE_IN_HOLD_MS, onInterrupt);
    d.push(0.9, 0);
    d.push(0.9, 600);
    d.push(0.9, 1200);
    d.push(0.9, 5000);
    expect(onInterrupt).toHaveBeenCalledTimes(1);
  });

  it('reset() re-arms the detector for the next playback', () => {
    const onInterrupt = vi.fn();
    const d = createBargeInDetector(BARGE_IN_THRESHOLD, BARGE_IN_HOLD_MS, onInterrupt);
    d.push(0.9, 0);
    d.push(0.9, 500);
    expect(onInterrupt).toHaveBeenCalledTimes(1);
    d.reset();
    d.push(0.9, 1000);
    d.push(0.9, 1500);
    expect(onInterrupt).toHaveBeenCalledTimes(2);
  });

  it('silence (level 0) never arms the detector', () => {
    const onInterrupt = vi.fn();
    const d = createBargeInDetector(BARGE_IN_THRESHOLD, BARGE_IN_HOLD_MS, onInterrupt);
    d.push(0, 0);
    d.push(0, 10_000);
    expect(onInterrupt).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 2. Mic level math
// ---------------------------------------------------------------------------
describe('computeMicLevel', () => {
  it('returns 0 for digital silence', () => {
    expect(computeMicLevel(new Uint8Array(2048).fill(128))).toBe(0);
  });

  it('returns 0 for an empty buffer', () => {
    expect(computeMicLevel(new Uint8Array(0))).toBe(0);
  });

  it('maps loud full-scale audio above the barge-in threshold', () => {
    const buf = new Uint8Array(2048);
    for (let i = 0; i < buf.length; i++) buf[i] = i % 2 === 0 ? 255 : 0;
    const level = computeMicLevel(buf);
    expect(level).toBeGreaterThanOrEqual(BARGE_IN_THRESHOLD);
    expect(level).toBeLessThanOrEqual(1);
  });

  it('clamps to 1 and stays well below threshold for quiet room tone', () => {
    const buf = new Uint8Array(2048);
    for (let i = 0; i < buf.length; i++) buf[i] = 128 + (i % 3) - 1; // ±1 LSB
    const level = computeMicLevel(buf);
    expect(level).toBeLessThan(BARGE_IN_THRESHOLD);
    expect(level).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// 3. stopAssistantPlayback: both playback channels, null-safe
// ---------------------------------------------------------------------------
describe('stopAssistantPlayback', () => {
  it('pauses backend audio AND cancels browser TTS', () => {
    const audio = { pause: vi.fn() };
    const synth = { cancel: vi.fn() };
    stopAssistantPlayback(audio, synth);
    expect(audio.pause).toHaveBeenCalledTimes(1);
    expect(synth.cancel).toHaveBeenCalledTimes(1);
  });

  it('handles the speechSynthesis-only path (backend TTS failed over)', () => {
    const synth = { cancel: vi.fn() };
    expect(() => stopAssistantPlayback(null, synth)).not.toThrow();
    expect(synth.cancel).toHaveBeenCalledTimes(1);
  });

  it('handles the backend-audio-only path', () => {
    const audio = { pause: vi.fn() };
    expect(() => stopAssistantPlayback(audio, null)).not.toThrow();
    expect(audio.pause).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when nothing is playing', () => {
    expect(() => stopAssistantPlayback(null, null)).not.toThrow();
    expect(() => stopAssistantPlayback(null, undefined)).not.toThrow();
  });

  it('swallows a throwing audio element instead of breaking interrupt', () => {
    const audio = {
      pause: vi.fn(() => {
        throw new Error('already released');
      }),
    };
    const synth = { cancel: vi.fn() };
    expect(() => stopAssistantPlayback(audio, synth)).not.toThrow();
    expect(synth.cancel).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 4. useBargeInWatch hook (jsdom, mocked mic + rAF)
// ---------------------------------------------------------------------------

// Scripted mic data for the fake analyser; swapped per test.
let fillTimeDomain: (buf: Uint8Array) => void = (buf) => buf.fill(128);
const stopTrack = vi.fn();
const closeCtx = vi.fn();
const getUserMedia = vi.fn();
let nowMs = 0;
const rafQueue: FrameRequestCallback[] = [];

class FakeAnalyser {
  fftSize = 2048;
  getByteTimeDomainData(buf: Uint8Array) {
    fillTimeDomain(buf);
  }
}
class FakeAudioContext {
  createAnalyser() {
    return new FakeAnalyser();
  }
  createMediaStreamSource() {
    return { connect: vi.fn() };
  }
  close() {
    closeCtx();
    return Promise.resolve();
  }
}

function Harness({ enabled }: { enabled: boolean }) {
  const [interrupts, setInterrupts] = useState(0);
  useBargeInWatch(enabled, () => setInterrupts((c) => c + 1));
  return React.createElement('div', { 'data-testid': 'interrupts' }, String(interrupts));
}

describe('useBargeInWatch', () => {
  let container: HTMLDivElement;
  let root: Root;

  const loud = (buf: Uint8Array) => {
    for (let i = 0; i < buf.length; i++) buf[i] = i % 2 === 0 ? 255 : 0;
  };
  const quiet = (buf: Uint8Array) => buf.fill(128);

  const flush = async () => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    });
  };
  /** Run one generation of captured rAF callbacks inside act. */
  const pumpRaf = () => {
    act(() => {
      const cbs = rafQueue.splice(0);
      for (const cb of cbs) cb(nowMs);
    });
  };
  const mount = async (enabled: boolean) => {
    await act(async () => {
      root = createRoot(container);
      root.render(React.createElement(Harness, { enabled }));
    });
    await flush();
  };
  const interruptCount = () =>
    Number(container.querySelector('[data-testid="interrupts"]')?.textContent ?? '0');

  beforeEach(() => {
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('AudioContext', FakeAudioContext);
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });
    getUserMedia.mockReset().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
    stopTrack.mockClear();
    closeCtx.mockClear();
    rafQueue.length = 0;
    nowMs = 0;
    fillTimeDomain = quiet;
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('opens the mic and fires onInterrupt after ~500ms of sustained loud audio', async () => {
    fillTimeDomain = loud;
    await mount(true);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    for (const t of [0, 100, 200, 300, 400]) {
      nowMs = t;
      pumpRaf();
    }
    expect(interruptCount()).toBe(0);
    nowMs = 500;
    pumpRaf();
    expect(interruptCount()).toBe(1);
  });

  it('does not interrupt on quiet audio even over a long reply', async () => {
    fillTimeDomain = quiet;
    await mount(true);
    for (let t = 0; t <= 5000; t += 100) {
      nowMs = t;
      pumpRaf();
    }
    expect(interruptCount()).toBe(0);
  });

  it('ignores a sub-500ms loud burst followed by silence', async () => {
    fillTimeDomain = loud;
    await mount(true);
    nowMs = 0;
    pumpRaf();
    nowMs = 200;
    pumpRaf();
    fillTimeDomain = quiet; // cough / door slam ends
    nowMs = 300;
    pumpRaf();
    nowMs = 2000;
    pumpRaf();
    expect(interruptCount()).toBe(0);
  });

  it('never opens the mic when disabled (toggle off => manual tap only)', async () => {
    fillTimeDomain = loud;
    await mount(false);
    expect(getUserMedia).not.toHaveBeenCalled();
    nowMs = 5000;
    pumpRaf();
    expect(interruptCount()).toBe(0);
  });

  it('stops the mic when disabled mid-watch', async () => {
    fillTimeDomain = loud;
    await mount(true);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    await act(async () => {
      root.render(React.createElement(Harness, { enabled: false }));
    });
    await flush();
    expect(stopTrack).toHaveBeenCalled();
    nowMs = 5000;
    pumpRaf();
    expect(interruptCount()).toBe(0);
  });

  it('mic denied: no crash, no interrupt, manual tap still the only path', async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'));
    await mount(true);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    fillTimeDomain = loud;
    nowMs = 5000;
    pumpRaf(); // no meter was ever started
    expect(interruptCount()).toBe(0);
  });

  it('tears down mic tracks and the audio context on unmount', async () => {
    await mount(true);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    act(() => {
      root.unmount();
    });
    expect(stopTrack).toHaveBeenCalled();
    expect(closeCtx).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 5. VoiceModeModal: the Auto-Interrupt toggle is honest copy, not theater
// ---------------------------------------------------------------------------
vi.mock('@quant/api-client', () => ({
  apiFetchRaw: vi.fn(async () => ({
    ok: true,
    json: async () => ({ stt: 'meta' }),
  })),
}));

describe('VoiceModeModal auto-interrupt copy (F-045 improvement)', () => {
  it('exposes an honest accessible name for the Auto-Interrupt toggle', async () => {
    const { VoiceModeModal } = await import('../VoiceModeModal');
    const container = document.createElement('div');
    document.body.appendChild(container);
    let root: Root | null = null;
    await act(async () => {
      root = createRoot(container);
      root.render(
        React.createElement(VoiceModeModal, { isOpen: true, onClose: vi.fn() }),
      );
      await new Promise((r) => setTimeout(r, 0));
    });
    // Open the settings drawer to reach the toggle.
    const settingsBtn = container.querySelector('button[aria-label="Voice settings"]');
    expect(settingsBtn).not.toBeNull();
    act(() => {
      settingsBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const toggle = container.querySelector('input[aria-label^="Auto-Interrupt"]');
    expect(toggle).not.toBeNull();
    expect(toggle!.getAttribute('aria-label')).toContain(
      'speak during the assistant\'s reply to cut it off',
    );
    // Honest barge-in caption is shown next to the toggle.
    expect(container.textContent).toContain('speak while the assistant is talking to cut in');
    act(() => {
      root!.unmount();
    });
    container.remove();
  });

  it('still renders the dialog shell statically', async () => {
    const { VoiceModeModal } = await import('../VoiceModeModal');
    const html = renderToStaticMarkup(
      React.createElement(VoiceModeModal, { isOpen: true, onClose: vi.fn() }),
    );
    expect(html).toContain('data-testid="voice-mode-modal"');
  });
});
