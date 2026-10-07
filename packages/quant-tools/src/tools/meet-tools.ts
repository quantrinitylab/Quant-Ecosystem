import type { ToolDefinition } from '../types.js';

export const meetTools: ToolDefinition[] = [
  {
    id: 'quantmeet.create',
    appId: 'quantmeet',
    name: 'Create Meeting',
    description: 'Create an instant video meeting room',
    inputSchema: {
      title: { type: 'string', required: true, description: 'Meeting title' },
      participants: {
        type: 'array',
        required: false,
        description: 'Participant emails to invite',
        default: [],
      },
    },
    outputSchema: {
      type: 'object',
      description: 'Meeting creation result',
      fields: {
        meetingId: { type: 'string', description: 'Meeting room ID' },
        joinUrl: { type: 'string', description: 'Join URL' },
      },
    },
    permissionTier: 1,
    costEstimate: 'low',
    undoRecipe: null,
    tags: ['meet', 'video', 'create'],
  },
  {
    id: 'quantmeet.join',
    appId: 'quantmeet',
    name: 'Join Meeting',
    description: 'Join an existing video meeting by ID',
    inputSchema: {
      meetingId: { type: 'string', required: true, description: 'Meeting ID to join' },
      audioOnly: {
        type: 'boolean',
        required: false,
        description: 'Join without video',
        default: false,
      },
    },
    outputSchema: {
      type: 'object',
      description: 'Join result',
      fields: {
        success: { type: 'boolean', description: 'Whether join succeeded' },
        participantCount: { type: 'number', description: 'Current participant count' },
      },
    },
    permissionTier: 0,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['meet', 'join', 'video'],
  },
  {
    id: 'quantmeet.record',
    appId: 'quantmeet',
    name: 'Record Meeting',
    description: 'Start or stop recording a meeting',
    inputSchema: {
      meetingId: { type: 'string', required: true, description: 'Meeting ID to record' },
      action: { type: 'string', required: true, description: 'Action: start or stop' },
    },
    outputSchema: {
      type: 'object',
      description: 'Recording result',
      fields: {
        recordingId: { type: 'string', description: 'Recording ID' },
        status: { type: 'string', description: 'Recording status' },
      },
    },
    permissionTier: 2,
    costEstimate: 'medium',
    undoRecipe: null,
    tags: ['meet', 'record', 'capture'],
  },
  {
    id: 'quantmeet.end',
    appId: 'quantmeet',
    name: 'End Meeting',
    description: 'End a meeting for all participants',
    inputSchema: {
      meetingId: { type: 'string', required: true, description: 'Meeting ID to end' },
    },
    outputSchema: {
      type: 'object',
      description: 'End result',
      fields: {
        success: { type: 'boolean', description: 'Whether meeting was ended' },
        duration: { type: 'number', description: 'Meeting duration in minutes' },
      },
    },
    permissionTier: 2,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['meet', 'end', 'close'],
  },
  {
    id: 'quantmeet.schedule',
    appId: 'quantmeet',
    name: 'Schedule Meeting',
    description: 'Schedule a future video meeting',
    inputSchema: {
      title: { type: 'string', required: true, description: 'Meeting title' },
      startTime: { type: 'string', required: true, description: 'Start time in ISO 8601' },
      duration: { type: 'number', required: true, description: 'Duration in minutes' },
      participants: { type: 'array', required: true, description: 'Participant emails' },
    },
    outputSchema: {
      type: 'object',
      description: 'Scheduling result',
      fields: {
        meetingId: { type: 'string', description: 'Scheduled meeting ID' },
        calendarEventId: { type: 'string', description: 'Linked calendar event ID' },
      },
    },
    permissionTier: 1,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['meet', 'schedule', 'future'],
  },
];
