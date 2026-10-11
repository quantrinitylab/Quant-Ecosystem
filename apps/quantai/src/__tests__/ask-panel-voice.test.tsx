// ============================================================================
// AskQuantPanel voice flow (F-044) — interaction tests
// ============================================================================
// The mic must never animate/record/drop silently: capture goes through the
// real useVoiceCapture hook, the WAV goes to the real /api/voice/stt pipeline,
// and the transcript lands in the input box for review. Every failure path
// must surface an honest error in the panel.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// Silence React's act() environment warning under vitest jsdom.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// Mock framer-motion (any motion.* tag renders as the plain element).
vi.mock('framer-motion', () => {
  const mockMotion = new Proxy(
    {},
    {
      get:
        (_t, tag: string) =>
        ({ children, ...props }: any) =>
          React.createElement(tag, props, children),
    },
  );
  return {
    motion: mockMotion,
    AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
  };
});

// Controllable useVoiceCapture mock.
const voiceMock = {
  state: 'idle',
  audioLevel: 0,
  error: null as string | null,
  startCapture: vi.fn(async () => {}),
  stopCapture: vi.fn(async (): Promise<Blob | null> => null),
  cancelCapture: vi.fn(),
};
vi.mock('../hooks/useVoiceCapture', () => ({
  useVoiceCapture: () => voiceMock,
}));

// Mock the transport; the REAL transcribeVoiceAudio helper runs against it.
vi.mock('@quant/api-client', () => ({
  apiFetchRaw: vi.fn(),
}));

const { AskQuantPanel } = await import('../components/AskQuantPanel');
const { apiFetchRaw } = await import('@quant/api-client');
const mockFetch = apiFetchRaw as unknown as ReturnType<typeof vi.fn>;

function wavBlob(): Blob {
  return new Blob([new Uint8Array(2048)], { type: 'audio/wav' });
}

function sttOk(text: string) {
  return { ok: true, status: 200, json: async () => ({ text }) } as unknown as Response;
}

function sttFail(status: number, error: string) {
  return { ok: false, status, json: async () => ({ error }) } as unknown as Response;
}

let container: HTMLDivElement;
let root: Root;

function renderPanel() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
}

async function mount() {
  await act(async () => {
    root.render(React.createElement(AskQuantPanel));
  });
}

