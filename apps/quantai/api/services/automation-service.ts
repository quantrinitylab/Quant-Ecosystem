// ============================================================================
// QuantAI - Automation Service
// Workflow engine, trigger evaluation, action execution, scheduling
// ============================================================================

import type { Automation, AutomationTriggerConfig, AutomationAction, AutomationCondition } from '../../src/types';

interface ExecutionLog {
  id: string;
  automationId: string;
  trigger: string;
  actions: { actionId: string; status: 'success' | 'failed'; output: unknown; duration: number }[];
  status: 'success' | 'partial' | 'failed';
  startedAt: string;
  completedAt: string;
}

export class AutomationService {
  private automations: Map<string, Automation> = new Map();
  private executionLogs: Map<string, ExecutionLog[]> = new Map();
  private scheduledTimers: Map<string, NodeJS.Timeout> = new Map();

  createAutomation(userId: string, input: { name: string; description: string; trigger: AutomationTriggerConfig; actions: AutomationAction[]; conditions?: AutomationCondition[] }): Automation {
    const automation: Automation = {
      id: `auto_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`,
      userId,
      name: input.name,
      description: input.description,
      trigger: input.trigger,
      actions: input.actions.map((a, i) => ({ ...a, order: i })),
      conditions: input.conditions || [],
      isActive: true,
      executionCount: 0,
      createdAt: new Date().toISOString(),
    };
    this.automations.set(automation.id, automation);

    if (automation.trigger.type === 'schedule' && automation.trigger.schedule) {
      this.scheduleAutomation(automation);
    }

    return automation;
  }

  getAutomation(automationId: string): Automation | null {
    return this.automations.get(automationId) || null;
  }

  listAutomations(userId: string): Automation[] {
    return Array.from(this.automations.values()).filter(a => a.userId === userId);
  }

  updateAutomation(automationId: string, updates: Partial<Automation>): Automation | null {
    const automation = this.automations.get(automationId);
    if (!automation) return null;
    Object.assign(automation, updates);
    return automation;
  }

  deleteAutomation(automationId: string): boolean {
    const timer = this.scheduledTimers.get(automationId);
    if (timer) clearTimeout(timer);
    this.scheduledTimers.delete(automationId);
    return this.automations.delete(automationId);
  }

  toggleAutomation(automationId: string): boolean {
    const automation = this.automations.get(automationId);
    if (!automation) return false;
    automation.isActive = !automation.isActive;
    if (!automation.isActive) {
      const timer = this.scheduledTimers.get(automationId);
      if (timer) clearTimeout(timer);
    }
    return automation.isActive;
  }

  async executeAutomation(automationId: string, triggerData?: Record<string, unknown>): Promise<ExecutionLog> {
    const automation = this.automations.get(automationId);
    if (!automation) throw new Error('Automation not found');
    if (!automation.isActive) throw new Error('Automation is disabled');

    const startedAt = new Date().toISOString();
    const actionResults: ExecutionLog['actions'] = [];

    // Check conditions
    if (automation.conditions.length > 0 && triggerData) {
      const conditionsMet = automation.conditions.every(c => this.evaluateCondition(c, triggerData));
      if (!conditionsMet) {
        return { id: `exec_${Date.now().toString(36)}`, automationId, trigger: automation.trigger.type, actions: [], status: 'failed', startedAt, completedAt: new Date().toISOString() };
      }
    }

    // Execute actions in order
    for (const action of automation.actions.sort((a, b) => a.order - b.order)) {
      const actionStart = Date.now();
      try {
        const output = await this.executeAction(action, triggerData);
        actionResults.push({ actionId: action.id, status: 'success', output, duration: Date.now() - actionStart });
      } catch (error: any) {
        actionResults.push({ actionId: action.id, status: 'failed', output: error.message, duration: Date.now() - actionStart });
        if (!action.retryOnFail) break;
      }
    }

    const status = actionResults.every(r => r.status === 'success') ? 'success' : actionResults.some(r => r.status === 'success') ? 'partial' : 'failed';
    const log: ExecutionLog = { id: `exec_${Date.now().toString(36)}`, automationId, trigger: automation.trigger.type, actions: actionResults, status, startedAt, completedAt: new Date().toISOString() };

    const logs = this.executionLogs.get(automationId) || [];
    logs.push(log);
    this.executionLogs.set(automationId, logs);

    automation.executionCount++;
    automation.lastExecuted = log.completedAt;

    return log;
  }

