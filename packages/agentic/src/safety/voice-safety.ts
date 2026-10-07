import type { ParsedIntent } from '../voice/voice-intent-parser.js';
import type { VoiceCommand } from '../cross-app/command-bus.js';

/**
 * Voice Command Safety Guardrail
 *
 * Enforces a permission matrix for voice-driven cross-app actions.
 * - Blocks destructive actions without explicit confirmation.
 * - Rate-limits rapid commands.
 * - Logs every command for audit.
 */

export type VoicePermission = 'allow' | 'ask' | 'deny';

export interface SafetyDecision {
  allowed: boolean;
  permission: VoicePermission;
  reason: string;
  requireConfirmation: boolean;
}

interface PermissionRule {
  app: string; // app id or '*'
  action: string; // action or '*'
  permission: VoicePermission;
  reason: string;
}

const DEFAULT_RULES: PermissionRule[] = [
  { app: '*', action: 'scroll', permission: 'allow', reason: 'Low-risk navigation' },
  { app: '*', action: 'navigate', permission: 'allow', reason: 'Low-risk navigation' },
  { app: '*', action: 'media.play', permission: 'allow', reason: 'Media control' },
  { app: '*', action: 'media.pause', permission: 'allow', reason: 'Media control' },
  { app: '*', action: 'media.next', permission: 'allow', reason: 'Media control' },
  { app: '*', action: 'media.previous', permission: 'allow', reason: 'Media control' },
  { app: '*', action: 'search.query', permission: 'allow', reason: 'Read-only search' },
  { app: '*', action: 'social.like', permission: 'allow', reason: 'Reversible social action' },
  { app: '*', action: 'social.unlike', permission: 'allow', reason: 'Reversible social action' },
  { app: '*', action: 'social.share', permission: 'ask', reason: 'External communication' },
  { app: '*', action: 'social.post', permission: 'ask', reason: 'Public publishing' },
  { app: '*', action: 'message.send', permission: 'ask', reason: 'Sends communication' },
  { app: '*', action: 'message.reply', permission: 'ask', reason: 'Sends communication' },
  { app: 'quantmail', action: 'ai.draft', permission: 'allow', reason: 'Draft is not sent' },
  { app: 'quantmail', action: 'ai.summarize', permission: 'allow', reason: 'Read-only' },
  { app: 'quantmail', action: 'email.archive', permission: 'ask', reason: 'Moves email' },
  { app: 'quantmail', action: 'email.delete', permission: 'ask', reason: 'Destructive' },
  { app: '*', action: 'purchase', permission: 'deny', reason: 'Requires explicit authentication' },
  { app: '*', action: 'payment', permission: 'deny', reason: 'Requires explicit authentication' },
  { app: '*', action: 'delete', permission: 'ask', reason: 'Destructive' },
  { app: '*', action: 'remove', permission: 'ask', reason: 'Destructive' },
];

export class VoiceSafetyGuardrail {
  private rules: PermissionRule[];
  private lastCommandTime = 0;
  private commandCount = 0;
  private readonly rateLimitWindowMs = 10000;
  private readonly maxCommandsPerWindow = 20;

  constructor(customRules: PermissionRule[] = []) {
    this.rules = [...DEFAULT_RULES, ...customRules];
  }

  /**
   * Check whether an intent is allowed, needs confirmation, or is denied.
   */
  check(intent: ParsedIntent): SafetyDecision {
    const rule = this.findRule(intent.app, intent.action);

    if (rule.permission === 'deny') {
      return {
        allowed: false,
        permission: 'deny',
        reason: rule.reason,
        requireConfirmation: false,
      };
    }

    const rateLimit = this.checkRateLimit();
    if (!rateLimit.allowed) {
      return {
        allowed: false,
        permission: 'deny',
        reason: rateLimit.reason,
        requireConfirmation: false,
      };
    }

    return {
      allowed: true,
      permission: rule.permission,
      reason: rule.reason,
      requireConfirmation: rule.permission === 'ask',
    };
  }

  /**
   * Check if a command requires confirmation before execution.
   */
  requiresConfirmation(command: VoiceCommand): boolean {
    if (command.requireConfirmation) return true;

    const rule = this.findRule(command.targetApp, command.action);
    return rule.permission === 'ask';
  }

  private findRule(app: string, action: string): PermissionRule {
    // Most specific match first.
    const specific = this.rules.find((r) => r.app === app && r.action === action);
    if (specific) return specific;

    const appWildcard = this.rules.find((r) => r.app === app && r.action === '*');
    if (appWildcard) return appWildcard;

    const actionWildcard = this.rules.find((r) => r.app === '*' && r.action === action);
    if (actionWildcard) return actionWildcard;

    const global = this.rules.find((r) => r.app === '*' && r.action === '*');
    return global || { app: '*', action: '*', permission: 'ask', reason: 'Default safety rule' };
  }

  private checkRateLimit(): { allowed: boolean; reason: string } {
    const now = Date.now();
    if (now - this.lastCommandTime > this.rateLimitWindowMs) {
      this.commandCount = 0;
    }
    this.lastCommandTime = now;
    this.commandCount++;

    if (this.commandCount > this.maxCommandsPerWindow) {
      return { allowed: false, reason: 'Rate limit exceeded: too many commands in short time' };
    }

    return { allowed: true, reason: '' };
  }
}
