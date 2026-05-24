// ============================================================================
// QuantAI - Device Controller
// ============================================================================

import { deviceService } from '../services/device-service';
import type { DeviceType } from '../../src/types';

export class DeviceController {
  registerDevice(userId: string, name: string, type: DeviceType, os: string, osVersion: string) { return deviceService.registerDevice(userId, { name, type, os, osVersion }); }
  listDevices(userId: string) { return deviceService.listDevices(userId); }
  getDevice(deviceId: string) { return deviceService.getDevice(deviceId); }
  async executeCommand(deviceId: string, type: string, params: Record<string, unknown>) { return deviceService.executeCommand(deviceId, { type: type as any, params }); }
  readScreen(deviceId: string) { return deviceService.readScreen(deviceId); }
  getHistory(deviceId: string, limit?: number) { return deviceService.getCommandHistory(deviceId, limit); }
  removeDevice(deviceId: string) { return deviceService.removeDevice(deviceId); }
}

export const deviceController = new DeviceController();
