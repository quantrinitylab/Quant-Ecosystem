import type { ToolDefinition } from '../types.js';

export const calendarTools: ToolDefinition[] = [
  {
    id: 'quantcalendar.create-event',
    appId: 'quantcalendar',
    name: 'Create Event',
    description: 'Create a new calendar event with title, time, and attendees',
    inputSchema: {
      title: { type: 'string', required: true, description: 'Event title' },
      startTime: { type: 'string', required: true, description: 'Start time in ISO 8601 format' },
      endTime: { type: 'string', required: true, description: 'End time in ISO 8601 format' },
      attendees: {
        type: 'array',
        required: false,
        description: 'Attendee email addresses',
        default: [],
      },
      location: { type: 'string', required: false, description: 'Event location' },
    },
    outputSchema: {
      type: 'object',
      description: 'Event creation result',
      fields: {
        eventId: { type: 'string', description: 'Created event ID' },
        calendarLink: { type: 'string', description: 'Link to view event' },
      },
    },
    permissionTier: 1,
    costEstimate: 'free',
    undoRecipe: {
      toolId: 'quantcalendar.cancel',
      params: { eventId: '{{eventId}}' },
      description: 'Cancel the created event',
      ttlMs: 3600000,
    },
    tags: ['calendar', 'event', 'schedule'],
  },
  {
    id: 'quantcalendar.reschedule',
    appId: 'quantcalendar',
    name: 'Reschedule Event',
    description: 'Change the time of an existing calendar event',
    inputSchema: {
      eventId: { type: 'string', required: true, description: 'Event ID to reschedule' },
      newStartTime: { type: 'string', required: true, description: 'New start time in ISO 8601' },
      newEndTime: { type: 'string', required: true, description: 'New end time in ISO 8601' },
      notifyAttendees: {
        type: 'boolean',
        required: false,
        description: 'Notify attendees of change',
        default: true,
      },
    },
    outputSchema: {
      type: 'object',
      description: 'Reschedule result',
      fields: {
        success: { type: 'boolean', description: 'Whether reschedule succeeded' },
        updatedEvent: { type: 'object', description: 'Updated event details' },
      },
    },
    permissionTier: 1,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['calendar', 'reschedule', 'update'],
  },
  {
    id: 'quantcalendar.invite',
    appId: 'quantcalendar',
    name: 'Invite Attendee',
    description: 'Add an attendee to an existing calendar event',
    inputSchema: {
      eventId: { type: 'string', required: true, description: 'Event ID' },
      email: { type: 'string', required: true, description: 'Attendee email to invite' },
      role: {
        type: 'string',
        required: false,
        description: 'Attendee role (required, optional)',
        default: 'required',
      },
    },
    outputSchema: {
      type: 'object',
      description: 'Invite result',
      fields: {
        success: { type: 'boolean', description: 'Whether invite was sent' },
        attendeeCount: { type: 'number', description: 'Total attendee count' },
      },
    },
    permissionTier: 1,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['calendar', 'invite', 'attendee'],
  },
  {
    id: 'quantcalendar.cancel',
    appId: 'quantcalendar',
    name: 'Cancel Event',
    description: 'Cancel a calendar event and notify attendees',
    inputSchema: {
      eventId: { type: 'string', required: true, description: 'Event ID to cancel' },
      reason: { type: 'string', required: false, description: 'Cancellation reason' },
      notifyAttendees: {
        type: 'boolean',
        required: false,
        description: 'Whether to notify attendees',
        default: true,
      },
    },
    outputSchema: {
      type: 'object',
      description: 'Cancellation result',
      fields: {
        success: { type: 'boolean', description: 'Whether cancellation succeeded' },
        cancelledAt: { type: 'number', description: 'Cancellation timestamp' },
      },
    },
    permissionTier: 2,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['calendar', 'cancel', 'delete'],
  },
  {
    id: 'quantcalendar.list-today',
    appId: 'quantcalendar',
    name: 'List Today Events',
    description: 'List all events scheduled for today',
    inputSchema: {
      timezone: {
        type: 'string',
        required: false,
        description: 'Timezone for today calculation',
        default: 'UTC',
      },
    },
    outputSchema: {
      type: 'array',
      description: 'Today events list',
      fields: {
        eventId: { type: 'string', description: 'Event ID' },
        title: { type: 'string', description: 'Event title' },
        startTime: { type: 'string', description: 'Start time' },
      },
    },
    permissionTier: 0,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['calendar', 'list', 'today'],
  },
];
