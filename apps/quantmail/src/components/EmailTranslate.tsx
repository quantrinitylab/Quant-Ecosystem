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
        <div className="translate-prompt flex items-center gap-2">
          <span className="translate-icon">
            <svg
              className="size-4 text-[#FF8C42]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="2" x2="22" y1="12" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </span>
          <span className="translate-text">
            Detected: <strong>{detectedLanguage}</strong>
          </span>
          <select
            className="translate-select"
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
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
            <div className="translate-result-header flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-medium">
                <svg
                  className="size-3.5 text-[#FF8C42]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" x2="22" y1="12" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                Translated to {LANGUAGES.find((l) => l.code === targetLang)?.label}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowOriginal((v) => !v)}
                  className="text-xs text-[#A1A4AC] hover:text-[#F5F5F5]"
                >
                  {showOriginal ? 'Hide original' : 'Show original'}
                </button>
                <button
                  type="button"
                  onClick={() => setTranslated(null)}
                  className="text-[#6B6E76] hover:text-[#F5F5F5]"
                >
                  <svg
                    className="size-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
            <p className="translate-result-text">{translated}</p>
            {showOriginal && <p className="translate-original">{text}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
