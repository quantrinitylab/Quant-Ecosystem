export interface AutomateVoiceResult {
  success: boolean;
  action: string;
  spokenResponse: string;
  automationId?: string;
}

interface AutomationEntry {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  status: 'active' | 'paused' | 'error';
}

export class AutomateVoiceBridge {
  private automations: AutomationEntry[] = [];

  async handleAutomationCommand(transcript: string): Promise<AutomateVoiceResult> {
    const lower = transcript.toLowerCase().trim();

    // Pattern: "every day at X do Y" or "every X do Y"
    const scheduleMatch = lower.match(/every\s+(.+?)\s+(?:do|post|send|run|create|forward)\s+(.+)/);
    if (scheduleMatch) {
      const schedule = scheduleMatch[1]!;
      const action = scheduleMatch[2]!;
      const id = `auto-${Date.now()}`;
      const name = `${action} ${schedule}`;
      this.automations.push({
        id,
        name,
        description: `Schedule: ${schedule}, Action: ${action}`,
        enabled: true,
        status: 'active',
      });
      return {
        success: true,
        action: 'create',
        spokenResponse: `Automation created: ${action} ${schedule}. It is now active.`,
        automationId: id,
      };
    }

    // Pattern: "when X happens do Y" or "when I get X forward to Y"
    const eventMatch = lower.match(/when\s+(.+?)\s+(?:do|forward|send|run|create)\s+(.+)/);
    if (eventMatch) {
      const trigger = eventMatch[1]!;
      const action = eventMatch[2]!;
      const id = `auto-${Date.now()}`;
      const name = `on ${trigger}: ${action}`;
      this.automations.push({
        id,
        name,
        description: `Trigger: ${trigger}, Action: ${action}`,
        enabled: true,
        status: 'active',
      });
      return {
        success: true,
        action: 'create',
        spokenResponse: `Automation created: when ${trigger}, ${action}. It is now active.`,
        automationId: id,
      };
    }

    // Pattern: "create automation ..."
    const createMatch = lower.match(/create\s+(?:an?\s+)?automation[:\s]+(.+)/);
    if (createMatch) {
      const desc = createMatch[1]!;
      const id = `auto-${Date.now()}`;
      this.automations.push({
        id,
        name: desc,
        description: desc,
        enabled: true,
        status: 'active',
      });
      return {
        success: true,
        action: 'create',
        spokenResponse: `Automation created: ${desc}. It is now active.`,
        automationId: id,
      };
    }

    return {
      success: false,
      action: 'unknown',
      spokenResponse: 'I did not understand that automation command.',
    };
  }

  listAutomations(): AutomateVoiceResult {
    if (this.automations.length === 0) {
      return {
        success: true,
        action: 'list',
        spokenResponse: 'You have no automations set up.',
      };
    }

    const names = this.automations.map((a) => a.name).join(', ');
    return {
      success: true,
      action: 'list',
      spokenResponse: `You have ${this.automations.length} automations: ${names}.`,
    };
  }

  toggleAutomation(name: string, enabled: boolean): AutomateVoiceResult {
    const automation = this.automations.find((a) =>
      a.name.toLowerCase().includes(name.toLowerCase()),
    );
    if (!automation) {
      return {
        success: false,
        action: 'toggle',
        spokenResponse: `I could not find an automation matching "${name}".`,
      };
    }

    automation.enabled = enabled;
    automation.status = enabled ? 'active' : 'paused';
    const state = enabled ? 'enabled' : 'paused';
    return {
      success: true,
      action: 'toggle',
      spokenResponse: `Automation "${automation.name}" is now ${state}.`,
      automationId: automation.id,
    };
  }

  getAutomationStatus(name: string): AutomateVoiceResult {
    const automation = this.automations.find((a) =>
      a.name.toLowerCase().includes(name.toLowerCase()),
    );
    if (!automation) {
      return {
        success: false,
        action: 'status',
        spokenResponse: `I could not find an automation matching "${name}".`,
      };
    }

    return {
      success: true,
      action: 'status',
      spokenResponse: `Automation "${automation.name}" is ${automation.status}.`,
      automationId: automation.id,
    };
  }
}
