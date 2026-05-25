// ============================================================================
// QuantAI - Smart Home Dashboard
// Room tabs, device grid with controls (lights, thermostat, cameras, locks),
// scenes panel, voice command input with waveform visualization
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

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
  deviceCount: number;
}

interface Scene {
  id: string;
  name: string;
  icon: string;
  description: string;
  deviceActions: number;
  isActive: boolean;
}

interface VoiceCommand {
  id: string;
  text: string;
  timestamp: string;
  response: string;
  success: boolean;
}

const ROOMS: Room[] = [
  { id: 'living', name: 'Living Room', icon: '🛋️', deviceCount: 6 },
  { id: 'bedroom', name: 'Bedroom', icon: '🛏️', deviceCount: 4 },
  { id: 'kitchen', name: 'Kitchen', icon: '🍳', deviceCount: 5 },
  { id: 'office', name: 'Office', icon: '💼', deviceCount: 3 },
  { id: 'bathroom', name: 'Bathroom', icon: '🚿', deviceCount: 2 },
];

const INITIAL_DEVICES: SmartDevice[] = [
  { id: 'd1', name: 'Ceiling Light', type: 'light', room: 'living', isOnline: true, isOn: true, brightness: 80 },
  { id: 'd2', name: 'Floor Lamp', type: 'light', room: 'living', isOnline: true, isOn: false, brightness: 0 },
  { id: 'd3', name: 'Thermostat', type: 'thermostat', room: 'living', isOnline: true, isOn: true, temperature: 22, targetTemp: 23 },
  { id: 'd4', name: 'Security Camera', type: 'camera', room: 'living', isOnline: true, isOn: true, previewUrl: '/camera-preview.jpg' },
  { id: 'd5', name: 'Front Door', type: 'lock', room: 'living', isOnline: true, isOn: true, isLocked: true },
  { id: 'd6', name: 'Smart Speaker', type: 'speaker', room: 'living', isOnline: true, isOn: true, volume: 45 },
  { id: 'd7', name: 'Bedside Lamp', type: 'light', room: 'bedroom', isOnline: true, isOn: false, brightness: 0 },
  { id: 'd8', name: 'AC Unit', type: 'thermostat', room: 'bedroom', isOnline: true, isOn: true, temperature: 20, targetTemp: 21 },
  { id: 'd9', name: 'Window Blinds', type: 'blind', room: 'bedroom', isOnline: true, isOn: true, position: 50 },
  { id: 'd10', name: 'Bedroom Camera', type: 'camera', room: 'bedroom', isOnline: false, isOn: false, previewUrl: '' },
  { id: 'd11', name: 'Kitchen Light', type: 'light', room: 'kitchen', isOnline: true, isOn: true, brightness: 100 },
  { id: 'd12', name: 'Under Cabinet', type: 'light', room: 'kitchen', isOnline: true, isOn: true, brightness: 60 },
  { id: 'd13', name: 'Kitchen Thermostat', type: 'thermostat', room: 'kitchen', isOnline: true, isOn: true, temperature: 24, targetTemp: 22 },
  { id: 'd14', name: 'Back Door Lock', type: 'lock', room: 'kitchen', isOnline: true, isOn: true, isLocked: false },
  { id: 'd15', name: 'Kitchen Speaker', type: 'speaker', room: 'kitchen', isOnline: true, isOn: false, volume: 30 },
  { id: 'd16', name: 'Desk Lamp', type: 'light', room: 'office', isOnline: true, isOn: true, brightness: 90 },
  { id: 'd17', name: 'Office Camera', type: 'camera', room: 'office', isOnline: true, isOn: true, previewUrl: '/camera-office.jpg' },
  { id: 'd18', name: 'Office Thermostat', type: 'thermostat', room: 'office', isOnline: true, isOn: true, temperature: 21, targetTemp: 22 },
  { id: 'd19', name: 'Bathroom Light', type: 'light', room: 'bathroom', isOnline: true, isOn: false, brightness: 0 },
  { id: 'd20', name: 'Towel Heater', type: 'thermostat', room: 'bathroom', isOnline: true, isOn: false, temperature: 18, targetTemp: 35 },
];

