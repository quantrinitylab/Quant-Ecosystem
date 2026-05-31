'use client';
// ============================================================================
// QuantLive - Main Component
// ============================================================================

import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type {
  QuantLiveProps,
  QuantLiveState,
  OrbColorState,
  CaptionEntry,
  ActionChipInfo,
} from './types';
import { QuantLiveOrb } from './QuantLiveOrb';
import { QuantLiveCaptions } from './QuantLiveCaptions';
import { QuantLiveActionChip } from './QuantLiveActionChip';
import { QuantLiveControls } from './QuantLiveControls';
import { QuantLivePrivacyIndicator } from './QuantLivePrivacyIndicator';

const positionStyles: Record<string, string> = {
  'bottom-right': 'fixed bottom-4 right-4',
  'bottom-center': 'fixed bottom-4 left-1/2 -translate-x-1/2',
  fullscreen: 'fixed inset-0',
};

export const QuantLive: React.FC<QuantLiveProps> = ({
  onActivate,
  onDeactivate,
  className = '',
  position = 'bottom-right',
  captions: captionsProp,
  currentAction: currentActionProp,
  orbColorState: orbColorProp,
}) => {
  const [state, setState] = useState<QuantLiveState>('idle');
  const [orbColorInternal, setOrbColorInternal] = useState<OrbColorState>('idle');
  const [micMuted, setMicMuted] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [captionsInternal, setCaptionsInternal] = useState<CaptionEntry[]>([]);
  const [currentActionInternal, setCurrentActionInternal] = useState<ActionChipInfo | null>(null);

  const orbColor = orbColorProp ?? orbColorInternal;
  const captions = captionsProp ?? captionsInternal;
  const currentAction = currentActionProp !== undefined ? currentActionProp : currentActionInternal;

  const handleActivate = useCallback(() => {
    setState('active');
    setOrbColorInternal('listening');
    onActivate?.();
  }, [onActivate]);

  const handleDeactivate = useCallback(() => {
    setState('idle');
    setOrbColorInternal('idle');
    setMicMuted(false);
    setCameraActive(false);
    setScreenSharing(false);
    setCaptionsInternal([]);
    setCurrentActionInternal(null);
    onDeactivate?.();
  }, [onDeactivate]);

  const handleMinimize = useCallback(() => {
    setState('minimized');
  }, []);

  const handleMaximize = useCallback(() => {
    setState('active');
  }, []);

  const handleToggleMic = useCallback(() => {
    setMicMuted((prev) => !prev);
  }, []);

  const handleToggleCamera = useCallback(() => {
    setCameraActive((prev) => !prev);
  }, []);

  const handleToggleScreen = useCallback(() => {
    setScreenSharing((prev) => !prev);
  }, []);

  if (state === 'idle') {
    return (
      <div className={`${positionStyles[position] || positionStyles['bottom-right']} ${className}`}>
        <QuantLiveOrb colorState={orbColor} onClick={handleActivate} size="sm" />
      </div>
    );
  }

  if (state === 'minimized') {
    return (
      <div className={`${positionStyles[position] || positionStyles['bottom-right']} ${className}`}>
        <QuantLiveOrb colorState={orbColor} onClick={handleMaximize} size="sm" />
        <QuantLivePrivacyIndicator
          micActive={!micMuted}
          cameraActive={cameraActive}
          screenSharing={screenSharing}
        />
      </div>
    );
  }

  const privacyIndicator = (
    <QuantLivePrivacyIndicator
      micActive={!micMuted}
      cameraActive={cameraActive}
      screenSharing={screenSharing}
    />
  );

  return (
    <div
      className={`${positionStyles[position] || positionStyles['bottom-right']} transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none ${position === 'fullscreen' ? 'flex flex-col' : 'w-80'} bg-white rounded-xl shadow-2xl overflow-hidden ${className}`}
    >
      <div className="flex items-center justify-between p-3 border-b border-gray-100">
        <QuantLiveOrb colorState={orbColor} size="sm" />
        <QuantLiveActionChip action={currentAction} />
      </div>

      <QuantLiveCaptions
        captions={captions}
        className={position === 'fullscreen' ? 'flex-1' : ''}
      />

      <div className="p-3 border-t border-gray-100">
        <QuantLiveControls
          micMuted={micMuted}
          cameraActive={cameraActive}
          screenSharing={screenSharing}
          onToggleMic={handleToggleMic}
          onToggleCamera={handleToggleCamera}
          onToggleScreen={handleToggleScreen}
          onEndSession={handleDeactivate}
          onToggleMinimize={handleMinimize}
          isMinimized={false}
        />
      </div>

      {typeof document !== 'undefined'
        ? createPortal(privacyIndicator, document.body)
        : privacyIndicator}
    </div>
  );
};
