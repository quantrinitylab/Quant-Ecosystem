import type { Automation, AutomationTemplate } from '../types.js';
import { builtinAutomationTemplates } from '../templates/automation-templates.js';

interface ParsePattern {
  pattern: RegExp;
  extract: (match: RegExpMatchArray) => Partial<Automation>;
}

const PARSE_PATTERNS: ParsePattern[] = [
  {
    // "every day at 9am, post a reel"
    pattern: /every\s+day\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?,?\s*(.+)/i,
    extract: (m) => {
      let hour = parseInt(m[1] ?? '0', 10);
      const minute = parseInt(m[2] ?? '0', 10);
      if (m[3]?.toLowerCase() === 'pm' && hour < 12) hour += 12;
      if (m[3]?.toLowerCase() === 'am' && hour === 12) hour = 0;
      const action = m[4] ?? '';

      return {
        name: `Daily: ${action.trim()}`,
        description: `Every day at ${hour}:${minute.toString().padStart(2, '0')}, ${action.trim()}`,
        triggers: [
          {
            id: 'trigger_1',
            type: 'schedule',
            config: { type: 'schedule', cron: `${minute} ${hour} * * *` },
            enabled: true,
          },
        ],
        actions: [
          {
            id: 'action_1',
            toolId: inferToolFromAction(action),
            params: inferParamsFromAction(action),
            retryPolicy: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
            timeoutMs: 30000,
            order: 1,
          },
        ],
      };
    },
  },
  {
    // "every Monday, backup my files"
    pattern: /every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s*(.+)/i,
    extract: (m) => {
      const dayMap: Record<string, string> = {
        sunday: '0',
        monday: '1',
        tuesday: '2',
        wednesday: '3',
        thursday: '4',
        friday: '5',
        saturday: '6',
      };
      const day = dayMap[m[1]?.toLowerCase() ?? 'monday'] ?? '1';
      const action = m[2] ?? '';

      return {
        name: `Weekly: ${action.trim()}`,
        description: `Every ${m[1]}, ${action.trim()}`,
        triggers: [
          {
            id: 'trigger_1',
            type: 'schedule',
            config: { type: 'schedule', cron: `0 0 * * ${day}` },
            enabled: true,
          },
        ],
        actions: [
          {
            id: 'action_1',
            toolId: inferToolFromAction(action),
            params: inferParamsFromAction(action),
            retryPolicy: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
            timeoutMs: 30000,
            order: 1,
          },
        ],
      };
    },
  },
  {
    // "when I get an email from X, forward to Y"
    pattern:
      /when\s+(?:I\s+)?(?:get|receive)\s+(?:an?\s+)?(?:email|message)\s+from\s+(\S+),?\s*(?:forward|send)\s+(?:to|it\s+to)\s+(\S+)/i,
    extract: (m) => {
      const sender = m[1] ?? '';
      const recipient = m[2] ?? '';

      return {
        name: `Forward from ${sender} to ${recipient}`,
        description: `When receiving email from ${sender}, forward to ${recipient}`,
        triggers: [
          {
            id: 'trigger_1',
            type: 'event',
            config: {
              type: 'event',
              eventName: 'quantmail.received',
              appId: 'quantmail',
              filter: { from: sender },
            },
            enabled: true,
          },
        ],
        actions: [
          {
            id: 'action_1',
            toolId: 'quantmail.send',
            params: { to: recipient, type: 'forward' },
            retryPolicy: { maxRetries: 2, backoffMs: 1000, backoffMultiplier: 2 },
            timeoutMs: 15000,
            order: 1,
          },
        ],
      };
    },
  },
];

function inferToolFromAction(action: string): string {
  const lower = action.toLowerCase();
  if (lower.includes('post') || lower.includes('reel')) return 'neon.post';
  if (lower.includes('backup') || lower.includes('sync') || lower.includes('file'))
    return 'drive.sync-files';
  if (lower.includes('email') || lower.includes('send') || lower.includes('forward'))
    return 'quantmail.send';
  if (lower.includes('chat') || lower.includes('message')) return 'quantchat.send';
  if (lower.includes('doc') || lower.includes('create')) return 'quantdocs.create';
  return 'unknown.action';
}

function inferParamsFromAction(action: string): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  const lower = action.toLowerCase();

  if (lower.includes('reel')) params['type'] = 'reel';
  if (lower.includes('post')) params['visibility'] = 'public';
  if (lower.includes('backup')) params['recursive'] = true;

  return params;
}

export class NLAutomationBuilder {
  parse(description: string): Partial<Automation> | null {
    const trimmed = description.trim();
    if (!trimmed) return null;

    for (const { pattern, extract } of PARSE_PATTERNS) {
      const match = trimmed.match(pattern);
      if (match) {
        const automation = extract(match);
        return {
          id: `auto_${Date.now()}`,
          status: 'draft',
          flowControls: [],
          durableState: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastRunAt: null,
          runCount: 0,
          ...automation,
        };
      }
    }

    return null;
  }

  suggest(partial: string): string[] {
    const lower = partial.toLowerCase();
    const suggestions: string[] = [];

    if ('every'.startsWith(lower) || lower.startsWith('every')) {
      suggestions.push('every day at 9am, post a reel');
      suggestions.push('every Monday, backup my files');
    }
    if ('when'.startsWith(lower) || lower.startsWith('when')) {
      suggestions.push('when I get an email from boss, forward to team');
    }
    if (lower.includes('backup') || lower.includes('file')) {
      suggestions.push('every day at 11pm, backup my files');
    }
    if (lower.includes('post') || lower.includes('reel')) {
      suggestions.push('every day at 9am, post a reel');
    }

    return suggestions;
  }

  getTemplates(): AutomationTemplate[] {
    return builtinAutomationTemplates;
  }

  fromTemplate(templateId: string, overrides?: Partial<Automation>): Automation | null {
    const template = builtinAutomationTemplates.find((t) => t.id === templateId);
    if (!template) return null;

    const now = Date.now();
    const automation: Automation = {
      id: `auto_${templateId}_${now}`,
      name: template.name,
      description: template.description,
      triggers: template.triggers.map((t, i) => ({ ...t, id: `trigger_${i}` })),
      actions: template.actions.map((a, i) => ({ ...a, id: `action_${i}` })),
      flowControls: [],
      status: 'draft',
      durableState: null,
      createdAt: now,
      updatedAt: now,
      lastRunAt: null,
      runCount: 0,
      ...overrides,
    };

    return automation;
  }
}
