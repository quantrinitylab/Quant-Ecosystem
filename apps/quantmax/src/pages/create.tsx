// ============================================================================
// QuantMax - Video Creation Studio
// Camera view, effects/filters gallery, speed controls, timer countdown,
// gallery picker, trim/split editor, text overlay, sound selector, duet/stitch
// ============================================================================

import React, { useState, useCallback, useRef, useMemo } from 'react';
import { useCreator } from '../hooks/useCreator';

type SpeedOption = 0.5 | 1 | 1.5 | 2 | 3;
type TimerOption = 0 | 3 | 10;
type DurationOption = 15 | 60 | 180;

const SPEED_OPTIONS: SpeedOption[] = [0.5, 1, 1.5, 2, 3];
const TIMER_OPTIONS: TimerOption[] = [0, 3, 10];
const DURATION_OPTIONS: DurationOption[] = [15, 60, 180];
const FONT_OPTIONS = ['Sans-Serif', 'Serif', 'Monospace', 'Handwriting', 'Display'];
const COLOR_OPTIONS = [
  '#ffffff',
  '#000000',
  '#ff0000',
  '#00ff00',
  '#0000ff',
  '#ffff00',
  '#ff00ff',
  '#00ffff',
  '#ff6600',
  '#9900ff',
];

const CreateVideoPage: React.FC = () => {
  const creator = useCreator();

  const [maxDuration, setMaxDuration] = useState<DurationOption>(60);
  const [speed, setSpeed] = useState<SpeedOption>(1);
  const [timer, setTimer] = useState<TimerOption>(0);
  const [timerCountdown, setTimerCountdown] = useState<number>(0);
  const [isTimerActive, setIsTimerActive] = useState<boolean>(false);
  const [isFrontCamera, setIsFrontCamera] = useState<boolean>(true);
  const [flashOn, setFlashOn] = useState<boolean>(false);
  const [showEffectsGallery, setShowEffectsGallery] = useState<boolean>(false);
  const [showSoundSelector, setShowSoundSelector] = useState<boolean>(false);
  const [showTextEditor, setShowTextEditor] = useState<boolean>(false);
  const [showSpeedControl, setShowSpeedControl] = useState<boolean>(false);
  const [showGalleryPicker, setShowGalleryPicker] = useState<boolean>(false);
  const [showModeSelector, setShowModeSelector] = useState<boolean>(false);
  const [showTrimEditor, setShowTrimEditor] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const [hasRecordedClip, setHasRecordedClip] = useState<boolean>(false);
  const [newTextValue, setNewTextValue] = useState<string>('');
  const [selectedFont, setSelectedFont] = useState<string>('Sans-Serif');
  const [selectedColor, setSelectedColor] = useState<string>('#ffffff');
  const [selectedFontSize, setSelectedFontSize] = useState<number>(24);
  const [soundSearch, setSoundSearch] = useState<string>('');

  const recordingInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRecording = useCallback(() => {
    if (timer > 0) {
      setIsTimerActive(true);
      setTimerCountdown(timer);
      timerInterval.current = setInterval(() => {
        setTimerCountdown((prev) => {
          if (prev <= 1) {
            if (timerInterval.current) clearInterval(timerInterval.current);
            setIsTimerActive(false);
            setIsRecording(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setIsRecording(true);
    }
  }, [timer]);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    setHasRecordedClip(true);
    if (recordingInterval.current) clearInterval(recordingInterval.current);
  }, []);

  const progressPercent = useMemo(
    () => (recordingDuration / maxDuration) * 100,
    [recordingDuration, maxDuration],
  );

  return (
    <div className="create-page">
      <div className="camera-view-area">
        <div className="camera-feed">
          <div className="camera-preview">
            <div className="camera-placeholder">
              <span className="camera-icon">{isFrontCamera ? '🤳' : '📷'}</span>
            </div>
          </div>
        </div>
        {isTimerActive && (
          <div className="timer-countdown-overlay">
            <span className="countdown-number">{timerCountdown}</span>
          </div>
        )}
        <div className="recording-progress">
          <div className="progress-track">
            <div className="progress-filled" style={{ width: `${progressPercent}%` }} />
          </div>
          <span className="duration-label">
            {recordingDuration.toFixed(1)}s / {maxDuration}s
          </span>
        </div>
        {isRecording && (
          <div className="recording-indicator">
            <span className="rec-dot" />
            <span className="rec-text">REC</span>
          </div>
        )}
      </div>

      <div className="side-controls">
        <button className="side-control-btn" onClick={() => setIsFrontCamera(!isFrontCamera)}>
          <span className="control-icon">🔄</span>
          <span className="control-label">Flip</span>
        </button>
        <button className="side-control-btn" onClick={() => setShowSpeedControl(!showSpeedControl)}>
          <span className="control-icon">⚡</span>
          <span className="control-label">{speed}x</span>
        </button>
        <button
          className="side-control-btn"
          onClick={() => setShowEffectsGallery(!showEffectsGallery)}
        >
          <span className="control-icon">✨</span>
          <span className="control-label">Effects</span>
        </button>
        <button className="side-control-btn" onClick={() => setFlashOn(!flashOn)}>
          <span className="control-icon">{flashOn ? '⚡' : '💡'}</span>
          <span className="control-label">Flash</span>
        </button>
        <button
          className="side-control-btn"
          onClick={() =>
            setTimer(
              (prev) => TIMER_OPTIONS[(TIMER_OPTIONS.indexOf(prev) + 1) % TIMER_OPTIONS.length],
            )
          }
        >
          <span className="control-icon">⏱️</span>
          <span className="control-label">{timer > 0 ? `${timer}s` : 'Off'}</span>
        </button>
        <button className="side-control-btn" onClick={() => setShowTextEditor(true)}>
          <span className="control-icon">Aa</span>
          <span className="control-label">Text</span>
        </button>
        <button className="side-control-btn" onClick={() => setShowModeSelector(true)}>
          <span className="control-icon">🎭</span>
          <span className="control-label">Mode</span>
        </button>
      </div>

      <div className="bottom-controls">
        <div className="duration-options">
          {DURATION_OPTIONS.map((d) => (
            <button
              key={d}
              className={`duration-btn ${maxDuration === d ? 'active' : ''}`}
              onClick={() => setMaxDuration(d)}
            >
              {d}s
            </button>
          ))}
        </div>
        <div className="main-actions-row">
          <button className="gallery-btn" onClick={() => setShowGalleryPicker(true)}>
            <span className="gallery-thumb">🖼️</span>
            <span className="gallery-label">Gallery</span>
          </button>
          <button
            className={`record-button ${isRecording ? 'recording' : ''}`}
            onClick={isRecording ? stopRecording : startRecording}
          >
            <div className={`record-inner ${isRecording ? 'recording' : ''}`} />
          </button>
          <button className="sound-btn" onClick={() => setShowSoundSelector(true)}>
            <span className="sound-icon">🎵</span>
            <span className="sound-label">Sounds</span>
          </button>
        </div>
        {hasRecordedClip && (
          <div className="post-record-actions">
            <button className="trim-btn" onClick={() => setShowTrimEditor(true)}>
              Trim
            </button>
            <button className="next-btn">Next &rarr;</button>
          </div>
        )}
      </div>

      {showSpeedControl && (
        <div className="speed-control-panel">
          <h4 className="speed-title">Recording Speed</h4>
          <div className="speed-options">
            {SPEED_OPTIONS.map((s) => (
              <button
                key={s}
                className={`speed-btn ${speed === s ? 'active' : ''}`}
                onClick={() => {
                  setSpeed(s);
                  setShowSpeedControl(false);
                }}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
      )}

      {showEffectsGallery && (
        <div className="effects-gallery-overlay">
          <div className="effects-gallery">
            <div className="effects-header">
              <h3>Effects</h3>
              <button className="close-btn" onClick={() => setShowEffectsGallery(false)}>
                &#10005;
              </button>
            </div>
            <p>Effects loaded from API</p>
          </div>
        </div>
      )}

      {showSoundSelector && (
        <div className="sound-selector-overlay">
          <div className="sound-selector">
            <div className="sound-header">
              <h3>Sounds</h3>
              <button className="close-btn" onClick={() => setShowSoundSelector(false)}>
                &#10005;
              </button>
            </div>
            <div className="sound-search">
              <input
                className="sound-search-input"
                placeholder="Search sounds..."
                value={soundSearch}
                onChange={(e) => setSoundSearch(e.target.value)}
              />
            </div>
            <p>Sounds loaded from API</p>
          </div>
        </div>
      )}

      {showTextEditor && (
        <div className="text-editor-overlay">
          <div className="text-editor">
            <div className="text-editor-header">
              <h3>Add Text</h3>
              <button className="close-btn" onClick={() => setShowTextEditor(false)}>
                &#10005;
              </button>
            </div>
            <input
              className="text-input"
              placeholder="Type your text..."
              value={newTextValue}
              onChange={(e) => setNewTextValue(e.target.value)}
              autoFocus
            />
            <div className="font-selector">
              <h4>Font</h4>
              <div className="font-options">
                {FONT_OPTIONS.map((font) => (
                  <button
                    key={font}
                    className={`font-btn ${selectedFont === font ? 'active' : ''}`}
                    onClick={() => setSelectedFont(font)}
                    style={{ fontFamily: font }}
                  >
                    {font}
                  </button>
                ))}
              </div>
            </div>
            <div className="color-selector">
              <h4>Color</h4>
              <div className="color-options">
                {COLOR_OPTIONS.map((color) => (
                  <button
                    key={color}
                    className={`color-btn ${selectedColor === color ? 'active' : ''}`}
                    onClick={() => setSelectedColor(color)}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            <div className="font-size-control">
              <h4>Size: {selectedFontSize}px</h4>
              <input
                type="range"
                min="12"
                max="72"
                value={selectedFontSize}
                onChange={(e) => setSelectedFontSize(Number(e.target.value))}
                className="size-slider"
              />
            </div>
            <button
              className="add-text-btn"
              onClick={() => setShowTextEditor(false)}
              disabled={!newTextValue.trim()}
            >
              Add Text
            </button>
          </div>
        </div>
      )}

      {showModeSelector && (
        <div className="mode-selector-overlay" onClick={() => setShowModeSelector(false)}>
          <div className="mode-selector" onClick={(e) => e.stopPropagation()}>
            <h3>Recording Mode</h3>
            <div className="mode-options">
              {(['normal', 'duet', 'stitch', 'greenscreen'] as const).map((m) => (
                <button key={m} className="mode-btn" onClick={() => setShowModeSelector(false)}>
                  <span className="mode-icon">
                    {m === 'normal' ? '🎬' : m === 'duet' ? '👥' : m === 'stitch' ? '🧵' : '🟢'}
                  </span>
                  <span className="mode-name">{m.charAt(0).toUpperCase() + m.slice(1)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateVideoPage;
