// ============================================================================
// PII Scrubber - Detect and Redact PII from Log Entries
// ============================================================================

import { PIIPattern, RedactionStats } from './types';

export class PIIScrubber {
  private patterns: PIIPattern[] = [];
  private stats: RedactionStats = {};

  constructor() {
    this.initBuiltInPatterns();
  }

  /**
   * Scrub PII from a log entry (string or object).
   */
  scrub(logEntry: string | Record<string, unknown>): string | Record<string, unknown> {
    if (typeof logEntry === 'string') {
      return this.scrubString(logEntry);
    }
    return this.scrubObject(logEntry);
  }

  /**
   * Add a custom PII detection pattern.
   */
  addPattern(name: string, regex: RegExp, replacement: string): void {
    this.patterns.push({ name, regex, replacement });
    if (!(name in this.stats)) {
      this.stats[name] = 0;
    }
  }

  /**
   * Get redaction statistics showing how many times each pattern matched.
   */
  getRedactionStats(): RedactionStats {
    return { ...this.stats };
  }

  /**
   * Get all registered pattern names.
   */
  getPatternNames(): string[] {
    return this.patterns.map((p) => p.name);
  }

  /**
   * Reset redaction statistics.
   */
  resetStats(): void {
    for (const key of Object.keys(this.stats)) {
      this.stats[key] = 0;
    }
  }

  private scrubString(input: string): string {
    let result = input;
    for (const pattern of this.patterns) {
      const before = result;
      result = result.replace(pattern.regex, pattern.replacement);
      if (result !== before) {
        const matches = before.match(pattern.regex);
        this.stats[pattern.name] = (this.stats[pattern.name] ?? 0) + (matches?.length ?? 1);
      }
    }
    return result;
  }

  private scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        result[key] = this.scrubString(value);
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result[key] = this.scrubObject(value as Record<string, unknown>);
      } else if (Array.isArray(value)) {
        result[key] = value.map((item) => {
          if (typeof item === 'string') return this.scrubString(item);
          if (typeof item === 'object' && item !== null) {
            return this.scrubObject(item as Record<string, unknown>);
          }
          return item;
        });
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  private initBuiltInPatterns(): void {
    const builtIn: Array<{ name: string; regex: RegExp; replacement: string }> = [
      {
        name: 'email',
        regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        replacement: '[REDACTED_EMAIL]',
      },
      {
        name: 'credit_card',
        regex: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
        replacement: '[REDACTED_CC]',
      },
      {
        name: 'ssn',
        regex: /\b\d{3}-\d{2}-\d{4}\b/g,
        replacement: '[REDACTED_SSN]',
      },
      {
        name: 'ip_address',
        regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
        replacement: '[REDACTED_IP]',
      },
      {
        name: 'phone',
        regex: /\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g,
        replacement: '[REDACTED_PHONE]',
      },
      {
        name: 'jwt',
        regex: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
        replacement: '[REDACTED_JWT]',
      },
    ];

    for (const p of builtIn) {
      this.patterns.push(p);
      this.stats[p.name] = 0;
    }
  }
}
