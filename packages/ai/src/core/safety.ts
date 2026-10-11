// ============================================================================
// AI Core - Safety Pipeline
// ============================================================================

import type { SafetyResult, PiiEntity, SafetyCategory } from '../types';

const PII_PATTERNS: Array<{ type: PiiEntity['type']; regex: RegExp; replacement: string }> = [
  {
    type: 'email',
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: '[EMAIL_REDACTED]',
  },
  {
    type: 'ssn',
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: '[SSN_REDACTED]',
  },
  {
    type: 'credit_card',
    regex: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    replacement: '[CC_REDACTED]',
  },
  {
    type: 'ip_address',
    regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    replacement: '[IP_REDACTED]',
  },
  {
    type: 'phone',
    regex: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    replacement: '[PHONE_REDACTED]',
  },
];

const HARMFUL_KEYWORDS: Record<string, string[]> = {
  violence: ['kill', 'murder', 'attack', 'bomb', 'weapon', 'shoot', 'stab', 'assault'],
  hate_speech: ['hate', 'racist', 'bigot', 'slur', 'supremacy', 'genocide'],
  self_harm: ['suicide', 'self-harm', 'cut myself', 'end my life'],
  illegal: ['illegal drugs', 'hack into', 'steal identity', 'launder money'],
};

/** Narrow suppressions for measured technical/news false positives. */
const BENIGN_HARMFUL_CONTEXTS = [
  /\bkill (?:the )?(?:stuck |hung )?process\b/gi,
  /\bshoot me (?:the )?logs\b/gi,
  /\battack (?:surface|vector)\b/gi,
  /\b(?:bombing|attack) anniversary memorial\b/gi,
];

/**
 * Deterministic, offline prompt-injection screen. Patterns require an
 * instruction-boundary attack, privilege/role override, safety bypass, or
 * sensitive-data exfiltration command rather than generic security words.
 *
 * Each pattern carries a stable id (PI-01..PI-11) so blocked attempts can be
 * attributed in audit logs without storing the offending prompt.
 */
export interface InjectionPattern {
  id: string;
  regex: RegExp;
}

