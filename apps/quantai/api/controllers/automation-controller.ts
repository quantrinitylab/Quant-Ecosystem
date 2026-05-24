// ============================================================================
// QuantAI - Automation Controller
// ============================================================================

import { automationService } from '../services/automation-service';
import type { AutomationTriggerConfig, AutomationAction, AutomationCondition } from '../../src/types';

export class AutomationController {
  create(userId: string, name: string, description: string, trigger: AutomationTriggerConfig, actions: AutomationAction[], conditions?: AutomationCondition[]) { return automationService.createAutomation(userId, { name, description, trigger, actions, conditions }); }
  list(userId: string) { return automationService.listAutomations(userId); }
  get(id: string) { return automationService.getAutomation(id); }
  update(id: string, updates: any) { return automationService.updateAutomation(id, updates); }
  delete(id: string) { return automationService.deleteAutomation(id); }
  toggle(id: string) { return automationService.toggleAutomation(id); }
  async execute(id: string, data?: any) { return automationService.executeAutomation(id, data); }
  getLogs(id: string) { return automationService.getExecutionLogs(id); }
  getTemplates() { return automationService.getTemplates(); }
}

export const automationController = new AutomationController();
