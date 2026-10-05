'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  type VoiceState,
  type VoicePersonaId,
  type VoicePersona,
  type TranscriptItem,
  type VoiceSessionConfig,
  SOVEREIGN_PERSONAS,
  PERSONA_LIST,
  DEFAULT_VOICE_CONFIG,
} from './voice-personas';
import { VoiceOrb } from './VoiceOrb';
import { VoiceFloatingChip } from './VoiceFloatingChip';
import { useVoiceCapture } from '../../hooks/useVoiceCapture';

export interface VoiceModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendMessage?: (text: string) => void;
  /** Latest assistant reply text from the real chat pipeline — spoken via TTS. */
  assistantReply?: string | null;
  /** Fired when the assistant reply has been consumed (to avoid re-speaking). */
  onAssistantReplyConsumed?: () => void;
  initialPersonaId?: VoicePersonaId;
  initialConfig?: Partial<VoiceSessionConfig>;
  initialTranscripts?: TranscriptItem[];
}

export const VoiceModeModal: React.FC<VoiceModeModalProps> = ({
  isOpen,
  onClose,
  onSendMessage,
  assistantReply,
  onAssistantReplyConsumed,
  initialPersonaId = 'aura',
  initialConfig,
  initialTranscripts,
}) => {
  // Session Configuration & Persona
  const [config, setConfig] = useState<VoiceSessionConfig>({
    ...DEFAULT_VOICE_CONFIG,
    persona: initialPersonaId,
    ...initialConfig,
  });

  const selectedPersona = SOVEREIGN_PERSONAS[config.persona] || SOVEREIGN_PERSONAS.aura;

  // Voice State Machine
  const [voiceState, setVoiceState] = useState<VoiceState>('listening');
  // Real mic capture: getUserMedia + AudioWorklet PCM + AnalyserNode levels.
  const {
    state: captureState,
    audioLevel: micLevel,
    error: captureError,
    startCapture,
    stopCapture,
    cancelCapture,
  } = useVoiceCapture();
  // Orb level: live mic RMS while capturing, else idle baseline.
  const audioLevel = captureState === 'capturing' ? micLevel : 0.05;
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showPersonaMenu, setShowPersonaMenu] = useState<boolean>(false);
  const [interimSpeech, setInterimSpeech] = useState<string>('');

  // Transcript History
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>(() => {
    if (initialTranscripts && initialTranscripts.length > 0) {
      return initialTranscripts;
    }
    return [
      {
        id: 'initial-greeting',
        speaker: 'assistant',
        personaId: initialPersonaId,
        text:
          SOVEREIGN_PERSONAS[initialPersonaId]?.sampleUtterance || "Hello, I'm here and listening.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ];
  });

  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const synthUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Auto-scroll transcript ticker to bottom
  useEffect(() => {
    if (transcriptScrollRef.current) {
      transcriptScrollRef.current.scrollTop = transcriptScrollRef.current.scrollHeight;
    }
  }, [transcripts, interimSpeech]);



  // Interrupt active assistant speech (Voice Activity Detection trigger or tap)
  const handleInterrupt = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setVoiceState('listening');
    setTranscripts((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.speaker === 'assistant' && !last.isInterrupted) {
        return [
          ...prev.slice(0, -1),
          { ...last, text: `${last.text} [Interrupted]`, isInterrupted: true },
        ];
      }
      return prev;
    });
  }, []);

  // Mute / Unmute live microphone
  const toggleMute = useCallback(() => {
    setConfig((prev) => {
      const next = !prev.isMuted;
      if (next) cancelCapture();
      return { ...prev, isMuted: next };
    });
  }, [cancelCapture]);

  // Persona Switching
  const handleSelectPersona = useCallback((personaId: VoicePersonaId) => {
    const target = SOVEREIGN_PERSONAS[personaId];
    if (!target) return;
    setConfig((prev) => ({
      ...prev,
      persona: personaId,
      pitch: target.defaultPitch,
      rate: target.defaultRate,
      cadence: target.cadence,
    }));
    setShowPersonaMenu(false);
  }, []);

  // Play Audio Sample Preview
  const handlePlayPreview = useCallback((persona: VoicePersona) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(persona.sampleUtterance);
      utterance.pitch = persona.defaultPitch;
      utterance.rate = persona.defaultRate;
      window.speechSynthesis.speak(utterance);
    }
  }, []);

  // Speak text: try backend TTS first, fall back to browser speech.
  const speakText = useCallback(
    async (text: string) => {
      setVoiceState('speaking');
      const botMsg: TranscriptItem = {
        id: `bot-${Date.now()}`,
        speaker: 'assistant',
        personaId: config.persona,
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setTranscripts((prev) => [...prev, botMsg]);

      let played = false;
      try {
        const res = await fetch('/api/voice/tts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text, voiceId: config.persona }),
        });
        if (res.ok) {
          const buf = await res.arrayBuffer();
          if (buf.byteLength > 0) {
            const url = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }));
            const audio = new Audio(url);
            audio.onended = () => {
              URL.revokeObjectURL(url);
              setVoiceState('listening');
            };
            audio.onerror = () => {
              URL.revokeObjectURL(url);
              setVoiceState('listening');
            };
            await audio.play();
            played = true;
          }
        }
      } catch {
        played = false;
      }

      if (!played && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.pitch = config.pitch;
        utterance.rate = config.rate;
        synthUtteranceRef.current = utterance;
        utterance.onend = () => setVoiceState('listening');
        utterance.onerror = () => setVoiceState('listening');
        window.speechSynthesis.speak(utterance);
      } else if (!played) {
        setTimeout(() => setVoiceState('listening'), 3000);
      }
    },
    [config.persona, config.pitch, config.rate],
  );

  // When the real chat pipeline produces an assistant reply, speak it.
  const lastSpokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (assistantReply && assistantReply !== lastSpokenRef.current && voiceState === 'thinking') {
      lastSpokenRef.current = assistantReply;
      onAssistantReplyConsumed?.();
      void speakText(assistantReply);
    }
  }, [assistantReply, voiceState, speakText, onAssistantReplyConsumed]);

  // Real voice turn: mic capture -> Meta STT -> chat pipeline -> TTS.
  const handleVoiceTurn = useCallback(async () => {
    if (config.isMuted) return;
    setInterimSpeech('');
    try {
      await startCapture();
    } catch {
      return;
    }
    // Capture until the user taps the mic button again (toggle behavior is
    // handled by the caller) — this entry point starts a fresh turn.
  }, [config.isMuted, startCapture]);

  const finishVoiceTurn = useCallback(async () => {
    const wav = await stopCapture();
    if (!wav) {
      setVoiceState('listening');
      return;
    }
    setVoiceState('thinking');
    try {
      const form = new FormData();
      form.append('file', wav, 'audio.wav');
      const res = await fetch('/api/voice/stt', { method: 'POST', body: form });
      const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!res.ok || !data.text) {
        throw new Error(data.error || 'Transcription failed');
      }
      const transcript = data.text.trim();
      setInterimSpeech('');
      const userMsg: TranscriptItem = {
        id: `user-${Date.now()}`,
        speaker: 'user',
        text: transcript,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setTranscripts((prev) => [...prev, userMsg]);
      // Into the REAL chat pipeline — the reply comes back via assistantReply.
      onSendMessage?.(transcript);
      // If the parent doesn't feed assistantReply back, don't hang in thinking.
      setTimeout(() => {
        setVoiceState((s) => (s === 'thinking' ? 'listening' : s));
      }, 45000);
    } catch (err) {
      const errMsg: TranscriptItem = {
        id: `err-${Date.now()}`,
        speaker: 'assistant',
        personaId: config.persona,
        text: `Sorry, I couldn't transcribe that: ${err instanceof Error ? err.message : 'unknown error'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setTranscripts((prev) => [...prev, errMsg]);
      setVoiceState('listening');
    }
  }, [stopCapture, onSendMessage, config.persona]);

  // Mic button: tap to start, tap again to stop & transcribe.
  const handleMicButton = useCallback(() => {
    if (captureState === 'capturing') {
      void finishVoiceTurn();
    } else if (!config.isMuted) {
      void handleVoiceTurn();
    }
  }, [captureState, config.isMuted, finishVoiceTurn, handleVoiceTurn]);

  // Clean up Web Speech API on unmount or close
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  if (!isOpen) return null;

  return (
    <>
      {/* Minimized Floating Status Chip */}
      <VoiceFloatingChip
        isOpen={isOpen}
        isMinimized={isMinimized}
        state={voiceState}
        personaId={config.persona}
        persona={selectedPersona}
        isMuted={config.isMuted}
        audioLevel={audioLevel}
        onExpand={() => setIsMinimized(false)}
        onToggleMute={toggleMute}
        onDisconnect={onClose}
      />

      {/* Full-Screen Immersive Voice Mode Modal */}
      {!isMinimized && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="QuantAI Advanced Voice Mode"
          data-testid="voice-mode-modal"
          className="fixed inset-0 z-50 flex flex-col bg-zinc-950/95 backdrop-blur-2xl text-zinc-100 select-none overflow-hidden"
        >
          {/* Top Status & Controls Header */}
          <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80 bg-zinc-950/60 z-20">
            {/* Left: Persona Switcher Badge & Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowPersonaMenu(!showPersonaMenu)}
                aria-haspopup="listbox"
                aria-expanded={showPersonaMenu}
                aria-label="Select Voice Persona"
                className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800/90 transition-all cursor-pointer"
              >
                <span className="text-base">{selectedPersona.avatar}</span>
                <div className="flex flex-col text-left">
                  <span className="text-xs font-semibold text-white leading-tight">
                    {selectedPersona.name}
                  </span>
                  <span className="text-[10px] text-zinc-400 leading-tight">
                    {selectedPersona.tagline}
                  </span>
                </div>
                <svg
                  className="w-3.5 h-3.5 text-zinc-400 ml-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {/* Persona Selector Dropdown Menu */}
              <AnimatePresence>
                {showPersonaMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    role="listbox"
                    aria-label="Sovereign voice personas list"
                    className="absolute left-0 mt-2 w-80 rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl p-2 z-50 text-xs"
                  >
                    <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
                      <span className="font-semibold text-zinc-200 uppercase tracking-wider text-[10px]">
                        Sovereign Voice Personas
                      </span>
                      <span className="text-[10px] text-zinc-400">4 Trademarks</span>
                    </div>

                    <div className="py-1 space-y-1">
                      {PERSONA_LIST.map((p) => {
                        const isSelected = p.id === config.persona;
                        return (
                          <div
                            key={p.id}
                            role="option"
                            aria-selected={isSelected}
                            className={`flex items-start justify-between p-2.5 rounded-xl transition-all ${
                              isSelected
                                ? 'bg-violet-900/30 border border-violet-500/40 text-white'
                                : 'hover:bg-zinc-800/80 text-zinc-300'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => handleSelectPersona(p.id)}
                              className="flex items-start gap-2.5 flex-1 text-left cursor-pointer"
                            >
                              <span className="text-xl shrink-0 mt-0.5">{p.avatar}</span>
                              <div className="min-w-0">
                                <div className="font-semibold flex items-center gap-1.5">
                                  <span>{p.name}</span>
                                  <span className="text-[10px] text-zinc-400 font-normal">
                                    • {p.cadence}
                                  </span>
                                </div>
                                <p className="text-[11px] text-zinc-400 line-clamp-2 mt-0.5 leading-relaxed">
                                  {p.description}
                                </p>
                              </div>
                            </button>

                            {/* Sample Preview Play Button */}
                            <button
                              type="button"
                              onClick={() => handlePlayPreview(p)}
                              aria-label={`Preview voice sample for ${p.name}`}
                              title={`Preview ${p.name}`}
                              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer shrink-0 ml-2"
                            >
                              <span className="text-xs">▶️</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Center: Live Connectivity & Mode Indicator */}
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900/80 border border-zinc-800 text-[11px] text-zinc-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-medium">Advanced Voice Mode</span>
              <span className="text-zinc-500">•</span>
              <span className="text-zinc-400 uppercase tracking-wider text-[10px]">
                Real-time Low Latency
              </span>
            </div>

            {/* Right: Settings, Minimize, Close Actions */}
            <div className="flex items-center gap-2">
              {/* Pitch/Speed Settings Toggle */}
              <button
                type="button"
                onClick={() => setShowSettings(!showSettings)}
                aria-label="Voice settings"
                title="Voice pitch & speed settings"
                className={`p-2 rounded-full transition-colors cursor-pointer ${
                  showSettings
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                  />
                </svg>
              </button>

              {/* Minimize to Floating Chip Button */}
              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                aria-label="Minimize voice mode"
                title="Minimize voice to background chip"
                className="p-2 rounded-full text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {/* End Session Button */}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close voice mode"
                title="End voice session"
                className="p-2 rounded-full bg-red-500/20 text-red-400 hover:bg-red-500/30 hover:text-red-300 transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </header>

          {/* Configuration Drawer (Pitch, Speed, Cadence) */}
          <AnimatePresence>
            {showSettings && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="border-b border-zinc-800 bg-zinc-900/90 px-6 py-4 flex flex-wrap items-center justify-between gap-6 text-xs z-10"
              >
                <div className="flex items-center gap-6 flex-wrap">
                  {/* Speech Rate / Speed Slider */}
                  <div className="flex items-center gap-3">
                    <label htmlFor="voice-speed" className="font-medium text-zinc-300">
                      Speed ({config.rate.toFixed(2)}x):
                    </label>
                    <input
                      id="voice-speed"
                      type="range"
                      min="0.8"
                      max="1.5"
                      step="0.05"
                      value={config.rate}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, rate: parseFloat(e.target.value) }))
                      }
                      className="w-28 accent-violet-400 cursor-pointer"
                    />
                  </div>

                  {/* Pitch Slider */}
                  <div className="flex items-center gap-3">
                    <label htmlFor="voice-pitch" className="font-medium text-zinc-300">
                      Pitch ({config.pitch.toFixed(2)}x):
                    </label>
                    <input
                      id="voice-pitch"
                      type="range"
                      min="0.5"
                      max="1.8"
                      step="0.05"
                      value={config.pitch}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, pitch: parseFloat(e.target.value) }))
                      }
                      className="w-28 accent-violet-400 cursor-pointer"
                    />
                  </div>

                  {/* Noise Suppression & Echo Cancellation */}
                  <div className="flex items-center gap-4 text-zinc-400">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.noiseSuppression}
                        onChange={(e) =>
                          setConfig((prev) => ({ ...prev, noiseSuppression: e.target.checked }))
                        }
                        className="rounded accent-violet-500 cursor-pointer"
                      />
                      <span>Noise Suppression</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.autoInterrupt}
                        onChange={(e) =>
                          setConfig((prev) => ({ ...prev, autoInterrupt: e.target.checked }))
                        }
                        className="rounded accent-violet-500 cursor-pointer"
                      />
                      <span>Auto-Interrupt (VAD)</span>
                    </label>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setConfig((prev) => ({
                      ...prev,
                      pitch: selectedPersona.defaultPitch,
                      rate: selectedPersona.defaultRate,
                    }))
                  }
                  className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors cursor-pointer"
                >
                  Reset Defaults
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Central Stage: 3D Fluid Animated Audio Sphere */}
          <main className="flex-1 flex flex-col items-center justify-center relative p-6">
            {/* Dynamic Animated 3D Audio Sphere */}
            <div className="relative z-10 flex flex-col items-center">
              <VoiceOrb
                state={voiceState}
                personaId={config.persona}
                persona={selectedPersona}
                audioLevel={audioLevel}
                size="hero"
                isMuted={config.isMuted}
                onClick={voiceState === 'speaking' ? handleInterrupt : handleMicButton}
              />
            </div>

            {/* Mic capture error (permission denied, etc.) */}
            {(captureError || captureState === 'denied') && (
              <div className="mt-4 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/40 text-red-300 text-xs max-w-sm text-center">
                {captureError || 'Microphone unavailable.'}
              </div>
            )}

            {/* Interrupt Action Banner (Appears when assistant is speaking) */}
            <div className="h-10 mt-10 flex items-center justify-center">
              <AnimatePresence>
                {voiceState === 'speaking' && (
                  <motion.button
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    type="button"
                    onClick={handleInterrupt}
                    aria-label="Tap to interrupt assistant"
                    data-testid="interrupt-button"
                    className="px-4 py-1.5 rounded-full bg-zinc-800/90 hover:bg-zinc-700/90 border border-zinc-600 text-xs font-semibold text-zinc-200 hover:text-white shadow-xl flex items-center gap-2 cursor-pointer transition-all active:scale-95"
                  >
                    <span>✋</span>
                    <span>Tap to interrupt</span>
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </main>

          {/* Real-Time Transcript Ticker Bar */}
          <section
            aria-label="Live voice transcript ticker"
            className="w-full max-w-3xl mx-auto px-6 mb-2"
          >
            <div
              ref={transcriptScrollRef}
              data-testid="transcript-ticker"
              className="max-h-32 overflow-y-auto rounded-2xl bg-zinc-900/60 border border-zinc-800/80 p-3.5 space-y-2 backdrop-blur-md shadow-inner text-xs"
            >
              {transcripts.slice(-4).map((t) => (
                <div
                  key={t.id}
                  className={`flex items-start gap-2 ${
                    t.speaker === 'user' ? 'text-zinc-200' : 'text-violet-300'
                  }`}
                >
                  <span className="font-semibold shrink-0">
                    {t.speaker === 'user' ? 'You:' : `${selectedPersona.name}:`}
                  </span>
                  <span className="leading-relaxed flex-1">{t.text}</span>
                  <span className="text-[10px] text-zinc-500 shrink-0">{t.timestamp}</span>
                </div>
              ))}
              {interimSpeech && (
                <div className="flex items-start gap-2 text-zinc-400 italic">
                  <span className="font-semibold shrink-0">Listening:</span>
                  <span className="leading-relaxed animate-pulse">{interimSpeech}...</span>
                </div>
              )}
            </div>
          </section>

          {/* Bottom Control Bar: Mic, Input Visualizer, Text Input Prompt, End Call */}
          <footer className="w-full px-6 py-4 border-t border-zinc-800/80 bg-zinc-950/80 backdrop-blur-xl flex flex-col sm:flex-row items-center justify-between gap-4 z-20">
            {/* Left: Live Input Audio Level Visualizer */}
            <div
              className="flex items-center gap-1.5 h-6 px-3 rounded-full bg-zinc-900 border border-zinc-800"
              aria-label="Audio level visualizer"
            >
              <span className="text-[10px] text-zinc-400 mr-1">MIC</span>
              {[1, 2, 3, 4, 5, 6, 7].map((barIndex) => {
                const isActive = !config.isMuted && audioLevel > barIndex * 0.12;
                return (
                  <motion.div
                    key={barIndex}
                    className={`w-1 rounded-full transition-colors ${
                      config.isMuted
                        ? 'bg-zinc-700 h-1.5'
                        : isActive
                          ? 'bg-emerald-400'
                          : 'bg-zinc-700 h-1.5'
                    }`}
                    animate={{
                      height: config.isMuted
                        ? 4
                        : Math.max(4, audioLevel * 20 * (barIndex % 2 === 0 ? 1 : 0.8)),
                    }}
                    transition={{ duration: 0.1 }}
                  />
                );
              })}
            </div>

            {/* Center Controls: Mute/Unmute Mic Toggle & Interrupt / Simulation */}
            <div className="flex items-center gap-4">
              {/* Primary Live Microphone Toggle */}
              <button
                type="button"
                onClick={handleMicButton}
                onDoubleClick={toggleMute}
                aria-label={
                  captureState === 'capturing'
                    ? 'Stop and transcribe'
                    : config.isMuted
                      ? 'Unmute microphone'
                      : 'Start voice capture'
                }
                title="Tap to talk, tap again to transcribe (double-click to mute)"
                data-testid="mute-toggle-button"
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-xl ${
                  captureState === 'capturing'
                    ? 'bg-emerald-500 text-zinc-950 hover:bg-emerald-400 animate-pulse'
                    : config.isMuted
                      ? 'bg-red-500/20 border-2 border-red-500 text-red-400 hover:bg-red-500/30'
                      : 'bg-white text-zinc-950 hover:bg-zinc-200'
                }`}
              >
                {config.isMuted ? (
                  <span className="text-xl">🔇</span>
                ) : captureState === 'capturing' ? (
                  <span className="text-xl">⏹️</span>
                ) : (
                  <span className="text-xl">🎙️</span>
                )}
              </button>


            </div>

            {/* Right: End Voice Session */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                aria-label="Disconnect call"
                data-testid="disconnect-button"
                className="px-4 py-2 rounded-xl bg-red-600/90 hover:bg-red-500 text-white text-xs font-semibold shadow-lg transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span>End Call</span>
              </button>
            </div>
          </footer>
        </div>
      )}
    </>
  );
};

export default VoiceModeModal;
