'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';
import { VoiceInput, Button } from '@quant/shared-ui';

export default function VoicePage() {
  const [transcript, setTranscript] = useState<string | null>(null);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTranscript = async (text: string) => {
    setTranscript(text);
    setError(null);
    setAiResponse(null);
    setLoading(true);

    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, model: 'default' }),
      });
      const json = await res.json();
      if (json.response || json.message || json.data) {
        setAiResponse(json.response || json.message || json.data);
      } else if (json.error) {
        setError(json.error);
      } else {
        setAiResponse('AI responded but the response format was unexpected. Please try again.');
      }
    } catch {
      setError('Failed to get AI response. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      className="flex flex-col items-center justify-center h-screen p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', ...spring.gentle }}
    >
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold mb-2 text-[var(--foreground)]">Voice Interaction</h1>
        <p className="text-[var(--foreground-secondary)]">
          Tap the microphone to start speaking with QuantAI
        </p>
      </div>

      <motion.div
        className="mb-8"
        animate={loading ? { scale: [1, 1.05, 1] } : undefined}
        transition={loading ? { duration: 1.5, repeat: Infinity, ease: 'easeInOut' } : undefined}
      >
        <div
          className={`rounded-full ${loading ? 'ring-4 ring-[var(--brand-accent)]/40' : ''} transition-shadow`}
        >
          <VoiceInput
            onTranscript={handleTranscript}
            onRecordingStart={() => {}}
            onRecordingStop={() => {}}
          />
        </div>
      </motion.div>

      <div className="w-full max-w-md space-y-4">
        {/* Transcript display */}
        <motion.div
          className="p-4 rounded-lg bg-[var(--quant-muted)]"
          initial={false}
          animate={transcript ? { borderColor: 'var(--brand-app-color)' } : undefined}
        >
          {transcript ? (
            <div>
              <p className="text-xs text-[var(--foreground-secondary)] mb-1">Your words:</p>
              <p className="text-sm text-[var(--foreground)]">{transcript}</p>
            </div>
          ) : (
            <p className="text-sm text-[var(--foreground-secondary)] text-center">
              Transcription will appear here...
            </p>
          )}
        </motion.div>

        {/* Loading state */}
        <AnimatePresence>
          {loading && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ type: 'spring', ...spring.snappy }}
              className="p-4 rounded-lg bg-[var(--brand-app-color)]/5 border border-[var(--brand-app-color)]/20"
            >
              <p className="text-sm text-[var(--brand-app-color)] animate-pulse">Thinking...</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* AI Response */}
        <AnimatePresence>
          {aiResponse && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ type: 'spring', ...spring.snappy }}
              className="p-4 rounded-lg bg-[var(--brand-app-color)]/5 border border-[var(--brand-app-color)]/20"
            >
              <p className="text-xs text-[var(--brand-app-color)] mb-1">Quant AI:</p>
              <p className="text-sm text-[var(--foreground)] whitespace-pre-wrap">{aiResponse}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ type: 'spring', ...spring.snappy }}
              className="p-4 rounded-lg bg-red-500/5 border border-red-500/20"
            >
              <p className="text-sm text-red-400">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex justify-center">
          <Button variant="secondary">View History</Button>
        </div>
      </div>
    </motion.div>
  );
}