  private evaluateCondition(condition: AutomationCondition, data: Record<string, unknown>): boolean {
    const value = data[condition.field];
    switch (condition.operator) {
      case 'equals': return value === condition.value;
      case 'not-equals': return value !== condition.value;
      case 'contains': return typeof value === 'string' && value.includes(String(condition.value));
      case 'gt': return typeof value === 'number' && value > (condition.value as number);
      case 'lt': return typeof value === 'number' && value < (condition.value as number);
      case 'exists': return value !== undefined && value !== null;
      default: return false;
    }
  }

  private async executeAction(action: AutomationAction, triggerData?: Record<string, unknown>): Promise<unknown> {
    await new Promise(resolve => setTimeout(resolve, 20));

    switch (action.type) {
      case 'send_notification': return { sent: true, to: action.params['to'], message: action.params['message'] };
      case 'send_email': return { sent: true, recipient: action.params['to'], subject: action.params['subject'] };
      case 'create_post': return { posted: true, app: action.app, content: action.params['content'] };
      case 'webhook': return { called: true, url: action.params['url'], statusCode: 200 };
      case 'delay': return { waited: action.params['seconds'] || 5 };
      case 'condition': return { evaluated: true, result: true };
      case 'ai_generate': return { generated: true, output: 'AI generated content' };
      case 'device_command': return { executed: true, device: action.params['deviceId'] };
      default: return { executed: true, type: action.type };
    }
  }

  private scheduleAutomation(automation: Automation): void {
    if (!automation.trigger.schedule) return;
    // Simple schedule: interpret as interval in ms
    const intervalMs = this.parseCronToMs(automation.trigger.schedule);
    const timer = setInterval(() => {
      if (automation.isActive) this.executeAutomation(automation.id);
    }, intervalMs);
    this.scheduledTimers.set(automation.id, timer as any);
  }

  private parseCronToMs(schedule: string): number {
    // Simplified: interpret common patterns
    if (schedule.includes('hourly')) return 3600000;
    if (schedule.includes('daily')) return 86400000;
    if (schedule.includes('weekly')) return 604800000;
    const minutes = parseInt(schedule) || 60;
    return minutes * 60000;
  }

  getExecutionLogs(automationId: string, limit: number = 20): ExecutionLog[] {
    return (this.executionLogs.get(automationId) || []).slice(-limit);
  }

  getTemplates(): { name: string; description: string; trigger: string; actions: string[] }[] {
    return [
      { name: 'Morning Briefing', description: 'Daily summary of emails, calendar, and news', trigger: 'schedule (8:00 AM)', actions: ['Fetch unread emails', 'Get calendar events', 'Generate summary'] },
      { name: 'Auto-Post Cross-Platform', description: 'Post to all social platforms simultaneously', trigger: 'manual', actions: ['Create QuantSync post', 'Share on QuantNeon', 'Create QuantMax short'] },
      { name: 'New Follower Welcome', description: 'Send welcome message when someone follows you', trigger: 'event (new_follower)', actions: ['Generate welcome message', 'Send DM'] },
      { name: 'Content Scheduler', description: 'Schedule content publishing at optimal times', trigger: 'schedule', actions: ['Check scheduled content', 'Analyze best time', 'Publish content'] },
      { name: 'Smart Backup', description: 'Backup important data periodically', trigger: 'schedule (daily)', actions: ['Export project data', 'Sync to cloud', 'Verify backup'] },
    ];
  }
}

export const automationService = new AutomationService();
