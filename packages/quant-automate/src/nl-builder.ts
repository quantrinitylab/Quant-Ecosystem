import type {
  Automation,
  AutomationStep,
  AutomationTrigger,
  NLParseConfidence,
  NLParseResult,
} from './types.js';

interface PatternMatch {
  trigger?: AutomationTrigger;
  steps: AutomationStep[];
  name: string;
  confidence: NLParseConfidence;
}

const CRON_DAY_MAP: Record<string, string> = {
  monday: '1',
  tuesday: '2',
  wednesday: '3',
  thursday: '4',
  friday: '5',
  saturday: '6',
  sunday: '0',
};

const CRON_INTERVAL_MAP: Record<string, string> = {
  minute: '* * * * *',
  hour: '0 * * * *',
  day: '0 9 * * *',
  daily: '0 9 * * *',
  week: '0 9 * * 1',
  weekly: '0 9 * * 1',
  month: '0 9 1 * *',
  monthly: '0 9 1 * *',
};

/**
 * Extracts schedule trigger from natural language input.
 */
function extractScheduleTrigger(input: string): AutomationTrigger | undefined {
  const lower = input.toLowerCase();

  // Check for "every <day>"
  for (const [day, cronDay] of Object.entries(CRON_DAY_MAP)) {
    if (lower.includes(`every ${day}`)) {
      return { type: 'schedule', cron: { expression: `0 9 * * ${cronDay}` } };
    }
  }

  // Check for "every <interval>"
  for (const [interval, expression] of Object.entries(CRON_INTERVAL_MAP)) {
    if (lower.includes(`every ${interval}`)) {
      return { type: 'schedule', cron: { expression } };
    }
  }

  // Check for specific time patterns like "at 9am" or "at 14:00"
  const timeMatch = /at (\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(lower);
  if (timeMatch) {
    let hour = parseInt(timeMatch[1]!, 10);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const period = timeMatch[3]?.toLowerCase();
    if (period === 'pm' && hour < 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;
    return { type: 'schedule', cron: { expression: `${minutes} ${hour} * * *` } };
  }

  return undefined;
}

/**
 * Extracts event trigger from natural language input.
 */
function extractEventTrigger(input: string): AutomationTrigger | undefined {
  const lower = input.toLowerCase();

  const eventPatterns: Array<{ pattern: RegExp; eventName: string }> = [
    { pattern: /when (?:a |an )?new email/i, eventName: 'email.received' },
    { pattern: /when (?:a |an )?email (?:is )?received/i, eventName: 'email.received' },
    { pattern: /when (?:a |an )?file (?:is )?uploaded/i, eventName: 'file.uploaded' },
    { pattern: /when (?:a |an )?message (?:is )?sent/i, eventName: 'message.sent' },
    { pattern: /when (?:a |an )?task (?:is )?completed/i, eventName: 'task.completed' },
    { pattern: /when (?:a |an )?user (?:signs up|registers)/i, eventName: 'user.registered' },
    { pattern: /on (?:a |an )?new commit/i, eventName: 'code.commit' },
    { pattern: /when (?:a |an )?pr (?:is )?(?:opened|created)/i, eventName: 'pr.opened' },
  ];

  for (const { pattern, eventName } of eventPatterns) {
    if (pattern.test(lower)) {
      return { type: 'event', eventName };
    }
  }

  return undefined;
}

/**
 * Extracts webhook trigger from natural language input.
 */
function extractWebhookTrigger(input: string): AutomationTrigger | undefined {
  const lower = input.toLowerCase();

  const webhookMatch = /webhook(?:\s+(?:at|on|to))?\s+([/\w-]+)/i.exec(lower);
  if (webhookMatch) {
    const path = webhookMatch[1]!.startsWith('/') ? webhookMatch[1]! : `/${webhookMatch[1]!}`;
    return { type: 'webhook', path, method: 'POST' };
  }

  if (lower.includes('webhook') || lower.includes('http endpoint')) {
    return { type: 'webhook', path: '/automation/webhook', method: 'POST' };
  }

  return undefined;
}

/**
 * Extracts steps from natural language input.
 */
function extractSteps(input: string): AutomationStep[] {
  const lower = input.toLowerCase();
  const steps: AutomationStep[] = [];

  const actionPatterns: Array<{ pattern: RegExp; toolId: string; name: string }> = [
    { pattern: /send (?:an? )?email/i, toolId: 'mail.send', name: 'Send Email' },
    { pattern: /send (?:a )?message/i, toolId: 'chat.send', name: 'Send Message' },
    { pattern: /create (?:a )?document/i, toolId: 'docs.create', name: 'Create Document' },
    { pattern: /upload (?:a )?file/i, toolId: 'drive.upload', name: 'Upload File' },
    { pattern: /summarize|summary/i, toolId: 'ai.summarize', name: 'Generate Summary' },
    { pattern: /notify|notification/i, toolId: 'chat.notify', name: 'Send Notification' },
    { pattern: /backup/i, toolId: 'storage.backup', name: 'Create Backup' },
    { pattern: /deploy/i, toolId: 'code.deploy', name: 'Deploy' },
    { pattern: /run tests/i, toolId: 'code.test', name: 'Run Tests' },
    { pattern: /analyze/i, toolId: 'ai.analyze', name: 'Analyze' },
  ];

  let stepIndex = 0;
  for (const { pattern, toolId, name } of actionPatterns) {
    if (pattern.test(lower)) {
      stepIndex++;
      steps.push({
        id: `step_${stepIndex}`,
        toolId,
        name,
      });
    }
  }

  return steps;
}

export class NLAutomationBuilder {
  parse(input: string): NLParseResult {
    if (!input || input.trim().length === 0) {
      return {
        automation: { status: 'draft', name: 'Untitled Automation' },
        confidence: 'low',
        suggestions: ['Please provide a description of what you want to automate.'],
      };
    }

    const pattern = this.matchPattern(input);

    const automation: Partial<Automation> = {
      name: pattern.name,
      status: 'draft',
      description: input,
    };

    if (pattern.trigger) {
      automation.trigger = pattern.trigger;
    }

    if (pattern.steps.length > 0) {
      automation.steps = pattern.steps;
    }

    const suggestions = this.generateSuggestions(pattern);

    return {
      automation,
      confidence: pattern.confidence,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
  }

  private matchPattern(input: string): PatternMatch {
    // Try to extract trigger
    const trigger =
      extractScheduleTrigger(input) ?? extractEventTrigger(input) ?? extractWebhookTrigger(input);

    // Extract steps
    const steps = extractSteps(input);

    // Determine confidence
    let confidence: NLParseConfidence = 'low';
    if (trigger && steps.length > 0) {
      confidence = 'high';
    } else if (trigger || steps.length > 0) {
      confidence = 'medium';
    }

    // Generate name
    const name = this.generateName(input, trigger);

    return { trigger, steps, name, confidence };
  }

  private generateName(input: string, trigger?: AutomationTrigger): string {
    // Take first meaningful words as automation name
    const words = input.trim().split(/\s+/).slice(0, 6);
    const baseName = words.join(' ');

    if (trigger) {
      switch (trigger.type) {
        case 'schedule':
          return `Scheduled: ${baseName}`;
        case 'event':
          return `On Event: ${baseName}`;
        case 'webhook':
          return `Webhook: ${baseName}`;
        default:
          return baseName;
      }
    }

    return baseName;
  }

  private generateSuggestions(pattern: PatternMatch): string[] {
    const suggestions: string[] = [];

    if (!pattern.trigger) {
      suggestions.push(
        'Consider specifying a trigger: "every day", "when a new email arrives", or "on webhook /path"',
      );
    }

    if (pattern.steps.length === 0) {
      suggestions.push(
        'Specify actions: "send email", "create document", "notify team", "run tests"',
      );
    }

    return suggestions;
  }
}
