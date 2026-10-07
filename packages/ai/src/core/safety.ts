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
 */
const PROMPT_INJECTION_PATTERNS = [
  /\b(?:ignore|disregard|forget|override)\b.{0,80}\b(?:previous|prior|above|system|developer|all|your)?\s*(?:instructions?|rules?|prompts?)\b/i,
  /\b(?:reveal|show|print|output|repeat|leak|expose)\b.{0,60}\b(?:system|developer|hidden|initial)\s+(?:prompts?|instructions?|messages?)\b/i,
  /\b(?:you are now|act as|pretend to be|switch to)\b.{0,60}\b(?:unrestricted|unsafe|developer|admin|root|dan|no restrictions?)\b/i,
  /\b(?:disable|bypass|remove|turn off|evade)\b.{0,50}\b(?:safety|guardrails?|filters?|restrictions?|policy|moderation)\b/i,
  /\b(?:do not|don't|never)\s+(?:mention|tell|disclose|reveal)\b.{0,40}\b(?:this|these instructions?|that)\b/i,
  /\b(?:forward|send|upload|exfiltrate|output)\b.{0,80}\b(?:emails?|memories|secrets?|tokens?|credentials?|private data)\b/i,
  /\b(?:pichl[ei]|pehle ki|upar wali)\b.{0,60}\b(?:instructions?|hidayat|nirdesh)\b.{0,40}\b(?:ignore|bhool|mat mano)\b/i,
  /\b(?:system|developer)\s*prompt\b.{0,40}\b(?:dikha|bata|print|reveal|show)\b/i,
  /(?:पुराने|पिछले|ऊपर वाले).{0,40}(?:निर्देश|नियम).{0,40}(?:नज़रअंदाज़|भूल|मत मानो)/i,
  /(?:सिस्टम|डेवलपर)\s*प्रॉम्प्ट.{0,40}(?:दिखाओ|बताओ|प्रिंट)/i,
  /\b(?:ignora|ignorez?|olvida|oublie)\b.{0,80}\b(?:instrucciones|instructions|reglas|règles)\b/i,
];

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
    };
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

    const injectionDetected = PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(text));
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