const PROMPT_INJECTION_PATTERNS: InjectionPattern[] = [
  { id: 'PI-01', regex: /\b(?:ignore|disregard|forget|override)\b.{0,80}\b(?:previous|prior|above|system|developer|all|your)?\s*(?:instructions?|rules?|prompts?)\b/i },
  { id: 'PI-02', regex: /\b(?:reveal|show|print|output|repeat|leak|expose)\b.{0,60}\b(?:system|developer|hidden|initial)\s+(?:prompts?|instructions?|messages?)\b/i },
  { id: 'PI-03', regex: /\b(?:you are now|act as|pretend to be|switch to)\b.{0,60}\b(?:unrestricted|unsafe|developer|admin|root|dan|no restrictions?)\b/i },
  { id: 'PI-04', regex: /\b(?:disable|bypass|remove|turn off|evade)\b.{0,50}\b(?:safety|guardrails?|filters?|restrictions?|policy|moderation)\b/i },
  { id: 'PI-05', regex: /\b(?:do not|don't|never)\s+(?:mention|tell|disclose|reveal)\b.{0,40}\b(?:this|these instructions?|that)\b/i },
  { id: 'PI-06', regex: /\b(?:forward|send|upload|exfiltrate|output)\b.{0,80}\b(?:emails?|memories|secrets?|tokens?|credentials?|private data)\b/i },
  { id: 'PI-07', regex: /\b(?:pichl[ei]|pehle ki|upar wali)\b.{0,60}\b(?:instructions?|hidayat|nirdesh)\b.{0,40}\b(?:ignore|bhool|mat mano)\b/i },
  { id: 'PI-08', regex: /\b(?:system|developer)\s*prompt\b.{0,40}\b(?:dikha|bata|print|reveal|show)\b/i },
  { id: 'PI-09', regex: /(?:पुराने|पिछले|ऊपर वाले).{0,40}(?:निर्देश|नियम).{0,40}(?:नज़रअंदाज़|भूल|मत मानो)/i },
  { id: 'PI-10', regex: /(?:सिस्टम|डेवलपर)\s*प्रॉम्प्ट.{0,40}(?:दिखाओ|बताओ|प्रिंट)/i },
  { id: 'PI-11', regex: /\b(?:ignora|ignorez?|olvida|oublie)\b.{0,80}\b(?:instrucciones|instructions|reglas|règles)\b/i },
];

/**
 * Honest, user-facing refusal served when the input safety screen flags a
 * prompt. Names nothing about internals — no pattern ids, no scores.
 */
export const SAFETY_REFUSAL_MESSAGE = "I can't help with that request.";

/**
 * Structured audit entry for a blocked attempt. Carries pattern ids and a
 * timestamp, never the prompt text or any extracted PII — attribution
 * without exfiltration of the attack content itself.
 */
export interface SafetyBlockLogEntry {
  event: 'ai.safety.block';
  timestamp: string;
  path: string;
  userId: string | null;
  app: string | null;
  feature: string | null;
  patternIds: string[];
  categories: string[];
  promptLength: number;
}

/**
 * Build the audit entry for a blocked attempt from a `SafetyResult`.
 * Callers emit it (e.g. a single JSON line on stderr/stdout) on their log
 * pipeline; this function intentionally performs no I/O itself.
 */
export function buildSafetyBlockLog(input: {
  path: string;
  userId?: string | null;
  app?: string | null;
  feature?: string | null;
  patternIds: string[];
  categories: string[];
  promptLength: number;
}): SafetyBlockLogEntry {
  return {
    event: 'ai.safety.block',
    timestamp: new Date().toISOString(),
    path: input.path,
    userId: input.userId ?? null,
    app: input.app ?? null,
    feature: input.feature ?? null,
    patternIds: input.patternIds,
    categories: input.categories,
    promptLength: input.promptLength,
  };
}

const SAFETY_THRESHOLD = 0.6;

export class SafetyPipeline {
  processInput(text: string): SafetyResult {
    const { redactedText, entities } = this.redactPii(text);
    const { score, categories } = this.checkContent(text);

    return {
      text: redactedText,
      redactedEntities: entities,
      safetyScore: score,
      isSafe: score < SAFETY_THRESHOLD,
      categories,
      matchedInjectionPatterns: this.detectInjectionPatterns(text),
    };
  }

  processOutput(text: string): SafetyResult {
    const { redactedText, entities } = this.redactPii(text);
    const { score, categories } = this.checkContent(text);

    return {
      text: redactedText,
      redactedEntities: entities,
      safetyScore: score,
      isSafe: score < SAFETY_THRESHOLD,
      categories,
      matchedInjectionPatterns: this.detectInjectionPatterns(text),
    };
  }

  /**
   * Return the ids of the injection-screen patterns that match `text`.
   * Used for structured audit attribution without persisting the prompt.
   */
  detectInjectionPatterns(text: string): string[] {
    const matched: string[] = [];
    for (const pattern of PROMPT_INJECTION_PATTERNS) {
      // Reset global-stateful regexes defensively (none are global today,
      // but a future `g` flag must not leak matches across calls).
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(text)) matched.push(pattern.id);
    }
    return matched;
  }

  redactPii(text: string): { redactedText: string; entities: PiiEntity[] } {
    const entities: PiiEntity[] = [];
    let redactedText = text;

    for (const pattern of PII_PATTERNS) {
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        entities.push({
          type: pattern.type,
          value: this.maskValue(match[0], pattern.type),
          redacted: pattern.replacement,
          start: match.index,
          end: match.index + match[0].length,
        });
      }

      redactedText = redactedText.replace(
        new RegExp(pattern.regex.source, pattern.regex.flags),
        pattern.replacement,
      );
    }

    return { redactedText, entities };
  }

  private maskValue(value: string, type: PiiEntity['type']): string {
    switch (type) {
      case 'email': {
        const atIndex = value.indexOf('@');
        if (atIndex <= 0) return '***';
        const localPart = value.slice(0, atIndex);
        const domain = value.slice(atIndex);
        if (localPart.length <= 1) return localPart + '***' + domain;
        return localPart[0] + '***' + domain;
      }
      case 'ssn': {
        const digits = value.replace(/\D/g, '');
        if (digits.length < 4) return '***-**-****';
        return '***-**-' + digits.slice(-4);
      }
      case 'credit_card': {
        const ccDigits = value.replace(/\D/g, '');
        if (ccDigits.length < 4) return '****-****-****-****';
        return '****-****-****-' + ccDigits.slice(-4);
      }
      case 'phone': {
        const phoneDigits = value.replace(/\D/g, '');
        if (phoneDigits.length < 4) return '***-***-****';
        return '***-***-' + phoneDigits.slice(-4);
      }
      case 'ip_address': {
        const parts = value.split('.');
        if (parts.length < 4) return '***.***.***.***';
        return '***.***.***.' + parts[parts.length - 1];
      }
      default:
        return '***';
    }
  }

  checkContent(text: string): { score: number; categories: SafetyCategory[] } {
    let harmfulText = text.toLowerCase();
    for (const context of BENIGN_HARMFUL_CONTEXTS) harmfulText = harmfulText.replace(context, ' ');

    const categories: SafetyCategory[] = [];
    let maxScore = 0;

    for (const [categoryName, keywords] of Object.entries(HARMFUL_KEYWORDS)) {
      const matchCount = keywords.filter((keyword) => harmfulText.includes(keyword)).length;
      const score = Math.min(matchCount / 3, 1.0);
      const flagged = score >= SAFETY_THRESHOLD;
      categories.push({ name: categoryName, score, flagged });
      maxScore = Math.max(maxScore, score);
    }

    const injectionDetected = this.detectInjectionPatterns(text).length > 0;
    const injectionScore = injectionDetected ? 1 : 0;
    categories.push({
      name: 'prompt_injection',
      score: injectionScore,
      flagged: injectionDetected,
    });
    maxScore = Math.max(maxScore, injectionScore);

    return { score: maxScore, categories };
  }
}