const SCENES: Scene[] = [
  { id: 's1', name: 'Movie Night', icon: '🎬', description: 'Dim lights, close blinds, set TV mode', deviceActions: 4, isActive: false },
  { id: 's2', name: 'Good Morning', icon: '🌅', description: 'Open blinds, warm lights, start coffee', deviceActions: 5, isActive: false },
  { id: 's3', name: 'Away Mode', icon: '🔒', description: 'Lock doors, arm cameras, lights off', deviceActions: 8, isActive: false },
  { id: 's4', name: 'Focus Mode', icon: '🎯', description: 'Office light on, DND, block notifications', deviceActions: 3, isActive: false },
  { id: 's5', name: 'Night Mode', icon: '🌙', description: 'All lights off, lock doors, low temp', deviceActions: 6, isActive: true },
  { id: 's6', name: 'Party Mode', icon: '🎉', description: 'Color lights, music on, warm temp', deviceActions: 5, isActive: false },
];

export default function DevicePage(): JSX.Element {
  const [devices, setDevices] = useState<SmartDevice[]>(INITIAL_DEVICES);
  const [selectedRoom, setSelectedRoom] = useState<string>('living');
  const [scenes, setScenes] = useState<Scene[]>(SCENES);
  const [voiceActive, setVoiceActive] = useState<boolean>(false);
  const [voiceInput, setVoiceInput] = useState<string>('');
  const [voiceHistory, setVoiceHistory] = useState<VoiceCommand[]>([]);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const animationRef = useRef<number>(0);

  const roomDevices = useMemo(() => {
    return devices.filter(d => d.room === selectedRoom);
  }, [devices, selectedRoom]);

  const currentRoom = useMemo(() => {
    return ROOMS.find(r => r.id === selectedRoom) || ROOMS[0];
  }, [selectedRoom]);

  useEffect(() => {
    if (voiceActive) {
      const interval = setInterval(() => {
        setAudioLevel(Math.random() * 100);
      }, 100);
      return () => clearInterval(interval);
    } else {
      setAudioLevel(0);
    }
  }, [voiceActive]);

  const handleToggleDevice = useCallback((deviceId: string) => {
    setDevices(prev => prev.map(d =>
      d.id === deviceId ? { ...d, isOn: !d.isOn } : d
    ));
  }, []);

  const handleBrightnessChange = useCallback((deviceId: string, value: number) => {
    setDevices(prev => prev.map(d =>
      d.id === deviceId ? { ...d, brightness: value, isOn: value > 0 } : d
    ));
  }, []);

  const handleTempUp = useCallback((deviceId: string) => {
    setDevices(prev => prev.map(d =>
      d.id === deviceId && d.targetTemp !== undefined
        ? { ...d, targetTemp: Math.min(d.targetTemp + 1, 35) }
        : d
    ));
  }, []);

  const handleTempDown = useCallback((deviceId: string) => {
    setDevices(prev => prev.map(d =>
      d.id === deviceId && d.targetTemp !== undefined
        ? { ...d, targetTemp: Math.max(d.targetTemp - 1, 15) }
        : d
    ));
  }, []);

  const handleToggleLock = useCallback((deviceId: string) => {
    setDevices(prev => prev.map(d =>
      d.id === deviceId ? { ...d, isLocked: !d.isLocked } : d
    ));
  }, []);

  const handleActivateScene = useCallback((sceneId: string) => {
    setScenes(prev => prev.map(s => ({ ...s, isActive: s.id === sceneId })));
  }, []);

  const handleVoiceToggle = useCallback(() => {
    if (voiceActive) {
      setVoiceActive(false);
      if (voiceInput.trim()) {
        const cmd: VoiceCommand = {
          id: `vc${Date.now()}`,
          text: voiceInput,
          timestamp: new Date().toISOString(),
          response: `Executed: ${voiceInput}`,
          success: true,
        };
        setVoiceHistory(prev => [cmd, ...prev]);
        setVoiceInput('');
      }
    } else {
      setVoiceActive(true);
    }
  }, [voiceActive, voiceInput]);

  const handleVoiceCommand = useCallback((text: string) => {
    const cmd: VoiceCommand = {
      id: `vc${Date.now()}`,
      text,
      timestamp: new Date().toISOString(),
      response: `Command processed: ${text}`,
      success: true,
    };
    setVoiceHistory(prev => [cmd, ...prev]);
    setVoiceInput('');
  }, []);

  const renderDeviceCard = useCallback((device: SmartDevice) => {
    return (
      <div key={device.id} className={`device-card ${device.type} ${device.isOn ? 'on' : 'off'} ${!device.isOnline ? 'offline' : ''}`}>
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
                onChange={e => handleBrightnessChange(device.id, Number(e.target.value))}
                className="brightness-slider"
                disabled={!device.isOnline}
              />
            </div>
          )}

          {device.type === 'thermostat' && (
            <div className="temp-control">
              <div className="current-temp">
                <span className="temp-label">Current</span>
                <span className="temp-value">{device.temperature}°C</span>
              </div>
              <div className="target-temp">
                <span className="temp-label">Target</span>
                <div className="temp-adjust">
                  <button onClick={() => handleTempDown(device.id)} disabled={!device.isOnline}>-</button>
                  <span className="temp-value">{device.targetTemp}°C</span>
                  <button onClick={() => handleTempUp(device.id)} disabled={!device.isOnline}>+</button>
                </div>
              </div>
            </div>
          )}

          {device.type === 'camera' && (
            <div className="camera-preview">
              {device.isOn && device.isOnline ? (
                <div className="preview-placeholder">
                  <span>Live Preview</span>
                  <div className="recording-indicator">● REC</div>
                </div>
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
                onChange={e => setDevices(prev => prev.map(d =>
                  d.id === device.id ? { ...d, volume: Number(e.target.value) } : d
                ))}
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
                onChange={e => setDevices(prev => prev.map(d =>
                  d.id === device.id ? { ...d, position: Number(e.target.value) } : d
                ))}
                className="blind-slider"
                disabled={!device.isOnline}
              />
            </div>
          )}
        </div>
      </div>
    );
  }, [handleToggleDevice, handleBrightnessChange, handleTempUp, handleTempDown, handleToggleLock]);

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
          {ROOMS.map(room => (
            <button
              key={room.id}
              className={`room-tab ${selectedRoom === room.id ? 'active' : ''}`}
              onClick={() => setSelectedRoom(room.id)}
            >
              <span className="room-icon">{room.icon}</span>
              <span className="room-name">{room.name}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="device-body">
        <section className="devices-section">
          <div className="section-header">
            <h2>{currentRoom.icon} {currentRoom.name}</h2>
            <span className="device-count">{roomDevices.length} devices</span>
          </div>
          {roomDevices.length === 0 ? (
            <div className="empty-room">
              <p>No devices in this room</p>
              <button className="btn-add-device">+ Add Device</button>
            </div>
          ) : (
            <div className="devices-grid">
              {roomDevices.map(device => renderDeviceCard(device))}
            </div>
          )}
        </section>

        <section className="scenes-section">
          <h2>Scenes</h2>
          <div className="scenes-grid">
            {scenes.map(scene => (
              <div
                key={scene.id}
                className={`scene-card ${scene.isActive ? 'active' : ''}`}
                onClick={() => handleActivateScene(scene.id)}
              >
                <span className="scene-icon">{scene.icon}</span>
                <div className="scene-info">
                  <div className="scene-name">{scene.name}</div>
                  <div className="scene-desc">{scene.description}</div>
                </div>
                {scene.isActive && <span className="scene-active-badge">Active</span>}
              </div>
            ))}
          </div>
        </section>

        <section className="voice-section">
          <h2>Voice Command</h2>
          <div className="voice-control">
            <div className={`waveform ${voiceActive ? 'active' : ''}`}>
              {Array.from({ length: 20 }).map((_, i) => (
                <div
                  key={i}
                  className="waveform-bar"
                  style={{ height: voiceActive ? `${Math.random() * 60 + 10}%` : '10%' }}
                />
              ))}
            </div>
            <div className="voice-input-area">
              <input
                type="text"
                value={voiceInput}
                onChange={e => setVoiceInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && voiceInput.trim()) handleVoiceCommand(voiceInput); }}
                placeholder="Type or speak a command..."
                className="voice-text-input"
              />
              <button
                className={`btn-mic ${voiceActive ? 'listening' : ''}`}
                onClick={handleVoiceToggle}
              >
                {voiceActive ? '⏹️' : '🎤'}
              </button>
            </div>
            {voiceHistory.length > 0 && (
              <div className="voice-history">
                {voiceHistory.slice(0, 5).map(cmd => (
                  <div key={cmd.id} className={`voice-cmd ${cmd.success ? 'success' : 'failed'}`}>
                    <span className="cmd-text">{cmd.text}</span>
                    <span className="cmd-time">{new Date(cmd.timestamp).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
