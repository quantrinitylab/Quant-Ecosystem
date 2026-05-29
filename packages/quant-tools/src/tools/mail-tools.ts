import type { ToolDefinition } from '../types.js';

export const mailTools: ToolDefinition[] = [
  {
    id: 'quantmail.send',
    appId: 'quantmail',
    name: 'Send Email',
    description: 'Send an email to one or more recipients with subject and body',
    inputSchema: {
      to: {
        type: 'string',
        required: true,
        description: 'Recipient email address(es), comma-separated',
      },
      subject: { type: 'string', required: true, description: 'Email subject line' },
      body: { type: 'string', required: true, description: 'Email body content' },
      cc: { type: 'string', required: false, description: 'CC recipients', default: '' },
      attachments: {
        type: 'array',
        required: false,
        description: 'File attachment references',
        default: [],
      },
    },
    outputSchema: {
      type: 'object',
      description: 'Send result with message ID',
      fields: {
        messageId: { type: 'string', description: 'Unique message identifier' },
        timestamp: { type: 'number', description: 'Send timestamp' },
      },
    },
    permissionTier: 1,
    costEstimate: 'free',
    undoRecipe: {
      toolId: 'quantmail.archive',
      params: { messageId: '{{messageId}}' },
      description: 'Archive the sent email',
      ttlMs: 30000,
    },
    tags: ['email', 'communication', 'send'],
  },
  {
    id: 'quantmail.search',
    appId: 'quantmail',
    name: 'Search Email',
    description: 'Search emails by query string across subject, body, and sender',
    inputSchema: {
      query: { type: 'string', required: true, description: 'Search query string' },
      folder: {
        type: 'string',
        required: false,
        description: 'Folder to search in',
        default: 'inbox',
      },
      limit: { type: 'number', required: false, description: 'Max results to return', default: 20 },
    },
    outputSchema: {
      type: 'array',
      description: 'List of matching email summaries',
      fields: {
        id: { type: 'string', description: 'Email ID' },
        subject: { type: 'string', description: 'Subject line' },
        from: { type: 'string', description: 'Sender address' },
      },
    },
    permissionTier: 0,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['email', 'search', 'query'],
  },
  {
    id: 'quantmail.archive',
    appId: 'quantmail',
    name: 'Archive Email',
    description: 'Move an email to the archive folder',
    inputSchema: {
      messageId: { type: 'string', required: true, description: 'ID of the email to archive' },
    },
    outputSchema: {
      type: 'object',
      description: 'Archive result',
      fields: {
        success: { type: 'boolean', description: 'Whether the archive succeeded' },
        archivedAt: { type: 'number', description: 'Timestamp of archive action' },
      },
    },
    permissionTier: 0,
    costEstimate: 'free',
    undoRecipe: {
      toolId: 'quantmail.send',
      params: { messageId: '{{messageId}}', folder: 'inbox' },
      description: 'Move email back to inbox',
      ttlMs: 60000,
    },
    tags: ['email', 'organize', 'archive'],
  },
  {
    id: 'quantmail.label',
    appId: 'quantmail',
    name: 'Label Email',
    description: 'Apply a label to an email for organization',
    inputSchema: {
      messageId: { type: 'string', required: true, description: 'ID of the email to label' },
      label: { type: 'string', required: true, description: 'Label name to apply' },
    },
    outputSchema: {
      type: 'object',
      description: 'Label application result',
      fields: {
        success: { type: 'boolean', description: 'Whether labeling succeeded' },
        labels: { type: 'array', description: 'Current labels on the email' },
      },
    },
    permissionTier: 0,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['email', 'organize', 'label'],
  },
  {
    id: 'quantmail.draft',
    appId: 'quantmail',
    name: 'Create Draft',
    description: 'Create a draft email without sending it',
    inputSchema: {
      to: { type: 'string', required: true, description: 'Recipient email address(es)' },
      subject: { type: 'string', required: true, description: 'Email subject line' },
      body: { type: 'string', required: true, description: 'Email body content' },
    },
    outputSchema: {
      type: 'object',
      description: 'Draft creation result',
      fields: {
        draftId: { type: 'string', description: 'Draft identifier' },
        createdAt: { type: 'number', description: 'Creation timestamp' },
      },
    },
    permissionTier: 0,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['email', 'draft', 'compose'],
  },
];
