// ============================================================================
// F-052 — STT retry-without-rerecording + honest per-turn latency
// ============================================================================
// Unit tests for stt-retry.ts, plus integration tests driving VoiceModeModal
// with a mocked mic hook + mocked apiFetchRaw:
//   - STT fails -> inline "Retry transcription" appears, retry succeeds on the
//     2nd attempt with NO new capture, honest "(took Xs)" shown
//   - retry fails again -> button retained, audio blob retained (no re-record)
//   - empty/missing audio -> no retry surface
//   - unmount mid-retry -> silent, no crash
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  transcribeAudio,
  formatTurnLatency,
  SttEmptyAudioError,
} from '../stt-retry';
import { VoiceModeModal } from '../VoiceModeModal';
import { apiFetchRaw } from '@quant/api-client';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@quant/api-client', () => ({ apiFetchRaw: vi.fn() }));

const { mockStopCapture } = vi.hoisted(() => ({ mockStopCapture: vi.fn() }));

vi.mock('../../../hooks/useVoiceCapture', () => ({
  useVoiceCapture: () => ({
    state: 'capturing',
    audioLevel: 0.5,
    error: null,
    startCapture: vi.fn(),
    stopCapture: mockStopCapture,
    cancelCapture: vi.fn(),
  }),
  encodeWav16kMono: (pcm: Float32Array) =>
    new Blob([pcm.buffer as ArrayBuffer], { type: 'audio/wav' }),
}));

const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const flushAll = async () => {
  for (let i = 0; i < 6; i++) await flush();
};

const wav = () => new Blob(['fake-audio-bytes'], { type: 'audio/wav' });
const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('stt-retry.ts — transcribeAudio', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns trimmed text and honest latency (audio-sent -> transcript-received)', async () => {
    const times = [1000, 1900];
    let i = 0;
    const now = () => times[i++] ?? 0;
    const res = await transcribeAudio(
      wav(),
      async (form) => {
        expect(form.get('file')).toBeInstanceOf(Blob);
        return jsonRes({ text: '  hello world  ' });
      },
      now,
    );
    expect(res.text).toBe('hello world');
    expect(res.latencyMs).toBe(900);
  });

  it('throws an honest network message when the fetch itself fails', async () => {
    await expect(
      transcribeAudio(wav(), async () => {
        throw new TypeError('fetch failed');
      }),
    ).rejects.toThrow(/could not be reached/i);
  });

  it('surfaces the server-provided error message on HTTP failure', async () => {
    await expect(
      transcribeAudio(wav(), async () => jsonRes({ error: 'quota exceeded' }, 429)),
    ).rejects.toThrow(/quota exceeded/);
  });

  it('reports the HTTP status when the server gives no error body', async () => {
    await expect(
      transcribeAudio(wav(), async () => jsonRes({}, 500)),
    ).rejects.toThrow(/HTTP 500/);
  });

  it('rejects empty transcript text as a failure', async () => {
    await expect(
      transcribeAudio(wav(), async () => jsonRes({ text: '   ' })),
    ).rejects.toThrow(/Transcription failed/);
  });

  it('throws SttEmptyAudioError for an empty blob WITHOUT calling post (not retryable)', async () => {
    const post = vi.fn();
    await expect(transcribeAudio(new Blob([]), post)).rejects.toBeInstanceOf(SttEmptyAudioError);
    expect(post).not.toHaveBeenCalled();
  });

  it('throws SttEmptyAudioError for missing audio', async () => {
    const post = vi.fn();
    await expect(transcribeAudio(null, post)).rejects.toBeInstanceOf(SttEmptyAudioError);
    expect(post).not.toHaveBeenCalled();
  });

  it('clamps negative latency to 0 when the clock skews backwards', async () => {
    const times = [1000, 900]; // t1 < t0: skew
    let i = 0;
    const res = await transcribeAudio(wav(), async () => jsonRes({ text: 'hi' }), () => times[i++] ?? 0);
    expect(res.latencyMs).toBe(0);
  });
});

describe('stt-retry.ts — formatTurnLatency', () => {
  it('formats seconds with one decimal', () => {
    expect(formatTurnLatency(3240)).toBe('took 3.2s');
    expect(formatTurnLatency(1000)).toBe('took 1.0s');
    expect(formatTurnLatency(0)).toBe('took 0.0s');
  });

  it('never renders a negative latency', () => {
    expect(formatTurnLatency(-50)).toBe('took 0.0s');
  });
});

// ---------------------------------------------------------------------------
// VoiceModeModal integration: retry-without-rerecording
// ---------------------------------------------------------------------------

