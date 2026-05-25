// ============================================================================
// QuantAI - Voice Assistant Page
// Large circular waveform visualization, wake word toggle, listening indicator,
// command history with timestamps, voice selection grid, speed/pitch sliders,
// hotkey configuration
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

interface VoiceOption {
  id: string;
  name: string;
  gender: 'male' | 'female' | 'neutral';
  accent: string;
  preview: string;
  description: string;
}

interface CommandHistoryItem {
  id: string;
  text: string;
  response: string;
  timestamp: string;
  duration: number;
  success: boolean;
}

const VOICE_OPTIONS: VoiceOption[] = [
  { id: 'v1', name: 'Nova', gender: 'female', accent: 'American', preview: '🗣️', description: 'Clear and professional female voice' },
  { id: 'v2', name: 'Atlas', gender: 'male', accent: 'American', preview: '🎙️', description: 'Deep and authoritative male voice' },
  { id: 'v3', name: 'Aria', gender: 'female', accent: 'British', preview: '🗣️', description: 'Elegant British female voice' },
  { id: 'v4', name: 'Onyx', gender: 'male', accent: 'British', preview: '🎙️', description: 'Refined British male voice' },
  { id: 'v5', name: 'Shimmer', gender: 'neutral', accent: 'American', preview: '✨', description: 'Warm and friendly neutral voice' },
  { id: 'v6', name: 'Echo', gender: 'neutral', accent: 'Australian', preview: '🌊', description: 'Casual Australian neutral voice' },
];

const INITIAL_HISTORY: CommandHistoryItem[] = [
  { id: 'h1', text: 'What is the weather today?', response: 'It is currently 22 degrees Celsius with partly cloudy skies.', timestamp: '2024-01-15T14:30:00Z', duration: 1.2, success: true },
  { id: 'h2', text: 'Set a timer for 10 minutes', response: 'Timer set for 10 minutes. I will notify you when it is done.', timestamp: '2024-01-15T14:25:00Z', duration: 0.8, success: true },
  { id: 'h3', text: 'Turn off the living room lights', response: 'Living room lights turned off.', timestamp: '2024-01-15T14:20:00Z', duration: 1.5, success: true },
  { id: 'h4', text: 'Play some jazz music', response: 'Playing Jazz Classics playlist on QuantTube Music.', timestamp: '2024-01-15T13:45:00Z', duration: 1.1, success: true },
  { id: 'h5', text: 'Send a message to John', response: 'Sorry, I could not find a contact named John. Please try again.', timestamp: '2024-01-15T13:30:00Z', duration: 2.0, success: false },
];

