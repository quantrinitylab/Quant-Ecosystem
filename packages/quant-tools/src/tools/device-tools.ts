import type { ToolDefinition } from '../types.js';

export const deviceTools: ToolDefinition[] = [
  {
    id: 'device-control.control',
    appId: 'device-control',
    name: 'Control Device',
    description: 'Send a control command to a connected device',
    inputSchema: {
      deviceId: { type: 'string', required: true, description: 'Device ID to control' },
      command: {
        type: 'string',
        required: true,
        description: 'Command to execute (on, off, toggle, set)',
      },
      value: { type: 'string', required: false, description: 'Command value if applicable' },
    },
    outputSchema: {
      type: 'object',
      description: 'Control result',
      fields: {
        success: { type: 'boolean', description: 'Whether command was executed' },
        currentState: { type: 'string', description: 'Device state after command' },
      },
    },
    permissionTier: 2,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['device', 'control', 'iot'],
  },
  {
    id: 'device-control.status',
    appId: 'device-control',
    name: 'Device Status',
    description: 'Get the current status of a connected device',
    inputSchema: {
      deviceId: { type: 'string', required: true, description: 'Device ID to query' },
    },
    outputSchema: {
      type: 'object',
      description: 'Device status',
      fields: {
        online: { type: 'boolean', description: 'Whether device is online' },
        state: { type: 'string', description: 'Current device state' },
        battery: { type: 'number', description: 'Battery percentage if applicable' },
      },
    },
    permissionTier: 0,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['device', 'status', 'query'],
  },
  {
    id: 'device-control.configure',
    appId: 'device-control',
    name: 'Configure Device',
    description: 'Update device configuration or settings',
    inputSchema: {
      deviceId: { type: 'string', required: true, description: 'Device ID to configure' },
      settings: { type: 'object', required: true, description: 'Settings to apply' },
    },
    outputSchema: {
      type: 'object',
      description: 'Configuration result',
      fields: {
        success: { type: 'boolean', description: 'Whether configuration was applied' },
        appliedSettings: { type: 'number', description: 'Number of settings changed' },
      },
    },
    permissionTier: 2,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['device', 'configure', 'settings'],
  },
  {
    id: 'device-control.schedule-action',
    appId: 'device-control',
    name: 'Schedule Device Action',
    description: 'Schedule a future action on a device',
    inputSchema: {
      deviceId: { type: 'string', required: true, description: 'Device ID' },
      command: { type: 'string', required: true, description: 'Command to schedule' },
      executeAt: { type: 'string', required: true, description: 'Execution time in ISO 8601' },
      repeat: {
        type: 'string',
        required: false,
        description: 'Repeat pattern (daily, weekly, once)',
        default: 'once',
      },
    },
    outputSchema: {
      type: 'object',
      description: 'Schedule result',
      fields: {
        scheduleId: { type: 'string', description: 'Schedule entry ID' },
        nextExecution: { type: 'string', description: 'Next scheduled execution time' },
      },
    },
    permissionTier: 2,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['device', 'schedule', 'automation'],
  },
  {
    id: 'device-control.emergency',
    appId: 'device-control',
    name: 'Emergency Command',
    description: 'Send an emergency command to all connected devices',
    inputSchema: {
      action: {
        type: 'string',
        required: true,
        description: 'Emergency action (lockdown, alarm, shutdown)',
      },
      scope: {
        type: 'string',
        required: false,
        description: 'Scope of action (all, room, floor)',
        default: 'all',
      },
    },
    outputSchema: {
      type: 'object',
      description: 'Emergency action result',
      fields: {
        executed: { type: 'number', description: 'Number of devices affected' },
        failed: { type: 'number', description: 'Number of devices that failed' },
      },
    },
    permissionTier: 3,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['device', 'emergency', 'safety'],
  },
];
