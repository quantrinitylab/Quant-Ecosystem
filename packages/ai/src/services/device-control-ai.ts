// ============================================================================
// AI Services - Device Control AI (QuantAI)
// ============================================================================

import type { AIInferenceRequest, DeviceControlCommand, DeviceControlResult } from '../types';
import { AIEngine } from '../core/engine';

/** Known device capabilities */
interface DeviceCapability {
  deviceType: string;
  actions: string[];
  parameters: Record<string, { type: string; range?: [number, number]; options?: string[] }>;
}

/**
 * Device Control AI Service
 *
 * Natural language device control for the QuantAI app:
 * - Parse natural language commands into device actions
 * - Multi-device orchestration
 * - Scene/routine management
 * - Proactive suggestions based on context
 * - Safety validation before execution
 */
export class DeviceControlAIService {
  private engine: AIEngine;
  private deviceRegistry: Map<string, DeviceCapability> = new Map();
  private executionHistory: Map<string, DeviceControlResult[]> = new Map();

  constructor(engine: AIEngine) {
    this.engine = engine;
    this.registerDefaultCapabilities();
  }

  /**
   * Parse a natural language command into device actions
   */
  async parseCommand(
    naturalLanguage: string,
    availableDevices: { id: string; type: string; name: string; room?: string }[],
    userId: string
  ): Promise<DeviceControlCommand[]> {
    const deviceList = availableDevices
      .map((d) => `${d.name} (${d.type}, ${d.room || 'unknown room'})`)
      .join(', ');

    const request: AIInferenceRequest = {
      prompt: `Parse this command for smart home devices: "${naturalLanguage}"\n\nAvailable devices: ${deviceList}`,
      systemPrompt: 'Extract device actions from natural language. Identify target devices, actions, and parameters. Handle multi-device commands.',
      userId,
      app: 'quantai',
      feature: 'device_control',
      temperature: 0.2,
      maxTokens: 300,
    };

    const response = await this.engine.infer(request);
    return this.extractCommands(response.content, availableDevices, userId);
  }

  /**
   * Execute a device control command
   */
  async executeCommand(command: DeviceControlCommand): Promise<DeviceControlResult> {
    const startTime = Date.now();

    // Validate command safety
    const safetyCheck = this.validateCommandSafety(command);
    if (!safetyCheck.safe) {
      return {
        success: false,
        deviceId: command.deviceId,
        action: command.action,
        error: safetyCheck.reason,
        executionTimeMs: Date.now() - startTime,
      };
    }

    // Simulate device execution
    const result: DeviceControlResult = {
      success: true,
      deviceId: command.deviceId,
      action: command.action,
      result: {
        previousState: this.getSimulatedState(command.deviceType),
        newState: command.parameters,
        timestamp: new Date().toISOString(),
      },
      executionTimeMs: Date.now() - startTime + Math.floor(Math.random() * 100),
    };

    // Store execution history
    const history = this.executionHistory.get(command.userId) || [];
    history.push(result);
    if (history.length > 100) history.shift();
    this.executionHistory.set(command.userId, history);

    return result;
  }

  /**
   * Create a scene (multiple device actions)
   */
  async createScene(
    name: string,
    description: string,
    userId: string,
    availableDevices: { id: string; type: string; name: string; room?: string }[]
  ): Promise<{ name: string; commands: DeviceControlCommand[] }> {
    const request: AIInferenceRequest = {
      prompt: `Create a smart home scene called "${name}": ${description}\n\nDevices: ${availableDevices.map((d) => `${d.name} (${d.type})`).join(', ')}`,
      systemPrompt: 'Create a scene with appropriate settings for each device. Consider ambiance, energy efficiency, and comfort.',
      userId,
      app: 'quantai',
      feature: 'scene_creation',
      temperature: 0.5,
      maxTokens: 400,
    };

    const response = await this.engine.infer(request);
    const commands = this.extractCommands(response.content, availableDevices, userId);

    return { name, commands };
  }

  /**
   * Get proactive suggestions based on context
   */
  async getProactiveSuggestions(
    context: { timeOfDay: string; weather?: string; userActivity?: string; recentCommands: string[] },
    userId: string
  ): Promise<{ suggestion: string; commands: DeviceControlCommand[] }[]> {
    const suggestions: { suggestion: string; commands: DeviceControlCommand[] }[] = [];

    // Time-based suggestions
    if (context.timeOfDay === 'evening') {
      suggestions.push({
        suggestion: 'Set up evening ambiance - dim lights and adjust thermostat',
        commands: [{
          deviceId: 'auto',
          deviceType: 'light',
          action: 'dim',
          parameters: { brightness: 40 },
          userId,
          confirmationRequired: false,
        }],
      });
    }

    if (context.timeOfDay === 'night') {
      suggestions.push({
        suggestion: 'Prepare for bedtime - turn off main lights, lock doors',
        commands: [{
          deviceId: 'auto',
          deviceType: 'light',
          action: 'off',
          parameters: {},
          userId,
          confirmationRequired: true,
        }],
      });
    }

    if (context.weather === 'hot') {
      suggestions.push({
        suggestion: 'It is warm outside - lower the thermostat',
        commands: [{
          deviceId: 'auto',
          deviceType: 'thermostat',
          action: 'set_temperature',
          parameters: { temperature: 22, unit: 'celsius' },
          userId,
          confirmationRequired: false,
        }],
      });
    }

    return suggestions;
  }