function micButton(): HTMLButtonElement {
  const btn = container.querySelector(
    'button[aria-label="Start recording"], button[aria-label="Stop recording"]',
  );
  if (!btn) throw new Error('mic button not found');
  return btn as HTMLButtonElement;
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function errorText(): string {
  return container.textContent ?? '';
}

beforeEach(() => {
  voiceMock.state = 'idle';
  voiceMock.error = null;
  voiceMock.startCapture.mockClear().mockImplementation(async () => {});
  voiceMock.stopCapture.mockClear().mockImplementation(async () => null);
  voiceMock.cancelCapture.mockClear();
  mockFetch.mockReset();
  if (container) {
    root.unmount();
    container.remove();
  }
});

describe('AskQuantPanel voice flow (F-044)', () => {
  it('renders the mic button ready to record', async () => {
    renderPanel();
    await mount();
    const btn = container.querySelector('button[aria-label="Start recording"]');
    expect(btn).not.toBeNull();
    expect(btn?.hasAttribute('disabled')).toBe(false);
  });

  it('first tap starts real capture via the hook', async () => {
    renderPanel();
    await mount();
    await click(micButton());
    expect(voiceMock.startCapture).toHaveBeenCalledTimes(1);
  });

  it('shows Stop recording + Listening... while capturing', async () => {
    voiceMock.state = 'capturing';
    renderPanel();
    await mount();
    expect(container.querySelector('button[aria-label="Stop recording"]')).not.toBeNull();
    expect(errorText()).toContain('Listening...');
  });

  it('full voice turn: stops capture, transcribes, lands transcript in the input box', async () => {
    voiceMock.state = 'capturing';
    const wav = wavBlob();
    voiceMock.stopCapture.mockResolvedValueOnce(wav);
    mockFetch.mockResolvedValueOnce(sttOk('  send email to bob  '));
    renderPanel();
    await mount();

    await click(micButton());

    // The WAV went to the real STT route as multipart.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [path, init] = mockFetch.mock.calls[0] as [string, { body: unknown }];
    expect(path).toBe('/api/voice/stt');
    expect((init.body as FormData).get('file')).toBeInstanceOf(Blob);

    // Transcript lands in the input box for review (trimmed), ready for the
    // normal dry-run -> plan preview -> Execute path.
    await act(async () => {
      await vi.waitFor(() => {
        const input = container.querySelector(
          'input[aria-label="Ask Quant"]',
        ) as HTMLInputElement;
        expect(input.value).toBe('send email to bob');
      });
    });
    const input = container.querySelector('input[aria-label="Ask Quant"]') as HTMLInputElement;
    expect(input.value).toBe('send email to bob');
  });

  it('shows Transcribing… honestly while the STT request is in flight', async () => {
    voiceMock.state = 'capturing';
    voiceMock.stopCapture.mockResolvedValueOnce(wavBlob());
    let resolveFetch!: (res: Response) => void;
    mockFetch.mockImplementationOnce(
      () => new Promise<Response>((resolve) => { resolveFetch = resolve; }),
    );
    renderPanel();
    await mount();

    const btn = micButton();
    await act(async () => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      // Flush the microtask queue so the handler reaches setTranscribing(true).
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(errorText()).toContain('Transcribing…');

    // Resolve the in-flight STT request, flush the promise chain, and let
    // act() process the resulting state updates.
    await act(async () => {
      resolveFetch(sttOk('hello quant'));
      await new Promise((r) => setTimeout(r, 50));
    });
    const input = container.querySelector('input[aria-label="Ask Quant"]') as HTMLInputElement;
    expect(input.value).toBe('hello quant');
    // Transcribing state cleared — the mic is usable again.
    expect(errorText()).not.toContain('Transcribing…');
  });

  it('STT outage (503) surfaces the honest server message, nothing is dropped silently', async () => {
    voiceMock.state = 'capturing';
    voiceMock.stopCapture.mockResolvedValueOnce(wavBlob());
    mockFetch.mockResolvedValueOnce(sttFail(503, 'Voice backend unreachable'));
    renderPanel();
    await mount();

    await click(micButton());

    await act(async () => {
      await vi.waitFor(() => {
        expect(errorText()).toContain(
          'Transcription failed: Voice backend unreachable',
        );
      });
    });
    // Input stays empty — no fake transcript was invented.
    const input = container.querySelector('input[aria-label="Ask Quant"]') as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('empty recording shows an honest error instead of a fake turn', async () => {
    voiceMock.state = 'capturing';
    voiceMock.stopCapture.mockResolvedValueOnce(null);
    renderPanel();
    await mount();

    await click(micButton());

    await act(async () => {
      await vi.waitFor(() => {
        expect(errorText()).toContain('No audio captured');
      });
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('mic permission denied surfaces the hook’s honest error', async () => {
    voiceMock.state = 'denied';
    voiceMock.error = 'Microphone access denied. Allow mic permission to use voice mode.';
    renderPanel();
    await mount();
    expect(errorText()).toContain('Microphone access denied');
  });

  it('does not leave the mic button disabled after a failed turn (retry stays possible)', async () => {
    voiceMock.state = 'capturing';
    voiceMock.stopCapture.mockResolvedValueOnce(wavBlob());
    mockFetch.mockResolvedValueOnce(sttFail(500, 'boom'));
    renderPanel();
    await mount();

    await click(micButton());
    await act(async () => {
      await vi.waitFor(() => {
        expect(errorText()).toContain('Transcription failed: boom');
      });
    });
    // Back to idle: the mic is usable again for a retry.
    voiceMock.state = 'idle';
    await mount();
    const btn = container.querySelector('button[aria-label="Start recording"]');
    expect(btn?.hasAttribute('disabled')).toBe(false);
  });
});
