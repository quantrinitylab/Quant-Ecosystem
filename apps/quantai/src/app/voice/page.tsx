'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVoiceCapture } from '../../hooks/useVoiceCapture';
import { apiFetchRaw } from '@quant/api-client';

export default function VoicePage() {
  const {
    state: captureState,
    audioLevel,
    error: captureError,
    startCapture,
    stopCapture,
    cancelCapture,
  } = useVoiceCapture();
  const [transcript, setTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isListening = captureState === 'capturing';

  const toggleListening = useCallback(async () => {
    setError(null);
    if (isListening) {
      // Stop capture -> real STT -> real chat pipeline.
      const wav = await stopCapture();
      if (!wav) {
        setIsProcessing(false);
        return;
      }
      setIsProcessing(true);
      try {
        const form = new FormData();
        form.append('file', wav, 'audio.wav');
        const sttRes = await apiFetchRaw('/api/voice/stt', { method: 'POST', body: form });
        const sttData = (await sttRes.json().catch(() => ({}))) as {
          text?: string;
          error?: string;
        };
        if (!sttRes.ok || !sttData.text) {
          throw new Error(sttData.error || 'Transcription failed');
        }
        const text = String(sttData.text).trim();
        setTranscript(text);

        const chatRes = await apiFetchRaw('/api/assistant/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: text }),
        });
        const chatData = (await chatRes.json().catch(() => ({}))) as {
          response?: string;
          error?: string;
        };
        if (!chatRes.ok) {
          throw new Error(chatData.error || 'Chat request failed');
        }
        setAiResponse(chatData.response ?? '');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Voice request failed');
      } finally {
        setIsProcessing(false);
      }
    } else {
      cancelCapture();
      setTranscript('');
      setAiResponse('');
      await startCapture();
    }
  }, [isListening, startCapture, stopCapture, cancelCapture]);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full text-center">
        {/* Header */}
        <div className="mb-12">
          <div className="inline-block px-4 py-1 rounded-full bg-white/5 text-xs tracking-[3px] mb-4">
            VOICE MODE
          </div>
          <h1 className="text-7xl font-bold tracking-[-3px]">Talk to QuantAI</h1>
          <p className="text-xl text-white/50 mt-3">Your voice. Your agents. Instant execution.</p>
        </div>

        {/* Voice Orb */}
        <div className="relative flex items-center justify-center mb-12">
          <motion.button
            onClick={toggleListening}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={`relative w-48 h-48 rounded-full flex items-center justify-center transition-all duration-300 ${
              isListening
                ? 'bg-red-500/20 border-2 border-red-500'
                : 'bg-white/5 border border-white/20 hover:bg-white/10'
            }`}
            aria-label={isListening ? 'Stop listening' : 'Start speaking'}
          >
            {/* Animated rings driven by the real mic level */}
            {isListening && (
              <>
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="absolute rounded-full border border-red-500/40"
                    animate={{
                      scale: [1, 1.4 + audioLevel],
                      opacity: [0.6, 0],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      delay: i * 0.4,
                    }}
                    style={{ width: 192 + i * 40, height: 192 + i * 40 }}
                  />
                ))}
              </>
            )}

            <div className="text-7xl z-10">{isListening ? '🎙️' : '🎤'}</div>
          </motion.button>
        </div>

        <button
          onClick={toggleListening}
          className="text-lg px-8 py-4 rounded-2xl border border-white/20 hover:bg-white/5 transition-all active:scale-[0.985]"
        >
          {isListening ? 'Stop Listening' : 'Start Speaking'}
        </button>

        {(captureError || error) && (
          <div className="mt-6 max-w-lg mx-auto text-red-300/90 bg-red-500/10 border border-red-500/30 rounded-2xl px-6 py-4">
            {captureError || error}
          </div>
        )}

        {/* Transcript */}
        <AnimatePresence>
          {transcript && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-12 text-left max-w-lg mx-auto"
            >
              <div className="text-xs text-white/40 tracking-[2px] mb-2">YOU SAID</div>
              <div className="text-2xl leading-tight">"{transcript}"</div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* AI Response */}
        <AnimatePresence>
          {isProcessing && (
            <div className="mt-12">
              <div className="flex items-center justify-center gap-3 text-white/60">
                <div className="w-2 h-2 rounded-full bg-white/60 animate-pulse" />
                <div>QuantAI is thinking...</div>
              </div>
            </div>
          )}

          {aiResponse && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-12 text-left max-w-2xl mx-auto bg-zinc-950 border border-zinc-800 rounded-3xl p-8"
            >
              <div className="text-xs text-emerald-400 tracking-[2px] mb-3">QUANTAI RESPONSE</div>
              <div className="text-lg leading-relaxed whitespace-pre-line">{aiResponse}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