  /**
   * Validate command safety before execution
   */
  private validateCommandSafety(command: DeviceControlCommand): { safe: boolean; reason?: string } {
    // Security-critical devices require confirmation
    if (command.deviceType === 'lock' && command.action === 'unlock' && !command.confirmationRequired) {
      return { safe: false, reason: 'Unlocking doors requires explicit confirmation' };
    }

    // Prevent extreme temperature settings
    if (command.deviceType === 'thermostat') {
      const temp = command.parameters.temperature as number;
      if (temp !== undefined && (temp < 10 || temp > 35)) {
        return { safe: false, reason: 'Temperature must be between 10-35 degrees Celsius' };
      }
    }

    // Prevent disabling security cameras
    if (command.deviceType === 'camera' && command.action === 'disable') {
      return { safe: false, reason: 'Disabling security cameras requires admin confirmation' };
    }

    return { safe: true };
  }

  /**
   * Extract commands from AI response
   */
  private extractCommands(
    response: string,
    devices: { id: string; type: string; name: string; room?: string }[],
    userId: string
  ): DeviceControlCommand[] {
    // Parse AI response to extract device commands
    const commands: DeviceControlCommand[] = [];

    for (const device of devices) {
      const nameLower = device.name.toLowerCase();
      const responseLower = response.toLowerCase();

      if (responseLower.includes(nameLower) || responseLower.includes(device.type)) {
        const action = this.inferAction(response, device.type);
        const parameters = this.inferParameters(response, device.type);

        commands.push({
          deviceId: device.id,
          deviceType: device.type,
          action,
          parameters,
          userId,
          confirmationRequired: device.type === 'lock' || device.type === 'camera',
        });
      }
    }

    // If no specific device matched, create a generic command
    if (commands.length === 0 && devices.length > 0) {
      commands.push({
        deviceId: devices[0].id,
        deviceType: devices[0].type,
        action: 'toggle',
        parameters: {},
        userId,
        confirmationRequired: false,
      });
    }

    return commands;
  }

  /**
   * Infer action from AI response based on device type
   */
  private inferAction(response: string, deviceType: string): string {
    const lower = response.toLowerCase();
    if (lower.includes('turn off') || lower.includes('disable') || lower.includes('stop')) return 'off';
    if (lower.includes('turn on') || lower.includes('enable') || lower.includes('start')) return 'on';
    if (lower.includes('dim') || lower.includes('lower')) return 'dim';
    if (lower.includes('brighten') || lower.includes('increase')) return 'brighten';
    if (lower.includes('lock')) return 'lock';
    if (lower.includes('unlock')) return 'unlock';
    if (lower.includes('set')) return 'set';
    return 'toggle';
  }

  /**
   * Infer parameters from AI response
   */
  private inferParameters(response: string, deviceType: string): Record<string, unknown> {
    const params: Record<string, unknown> = {};

    // Extract numbers
    const numbers = response.match(/\d+/g);
    if (numbers && numbers.length > 0) {
      if (deviceType === 'light') params.brightness = parseInt(numbers[0]);
      if (deviceType === 'thermostat') params.temperature = parseInt(numbers[0]);
      if (deviceType === 'speaker') params.volume = parseInt(numbers[0]);
    }

    // Extract colors for lights
    const colors = ['red', 'blue', 'green', 'white', 'warm', 'cool', 'yellow', 'purple'];
    for (const color of colors) {
      if (response.toLowerCase().includes(color)) {
        params.color = color;
        break;
      }
    }

    return params;
  }

  /**
   * Get simulated current state for a device type
   */
  private getSimulatedState(deviceType: string): Record<string, unknown> {
    const states: Record<string, Record<string, unknown>> = {
      light: { on: true, brightness: 80, color: 'warm_white' },
      thermostat: { temperature: 21, mode: 'auto', humidity: 45 },
      lock: { locked: true, lastActivity: 'none' },
      camera: { recording: true, motionDetection: true },
      speaker: { playing: false, volume: 30 },
      blinds: { position: 100, tilt: 0 },
    };
    return states[deviceType] || { status: 'unknown' };
  }

  /**
   * Register default device capabilities
   */
  private registerDefaultCapabilities(): void {
    this.deviceRegistry.set('light', {
      deviceType: 'light',
      actions: ['on', 'off', 'dim', 'brighten', 'set_color', 'set_brightness'],
      parameters: {
        brightness: { type: 'number', range: [0, 100] },
        color: { type: 'string', options: ['warm_white', 'cool_white', 'red', 'blue', 'green'] },
        colorTemp: { type: 'number', range: [2700, 6500] },
      },
    });

    this.deviceRegistry.set('thermostat', {
      deviceType: 'thermostat',
      actions: ['set_temperature', 'set_mode', 'off'],
      parameters: {
        temperature: { type: 'number', range: [10, 35] },
        mode: { type: 'string', options: ['heat', 'cool', 'auto', 'off'] },
      },
    });

    this.deviceRegistry.set('lock', {
      deviceType: 'lock',
      actions: ['lock', 'unlock'],
      parameters: {},
    });

    this.deviceRegistry.set('speaker', {
      deviceType: 'speaker',
      actions: ['play', 'pause', 'stop', 'set_volume', 'next', 'previous'],
      parameters: {
        volume: { type: 'number', range: [0, 100] },
      },
    });
  }
}
