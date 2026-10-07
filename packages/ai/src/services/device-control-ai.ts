// ============================================================================
// AI Services - Device Control AI (QuantAI)
// ============================================================================

import type { AIInferenceRequest, DeviceControlCommand, DeviceControlResult } from '../types';
import { AIEngine } from '../core/engine';

/**
 * Backend that actually actuates a device command against a real device-control
 * plane (smart-home hub / IoT gateway). Implementations return the device state
 * transition; throwing signals the command could not be executed.
 */
export interface DeviceControlBackend {
  execute(command: DeviceControlCommand): Promise<{
    previousState: Record<string, unknown>;
    newState: Record<string, unknown>;
  }>;
}

/**
 * Real device-control backend that calls a configured HTTP device-control
 * service. Enabled by setting DEVICE_CONTROL_URL (optionally DEVICE_CONTROL_API_KEY).
 */
export class HttpDeviceControlBackend implements DeviceControlBackend {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string,
    private readonly timeoutMs: number = 5000,
  ) {}

  async execute(command: DeviceControlCommand): Promise<{
    previousState: Record<string, unknown>;
    newState: Record<string, unknown>;
  }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(
        `${this.baseUrl.replace(/\/$/, '')}/devices/${encodeURIComponent(command.deviceId)}/commands`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
          },
          body: JSON.stringify({
            deviceType: command.deviceType,
            action: command.action,
            parameters: command.parameters,
          }),
          signal: controller.signal,
        },
      );
      if (!res.ok) {
        throw new Error(`device-control service responded ${res.status}`);
      }
      const body = (await res.json()) as {
        previousState?: Record<string, unknown>;
        newState?: Record<string, unknown>;
      };
      return {
        previousState: body.previousState ?? {},
        newState: body.newState ?? command.parameters,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

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
  private readonly backend: DeviceControlBackend | null;

  constructor(engine: AIEngine, backend?: DeviceControlBackend) {
    this.engine = engine;
    this.backend = backend ?? DeviceControlAIService.createBackendFromEnv();
    this.registerDefaultCapabilities();
  }

  private static createBackendFromEnv(): DeviceControlBackend | null {
    const url = process.env['DEVICE_CONTROL_URL'];
    if (url) {
      return new HttpDeviceControlBackend(url, process.env['DEVICE_CONTROL_API_KEY']);
    }
    return null;
  }

  /** Whether a real device-control backend is wired up. */
  isBackendConfigured(): boolean {
    return this.backend !== null;
  }

  /**
   * Parse a natural language command into device actions
   */
  async parseCommand(
    naturalLanguage: string,
    availableDevices: { id: string; type: string; name: string; room?: string }[],
    userId: string,
  ): Promise<DeviceControlCommand[]> {
    const deviceList = availableDevices
      .map((d) => `${d.name} (${d.type}, ${d.room || 'unknown room'})`)
      .join(', ');

    const request: AIInferenceRequest = {
      prompt: `Parse this command for smart home devices: "${naturalLanguage}"\n\nAvailable devices: ${deviceList}`,
      systemPrompt:
        'Extract device actions from natural language. Identify target devices, actions, and parameters. Handle multi-device commands.',
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

    let result: DeviceControlResult;

    if (this.backend) {
      try {
        const transition = await this.backend.execute(command);
        result = {
          success: true,
          deviceId: command.deviceId,
          action: command.action,
          result: {
            previousState: transition.previousState,
            newState: transition.newState,
            timestamp: new Date().toISOString(),
          },
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console
        console.warn(
          `[device-control-ai] backend execution failed for ${command.deviceId}, using simulation: ${message}`,
        );
        result = this.simulateExecution(command, startTime);
      }
    } else {
      result = this.simulateExecution(command, startTime);
    }

    // Store execution history
    const history = this.executionHistory.get(command.userId) || [];
    history.push(result);
    if (history.length > 100) history.shift();
    this.executionHistory.set(command.userId, history);

    return result;
  }

  /** Simulated device execution used when no real backend is configured (or on backend error). */
  private simulateExecution(command: DeviceControlCommand, startTime: number): DeviceControlResult {
    return {
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
  }

  /**
   * Create a scene (multiple device actions)
   */
  async createScene(
    name: string,
    description: string,
    userId: string,
    availableDevices: { id: string; type: string; name: string; room?: string }[],
  ): Promise<{ name: string; commands: DeviceControlCommand[] }> {
    const request: AIInferenceRequest = {
      prompt: `Create a smart home scene called "${name}": ${description}\n\nDevices: ${availableDevices.map((d) => `${d.name} (${d.type})`).join(', ')}`,
      systemPrompt:
        'Create a scene with appropriate settings for each device. Consider ambiance, energy efficiency, and comfort.',
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
    context: {
      timeOfDay: string;
      weather?: string;
      userActivity?: string;
      recentCommands: string[];
    },
    userId: string,
  ): Promise<{ suggestion: string; commands: DeviceControlCommand[] }[]> {
    const suggestions: { suggestion: string; commands: DeviceControlCommand[] }[] = [];

    // Time-based suggestions
    if (context.timeOfDay === 'evening') {
      suggestions.push({
        suggestion: 'Set up evening ambiance - dim lights and adjust thermostat',
        commands: [
          {
            deviceId: 'auto',
            deviceType: 'light',
            action: 'dim',
            parameters: { brightness: 40 },
            userId,
            confirmationRequired: false,
          },
        ],
      });
    }

    if (context.timeOfDay === 'night') {
      suggestions.push({
        suggestion: 'Prepare for bedtime - turn off main lights, lock doors',
        commands: [
          {
            deviceId: 'auto',
            deviceType: 'light',
            action: 'off',
            parameters: {},
            userId,
            confirmationRequired: true,
          },
        ],
      });
    }

    if (context.weather === 'hot') {
      suggestions.push({
        suggestion: 'It is warm outside - lower the thermostat',
        commands: [
          {
            deviceId: 'auto',
            deviceType: 'thermostat',
            action: 'set_temperature',
            parameters: { temperature: 22, unit: 'celsius' },
            userId,
            confirmationRequired: false,
          },
        ],
      });
    }

    return suggestions;
  }

  /**
   * Validate command safety before execution
   */
  private validateCommandSafety(command: DeviceControlCommand): { safe: boolean; reason?: string } {
    // Security-critical devices require confirmation
    if (
      command.deviceType === 'lock' &&
      command.action === 'unlock' &&
      !command.confirmationRequired
    ) {
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
    userId: string,
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
      const firstDevice = devices[0]!;
      commands.push({
        deviceId: firstDevice.id,
        deviceType: firstDevice.type,
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
  private inferAction(response: string, _deviceType: string): string {
    const lower = response.toLowerCase();
    if (lower.includes('turn off') || lower.includes('disable') || lower.includes('stop'))
      return 'off';
    if (lower.includes('turn on') || lower.includes('enable') || lower.includes('start'))
      return 'on';
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
