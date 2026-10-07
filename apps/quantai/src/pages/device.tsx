// ============================================================================
// QuantAI - Smart Home Dashboard
// Devices are loaded from the real backend (GET /api/devices); commands go to
// POST /api/devices/[deviceId]/command. No fabricated devices, scenes, or
// voice waveform: honest loading / error / empty states throughout.
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';

interface SmartDevice {
  id: string;
  name: string;
  type: 'light' | 'thermostat' | 'camera' | 'lock' | 'speaker' | 'blind';
  room: string;
  isOnline: boolean;
  isOn: boolean;
  brightness?: number;
  temperature?: number;
  targetTemp?: number;
  isLocked?: boolean;
  previewUrl?: string;
  volume?: number;
  position?: number;
}

interface Room {
  id: string;
  name: string;
  icon: string;
}

const ROOMS: Room[] = [
  { id: 'living', name: 'Living Room', icon: '🛋️' },
  { id: 'bedroom', name: 'Bedroom', icon: '🛏️' },
  { id: 'kitchen', name: 'Kitchen', icon: '🍳' },
  { id: 'office', name: 'Office', icon: '💼' },
  { id: 'bathroom', name: 'Bathroom', icon: '🚿' },
];

export default function DevicePage(): JSX.Element {
  const [devices, setDevices] = useState<SmartDevice[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string>('living');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/devices');
        const data = (await res.json().catch(() => ({}))) as {
          devices?: SmartDevice[];
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error || 'Could not load devices');
        }
        const list = Array.isArray(data) ? (data as unknown as SmartDevice[]) : (data.devices ?? []);
        if (!cancelled) setDevices(list);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load devices');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const roomDevices = useMemo(() => {
    return devices.filter((d) => (d.room || 'living') === selectedRoom);
  }, [devices, selectedRoom]);

  const currentRoom = useMemo(() => {
    return ROOMS.find((r) => r.id === selectedRoom) || ROOMS[0];
  }, [selectedRoom]);

  const roomDeviceCount = useCallback(
    (roomId: string) => devices.filter((d) => (d.room || 'living') === roomId).length,
    [devices],
  );

  /** Send a command to the real device backend; returns false on failure. */
  const sendCommand = useCallback(
    async (deviceId: string, command: Record<string, unknown>): Promise<boolean> => {
      setActionError(null);
      try {
        const res = await fetch(`/api/devices/${encodeURIComponent(deviceId)}/command`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(command),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          throw new Error(data.error || 'Device command failed');
        }
        return true;
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Device command failed');
        return false;
      }
    },
    [],
  );

  const handleToggleDevice = useCallback(
    async (deviceId: string) => {
      const device = devices.find((d) => d.id === deviceId);
      if (!device) return;
      const next = !device.isOn;
      setDevices((prev) => prev.map((d) => (d.id === deviceId ? { ...d, isOn: next } : d)));
      const ok = await sendCommand(deviceId, { action: 'toggle', on: next });
      if (!ok) {
        setDevices((prev) => prev.map((d) => (d.id === deviceId ? { ...d, isOn: device.isOn } : d)));
      }
    },
    [devices, sendCommand],
  );

  const handleBrightnessChange = useCallback(
    async (deviceId: string, value: number) => {
      setDevices((prev) =>
        prev.map((d) => (d.id === deviceId ? { ...d, brightness: value, isOn: value > 0 } : d)),
      );
      await sendCommand(deviceId, { action: 'setBrightness', brightness: value });
    },
    [sendCommand],
  );

  const handleTempChange = useCallback(
    async (deviceId: string, targetTemp: number) => {
      setDevices((prev) =>
        prev.map((d) => (d.id === deviceId ? { ...d, targetTemp } : d)),
      );
      await sendCommand(deviceId, { action: 'setTemperature', targetTemp });
    },
    [sendCommand],
  );

  const handleToggleLock = useCallback(
    async (deviceId: string) => {
      const device = devices.find((d) => d.id === deviceId);
      if (!device) return;
      const next = !device.isLocked;
      setDevices((prev) => prev.map((d) => (d.id === deviceId ? { ...d, isLocked: next } : d)));
      const ok = await sendCommand(deviceId, { action: 'setLock', locked: next });
      if (!ok) {
        setDevices((prev) =>
          prev.map((d) => (d.id === deviceId ? { ...d, isLocked: device.isLocked } : d)),
        );
      }
    },
    [devices, sendCommand],
  );

  const handleVolumeChange = useCallback(
    async (deviceId: string, value: number) => {
      setDevices((prev) => prev.map((d) => (d.id === deviceId ? { ...d, volume: value } : d)));
      await sendCommand(deviceId, { action: 'setVolume', volume: value });
    },
    [sendCommand],
  );

  const handlePositionChange = useCallback(
    async (deviceId: string, value: number) => {
      setDevices((prev) => prev.map((d) => (d.id === deviceId ? { ...d, position: value } : d)));
      await sendCommand(deviceId, { action: 'setPosition', position: value });
    },
    [sendCommand],
  );

  const renderDeviceCard = useCallback(
    (device: SmartDevice) => {
      return (
        <div
          key={device.id}
          className={`device-card ${device.type} ${device.isOn ? 'on' : 'off'} ${!device.isOnline ? 'offline' : ''}`}
        >
          <div className="device-header">
            <span className="device-icon">
              {device.type === 'light' && '💡'}
              {device.type === 'thermostat' && '🌡️'}
              {device.type === 'camera' && '📷'}
              {device.type === 'lock' && '🔐'}
              {device.type === 'speaker' && '🔊'}
              {device.type === 'blind' && '🪟'}
            </span>
            <div className="device-info">
              <div className="device-name">{device.name}</div>
              <div className="device-status">
                {device.isOnline ? (device.isOn ? 'On' : 'Off') : 'Offline'}
              </div>
            </div>
            <button
              className={`btn-toggle ${device.isOn ? 'active' : ''}`}
              onClick={() => handleToggleDevice(device.id)}
              disabled={!device.isOnline}
            >
              {device.isOn ? '●' : '○'}
            </button>
          </div>

          <div className="device-controls">
            {device.type === 'light' && device.brightness !== undefined && (
              <div className="brightness-control">
                <label>Brightness: {device.brightness}%</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={device.brightness}
                  onChange={(e) => handleBrightnessChange(device.id, Number(e.target.value))}
                  className="brightness-slider"
                  disabled={!device.isOnline}
                />
              </div>
            )}

            {device.type === 'thermostat' && (
              <div className="temp-control">
                <div className="current-temp">
                  <span className="temp-label">Current</span>
                  <span className="temp-value">{device.temperature ?? '—'}°C</span>
                </div>
                <div className="target-temp">
                  <span className="temp-label">Target</span>
                  <div className="temp-adjust">
                    <button
                      onClick={() =>
                        handleTempChange(device.id, Math.max((device.targetTemp ?? 20) - 1, 15))
                      }
                      disabled={!device.isOnline}
                    >
                      -
                    </button>
                    <span className="temp-value">{device.targetTemp ?? '—'}°C</span>
                    <button
                      onClick={() =>
                        handleTempChange(device.id, Math.min((device.targetTemp ?? 20) + 1, 35))
                      }
                      disabled={!device.isOnline}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            )}

            {device.type === 'camera' && (
              <div className="camera-preview">
                {device.isOn && device.isOnline && device.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={device.previewUrl} alt={`${device.name} preview`} className="preview-image" />
                ) : device.isOn && device.isOnline ? (
                  <div className="preview-offline">Preview not available</div>
                ) : (
                  <div className="preview-offline">Camera Off</div>
                )}
              </div>
            )}

            {device.type === 'lock' && (
              <div className="lock-control">
                <button
                  className={`btn-lock ${device.isLocked ? 'locked' : 'unlocked'}`}
                  onClick={() => handleToggleLock(device.id)}
                  disabled={!device.isOnline}
                >
                  {device.isLocked ? '🔒 Locked' : '🔓 Unlocked'}
                </button>
              </div>
            )}

            {device.type === 'speaker' && device.volume !== undefined && (
              <div className="volume-control">
                <label>Volume: {device.volume}%</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={device.volume}
                  onChange={(e) => handleVolumeChange(device.id, Number(e.target.value))}
                  className="volume-slider"
                  disabled={!device.isOnline}
                />
              </div>
            )}

            {device.type === 'blind' && device.position !== undefined && (
              <div className="blind-control">
                <label>Position: {device.position}%</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={device.position}
                  onChange={(e) => handlePositionChange(device.id, Number(e.target.value))}
                  className="blind-slider"
                  disabled={!device.isOnline}
                />
              </div>
            )}
          </div>
        </div>
      );
    },
    [handleToggleDevice, handleBrightnessChange, handleTempChange, handleToggleLock, handleVolumeChange, handlePositionChange],
  );

  if (error) {
    return (
      <div className="device-page error-state">
        <h2>Connection Error</h2>
        <p>{error}</p>
        <button onClick={() => setError(null)}>Retry</button>
      </div>
    );
  }

  return (
    <div className="device-page">
      <header className="device-header">
        <h1>Smart Home</h1>
        <div className="room-tabs">
          {ROOMS.map((room) => (
            <button
              key={room.id}
              className={`room-tab ${selectedRoom === room.id ? 'active' : ''}`}
              onClick={() => setSelectedRoom(room.id)}
            >
              <span className="room-icon">{room.icon}</span>
              <span className="room-name">{room.name}</span>
              <span className="room-count">{roomDeviceCount(room.id)}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="device-body">
        {actionError && (
          <div className="action-error">
            <p>{actionError}</p>
            <button onClick={() => setActionError(null)}>Dismiss</button>
          </div>
        )}

        <section className="devices-section">
          <div className="section-header">
            <h2>
              {currentRoom.icon} {currentRoom.name}
            </h2>
            <span className="device-count">{roomDevices.length} devices</span>
          </div>
          {isLoading ? (
            <div className="loading-devices">
              <p>Loading devices...</p>
            </div>
          ) : roomDevices.length === 0 ? (
            <div className="empty-room">
              <p>No devices connected in this room yet.</p>
            </div>
          ) : (
            <div className="devices-grid">
              {roomDevices.map((device) => renderDeviceCard(device))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
