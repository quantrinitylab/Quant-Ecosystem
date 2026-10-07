// ============================================================================
// QuantNeon - Reel Creator Component
// Reel recording/editing: effects, music, speed, timer, align
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface ReelCreatorProps {
  onPublish?: (data: ReelData) => void;
  onCancel?: () => void;
}

interface ReelData {
  duration: number;
  speed: number;
  soundId: string | null;
  effects: string[];
  caption: string;
}

interface CreatorState {
  recording: boolean;
  duration: number;
  maxDuration: number;
  speed: number;
  selectedEffect: string | null;
  soundId: string | null;
  soundName: string | null;
  timerEnabled: boolean;
  timerSeconds: number;
  alignEnabled: boolean;
  caption: string;
  step: 'record' | 'edit' | 'caption';
  flashEnabled: boolean;
  cameraFacing: 'front' | 'back';
}

const EFFECTS = ['None', 'Glow', 'Vintage', 'B&W', 'Neon', 'Blur', 'Sparkle', 'Glitch'];
const SPEEDS = [0.3, 0.5, 1, 2, 3];
const DURATIONS = [15, 30, 60, 90];

const ReelCreator: React.FC<ReelCreatorProps> = ({ onPublish, onCancel }) => {
  const [state, setState] = useState<CreatorState>({
    recording: false, duration: 0, maxDuration: 30, speed: 1, selectedEffect: null,
    soundId: null, soundName: null, timerEnabled: false, timerSeconds: 3,
    alignEnabled: false, caption: '', step: 'record', flashEnabled: false, cameraFacing: 'back',
  });

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (state.recording) {
      timerRef.current = setInterval(() => {
        setState(prev => {
          if (prev.duration >= prev.maxDuration) {
            return { ...prev, recording: false, step: 'edit' };
          }
          return { ...prev, duration: prev.duration + 0.1 };
        });
      }, 100);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }
  }, [state.recording]);

  const startRecording = useCallback(() => {
    if (state.timerEnabled) {
      setTimeout(() => setState(prev => ({ ...prev, recording: true })), state.timerSeconds * 1000);
    } else {
      setState(prev => ({ ...prev, recording: true }));
    }
  }, [state.timerEnabled, state.timerSeconds]);

  const stopRecording = useCallback(() => {
    setState(prev => ({ ...prev, recording: false, step: 'edit' }));
  }, []);

  const setSpeed = useCallback((speed: number) => { setState(prev => ({ ...prev, speed })); }, []);
  const setMaxDuration = useCallback((d: number) => { setState(prev => ({ ...prev, maxDuration: d })); }, []);
  const toggleFlash = useCallback(() => { setState(prev => ({ ...prev, flashEnabled: !prev.flashEnabled })); }, []);
  const flipCamera = useCallback(() => { setState(prev => ({ ...prev, cameraFacing: prev.cameraFacing === 'front' ? 'back' : 'front' })); }, []);

  const handlePublish = useCallback(() => {
    if (onPublish) onPublish({ duration: state.duration, speed: state.speed, soundId: state.soundId, effects: state.selectedEffect ? [state.selectedEffect] : [], caption: state.caption });
  }, [state, onPublish]);

  if (state.step === 'caption') {
    return (
      <div className="h-full bg-black flex flex-col p-4">
        <h2 className="text-white text-lg font-bold mb-4">Add Caption</h2>
        <textarea value={state.caption} onChange={(e) => setState(prev => ({ ...prev, caption: e.target.value }))} placeholder="Write a caption..." rows={4} className="flex-1 bg-gray-900 text-white rounded-xl px-4 py-3 text-sm outline-none resize-none max-h-40" />
        <div className="flex space-x-3 mt-4">
          <button onClick={() => setState(prev => ({ ...prev, step: 'edit' }))} className="flex-1 py-3 bg-gray-800 text-white rounded-xl">Back</button>
          <button onClick={handlePublish} className="flex-1 py-3 bg-pink-600 text-white rounded-xl font-semibold">Share</button>
        </div>
      </div>
    );
  }

  if (state.step === 'edit') {
    return (
      <div className="h-full bg-black flex flex-col">
        <div className="flex-1 bg-gray-900 rounded-xl m-4 flex items-center justify-center">
          <p className="text-gray-400">Preview ({state.duration.toFixed(1)}s)</p>
        </div>
        <div className="px-4 pb-4 space-y-3">
          <div className="flex space-x-2 overflow-x-auto">
            {EFFECTS.map(eff => (
              <button key={eff} onClick={() => setState(prev => ({ ...prev, selectedEffect: eff === 'None' ? null : eff }))} className={`px-3 py-2 rounded-lg text-xs whitespace-nowrap ${state.selectedEffect === eff || (eff === 'None' && !state.selectedEffect) ? 'bg-pink-600 text-white' : 'bg-gray-800 text-gray-300'}`}>{eff}</button>
            ))}
          </div>
          <div className="flex space-x-3">
            <button onClick={() => setState(prev => ({ ...prev, step: 'record', duration: 0 }))} className="flex-1 py-3 bg-gray-800 text-white rounded-xl">Re-record</button>
            <button onClick={() => setState(prev => ({ ...prev, step: 'caption' }))} className="flex-1 py-3 bg-pink-600 text-white rounded-xl font-semibold">Next</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-black flex flex-col relative">
      <div className="absolute top-4 left-4 z-10">
        <button onClick={onCancel} className="text-white text-xl">✕</button>
      </div>
      <div className="absolute top-4 right-4 z-10 space-y-3">
        <button onClick={flipCamera} className="w-10 h-10 bg-black/50 rounded-full flex items-center justify-center text-white text-sm">🔄</button>
        <button onClick={toggleFlash} className={`w-10 h-10 rounded-full flex items-center justify-center text-sm ${state.flashEnabled ? 'bg-yellow-500' : 'bg-black/50 text-white'}`}>⚡</button>
        <button onClick={() => setState(prev => ({ ...prev, timerEnabled: !prev.timerEnabled }))} className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm ${state.timerEnabled ? 'bg-pink-600' : 'bg-black/50'}`}>⏱</button>
        <button onClick={() => setState(prev => ({ ...prev, alignEnabled: !prev.alignEnabled }))} className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm ${state.alignEnabled ? 'bg-pink-600' : 'bg-black/50'}`}>⊞</button>
      </div>
      <div className="flex-1 bg-gray-900 flex items-center justify-center">
        <p className="text-gray-500">{state.cameraFacing === 'front' ? 'Front Camera' : 'Back Camera'}</p>
      </div>
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent pt-16 pb-6 px-4">
        <div className="flex justify-center space-x-3 mb-4">
          {SPEEDS.map(s => (
            <button key={s} onClick={() => setSpeed(s)} className={`px-2 py-1 rounded text-xs ${state.speed === s ? 'bg-white text-black' : 'text-white'}`}>{s}x</button>
          ))}
        </div>
        <div className="flex justify-center space-x-2 mb-4">
          {DURATIONS.map(d => (
            <button key={d} onClick={() => setMaxDuration(d)} className={`px-3 py-1 rounded-full text-xs ${state.maxDuration === d ? 'bg-pink-600 text-white' : 'bg-gray-800 text-gray-300'}`}>{d}s</button>
          ))}
        </div>
        <div className="flex items-center justify-center">
          <button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            className={`w-20 h-20 rounded-full border-4 flex items-center justify-center ${state.recording ? 'border-red-500 bg-red-500/30' : 'border-white bg-white/10'}`}
          >
            {state.recording ? <div className="w-8 h-8 bg-red-500 rounded-sm" /> : <div className="w-16 h-16 bg-red-500 rounded-full" />}
          </button>
        </div>
        <div className="mt-3 h-1 bg-gray-700 rounded-full">
          <div className="h-full bg-pink-500 rounded-full transition-all" style={{ width: `${(state.duration / state.maxDuration) * 100}%` }} />
        </div>
      </div>
    </div>
  );
};

export default ReelCreator;
