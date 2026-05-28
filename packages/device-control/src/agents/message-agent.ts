import type { SMSCapability } from '../capabilities/sms.js';
import type { PermissionManager } from '../permissions/permission-manager.js';
import type { MessageAgentIntent } from '../providers/types.js';

export interface MessageAgentConfig {
  smsProvider: SMSCapability;
  permissionManager: PermissionManager;
  contactsResolver?: (name: string) => Promise<string | null>;
}

export interface MessageAgentResult {
  success: boolean;
  messageSid?: string;
  messages?: Array<{ id: string; from: string; body: string }>;
  error?: string;
}

export class MessageAgent {
  private smsProvider: SMSCapability;
  private permissionManager: PermissionManager;
  private contactsResolver?: (name: string) => Promise<string | null>;

  constructor(config: MessageAgentConfig) {
    this.smsProvider = config.smsProvider;
    this.permissionManager = config.permissionManager;
    this.contactsResolver = config.contactsResolver;
  }

  async handleIntent(intent: MessageAgentIntent): Promise<MessageAgentResult> {
    const permState = this.permissionManager.getState('sms');
    if (permState === 'denied') {
      return { success: false, error: 'SMS permission denied' };
    }

    if (intent.action === 'send') {
      let target = intent.target;
      if (!target && intent.contactName && this.contactsResolver) {
        target = (await this.contactsResolver(intent.contactName)) ?? undefined;
      }
      if (!target) {
        return { success: false, error: 'No target number specified' };
      }
      if (!intent.body) {
        return { success: false, error: 'No message body specified' };
      }
      try {
        const sid = await this.smsProvider.sendSMS(target, intent.body);
        return { success: true, messageSid: sid };
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }
    }

    if (intent.action === 'read') {
      if (!intent.target) {
        return { success: false, error: 'No message ID specified' };
      }
      try {
        const msg = await this.smsProvider.readSMS(intent.target);
        return { success: true, messages: [{ id: msg.id, from: msg.from, body: msg.body }] };
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }
    }

    if (intent.action === 'reply') {
      if (!intent.target) {
        return { success: false, error: 'No target number for reply' };
      }
      if (!intent.body) {
        return { success: false, error: 'No message body specified' };
      }
      try {
        const sid = await this.smsProvider.sendSMS(intent.target, intent.body);
        return { success: true, messageSid: sid };
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }
    }

    return { success: false, error: `Unknown action: ${intent.action}` };
  }
}
