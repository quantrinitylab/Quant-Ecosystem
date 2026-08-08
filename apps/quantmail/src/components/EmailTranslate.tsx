'use client';

import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface EmailTranslateProps {
  text: string;
  detectedLanguage?: string;
  onTranslate: (text: string, targetLang: string) => Promise<string>;
}

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'ja', label: 'Japanese' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ar', label: 'Arabic' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ko', label: 'Korean' },
];

/**
 * Inline email translation — detects foreign language and offers one-click translate.
 * Gmail has this but only shows a banner. We show the translation inline below the
 * original with language detected automatically.
 */
export function EmailTranslate({ text, detectedLanguage, onTranslate }: EmailTranslateProps) {
  const [translated, setTranslated] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [targetLang, setTargetLang] = useState('en');
  const [showOriginal, setShowOriginal] = useState(false);

  const isNonEnglish = detectedLanguage && detectedLanguage !== 'en';

  const handleTranslate = useCallback(async () => {
    setLoading(true);
    try {
      const result = await onTranslate(text, targetLang);
      setTranslated(result);
    } catch {
      setTranslated('Translation failed. Try again.');
    } finally {
      setLoading(false);
    }
  }, [text, targetLang, onTranslate]);

  if (!isNonEnglish && !translated) return null;

  return (
    <div className="email-translate">
      {!translated && (
        <div className="translate-prompt">
          <span className="translate-icon">🌐</span>
          <span className="translate-text">
            Detected: <strong>{detectedLanguage}</strong>
          </span>
          <select
            className="translate-select"
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
          <button
            type="button"
            className="translate-btn"
            onClick={handleTranslate}
            disabled={loading}
          >
            {loading ? 'Translating…' : 'Translate'}
          </button>
        </div>
      )}
      <AnimatePresence>
        {translated && (
          <motion.div
            className="translate-result"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="translate-result-header">
              <span>🌐 Translated to {LANGUAGES.find((l) => l.code === targetLang)?.label}</span>
              <button type="button" onClick={() => setShowOriginal((v) => !v)}>
                {showOriginal ? 'Hide original' : 'Show original'}
              </button>
              <button type="button" onClick={() => setTranslated(null)}>×</button>
            </div>
            <p className="translate-result-text">{translated}</p>
            {showOriginal && (
              <p className="translate-original">{text}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
