'use client';
// ============================================================================
// Shared UI - DevicePicker Component
// ============================================================================

import React, { useState, useEffect, useCallback, useId } from 'react';

export interface DeviceInfo {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
}

export interface DevicePickerProps {
  onCameraSelect?: (deviceId: string) => void;
  onMicSelect?: (deviceId: string) => void;
  onSpeakerSelect?: (deviceId: string) => void;
  selectedCameraId?: string;
  selectedMicId?: string;
  selectedSpeakerId?: string;
  className?: string;
}

export const DevicePicker: React.FC<DevicePickerProps> = ({
  onCameraSelect,
  onMicSelect,
  onSpeakerSelect,
  selectedCameraId,
  selectedMicId,
  selectedSpeakerId,
  className = '',
}) => {
  const [cameras, setCameras] = useState<DeviceInfo[]>([]);
  const [microphones, setMicrophones] = useState<DeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<DeviceInfo[]>([]);
  const [permissionState, setPermissionState] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [error, setError] = useState<string | null>(null);

  /*
    All three `<label>`s were preceding siblings with no `htmlFor`, and none of
    the `<select>`s had an `id` — so the association was purely visual and every
    one of the three was announced as an unnamed combo box reading out whatever
    device happened to be selected. `useId` rather than fixed strings because a
    pre-join screen and a settings dialog can both be mounted at once, and two
    `id="camera"`s would silently point both labels at the first select.
  */
  const baseId = useId();
  const cameraId = `${baseId}-camera`;
  const micId = `${baseId}-mic`;
  const speakerId = `${baseId}-speaker`;

  const enumerateDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCameras(
        devices
          .filter((d) => d.kind === 'videoinput')
          .map((d) => ({
            deviceId: d.deviceId,
            label: d.label || `Camera ${d.deviceId.slice(0, 4)}`,
            kind: d.kind,
          })),
      );
      setMicrophones(
        devices
          .filter((d) => d.kind === 'audioinput')
          .map((d) => ({
            deviceId: d.deviceId,
            label: d.label || `Mic ${d.deviceId.slice(0, 4)}`,
            kind: d.kind,
          })),
      );
      setSpeakers(
        devices
          .filter((d) => d.kind === 'audiooutput')
          .map((d) => ({
            deviceId: d.deviceId,
            label: d.label || `Speaker ${d.deviceId.slice(0, 4)}`,
            kind: d.kind,
          })),
      );
      setPermissionState('granted');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enumerate devices');
    }
  }, []);

  const requestPermissions = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      stream.getTracks().forEach((track) => track.stop());
      setPermissionState('granted');
      await enumerateDevices();
    } catch (err) {
      setPermissionState('denied');
      setError('Permission denied. Please allow camera and microphone access.');
    }
  }, [enumerateDevices]);

  useEffect(() => {
    enumerateDevices();
  }, [enumerateDevices]);

  if (permissionState === 'denied') {
    return (
      <div className={`p-4 ${className}`}>
        {/* The only feedback for a denied prompt. Without a role it is inert text
            that arrives with the DOM it lives in, so nothing tells a reader why
            the picker vanished. */}
        <p className="text-red-600 text-sm" role="alert">
          {error || 'Permission denied'}
        </p>
      </div>
    );
  }

  if (permissionState === 'prompt' && cameras.length === 0) {
    return (
      <div className={`p-4 ${className}`}>
        <button
          type="button"
          onClick={requestPermissions}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          data-testid="request-permissions"
        >
          Allow Camera &amp; Microphone
        </button>
      </div>
    );
  }

  return (
    <div className={`space-y-4 p-4 ${className}`} data-testid="device-picker">
      {cameras.length > 0 && (
        <div>
          <label htmlFor={cameraId} className="block text-sm font-medium text-gray-700 mb-1">
            Camera
          </label>
          <select
            id={cameraId}
            value={selectedCameraId || ''}
            onChange={(e) => onCameraSelect?.(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            data-testid="camera-select"
          >
            {cameras.map((c) => (
              <option key={c.deviceId} value={c.deviceId}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {microphones.length > 0 && (
        <div>
          <label htmlFor={micId} className="block text-sm font-medium text-gray-700 mb-1">
            Microphone
          </label>
          <select
            id={micId}
            value={selectedMicId || ''}
            onChange={(e) => onMicSelect?.(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            data-testid="mic-select"
          >
            {microphones.map((m) => (
              <option key={m.deviceId} value={m.deviceId}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {speakers.length > 0 && (
        <div>
          <label htmlFor={speakerId} className="block text-sm font-medium text-gray-700 mb-1">
            Speaker
          </label>
          <select
            id={speakerId}
            value={selectedSpeakerId || ''}
            onChange={(e) => onSpeakerSelect?.(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            data-testid="speaker-select"
          >
            {speakers.map((s) => (
              <option key={s.deviceId} value={s.deviceId}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};
