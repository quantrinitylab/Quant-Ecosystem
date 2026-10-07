import type { ToolDefinition } from '../types.js';

export const docsTools: ToolDefinition[] = [
  {
    id: 'quantdocs.create',
    appId: 'quantdocs',
    name: 'Create Document',
    description: 'Create a new document with title and initial content',
    inputSchema: {
      title: { type: 'string', required: true, description: 'Document title' },
      content: { type: 'string', required: false, description: 'Initial content', default: '' },
      template: { type: 'string', required: false, description: 'Template to use' },
    },
    outputSchema: {
      type: 'object',
      description: 'Document creation result',
      fields: {
        docId: { type: 'string', description: 'Document ID' },
        url: { type: 'string', description: 'Document URL' },
      },
    },
    permissionTier: 0,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['docs', 'create', 'document'],
  },
  {
    id: 'quantdocs.edit',
    appId: 'quantdocs',
    name: 'Edit Document',
    description: 'Edit an existing document content',
    inputSchema: {
      docId: { type: 'string', required: true, description: 'Document ID to edit' },
      content: { type: 'string', required: true, description: 'New content to apply' },
      position: {
        type: 'string',
        required: false,
        description: 'Insert position (append, prepend, replace)',
        default: 'replace',
      },
    },
    outputSchema: {
      type: 'object',
      description: 'Edit result',
      fields: {
        success: { type: 'boolean', description: 'Whether edit succeeded' },
        version: { type: 'number', description: 'New document version' },
      },
    },
    permissionTier: 1,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['docs', 'edit', 'update'],
  },
  {
    id: 'quantdocs.share',
    appId: 'quantdocs',
    name: 'Share Document',
    description: 'Share a document with other users or make it public',
    inputSchema: {
      docId: { type: 'string', required: true, description: 'Document ID to share' },
      email: { type: 'string', required: true, description: 'Email to share with' },
      permission: {
        type: 'string',
        required: false,
        description: 'Permission level (view, edit, comment)',
        default: 'view',
      },
    },
    outputSchema: {
      type: 'object',
      description: 'Share result',
      fields: {
        success: { type: 'boolean', description: 'Whether sharing succeeded' },
        shareLink: { type: 'string', description: 'Share link if generated' },
      },
    },
    permissionTier: 1,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['docs', 'share', 'collaborate'],
  },
  {
    id: 'quantdocs.export',
    appId: 'quantdocs',
    name: 'Export Document',
    description: 'Export a document to PDF, DOCX, or other formats',
    inputSchema: {
      docId: { type: 'string', required: true, description: 'Document ID to export' },
      format: {
        type: 'string',
        required: true,
        description: 'Export format (pdf, docx, html, md)',
      },
    },
    outputSchema: {
      type: 'object',
      description: 'Export result',
      fields: {
        url: { type: 'string', description: 'Download URL for exported file' },
        size: { type: 'number', description: 'File size in bytes' },
      },
    },
    permissionTier: 0,
    costEstimate: 'low',
    undoRecipe: null,
    tags: ['docs', 'export', 'download'],
  },
  {
    id: 'quantdocs.search',
    appId: 'quantdocs',
    name: 'Search Documents',
    description: 'Search across all documents by content or title',
    inputSchema: {
      query: { type: 'string', required: true, description: 'Search query' },
      limit: { type: 'number', required: false, description: 'Max results', default: 10 },
    },
    outputSchema: {
      type: 'array',
      description: 'Matching documents',
      fields: {
        docId: { type: 'string', description: 'Document ID' },
        title: { type: 'string', description: 'Document title' },
        snippet: { type: 'string', description: 'Content snippet' },
      },
    },
    permissionTier: 0,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['docs', 'search', 'find'],
  },
];