export default function VoicePage(): JSX.Element {
  const [isListening, setIsListening] = useState<boolean>(false);
  const [wakeWordEnabled, setWakeWordEnabled] = useState<boolean>(true);
  const [commandHistory, setCommandHistory] = useState<CommandHistoryItem[]>(INITIAL_HISTORY);
  const [selectedVoice, setSelectedVoice] = useState<string>('v1');
  const [speed, setSpeed] = useState<number>(1.0);
  const [pitch, setPitch] = useState<number>(1.0);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [currentTranscript, setCurrentTranscript] = useState<string>('');
  const [hotkey, setHotkey] = useState<string>('Ctrl+Shift+V');
  const [isEditingHotkey, setIsEditingHotkey] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [playingPreview, setPlayingPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audioLevelRef = useRef<number>(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const currentVoice = useMemo(() => {
    return VOICE_OPTIONS.find(v => v.id === selectedVoice) || VOICE_OPTIONS[0];
  }, [selectedVoice]);

  const waveformBars = useMemo(() => {
    return Array.from({ length: 32 }).map((_, i) => {
      if (!isListening) return 5;
      const base = Math.sin((i / 32) * Math.PI) * audioLevel;
      return Math.max(5, base + Math.random() * 20);
    });
  }, [isListening, audioLevel]);

  useEffect(() => {
    if (isListening) {
      intervalRef.current = setInterval(() => {
        setAudioLevel(Math.random() * 80 + 20);
      }, 100);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    } else {
      setAudioLevel(0);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }, [isListening]);

  const handleToggleListening = useCallback(() => {
    if (isListening) {
      setIsListening(false);
      if (currentTranscript.trim()) {
        setIsProcessing(true);
        setTimeout(() => {
          const newCmd: CommandHistoryItem = {
            id: `h${Date.now()}`,
            text: currentTranscript,
            response: `Processed: "${currentTranscript}"`,
            timestamp: new Date().toISOString(),
            duration: 1.5,
            success: true,
          };
          setCommandHistory(prev => [newCmd, ...prev]);
          setCurrentTranscript('');
          setIsProcessing(false);
        }, 1500);
      }
    } else {
      setIsListening(true);
      setCurrentTranscript('');
      setTimeout(() => {
        setCurrentTranscript('Hey QuantAI, what is on my schedule today?');
      }, 2000);
    }
  }, [isListening, currentTranscript]);

  const handleVoiceSelect = useCallback((voiceId: string) => {
    setSelectedVoice(voiceId);
  }, []);

  const handlePreviewVoice = useCallback((voiceId: string) => {
    setPlayingPreview(voiceId);
    setTimeout(() => setPlayingPreview(null), 2000);
  }, []);

  const handleHotkeyCapture = useCallback((e: React.KeyboardEvent) => {
    if (!isEditingHotkey) return;
    e.preventDefault();
    const parts: string[] = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');
    if (e.metaKey) parts.push('Meta');
    if (e.key && !['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
      parts.push(e.key.toUpperCase());
    }
    if (parts.length >= 2) {
      setHotkey(parts.join('+'));
      setIsEditingHotkey(false);
    }
  }, [isEditingHotkey]);

  const handleClearHistory = useCallback(() => {
    setCommandHistory([]);
  }, []);

  if (error) {
    return (
      <div className="voice-page error-state">
        <h2>Voice Error</h2>
        <p>{error}</p>
        <button onClick={() => setError(null)}>Retry</button>
      </div>
    );
  }

  return (
    <div className="voice-page">
      <header className="voice-header">
        <h1>Voice Assistant</h1>
        <div className="header-controls">
          <label className="wake-word-toggle">
            <input
              type="checkbox"
              checked={wakeWordEnabled}
              onChange={e => setWakeWordEnabled(e.target.checked)}
            />
            <span>Wake Word: "Hey QuantAI"</span>
          </label>
        </div>
      </header>

      <div className="voice-body">
        <section className="waveform-section">
          <div className={`waveform-circle ${isListening ? 'active' : ''} ${isProcessing ? 'processing' : ''}`}>
            <div className="waveform-container">
              {waveformBars.map((height, i) => (
                <div
                  key={i}
                  className="waveform-bar"
                  style={{
                    height: `${height}%`,
                    animationDelay: `${i * 30}ms`,
                  }}
                />
              ))}
            </div>
            <div className="center-content">
              {isProcessing ? (
                <span className="processing-text">Processing...</span>
              ) : isListening ? (
                <span className="listening-dot pulsing">●</span>
              ) : (
                <span className="mic-icon">🎤</span>
              )}
            </div>
          </div>

          <button
            className={`btn-listen ${isListening ? 'listening' : ''}`}
            onClick={handleToggleListening}
            disabled={isProcessing}
          >
            {isListening ? 'Stop Listening' : 'Start Listening'}
          </button>

          {currentTranscript && (
            <div className="transcript-display">
              <p className="transcript-text">{currentTranscript}</p>
            </div>
          )}

          {isListening && (
            <div className="listening-indicator">
              <span className="pulse-dot" />
              <span>Listening...</span>
            </div>
          )}
        </section>

        <section className="voice-settings">
          <h2>Voice Selection</h2>
          <div className="voice-grid">
            {VOICE_OPTIONS.map(voice => (
              <div
                key={voice.id}
                className={`voice-card ${selectedVoice === voice.id ? 'selected' : ''}`}
                onClick={() => handleVoiceSelect(voice.id)}
              >
                <div className="voice-card-header">
                  <span className="voice-preview">{voice.preview}</span>
                  <span className="voice-name">{voice.name}</span>
                </div>
                <div className="voice-card-meta">
                  <span className="voice-gender">{voice.gender}</span>
                  <span className="voice-accent">{voice.accent}</span>
                </div>
                <p className="voice-desc">{voice.description}</p>
                <button
                  className={`btn-preview ${playingPreview === voice.id ? 'playing' : ''}`}
                  onClick={e => { e.stopPropagation(); handlePreviewVoice(voice.id); }}
                >
                  {playingPreview === voice.id ? '⏹️ Playing' : '▶ Preview'}
                </button>
              </div>
            ))}
          </div>

          <div className="voice-adjustments">
            <div className="slider-group">
              <label>Speed: {speed.toFixed(1)}x</label>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={speed}
                onChange={e => setSpeed(Number(e.target.value))}
                className="speed-slider"
              />
              <div className="slider-labels">
                <span>0.5x</span>
                <span>1.0x</span>
                <span>2.0x</span>
              </div>
            </div>
            <div className="slider-group">
              <label>Pitch: {pitch.toFixed(1)}x</label>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={pitch}
                onChange={e => setPitch(Number(e.target.value))}
                className="pitch-slider"
              />
              <div className="slider-labels">
                <span>Low</span>
                <span>Normal</span>
                <span>High</span>
              </div>
            </div>
          </div>

          <div className="hotkey-config">
            <label>Hotkey</label>
            <div className="hotkey-input-wrapper">
              <input
                type="text"
                value={hotkey}
                readOnly={!isEditingHotkey}
                onKeyDown={handleHotkeyCapture}
                className={`hotkey-input ${isEditingHotkey ? 'editing' : ''}`}
                placeholder="Press key combination..."
              />
              <button
                className="btn-edit-hotkey"
                onClick={() => setIsEditingHotkey(!isEditingHotkey)}
              >
                {isEditingHotkey ? 'Done' : 'Change'}
              </button>
            </div>
          </div>
        </section>

        <section className="history-section">
          <div className="history-header">
            <h2>Command History</h2>
            <button className="btn-clear" onClick={handleClearHistory} disabled={commandHistory.length === 0}>
              Clear All
            </button>
          </div>
          {commandHistory.length === 0 ? (
            <div className="empty-history">
              <p>No voice commands yet. Click "Start Listening" to begin.</p>
            </div>
          ) : (
            <div className="history-list">
              {commandHistory.map(cmd => (
                <div key={cmd.id} className={`history-item ${cmd.success ? 'success' : 'failed'}`}>
                  <div className="history-icon">
                    {cmd.success ? '✓' : '✗'}
                  </div>
                  <div className="history-content">
                    <div className="history-command">{cmd.text}</div>
                    <div className="history-response">{cmd.response}</div>
                    <div className="history-meta">
                      <span className="history-time">{new Date(cmd.timestamp).toLocaleTimeString()}</span>
                      <span className="history-duration">{cmd.duration}s</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
