// ============================================================================
// QuantAI - useDevices Hook
// IoT device state: discovery, control, scenes, schedules
// ============================================================================

import { useState, useCallback, useMemo, useEffect } from 'react';

interface SmartDevice {
  id: string;
  name: string;
  type: 'light' | 'thermostat' | 'camera' | 'lock' | 'speaker' | 'blind' | 'plug';
  room: string;
  isOnline: boolean;
  isOn: boolean;
  value?: number;
  unit?: string;
  min?: number;
  max?: number;
  lastUpdated: string;
  battery?: number;
  firmware?: string;
}

interface DeviceScene {
  id: string;
  name: string;
  icon: string;
  description: string;
  actions: Array<{ deviceId: string; action: string; value?: number }>;
  isActive: boolean;
}

interface DeviceSchedule {
  id: string;
  deviceId: string;
  time: string;
  action: 'on' | 'off' | 'set';
  value?: number;
  repeat: string[];
  isActive: boolean;
}

interface UseDevicesOptions {
  pollInterval?: number;
  rooms?: string[];
}

interface UseDevicesReturn {
  devices: SmartDevice[];
  rooms: string[];
  scenes: DeviceScene[];
  schedules: DeviceSchedule[];
  selectedRoom: string | null;
  isDiscovering: boolean;
  isLoading: boolean;
  error: string | null;
  toggleDevice: (id: string) => void;
  setDeviceValue: (id: string, value: number) => void;
  selectRoom: (room: string | null) => void;
  activateScene: (sceneId: string) => void;
  createScene: (name: string, icon: string, description: string, actions: DeviceScene['actions']) => void;
  deleteScene: (sceneId: string) => void;
  addSchedule: (deviceId: string, time: string, action: 'on' | 'off' | 'set', repeat: string[], value?: number) => void;
  removeSchedule: (scheduleId: string) => void;
  discoverDevices: () => void;
  getDevicesByRoom: (room: string) => SmartDevice[];
  getOnlineCount: () => number;
}

