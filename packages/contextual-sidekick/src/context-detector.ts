// ============================================================================
// Contextual Sidekick - ContextDetector
// ============================================================================

import type { ResourceType, SidekickContext, SidekickTool } from './types';

const RESOURCE_TYPE_INDICATORS: Record<string, ResourceType> = {
  email: 'email',
  mail: 'email',
  inbox: 'email',
  document: 'document',
  doc: 'document',
  page: 'document',
  message: 'message',
  chat: 'message',
  dm: 'message',
  file: 'file',
  attachment: 'file',
  upload: 'file',
  video: 'video',
  recording: 'video',
  stream: 'video',
  post: 'post',
  article: 'post',
  feed: 'post',
  event: 'event',
  meeting: 'event',
  calendar: 'event',
  task: 'task',
  todo: 'task',
  ticket: 'task',
  contact: 'contact',
  person: 'contact',
  user: 'contact',
};

const ACTION_MAP: Record<ResourceType, string[]> = {
  email: ['reply', 'forward', 'summarize', 'archive', 'label'],
  document: ['edit', 'share', 'summarize', 'comment', 'export'],
  message: ['reply', 'react', 'forward', 'pin', 'thread'],
  file: ['download', 'share', 'preview', 'rename', 'move'],
  video: ['play', 'share', 'transcript', 'clip', 'download'],
  post: ['like', 'comment', 'share', 'bookmark', 'report'],
  event: ['accept', 'decline', 'reschedule', 'invite', 'notes'],
  task: ['complete', 'assign', 'prioritize', 'comment', 'defer'],
  contact: ['message', 'email', 'call', 'schedule', 'view-profile'],
};

export class ContextDetector {
  detectResourceType(metadata: Record<string, unknown>): ResourceType | null {
    const typeField = metadata['type'];
    if (typeof typeField === 'string') {
      const normalized = typeField.toLowerCase();
      const matched = RESOURCE_TYPE_INDICATORS[normalized];
      if (matched) {
        return matched;
      }
    }

    const kindField = metadata['kind'];
    if (typeof kindField === 'string') {
      const normalized = kindField.toLowerCase();
      const matched = RESOURCE_TYPE_INDICATORS[normalized];
      if (matched) {
        return matched;
      }
    }

    const categoryField = metadata['category'];
    if (typeof categoryField === 'string') {
      const normalized = categoryField.toLowerCase();
      const matched = RESOURCE_TYPE_INDICATORS[normalized];
      if (matched) {
        return matched;
      }
    }

    return null;
  }

  inferActions(context: SidekickContext): string[] {
    if (!context.selectedResource) {
      return ['search', 'create', 'navigate'];
    }

    const resourceType = context.selectedResource.type;
    const actions = ACTION_MAP[resourceType];
    return actions ?? ['view', 'share'];
  }

  generateSuggestions(context: SidekickContext, availableTools: SidekickTool[]): string[] {
    const suggestions: string[] = [];
    const actions = this.inferActions(context);

    // Suggest actions that match available tools
    for (const action of actions) {
      const matchingTool = availableTools.find(
        (tool) =>
          tool.name.toLowerCase().includes(action) ||
          tool.description.toLowerCase().includes(action),
      );
      if (matchingTool) {
        suggestions.push(`${matchingTool.name}: ${matchingTool.description}`);
      }
    }

    // Add general suggestions if we have few matches
    if (suggestions.length === 0 && availableTools.length > 0) {
      const topTool = availableTools[0];
      if (topTool) {
        suggestions.push(`Try "${topTool.name}" for this context`);
      }
    }

    return suggestions;
  }
}
