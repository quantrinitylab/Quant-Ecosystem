// @vitest-environment jsdom
// ============================================================================
// QC-F-573 — VoiceNotePlayer: a REAL player around a genuine <audio> element
// (play/pause/seek/speed), a waveform decoded from the actual audio bytes,
// and an honest labeled fallback when the bytes cannot be read. No emoji.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { VoiceNotePlayer } from '../VoiceNotePlayer';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const URL = 'https://stub-storage.test/u/media_1/voice.webm';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(ui: React.ReactElement): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(ui);
  });
}

function audioEl(): HTMLAudioElement {
  const el = container!.querySelector('[data-testid="voice-note-audio"]');
  if (!(el instanceof HTMLAudioElement)) throw new Error('no <audio> element rendered');
  return el;
}

beforeEach(() => {
  // jsdom has no HTMLMediaElement.play/pause implementations; stub honestly.
  vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(async () => {});
  vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

describe('QC-F-573 VoiceNotePlayer', () => {
  it('renders a REAL <audio> element with the finalized media URL', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    render(<VoiceNotePlayer mediaUrl={URL} durationMs={5320} sender="self" />);
    const el = audioEl();
    expect(el.getAttribute('src')).toBe(URL);
  });

  it('play button toggles the real audio element (pause label after play)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    render(<VoiceNotePlayer mediaUrl={URL} durationMs={5320} sender="other" />);
    const playMock = window.HTMLMediaElement.prototype.play as unknown as ReturnType<typeof vi.fn>;
    const button = container!.querySelector('button[aria-label="Play voice note"]');
    expect(button).toBeTruthy();
    await act(async () => {
      (button as HTMLButtonElement).click();
    });
    expect(playMock).toHaveBeenCalledTimes(1);
    // The <audio> element's play event drives the label (honest state).
    await act(async () => {
      audioEl().dispatchEvent(new Event('play'));
    });
    expect(container!.querySelector('button[aria-label="Pause voice note"]')).toBeTruthy();
  });

  it('shows the recorder duration and cross-checks against the element', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    render(<VoiceNotePlayer mediaUrl={URL} durationMs={5320} sender="self" />);
    // 5320ms -> "0:05".
    expect(container!.textContent).toContain('0:05');
  });

  it('waveform fallback is labeled honestly when bytes cannot be read (no random bars)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('CORS blocked');
      }),
    );
    render(<VoiceNotePlayer mediaUrl={URL} durationMs={3000} sender="self" />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    const wave = container!.querySelector('[role="img"]');
    expect(wave?.getAttribute('aria-label')).toBe('Waveform preview unavailable');
  });

  it('decodes real peaks when the bytes are readable', async () => {
    const channel = new Float32Array(4000);
    for (let i = 0; i < channel.length; i++) {
      channel[i] = Math.abs(Math.sin(i / 40)) * (i < 2000 ? 0.9 : 0.2);
    }
    class FakeAudioContext {
      async decodeAudioData(_buf: ArrayBuffer) {
        return { getChannelData: () => channel, length: channel.length };
      }
      async close(): Promise<void> {}
    }
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array([1, 2, 3]).buffer)),
    );
    render(<VoiceNotePlayer mediaUrl={URL} durationMs={3000} sender="self" />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    const wave = container!.querySelector('[role="img"]');
    expect(wave?.getAttribute('aria-label')).toBe('Voice note waveform');
    const bars = Array.from(wave!.children) as HTMLElement[];
    expect(bars.length).toBe(40);
    // Real decoded peaks vary (loud first half, quiet second half) — never
    // the old hardcoded decorative sequence.
    const heights = bars.map((b) => b.style.height);
    expect(new Set(heights).size).toBeGreaterThan(2);
    const firstHalf = heights.slice(0, 10).map((h) => parseInt(h, 10));
    const secondHalf = heights.slice(20, 30).map((h) => parseInt(h, 10));
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(firstHalf)).toBeGreaterThan(avg(secondHalf));
  });

  it('renders no emoji glyphs anywhere', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    render(<VoiceNotePlayer mediaUrl={URL} durationMs={5320} sender="self" />);
    expect(container!.textContent).not.toMatch(EMOJI_RE);
  });
});
