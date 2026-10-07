// ============================================================================
// QuantChat - Disappearing Timer Component
// Timer selector: circular display, presets, custom duration, countdown anim
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

interface DisappearingTimerProps { currentDuration: number; onDurationChange: (seconds: number) => void; isActive?: boolean; onExpire?: () => void; showCountdown?: boolean; size?: 'small' | 'medium' | 'large'; }

const PRESETS = [{ label: '1s', value: 1 }, { label: '3s', value: 3 }, { label: '5s', value: 5 }, { label: '10s', value: 10 }, { label: '30s', value: 30 }, { label: '1m', value: 60 }, { label: '5m', value: 300 }, { label: '1h', value: 3600 }];

export const DisappearingTimer: React.FC<DisappearingTimerProps> = ({ currentDuration, onDurationChange, isActive = false, onExpire, showCountdown = true, size = 'medium' }) => {
  const [timeRemaining, setTimeRemaining] = useState<number>(currentDuration);
  const [showCustom, setShowCustom] = useState<boolean>(false);
  const [customMinutes, setCustomMinutes] = useState<string>('');
  const [customSeconds, setCustomSeconds] = useState<string>('');
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => { setTimeRemaining(currentDuration); }, [currentDuration]);

  useEffect(() => {
    if (isActive && !isPaused && timeRemaining > 0) {
      startTimeRef.current = Date.now();
      intervalRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          const next = prev - 1;
          if (next <= 0) { if (intervalRef.current) clearInterval(intervalRef.current); if (onExpire) onExpire(); return 0; }
          return next;
        });
      }, 1000);
      return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }
  }, [isActive, isPaused, onExpire]);

  const progress = useMemo(() => {
    if (currentDuration === 0) return 0;
    return ((currentDuration - timeRemaining) / currentDuration) * 100;
  }, [currentDuration, timeRemaining]);

  const circumference = useMemo(() => {
    const radii = { small: 30, medium: 50, large: 70 };
    return 2 * Math.PI * radii[size];
  }, [size]);

  const radius = useMemo(() => ({ small: 30, medium: 50, large: 70 }[size]), [size]);
  const svgSize = useMemo(() => (radius + 10) * 2, [radius]);

  const strokeDashoffset = useMemo(() => circumference * (1 - progress / 100), [circumference, progress]);

  const formatTime = useCallback((seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) { const m = Math.floor(seconds / 60); const s = seconds % 60; return s > 0 ? `${m}m ${s}s` : `${m}m`; }
    const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }, []);

  const handleCustomDuration = useCallback(() => {
    const mins = parseInt(customMinutes) || 0;
    const secs = parseInt(customSeconds) || 0;
    const total = mins * 60 + secs;
    if (total > 0 && total <= 86400) { onDurationChange(total); setShowCustom(false); setCustomMinutes(''); setCustomSeconds(''); }
  }, [customMinutes, customSeconds, onDurationChange]);

  const getTimerColor = useCallback((remaining: number, total: number): string => {
    const ratio = remaining / total;
    if (ratio > 0.5) return '#4CAF50';
    if (ratio > 0.25) return '#FF9800';
    return '#F44336';
  }, []);

  const timerColor = useMemo(() => getTimerColor(timeRemaining, currentDuration), [timeRemaining, currentDuration, getTimerColor]);

  return (
    <div className={`disappearing-timer size-${size}`}>
      {showCountdown && isActive ? (
        <div className="timer-countdown">
          <svg width={svgSize} height={svgSize} className="timer-ring">
            <circle cx={svgSize / 2} cy={svgSize / 2} r={radius} fill="none" stroke="#e0e0e0" strokeWidth="4" />
            <circle cx={svgSize / 2} cy={svgSize / 2} r={radius} fill="none" stroke={timerColor} strokeWidth="4" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" transform={`rotate(-90 ${svgSize / 2} ${svgSize / 2})`} className={`timer-progress ${timeRemaining <= 5 ? 'pulse-animation' : ''}`} />
          </svg>
          <div className="timer-display">
            <span className="timer-value" style={{ color: timerColor }}>{formatTime(timeRemaining)}</span>
            {timeRemaining <= 3 && timeRemaining > 0 && <span className="timer-warning">Disappearing...</span>}
          </div>
          <div className="timer-controls">
            <button onClick={() => setIsPaused(!isPaused)} className="pause-btn">{isPaused ? '\u25B6' : '\u23F8'}</button>
          </div>
        </div>
      ) : (
        <div className="timer-selector">
          <div className="timer-header">
            <span className="timer-icon">\u23F0</span>
            <span className="current-value">{currentDuration > 0 ? formatTime(currentDuration) : 'Off'}</span>
          </div>
          <div className="preset-buttons">
            {PRESETS.map(preset => (
              <button key={preset.value} onClick={() => onDurationChange(preset.value)} className={`preset-btn ${currentDuration === preset.value ? 'active' : ''}`}>{preset.label}</button>
            ))}
            <button onClick={() => onDurationChange(0)} className={`preset-btn off-btn ${currentDuration === 0 ? 'active' : ''}`}>Off</button>
            <button onClick={() => setShowCustom(!showCustom)} className="custom-btn">Custom</button>
          </div>
          {showCustom && (
            <div className="custom-input">
              <div className="custom-fields">
                <div className="field"><input type="number" value={customMinutes} onChange={(e) => setCustomMinutes(e.target.value)} placeholder="0" min="0" max="1440" /><label>min</label></div>
                <div className="field"><input type="number" value={customSeconds} onChange={(e) => setCustomSeconds(e.target.value)} placeholder="0" min="0" max="59" /><label>sec</label></div>
              </div>
              <button onClick={handleCustomDuration} className="set-btn" disabled={!customMinutes && !customSeconds}>Set</button>
            </div>
          )}
          <div className="timer-preview">
            <svg width={80} height={80} className="preview-ring">
              <circle cx="40" cy="40" r="35" fill="none" stroke="#e0e0e0" strokeWidth="3" />
              <circle cx="40" cy="40" r="35" fill="none" stroke="#FFFC00" strokeWidth="3" strokeDasharray={2 * Math.PI * 35} strokeDashoffset={0} strokeLinecap="round" />
            </svg>
            <span className="preview-text">{currentDuration > 0 ? formatTime(currentDuration) : '\u221E'}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default DisappearingTimer;
