// ============================================================================
// QuantAI - Translation Page
// Source/target language dropdowns with search, swap button, text input area,
// instant translation output, voice input, conversation mode, camera OCR,
// translation history sidebar
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useVoiceCapture } from '../hooks/useVoiceCapture';

interface Language {
  code: string;
  name: string;
  native: string;
  flag: string;
}

interface TranslationHistoryItem {
  id: string;
  source: string;
  target: string;
  sourceLang: string;
  targetLang: string;
  timestamp: string;
}

interface ConversationMessage {
  id: string;
  speaker: 'A' | 'B';
  original: string;
  translated: string;
  lang: string;
  timestamp: string;
}

const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', native: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', native: 'Espanol', flag: '🇪🇸' },
  { code: 'fr', name: 'French', native: 'Francais', flag: '🇫🇷' },
  { code: 'de', name: 'German', native: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', name: 'Italian', native: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', native: 'Portugues', flag: '🇵🇹' },
  { code: 'ru', name: 'Russian', native: 'Russkiy', flag: '🇷🇺' },
  { code: 'zh', name: 'Chinese', native: 'Zhongwen', flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese', native: 'Nihongo', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', native: 'Hangugeo', flag: '🇰🇷' },
  { code: 'ar', name: 'Arabic', native: 'Arabiyya', flag: '🇸🇦' },
  { code: 'hi', name: 'Hindi', native: 'Hindi', flag: '🇮🇳' },
  { code: 'bn', name: 'Bengali', native: 'Bangla', flag: '🇧🇩' },
  { code: 'pa', name: 'Punjabi', native: 'Panjabi', flag: '🇮🇳' },
  { code: 'tr', name: 'Turkish', native: 'Turkce', flag: '🇹🇷' },
  { code: 'vi', name: 'Vietnamese', native: 'Tieng Viet', flag: '🇻🇳' },
  { code: 'th', name: 'Thai', native: 'Phasa Thai', flag: '🇹🇭' },
  { code: 'nl', name: 'Dutch', native: 'Nederlands', flag: '🇳🇱' },
  { code: 'pl', name: 'Polish', native: 'Polski', flag: '🇵🇱' },
  { code: 'uk', name: 'Ukrainian', native: 'Ukrayinska', flag: '🇺🇦' },
  { code: 'sv', name: 'Swedish', native: 'Svenska', flag: '🇸🇪' },
  { code: 'da', name: 'Danish', native: 'Dansk', flag: '🇩🇰' },
  { code: 'fi', name: 'Finnish', native: 'Suomi', flag: '🇫🇮' },
  { code: 'no', name: 'Norwegian', native: 'Norsk', flag: '🇳🇴' },
  { code: 'el', name: 'Greek', native: 'Ellinika', flag: '🇬🇷' },
  { code: 'he', name: 'Hebrew', native: 'Ivrit', flag: '🇮🇱' },
  { code: 'cs', name: 'Czech', native: 'Cestina', flag: '🇨🇿' },
  { code: 'ro', name: 'Romanian', native: 'Romana', flag: '🇷🇴' },
  { code: 'hu', name: 'Hungarian', native: 'Magyar', flag: '🇭🇺' },
  { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia', flag: '🇮🇩' },
  { code: 'ms', name: 'Malay', native: 'Bahasa Melayu', flag: '🇲🇾' },
  { code: 'sw', name: 'Swahili', native: 'Kiswahili', flag: '🇰🇪' },
  { code: 'ta', name: 'Tamil', native: 'Tamil', flag: '🇮🇳' },
  { code: 'te', name: 'Telugu', native: 'Telugu', flag: '🇮🇳' },
  { code: 'ur', name: 'Urdu', native: 'Urdu', flag: '🇵🇰' },
  { code: 'fa', name: 'Persian', native: 'Farsi', flag: '🇮🇷' },
  { code: 'af', name: 'Afrikaans', native: 'Afrikaans', flag: '🇿🇦' },
  { code: 'ca', name: 'Catalan', native: 'Catala', flag: '🇪🇸' },
  { code: 'hr', name: 'Croatian', native: 'Hrvatski', flag: '🇭🇷' },
  { code: 'sk', name: 'Slovak', native: 'Slovencina', flag: '🇸🇰' },
];

