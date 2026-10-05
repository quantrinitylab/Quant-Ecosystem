'use client';

// ============================================================================
// useVoiceCapture — real microphone capture for QuantAI voice mode
// ============================================================================
// - getUserMedia + AudioContext + AnalyserNode => REAL audio levels
//   (replaces the old Math.random() fake level loop)
// - AudioWorklet (inline, no extra file) captures mono PCM, resampled to
//   16 kHz in the AudioContext => WAV 16-bit PCM the Meta STT endpoint wants
// - stopCapture() returns a WAV Blob ready for POST /api/voice/stt
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';

export type VoiceCaptureState =
  | 'idle'
  | 'requesting'
  | 'capturing'
  | 'denied'
  | 'error';

const TARGET_SAMPLE_RATE = 16000;

/** Encode mono Float32 PCM @16kHz as 16-bit PCM WAV. */
export function encodeWav16kMono(pcm: Float32Array): Blob {
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, TARGET_SAMPLE_RATE, true);
  view.setUint32(28, TARGET_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i] ?? 0));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

const PCM_WORKLET = `
class PcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('pcm-capture', PcmCapture);
`;

export interface UseVoiceCapture {
  state: VoiceCaptureState;
  /** Real mic level 0..1, updated ~10/s while capturing. */
  audioLevel: number;
  error: string | null;
  startCapture: () => Promise<void>;
  /** Stops mic and resolves with a 16 kHz mono WAV blob. */
  stopCapture: () => Promise<Blob | null>;
  cancelCapture: () => void;
}

export function useVoiceCapture(): UseVoiceCapture {
  const [state, setState] = useState<VoiceCaptureState>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const fallbackNodeRef = useRef<ScriptProcessorNode | null>(null);
  const rafRef = useRef<number>(0);
  const timeDataRef = useRef<Uint8Array | null>(null);

  const teardown = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    try { workletNodeRef.current?.disconnect(); } catch { /* noop */ }
    try { fallbackNodeRef.current?.disconnect(); } catch { /* noop */ }
    try { ctxRef.current?.close(); } catch { /* noop */ }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    ctxRef.current = null;
    analyserRef.current = null;
    workletNodeRef.current = null;
    fallbackNodeRef.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  // Real level meter loop (RMS of time-domain data).
  const startLevelMeter = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    if (!timeDataRef.current || timeDataRef.current.length !== analyser.fftSize) {
      timeDataRef.current = new Uint8Array(analyser.fftSize);
    }
    const buf = timeDataRef.current;
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i]! - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      // Gain + clamp to a lively 0..1 range.
      setAudioLevel(Math.min(1, rms * 4));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const startCapture = useCallback(async () => {
    setError(null);
    setState('requesting');
    pcmChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      const Ctx = window.AudioContext;
      // Ask for 16 kHz — the context resamples the mic stream for us.
      const ctx = new Ctx({ sampleRate: TARGET_SAMPLE_RATE });
      ctxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;
      src.connect(analyser);

      const onPcm = (chunk: Float32Array) => {
        pcmChunksRef.current.push(chunk);
      };

      let workletOk = false;
      try {
        const url = URL.createObjectURL(new Blob([PCM_WORKLET], { type: 'application/javascript' }));
        await ctx.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        const node = new AudioWorkletNode(ctx, 'pcm-capture');
        node.port.onmessage = (e: MessageEvent<Float32Array>) => onPcm(e.data);
        src.connect(node);
        // Worklet needs a destination connection to run in some browsers; use a
        // zero-gain node so nothing is audible.
        const mute = ctx.createGain();
        mute.gain.value = 0;
        node.connect(mute);
        mute.connect(ctx.destination);
        workletNodeRef.current = node;
        workletOk = true;
      } catch {
        workletOk = false;
      }

      if (!workletOk) {
        // Fallback for older browsers: ScriptProcessorNode.
        const proc = ctx.createScriptProcessor(4096, 1, 1);
        proc.onaudioprocess = (e) => onPcm(new Float32Array(e.inputBuffer.getChannelData(0)));
        src.connect(proc);
        const mute = ctx.createGain();
        mute.gain.value = 0;
        proc.connect(mute);
        mute.connect(ctx.destination);
        fallbackNodeRef.current = proc;
      }

      // If the context couldn't honor 16 kHz, note it (Meta wants 16/24 kHz).
      if (ctx.sampleRate !== TARGET_SAMPLE_RATE && ctx.sampleRate !== 24000) {
        setError(`Mic running at ${ctx.sampleRate} Hz; transcription quality may vary.`);
      }

      await ctx.resume();
      setState('capturing');
      startLevelMeter();
    } catch (err) {
      teardown();
      const name = err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setState('denied');
        setError('Microphone access denied. Allow mic permission to use voice mode.');
      } else {
        setState('error');
        setError(err instanceof Error ? err.message : 'Could not start microphone.');
      }
    }
  }, [startLevelMeter, teardown]);

  const stopCapture = useCallback(async (): Promise<Blob | null> => {
    if (state !== 'capturing') return null;
    // Let the last worklet block flush.
    await new Promise((r) => setTimeout(r, 120));
    const chunks = pcmChunksRef.current;
    const total = chunks.reduce((n, c) => n + c.length, 0);
    teardown();
    setAudioLevel(0);
    setState('idle');
    if (total === 0) return null;
    const pcm = new Float32Array(total);
    let off = 0;
    for (const c of chunks) {
      pcm.set(c, off);
      off += c.length;
    }
    return encodeWav16kMono(pcm);
  }, [state, teardown]);

  const cancelCapture = useCallback(() => {
    pcmChunksRef.current = [];
    teardown();
    setAudioLevel(0);
    setState('idle');
  }, [teardown]);

  return { state, audioLevel, error, startCapture, stopCapture, cancelCapture };
}

export default useVoiceCapture;
