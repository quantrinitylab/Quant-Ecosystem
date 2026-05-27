// ============================================================================
// QuantMail - Smart Inbox Service
// Rules-based email categorization into Primary, Social, Promotions, Updates, Forums
// ============================================================================

export type InboxCategory = 'primary' | 'social' | 'promotions' | 'updates' | 'forums';

export interface CategorizationRule {
  id: string;
  field: 'from' | 'subject' | 'to';
  pattern: string;
  category: InboxCategory;
  priority: number;
}

export interface CategorizedEmail {
  emailId: string;
  category: InboxCategory;
  confidence: number;
  matchedRule?: string;
}

export class SmartInboxService {
  private rules: CategorizationRule[] = [];
  private categoryCounts: Record<InboxCategory, number> = {
    primary: 0,
    social: 0,
    promotions: 0,
    updates: 0,
    forums: 0,
  };
  private userCorrections: Map<string, InboxCategory> = new Map();
  private ruleCounter = 0;

  constructor() {
    this.initBuiltInRules();
  }

  private initBuiltInRules(): void {
    const builtIn: Omit<CategorizationRule, 'id'>[] = [
      // Social networks
      { field: 'from', pattern: 'facebook.com', category: 'social', priority: 10 },
      { field: 'from', pattern: 'twitter.com', category: 'social', priority: 10 },
      { field: 'from', pattern: 'instagram.com', category: 'social', priority: 10 },
      { field: 'from', pattern: 'linkedin.com', category: 'social', priority: 10 },
      { field: 'from', pattern: 'tiktok.com', category: 'social', priority: 10 },
      // Newsletters / deals => promotions
      { field: 'subject', pattern: 'newsletter', category: 'promotions', priority: 8 },
      { field: 'subject', pattern: 'deal', category: 'promotions', priority: 8 },
      { field: 'subject', pattern: 'discount', category: 'promotions', priority: 8 },
      { field: 'subject', pattern: 'sale', category: 'promotions', priority: 7 },
      { field: 'subject', pattern: 'unsubscribe', category: 'promotions', priority: 6 },
      { field: 'from', pattern: 'noreply', category: 'promotions', priority: 5 },
      // Receipts / shipping => updates
      { field: 'subject', pattern: 'receipt', category: 'updates', priority: 9 },
      { field: 'subject', pattern: 'shipping', category: 'updates', priority: 9 },
      { field: 'subject', pattern: 'order confirmation', category: 'updates', priority: 9 },
      { field: 'subject', pattern: 'tracking', category: 'updates', priority: 8 },
      { field: 'subject', pattern: 'delivered', category: 'updates', priority: 8 },
      // Mailing lists => forums
      { field: 'to', pattern: 'list', category: 'forums', priority: 7 },
      { field: 'to', pattern: 'group', category: 'forums', priority: 7 },
      { field: 'from', pattern: 'groups.google.com', category: 'forums', priority: 9 },
      { field: 'subject', pattern: '[', category: 'forums', priority: 5 },
    ];

    for (const rule of builtIn) {
      this.addRule(rule);
    }
  }

  categorize(email: { from: string; subject: string; to: string; body: string }): CategorizedEmail {
    const emailId = `email-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Check user corrections first
    const correction = this.userCorrections.get(emailId);
    if (correction) {
      this.categoryCounts[correction] += 1;
      return { emailId, category: correction, confidence: 1.0 };
    }

    // Sort rules by priority descending
    const sortedRules = [...this.rules].sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      const fieldValue = email[rule.field].toLowerCase();
      if (fieldValue.includes(rule.pattern.toLowerCase())) {
        const confidence = Math.min(0.5 + rule.priority * 0.05, 1.0);
        this.categoryCounts[rule.category] += 1;
        return {
          emailId,
          category: rule.category,
          confidence,
          matchedRule: rule.id,
        };
      }
    }

    // Default to primary
    this.categoryCounts.primary += 1;
    return { emailId, category: 'primary', confidence: 0.5 };
  }

  addRule(rule: Omit<CategorizationRule, 'id'>): CategorizationRule {
    this.ruleCounter += 1;
    const newRule: CategorizationRule = {
      ...rule,
      id: `rule-${this.ruleCounter}`,
    };
    this.rules.push(newRule);
    return newRule;
  }

  removeRule(ruleId: string): boolean {
    const index = this.rules.findIndex((r) => r.id === ruleId);
    if (index === -1) {
      return false;
    }
    this.rules.splice(index, 1);
    return true;
  }

  getRules(): CategorizationRule[] {
    return [...this.rules];
  }

  getCategoryCounts(): Record<InboxCategory, number> {
    return { ...this.categoryCounts };
  }

  trainFromUserAction(emailId: string, correctCategory: InboxCategory): void {
    this.userCorrections.set(emailId, correctCategory);
  }
}