export function useDevices(options: UseDevicesOptions = {}): UseDevicesReturn {
  const { rooms: defaultRooms = ['Living Room', 'Bedroom', 'Kitchen', 'Office', 'Bathroom'] } = options;

  const [devices, setDevices] = useState<SmartDevice[]>([
    { id: 'd1', name: 'Ceiling Light', type: 'light', room: 'Living Room', isOnline: true, isOn: true, value: 80, unit: '%', min: 0, max: 100, lastUpdated: new Date().toISOString() },
    { id: 'd2', name: 'Thermostat', type: 'thermostat', room: 'Living Room', isOnline: true, isOn: true, value: 22, unit: 'C', min: 15, max: 35, lastUpdated: new Date().toISOString() },
    { id: 'd3', name: 'Front Camera', type: 'camera', room: 'Living Room', isOnline: true, isOn: true, lastUpdated: new Date().toISOString() },
    { id: 'd4', name: 'Front Door', type: 'lock', room: 'Living Room', isOnline: true, isOn: true, lastUpdated: new Date().toISOString() },
    { id: 'd5', name: 'Bedroom Light', type: 'light', room: 'Bedroom', isOnline: true, isOn: false, value: 0, unit: '%', min: 0, max: 100, lastUpdated: new Date().toISOString() },
    { id: 'd6', name: 'AC Unit', type: 'thermostat', room: 'Bedroom', isOnline: true, isOn: true, value: 20, unit: 'C', min: 16, max: 30, lastUpdated: new Date().toISOString() },
    { id: 'd7', name: 'Kitchen Light', type: 'light', room: 'Kitchen', isOnline: true, isOn: true, value: 100, unit: '%', min: 0, max: 100, lastUpdated: new Date().toISOString() },
    { id: 'd8', name: 'Smart Plug', type: 'plug', room: 'Office', isOnline: true, isOn: true, lastUpdated: new Date().toISOString() },
  ]);

  const [scenes, setScenes] = useState<DeviceScene[]>([
    { id: 's1', name: 'Movie Night', icon: '🎬', description: 'Dim lights, lock door', actions: [{ deviceId: 'd1', action: 'set', value: 20 }, { deviceId: 'd4', action: 'on' }], isActive: false },
    { id: 's2', name: 'Good Morning', icon: '🌅', description: 'Lights on, warm temp', actions: [{ deviceId: 'd1', action: 'set', value: 100 }, { deviceId: 'd2', action: 'set', value: 23 }], isActive: false },
    { id: 's3', name: 'Away Mode', icon: '🔒', description: 'All off, lock doors', actions: [{ deviceId: 'd1', action: 'off' }, { deviceId: 'd4', action: 'on' }], isActive: false },
  ]);

  const [schedules, setSchedules] = useState<DeviceSchedule[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [isDiscovering, setIsDiscovering] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const rooms = useMemo(() => defaultRooms, [defaultRooms]);

  const toggleDevice = useCallback((id: string) => {
    setDevices(prev => prev.map(d =>
      d.id === id ? { ...d, isOn: !d.isOn, lastUpdated: new Date().toISOString() } : d
    ));
  }, []);

  const setDeviceValue = useCallback((id: string, value: number) => {
    setDevices(prev => prev.map(d =>
      d.id === id ? { ...d, value, isOn: value > 0, lastUpdated: new Date().toISOString() } : d
    ));
  }, []);

  const selectRoom = useCallback((room: string | null) => {
    setSelectedRoom(room);
  }, []);

  const activateScene = useCallback((sceneId: string) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;

    setScenes(prev => prev.map(s => ({ ...s, isActive: s.id === sceneId })));

    scene.actions.forEach(action => {
      if (action.action === 'on') {
        setDevices(prev => prev.map(d => d.id === action.deviceId ? { ...d, isOn: true, lastUpdated: new Date().toISOString() } : d));
      } else if (action.action === 'off') {
        setDevices(prev => prev.map(d => d.id === action.deviceId ? { ...d, isOn: false, lastUpdated: new Date().toISOString() } : d));
      } else if (action.action === 'set' && action.value !== undefined) {
        setDevices(prev => prev.map(d => d.id === action.deviceId ? { ...d, value: action.value, isOn: true, lastUpdated: new Date().toISOString() } : d));
      }
    });
  }, [scenes]);

  const createScene = useCallback((name: string, icon: string, description: string, actions: DeviceScene['actions']) => {
    const newScene: DeviceScene = {
      id: `scene-${Date.now()}`,
      name,
      icon,
      description,
      actions,
      isActive: false,
    };
    setScenes(prev => [...prev, newScene]);
  }, []);

  const deleteScene = useCallback((sceneId: string) => {
    setScenes(prev => prev.filter(s => s.id !== sceneId));
  }, []);

  const addSchedule = useCallback((deviceId: string, time: string, action: 'on' | 'off' | 'set', repeat: string[], value?: number) => {
    const newSchedule: DeviceSchedule = {
      id: `sched-${Date.now()}`,
      deviceId,
      time,
      action,
      value,
      repeat,
      isActive: true,
    };
    setSchedules(prev => [...prev, newSchedule]);
  }, []);

  const removeSchedule = useCallback((scheduleId: string) => {
    setSchedules(prev => prev.filter(s => s.id !== scheduleId));
  }, []);

  const discoverDevices = useCallback(() => {
    setIsDiscovering(true);
    setTimeout(() => {
      setIsDiscovering(false);
    }, 3000);
  }, []);

  const getDevicesByRoom = useCallback((room: string) => {
    return devices.filter(d => d.room === room);
  }, [devices]);

  const getOnlineCount = useCallback(() => {
    return devices.filter(d => d.isOnline).length;
  }, [devices]);

  return {
    devices,
    rooms,
    scenes,
    schedules,
    selectedRoom,
    isDiscovering,
    isLoading,
    error,
    toggleDevice,
    setDeviceValue,
    selectRoom,
    activateScene,
    createScene,
    deleteScene,
    addSchedule,
    removeSchedule,
    discoverDevices,
    getDevicesByRoom,
    getOnlineCount,
  };
}

export default useDevices;
