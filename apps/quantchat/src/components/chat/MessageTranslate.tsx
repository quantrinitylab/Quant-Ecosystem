'use client';

import React, { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AIGeneratedBadge } from './AIGeneratedBadge';

// ============================================================================
// Task 12.6 (Requirement 11.6): "Translate" option on a message.
//
// Drop-in affordance rendered alongside a message. Tapping "Translate" auto-
// detects the source language on the backend and translates into the user's
// preferred language, then shows the translated text (AI content → badged).
// ============================================================================

export interface TranslateResponse {
  success: boolean;
  data?: {
    translatedText: string;
    detectedSourceLanguage: string;
    targetLanguage: string;
    isAIGenerated: boolean;
    confidence: number;
  };
}

export interface MessageTranslateProps {
  /** The original message text to translate. */
  text: string;
  /** User's preferred language code (e.g. "en", "es"). */
  preferredLanguage: string;
  /** Fetcher override (defaults to POST /api/ai/translate). */
  translate?: (args: {
    text: string;
    targetLanguage: string;
  }) => Promise<TranslateResponse['data'] | null>;
  className?: string;
}

async function defaultTranslate(args: {
  text: string;
  targetLanguage: string;
}): Promise<TranslateResponse['data'] | null> {
  const res = await fetch('/api/ai/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as TranslateResponse;
  return json.success ? (json.data ?? null) : null;
}

export function MessageTranslate({
  text,
  preferredLanguage,
  translate = defaultTranslate,
  className = '',
}: MessageTranslateProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TranslateResponse['data'] | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  const handleTranslate = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const data = await translate({ text, targetLanguage: preferredLanguage });
      setResult(data);
      setShowOriginal(false);
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [loading, translate, text, preferredLanguage]);

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {!result && (
        <button
          type="button"
          onClick={handleTranslate}
          disabled={loading}
          aria-label="Translate message"
          className="self-start text-xs font-medium text-violet-600 dark:text-violet-300 hover:underline disabled:opacity-60"
        >
          {loading ? 'Translating\u2026' : '\uD83C\uDF10 Translate'}
        </button>
      )}

      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="rounded-lg bg-violet-50/70 dark:bg-gray-800/70 p-2"
          >
            <p className="text-sm text-gray-800 dark:text-gray-100">
              {showOriginal ? text : result.translatedText}
            </p>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-wide text-gray-400">
                {result.detectedSourceLanguage} {'\u2192'} {result.targetLanguage}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowOriginal((v) => !v)}
                  className="text-[11px] text-violet-600 dark:text-violet-300 hover:underline"
                >
                  {showOriginal ? 'Show translation' : 'Show original'}
                </button>
                <AIGeneratedBadge size="sm" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default MessageTranslate;
