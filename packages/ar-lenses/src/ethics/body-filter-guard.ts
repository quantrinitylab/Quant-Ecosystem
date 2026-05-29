import type { BodyFilterCategory, EthicsPolicy } from '../types.js';

interface FilterCheckResult {
  allowed: boolean;
  blockedReasons: string[];
  category: BodyFilterCategory | null;
}

const BODY_SHAMING_PATTERNS: Record<BodyFilterCategory, RegExp> = {
  weight: /\b(slim|thin|fat|weight|waist|narrow|wide|shrink|enlarge)\b/i,
  skin_tone: /\b(lighten|darken|whiten|bleach|tan|skin\s*tone|complexion)\b/i,
  proportions: /\b(proportion|elongat|shorten|stretch|bigger|smaller|bust|hip)\b/i,
  age_appearance: /\b(younger|older|wrinkle|age|smooth\s*skin|baby\s*face)\b/i,
};

export class BodyFilterGuard {
  private policy: EthicsPolicy;

  constructor(policy: EthicsPolicy) {
    this.policy = policy;
  }

  check(effectDescription: string, effectType: string): FilterCheckResult {
    const blockedReasons: string[] = [];
    let matchedCategory: BodyFilterCategory | null = null;

    for (const category of this.policy.blockedCategories) {
      const pattern = BODY_SHAMING_PATTERNS[category];
      if (pattern.test(effectDescription) || pattern.test(effectType)) {
        blockedReasons.push(`body_filter_${category}`);
        matchedCategory = category;
      }
    }

    return {
      allowed: blockedReasons.length === 0,
      blockedReasons,
      category: matchedCategory,
    };
  }

  isBodyModification(effectType: string): boolean {
    const bodyMods = ['reshape', 'resize', 'morph', 'transform_body', 'body_edit'];
    return bodyMods.some((mod) => effectType.toLowerCase().includes(mod));
  }

  getPolicy(): EthicsPolicy {
    return { ...this.policy };
  }

  updatePolicy(policy: Partial<EthicsPolicy>): void {
    this.policy = { ...this.policy, ...policy };
  }
}
