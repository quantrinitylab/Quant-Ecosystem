export interface DeviceVoiceResult {
  success: boolean;
  action: string;
  deviceId: string;
  spokenResponse: string;
}

interface DeviceEntry {
  id: string;
  name: string;
  type: 'light' | 'thermostat' | 'lock' | 'speaker' | 'camera' | 'generic';
  status: 'on' | 'off' | 'locked' | 'unlocked';
  value?: number;
}

export class DeviceVoiceBridge {
  private devices: DeviceEntry[] = [
    { id: 'light-1', name: 'living room lights', type: 'light', status: 'off' },
    { id: 'light-2', name: 'bedroom lights', type: 'light', status: 'off' },
    { id: 'thermo-1', name: 'thermostat', type: 'thermostat', status: 'on', value: 20 },
    { id: 'lock-1', name: 'front door', type: 'lock', status: 'unlocked' },
    { id: 'lock-2', name: 'back door', type: 'lock', status: 'unlocked' },
    { id: 'speaker-1', name: 'kitchen speaker', type: 'speaker', status: 'off' },
  ];

  async handleDeviceCommand(transcript: string): Promise<DeviceVoiceResult> {
    const lower = transcript.toLowerCase().trim();

    // Pattern: "turn on/off X"
    const toggleMatch = lower.match(/turn\s+(on|off)\s+(?:the\s+)?(.+)/);
    if (toggleMatch) {
      const state = toggleMatch[1] as 'on' | 'off';
      const deviceName = toggleMatch[2]!;
      const device = this.findDevice(deviceName);
      if (device) {
        device.status = state;
        return {
          success: true,
          action: 'toggle',
          deviceId: device.id,
          spokenResponse: `${device.name} turned ${state}.`,
        };
      }
      return {
        success: false,
        action: 'toggle',
        deviceId: 'unknown',
        spokenResponse: `I could not find a device called ${deviceName}.`,
      };
    }

    // Pattern: "set temperature/thermostat to X"
    const tempMatch = lower.match(/set\s+(?:the\s+)?(?:temperature|thermostat)\s+to\s+(\d+)/);
    if (tempMatch) {
      const value = parseInt(tempMatch[1]!, 10);
      const thermo = this.devices.find((d) => d.type === 'thermostat');
      if (thermo) {
        thermo.value = value;
        return {
          success: true,
          action: 'set_temperature',
          deviceId: thermo.id,
          spokenResponse: `Thermostat set to ${value} degrees.`,
        };
      }
      return {
        success: false,
        action: 'set_temperature',
        deviceId: 'unknown',
        spokenResponse: 'No thermostat found.',
      };
    }

    // Pattern: "lock all doors" / "lock X"
    const lockMatch = lower.match(/lock\s+(?:all\s+)?(?:the\s+)?(.+)/);
    if (lockMatch) {
      const target = lockMatch[1]!;
      if (target.includes('all') || target.includes('doors')) {
        const locks = this.devices.filter((d) => d.type === 'lock');
        for (const lock of locks) {
          lock.status = 'locked';
        }
        return {
          success: true,
          action: 'lock_all',
          deviceId: 'all-locks',
          spokenResponse: `All ${locks.length} doors locked.`,
        };
      }
      const device = this.findDevice(target);
      if (device) {
        device.status = 'locked';
        return {
          success: true,
          action: 'lock',
          deviceId: device.id,
          spokenResponse: `${device.name} locked.`,
        };
      }
    }

    return {
      success: false,
      action: 'unknown',
      deviceId: 'unknown',
      spokenResponse: 'I did not understand that device command.',
    };
  }

  getDeviceStatus(deviceName: string): DeviceVoiceResult {
    const device = this.findDevice(deviceName);
    if (!device) {
      return {
        success: false,
        action: 'status',
        deviceId: 'unknown',
        spokenResponse: `I could not find a device called ${deviceName}.`,
      };
    }

    const valueStr = device.value !== undefined ? `, set to ${device.value}` : '';
    return {
      success: true,
      action: 'status',
      deviceId: device.id,
      spokenResponse: `${device.name} is ${device.status}${valueStr}.`,
    };
  }

  executeEmergency(type: 'sos' | 'lockdown' | 'alarm'): DeviceVoiceResult {
    switch (type) {
      case 'sos':
        return {
          success: true,
          action: 'emergency_sos',
          deviceId: 'system',
          spokenResponse: 'Emergency SOS activated. Contacting emergency services.',
        };
      case 'lockdown':
        for (const device of this.devices) {
          if (device.type === 'lock') {
            device.status = 'locked';
          }
        }
        return {
          success: true,
          action: 'emergency_lockdown',
          deviceId: 'system',
          spokenResponse: 'Lockdown activated. All doors locked.',
        };
      case 'alarm':
        return {
          success: true,
          action: 'emergency_alarm',
          deviceId: 'system',
          spokenResponse: 'Alarm triggered. Alerting household.',
        };
    }
  }

  listDevices(): DeviceVoiceResult {
    const names = this.devices.map((d) => d.name).join(', ');
    return {
      success: true,
      action: 'list',
      deviceId: 'all',
      spokenResponse: `You have ${this.devices.length} devices: ${names}.`,
    };
  }

  private findDevice(name: string): DeviceEntry | undefined {
    const lower = name.toLowerCase();
    return this.devices.find(
      (d) => d.name.toLowerCase().includes(lower) || lower.includes(d.name.toLowerCase()),
    );
  }
}