type SttBehavior = () => Response | Promise<Response>;
let sttBehavior: SttBehavior = () => jsonRes({ text: 'hello' });

function mockApi() {
  vi.mocked(apiFetchRaw).mockImplementation(async (path: string) => {
    if (path === '/api/voice/status') return jsonRes({ stt: 'meta' });
    if (path === '/api/voice/stt') return sttBehavior();
    throw new Error(`unexpected api path: ${path}`);
  });
}

async function renderModal(onSendMessage = vi.fn()) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(<VoiceModeModal isOpen onClose={() => {}} onSendMessage={onSendMessage} />);
    await flushAll();
  });
  return { container, root, onSendMessage };
}

async function clickMic(container: HTMLElement) {
  const btn = container.querySelector('[data-testid="mute-toggle-button"]') as HTMLElement;
  expect(btn).not.toBeNull();
  await act(async () => {
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAll();
  });
}

function retryButton(container: HTMLElement) {
  return container.querySelector('[data-testid="stt-retry-button"]') as HTMLButtonElement | null;
}

describe('VoiceModeModal — STT retry without re-recording (F-052)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockStopCapture.mockReset();
    mockStopCapture.mockResolvedValue(wav());
    sttBehavior = () => jsonRes({ text: 'hello' });
    mockApi();
    document.body.innerHTML = '';
  });

  it('shows an inline retry button when STT fails, and retry succeeds on the 2nd attempt with no new capture', async () => {
    let calls = 0;
    sttBehavior = () => {
      calls += 1;
      return calls === 1 ? jsonRes({ error: 'engine timeout' }, 500) : jsonRes({ text: 'second try works' });
    };
    const { container, onSendMessage } = await renderModal();

    await clickMic(container);
    // Failure surface: honest message + kept-recording copy + retry button.
    expect(container.textContent).toContain('engine timeout');
    expect(container.textContent).toContain('Your recording is kept');
    const btn = retryButton(container);
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toContain('Retry transcription');
    expect(mockStopCapture).toHaveBeenCalledTimes(1);

    // Retry: same blob re-POSTed, no new mic capture.
    await act(async () => {
      btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushAll();
    });
    expect(mockStopCapture).toHaveBeenCalledTimes(1); // no re-record
    expect(retryButton(container)).toBeNull(); // error row replaced
    expect(container.textContent).toContain('second try works');
    expect(container.textContent).toMatch(/\(took \d+\.\d+s\)/); // honest latency
    expect(onSendMessage).toHaveBeenCalledWith('second try works');
  });

  it('keeps the retry button (and the audio blob) when the retry also fails', async () => {
    sttBehavior = () => jsonRes({ error: 'still down' }, 503);
    const { container } = await renderModal();

    await clickMic(container);
    const btn = retryButton(container);
    expect(btn).not.toBeNull();

    await act(async () => {
      btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushAll();
    });
    // Blob retained: retry surface still there, still no new capture.
    expect(retryButton(container)).not.toBeNull();
    expect(mockStopCapture).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('still down');
  });

  it('offers no retry when no audio was captured', async () => {
    mockStopCapture.mockResolvedValue(null);
    const { container } = await renderModal();
    await clickMic(container);
    expect(retryButton(container)).toBeNull();
    expect(container.textContent).not.toContain('Your recording is kept');
  });

  it('unmounting mid-retry is silent and crash-free', async () => {
    let resolveStt!: (r: Response) => void;
    let calls = 0;
    sttBehavior = () => {
      calls += 1;
      if (calls === 1) return jsonRes({ error: 'flaky' }, 500);
      return new Promise<Response>((res) => {
        resolveStt = res;
      });
    };
    const { container, root } = await renderModal();

    await clickMic(container);
    const btn = retryButton(container);
    expect(btn).not.toBeNull();

    // Start the retry, then unmount before the server responds.
    await act(async () => {
      btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });
    await act(async () => {
      root.unmount();
    });
    resolveStt(jsonRes({ text: 'too late' }));
    await flushAll();
    expect(container.innerHTML).toBe('');
  });

  it('announces the failure to screen readers via the live region', async () => {
    sttBehavior = () => jsonRes({ error: 'engine timeout' }, 500);
    const { container } = await renderModal();
    await clickMic(container);
    const live = container.querySelector('[data-testid="stt-status-live"]');
    expect(live).not.toBeNull();
    expect(live!.getAttribute('aria-live')).toBe('polite');
    expect(live!.textContent).toContain('Retry transcription');
  });
});