export default function TranslatePage(): JSX.Element {
  const [sourceLang, setSourceLang] = useState<string>('en');
  const [targetLang, setTargetLang] = useState<string>('es');
  const [inputText, setInputText] = useState<string>('');
  const [outputText, setOutputText] = useState<string>('');
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [mode, setMode] = useState<'text' | 'conversation' | 'camera'>('text');
  const [history, setHistory] = useState<TranslationHistoryItem[]>([]);
  const [conversationMessages, setConversationMessages] = useState<ConversationMessage[]>([]);
  const [conversationLoading, setConversationLoading] = useState<boolean>(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const {
    state: voiceCaptureState,
    error: voiceCaptureError,
    startCapture,
    stopCapture,
    cancelCapture,
  } = useVoiceCapture();
  const voiceActive = voiceCaptureState === 'capturing';
  const [conversationInput, setConversationInput] = useState<string>('');
  const [currentSpeaker, setCurrentSpeaker] = useState<'A' | 'B'>('A');
  const [sourceLangSearch, setSourceLangSearch] = useState<string>('');
  const [targetLangSearch, setTargetLangSearch] = useState<string>('');
  const [showSourceDropdown, setShowSourceDropdown] = useState<boolean>(false);
  const [showTargetDropdown, setShowTargetDropdown] = useState<boolean>(false);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const filteredSourceLangs = useMemo(() => {
    if (!sourceLangSearch) return LANGUAGES;
    const q = sourceLangSearch.toLowerCase();
    return LANGUAGES.filter(l => l.name.toLowerCase().includes(q) || l.native.toLowerCase().includes(q));
  }, [sourceLangSearch]);

  const filteredTargetLangs = useMemo(() => {
    if (!targetLangSearch) return LANGUAGES;
    const q = targetLangSearch.toLowerCase();
    return LANGUAGES.filter(l => l.name.toLowerCase().includes(q) || l.native.toLowerCase().includes(q));
  }, [targetLangSearch]);

  const sourceLanguage = useMemo(() => LANGUAGES.find(l => l.code === sourceLang) || LANGUAGES[0], [sourceLang]);
  const targetLanguage = useMemo(() => LANGUAGES.find(l => l.code === targetLang) || LANGUAGES[1], [targetLang]);

  /** Real translation via the QuantAI chat pipeline. Errors surface honestly. */
  const translateText = useCallback(
    async (text: string): Promise<string> => {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: text,
          systemPrompt: `Translate the following text from ${sourceLanguage.name} to ${targetLanguage.name}. Return ONLY the translation, no explanations.`,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        response?: string;
        error?: string;
      };
      if (!res.ok || !data.response) {
        throw new Error(data.error || 'Translation failed');
      }
      return data.response;
    },
    [sourceLanguage, targetLanguage],
  );

  useEffect(() => {
    if (!inputText.trim()) {
      setOutputText('');
      setTranslateError(null);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setIsTranslating(true);
      setTranslateError(null);
      try {
        const result = await translateText(inputText);
        setOutputText(result);
      } catch (err) {
        setOutputText('');
        setTranslateError(err instanceof Error ? err.message : 'Translation failed');
      } finally {
        setIsTranslating(false);
      }
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [inputText, sourceLang, targetLang, translateText]);

  const handleSwapLanguages = useCallback(() => {
    const temp = sourceLang;
    setSourceLang(targetLang);
    setTargetLang(temp);
    setInputText(outputText);
    setOutputText(inputText);
  }, [sourceLang, targetLang, inputText, outputText]);

  /** Real voice input: mic capture -> STT -> input box. */
  const handleVoiceInput = useCallback(async () => {
    setTranslateError(null);
    if (voiceActive) {
      const wav = await stopCapture();
      if (!wav) return;
      try {
        const form = new FormData();
        form.append('file', wav, 'audio.wav');
        const res = await fetch('/api/voice/stt', { method: 'POST', body: form });
        const data = (await res.json().catch(() => ({}))) as {
          text?: string;
          error?: string;
        };
        if (!res.ok || !data.text) {
          throw new Error(data.error || 'Transcription failed');
        }
        setInputText(String(data.text).trim());
      } catch (err) {
        setTranslateError(err instanceof Error ? err.message : 'Transcription failed');
      }
    } else {
      cancelCapture();
      await startCapture();
    }
  }, [voiceActive, startCapture, stopCapture, cancelCapture]);

  const handleCopyOutput = useCallback(() => {
    if (outputText) {
      navigator.clipboard?.writeText(outputText);
    }
  }, [outputText]);

  const handleSaveToHistory = useCallback(() => {
    if (!inputText.trim() || !outputText.trim()) return;
    const item: TranslationHistoryItem = {
      id: `h${Date.now()}`,
      source: inputText,
      target: outputText,
      sourceLang,
      targetLang,
      timestamp: new Date().toISOString(),
    };
    setHistory(prev => [item, ...prev]);
  }, [inputText, outputText, sourceLang, targetLang]);

  const handleConversationSend = useCallback(async () => {
    if (!conversationInput.trim() || conversationLoading) return;
    const original = conversationInput;
    const from = currentSpeaker === 'A' ? sourceLanguage : targetLanguage;
    const to = currentSpeaker === 'A' ? targetLanguage : sourceLanguage;
    const msg: ConversationMessage = {
      id: `cm${Date.now()}`,
      speaker: currentSpeaker,
      original,
      translated: '',
      lang: currentSpeaker === 'A' ? sourceLang : targetLang,
      timestamp: new Date().toISOString(),
    };
    setConversationMessages(prev => [...prev, msg]);
    setConversationInput('');
    setConversationLoading(true);
    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: original,
          systemPrompt: `Translate the following text from ${from.name} to ${to.name}. Return ONLY the translation, no explanations.`,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        response?: string;
        error?: string;
      };
      if (!res.ok || !data.response) {
        throw new Error(data.error || 'Translation failed');
      }
      setConversationMessages(prev =>
        prev.map(m => (m.id === msg.id ? { ...m, translated: data.response as string } : m)),
      );
    } catch (err) {
      setConversationMessages(prev =>
        prev.map(m =>
          m.id === msg.id
            ? { ...m, translated: `Translation failed: ${err instanceof Error ? err.message : 'unknown error'}` }
            : m,
        ),
      );
    } finally {
      setConversationLoading(false);
      setCurrentSpeaker(prev => prev === 'A' ? 'B' : 'A');
    }
  }, [conversationInput, conversationLoading, currentSpeaker, sourceLang, targetLang, sourceLanguage, targetLanguage]);

  const handleHistoryClick = useCallback((item: TranslationHistoryItem) => {
    setSourceLang(item.sourceLang);
    setTargetLang(item.targetLang);
    setInputText(item.source);
    setOutputText(item.target);
    setMode('text');
  }, []);

  if (error) {
    return (
      <div className="translate-page error-state">
        <h2>Translation Error</h2>
        <p>{error}</p>
        <button onClick={() => setError(null)}>Retry</button>
      </div>
    );
  }

  return (
    <div className="translate-page">
      <header className="translate-header">
        <h1>Translate</h1>
        <div className="mode-selector">
          <button className={`mode-btn ${mode === 'text' ? 'active' : ''}`} onClick={() => setMode('text')}>
            📝 Text
          </button>
          <button className={`mode-btn ${mode === 'conversation' ? 'active' : ''}`} onClick={() => setMode('conversation')}>
            💬 Conversation
          </button>
          <button className={`mode-btn ${mode === 'camera' ? 'active' : ''}`} onClick={() => setMode('camera')}>
            📷 Camera
          </button>
          <button className={`btn-history ${showHistory ? 'active' : ''}`} onClick={() => setShowHistory(!showHistory)}>
            📋 History
          </button>
        </div>
      </header>

      <div className="translate-body">
        <div className="language-bar">
          <div className="lang-selector source">
            <button className="lang-btn" onClick={() => { setShowSourceDropdown(!showSourceDropdown); setShowTargetDropdown(false); }}>
              <span className="lang-flag">{sourceLanguage.flag}</span>
              <span className="lang-name">{sourceLanguage.name}</span>
              <span className="dropdown-arrow">▼</span>
            </button>
            {showSourceDropdown && (
              <div className="lang-dropdown">
                <input
                  type="text"
                  value={sourceLangSearch}
                  onChange={e => setSourceLangSearch(e.target.value)}
                  placeholder="Search languages..."
                  className="lang-search"
                  autoFocus
                />
                <div className="lang-list">
                  {filteredSourceLangs.map(lang => (
                    <div
                      key={lang.code}
                      className={`lang-option ${sourceLang === lang.code ? 'selected' : ''}`}
                      onClick={() => { setSourceLang(lang.code); setShowSourceDropdown(false); setSourceLangSearch(''); }}
                    >
                      <span className="lang-flag">{lang.flag}</span>
                      <span className="lang-name">{lang.name}</span>
                      <span className="lang-native">{lang.native}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button className="btn-swap" onClick={handleSwapLanguages} title="Swap languages">
            ⇄
          </button>

          <div className="lang-selector target">
            <button className="lang-btn" onClick={() => { setShowTargetDropdown(!showTargetDropdown); setShowSourceDropdown(false); }}>
              <span className="lang-flag">{targetLanguage.flag}</span>
              <span className="lang-name">{targetLanguage.name}</span>
              <span className="dropdown-arrow">▼</span>
            </button>
            {showTargetDropdown && (
              <div className="lang-dropdown">
                <input
                  type="text"
                  value={targetLangSearch}
                  onChange={e => setTargetLangSearch(e.target.value)}
                  placeholder="Search languages..."
                  className="lang-search"
                  autoFocus
                />
                <div className="lang-list">
                  {filteredTargetLangs.map(lang => (
                    <div
                      key={lang.code}
                      className={`lang-option ${targetLang === lang.code ? 'selected' : ''}`}
                      onClick={() => { setTargetLang(lang.code); setShowTargetDropdown(false); setTargetLangSearch(''); }}
                    >
                      <span className="lang-flag">{lang.flag}</span>
                      <span className="lang-name">{lang.name}</span>
                      <span className="lang-native">{lang.native}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {mode === 'text' && (
          <div className="translation-panels">
            <div className="input-panel">
              <textarea
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                placeholder="Enter text to translate..."
                className="translate-input"
                rows={8}
              />
              <div className="input-actions">
                <button className={`btn-voice ${voiceActive ? 'active' : ''}`} onClick={handleVoiceInput}>
                  {voiceActive ? '⏹️ Stop' : '🎤 Voice'}
                </button>
                <span className="char-count">{inputText.length} chars</span>
              </div>
            </div>

            <div className="output-panel">
              <div className={`translate-output ${isTranslating ? 'translating' : ''}`}>
                {isTranslating ? (
                  <span className="translating-indicator">Translating...</span>
                ) : translateError || voiceCaptureError ? (
                  <p className="translate-error">{translateError || voiceCaptureError}</p>
                ) : outputText ? (
                  <p>{outputText}</p>
                ) : (
                  <p className="placeholder">Translation will appear here</p>
                )}
              </div>
              <div className="output-actions">
                <button className="btn-copy" onClick={handleCopyOutput} disabled={!outputText}>
                  📋 Copy
                </button>
                <button className="btn-save" onClick={handleSaveToHistory} disabled={!outputText}>
                  💾 Save
                </button>
              </div>
            </div>
          </div>
        )}

        {mode === 'conversation' && (
          <div className="conversation-mode">
            <div className="conversation-messages">
              {conversationMessages.length === 0 ? (
                <div className="empty-conversation">
                  <p>Start a conversation. Messages will be translated between {sourceLanguage.name} and {targetLanguage.name}.</p>
                </div>
              ) : (
                conversationMessages.map(msg => (
                  <div key={msg.id} className={`conv-msg speaker-${msg.speaker}`}>
                    <div className="conv-speaker">Speaker {msg.speaker}</div>
                    <div className="conv-original">{msg.original}</div>
                    <div className="conv-translated">{msg.translated}</div>
                    <div className="conv-time">{new Date(msg.timestamp).toLocaleTimeString()}</div>
                  </div>
                ))
              )}
            </div>
            <div className="conversation-input">
              <span className="speaker-indicator">Speaker {currentSpeaker} ({currentSpeaker === 'A' ? sourceLanguage.name : targetLanguage.name})</span>
              <div className="conv-input-row">
                <input
                  type="text"
                  value={conversationInput}
                  onChange={e => setConversationInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleConversationSend(); }}
                  placeholder={`Type in ${currentSpeaker === 'A' ? sourceLanguage.name : targetLanguage.name}...`}
                  className="conv-text-input"
                />
                <button className="btn-conv-send" onClick={handleConversationSend} disabled={!conversationInput.trim() || conversationLoading}>
                  {conversationLoading ? 'Translating...' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        )}

        {mode === 'camera' && (
          <div className="camera-mode">
            <div className="camera-preview">
              <div className="camera-placeholder">
                <span className="camera-icon">📷</span>
                <p>Camera OCR is not connected yet.</p>
              </div>
            </div>
          </div>
        )}

        {showHistory && (
          <aside className="history-sidebar">
            <div className="history-header">
              <h3>Translation History</h3>
              <button onClick={() => setShowHistory(false)}>x</button>
            </div>
            <div className="history-list">
              {history.length === 0 ? (
                <p className="empty-history">No translation history</p>
              ) : (
                history.map(item => (
                  <div key={item.id} className="history-item" onClick={() => handleHistoryClick(item)}>
                    <div className="history-langs">
                      {LANGUAGES.find(l => l.code === item.sourceLang)?.flag} → {LANGUAGES.find(l => l.code === item.targetLang)?.flag}
                    </div>
                    <div className="history-source">{item.source}</div>
                    <div className="history-target">{item.target}</div>
                    <div className="history-time">{new Date(item.timestamp).toLocaleTimeString()}</div>
                  </div>
                ))
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
