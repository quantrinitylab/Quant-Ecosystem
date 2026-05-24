// ============================================================================
// QuantAI - Device Service
// Device control, screen reading, gesture simulation, OS integration
// ============================================================================

import type { Device, DeviceCommand, DeviceType, DeviceCapability } from '../../src/types';

export class DeviceService {
  private devices: Map<string, Device> = new Map();
  private commandHistory: Map<string, DeviceCommand[]> = new Map();
  private commandIdCounter = 0;

  registerDevice(userId: string, input: { name: string; type: DeviceType; os: string; osVersion: string; screenResolution?: { width: number; height: number } }): Device {
    const device: Device = {
      id: `dev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      userId,
      name: input.name,
      type: input.type,
      os: input.os,
      osVersion: input.osVersion,
      status: 'online',
      capabilities: this.getDefaultCapabilities(input.type),
      lastSeen: new Date().toISOString(),
      battery: 100,
      screenResolution: input.screenResolution || { width: 1920, height: 1080 },
    };
    this.devices.set(device.id, device);
    return device;
  }

  private getDefaultCapabilities(type: DeviceType): DeviceCapability[] {
    const base: DeviceCapability[] = [
      { id: 'cap_screen', name: 'Screen Read', type: 'screen-read', enabled: true },
      { id: 'cap_notify', name: 'Notifications', type: 'notification', enabled: true },
      { id: 'cap_app', name: 'App Control', type: 'app-control', enabled: true },
      { id: 'cap_clipboard', name: 'Clipboard', type: 'clipboard', enabled: true },
    ];
    if (type === 'phone' || type === 'tablet') {
      base.push({ id: 'cap_gesture', name: 'Gesture Simulation', type: 'gesture', enabled: true });
    }
    if (type === 'laptop' || type === 'desktop') {
      base.push({ id: 'cap_fs', name: 'File System', type: 'file-system', enabled: true });
      base.push({ id: 'cap_sys', name: 'System Commands', type: 'system-command', enabled: true });
    }
    return base;
  }

  listDevices(userId: string): Device[] {
    return Array.from(this.devices.values()).filter(d => d.userId === userId);
  }

  getDevice(deviceId: string): Device | null {
    return this.devices.get(deviceId) || null;
  }

  updateDeviceStatus(deviceId: string, status: Device['status']): boolean {
    const device = this.devices.get(deviceId);
    if (!device) return false;
    device.status = status;
    device.lastSeen = new Date().toISOString();
    return true;
  }

  async executeCommand(deviceId: string, command: Omit<DeviceCommand, 'id' | 'deviceId' | 'status' | 'executedAt'>): Promise<DeviceCommand> {
    const device = this.devices.get(deviceId);
    if (!device) throw new Error('Device not found');
    if (device.status !== 'online') throw new Error('Device is not online');

    // Check capability
    const capRequired = this.getRequiredCapability(command.type);
    const hasCap = device.capabilities.find(c => c.type === capRequired && c.enabled);
    if (!hasCap) throw new Error(`Device does not support ${command.type}`);

    const cmd: DeviceCommand = {
      id: `cmd_${++this.commandIdCounter}_${Date.now().toString(36)}`,
      deviceId,
      type: command.type,
      params: command.params,
      status: 'queued',
    };

    // Execute the command (simulated)
    cmd.status = 'executing';
    const result = await this.simulateExecution(cmd, device);
    cmd.status = 'completed';
    cmd.result = result;
    cmd.executedAt = new Date().toISOString();

    // Store in history
    const history = this.commandHistory.get(deviceId) || [];
    history.push(cmd);
    this.commandHistory.set(deviceId, history);

    return cmd;
  }

  private getRequiredCapability(commandType: string): DeviceCapability['type'] {
    switch (commandType) {
      case 'gesture': case 'scroll': case 'click': return 'gesture';
      case 'type': case 'key-press': return 'gesture';
      case 'screenshot': case 'screen-read': return 'screen-read';
      case 'open-app': return 'app-control';
      case 'system': return 'system-command';
      default: return 'gesture';
    }
  }

  private async simulateExecution(cmd: DeviceCommand, device: Device): Promise<unknown> {
    await new Promise(resolve => setTimeout(resolve, 50));

    switch (cmd.type) {
      case 'screenshot':
        return { imageUrl: `/screenshots/${device.id}/${Date.now()}.png`, width: device.screenResolution?.width || 1920, height: device.screenResolution?.height || 1080, timestamp: new Date().toISOString() };

      case 'gesture':
        return { gesture: cmd.params['gesture'], x: cmd.params['x'], y: cmd.params['y'], completed: true };

      case 'type':
        return { text: cmd.params['text'], typed: true, targetApp: cmd.params['targetApp'] };

      case 'open-app':
        return { appId: cmd.params['appId'], opened: true, pid: Math.floor(Math.random() * 10000) };

      case 'scroll':
        return { direction: cmd.params['direction'], distance: cmd.params['distance'], completed: true };

      case 'click':
        return { x: cmd.params['x'], y: cmd.params['y'], button: cmd.params['button'] || 'left', clicked: true };

      case 'key-press':
        return { key: cmd.params['key'], modifiers: cmd.params['modifiers'], pressed: true };

      case 'system':
        return { command: cmd.params['command'], output: 'Command executed successfully', exitCode: 0 };

      default:
        return { executed: true };
    }
  }

  readScreen(deviceId: string): { elements: ScreenElement[]; screenshot: string } | null {
    const device = this.devices.get(deviceId);
    if (!device) return null;

    // Simulate screen reading
    const elements: ScreenElement[] = [
      { id: 'el_1', type: 'button', text: 'Home', bounds: { x: 0, y: 0, w: 80, h: 44 }, clickable: true },
      { id: 'el_2', type: 'text', text: 'Status Bar', bounds: { x: 0, y: 0, w: 1920, h: 24 }, clickable: false },
      { id: 'el_3', type: 'input', text: '', bounds: { x: 100, y: 100, w: 400, h: 40 }, clickable: true },
    ];

    return { elements, screenshot: `/screenshots/${deviceId}/current.png` };
  }

  getCommandHistory(deviceId: string, limit: number = 50): DeviceCommand[] {
    return (this.commandHistory.get(deviceId) || []).slice(-limit);
  }

  removeDevice(deviceId: string): boolean {
    return this.devices.delete(deviceId);
  }
}

interface ScreenElement {
  id: string;
  type: string;
  text: string;
  bounds: { x: number; y: number; w: number; h: number };
  clickable: boolean;
}

export const deviceService = new DeviceService();
