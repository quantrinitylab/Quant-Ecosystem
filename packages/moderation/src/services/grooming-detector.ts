// ============================================================================
// Moderation - Grooming Pattern Detector
// Rule-based detection of grooming indicators in conversations
// ============================================================================

/** Result of grooming pattern analysis */
export interface GroomingDetectionResult {
  risk: number;
  indicators: string[];
}

/** Message to analyze */
export interface ConversationMessage {
  senderId: string;
  text: string;
  timestamp: number;
}

/** Pattern rule definition */
interface PatternRule {
  id: string;
  description: string;
  keywords: string[];
  weight: number;
}

/** Age-related probing patterns */
const AGE_PROBING_PATTERNS: PatternRule = {
  id: 'age_probing',
  description: 'Age-related probing questions',
  keywords: [
    'how old are you',
    'what grade are you in',
    'what year are you',
    'are you in school',
    'what school do you go to',
    'do you live with your parents',
    'are your parents home',
    'are you home alone',
    'when do your parents come home',
    'do you have your own room',
  ],
  weight: 0.2,
};

/** Isolation language patterns */
const ISOLATION_PATTERNS: PatternRule = {
  id: 'isolation_language',
  description: 'Isolation language attempting to separate from support network',
  keywords: [
    "don't tell anyone",
    'keep this between us',
    'our little secret',
    "your parents wouldn't understand",
    "they wouldn't get it",
    'no one else needs to know',
    'just between you and me',
    "don't tell your friends",
    "don't tell your mom",
    "don't tell your dad",
    'your friends are jealous',
    'they dont really care about you',
    'only i understand you',
    "i'm the only one who gets you",
  ],
  weight: 0.25,
};

/** Secrecy demands */
const SECRECY_PATTERNS: PatternRule = {
  id: 'secrecy_demands',
  description: 'Demands for secrecy about the relationship',
  keywords: [
    'promise not to tell',
    "swear you won't tell",
    'this is our secret',
    'delete this message',
    'delete our chat',
    'use a different app',
    'talk on a private app',
    "don't screenshot",
    'nobody can know',
    'if you tell anyone',
  ],
  weight: 0.2,
};

/** Gift/money offers */
const GIFT_PATTERNS: PatternRule = {
  id: 'gift_money_offers',
  description: 'Unsolicited offers of gifts or money',
  keywords: [
    "i'll buy you",
    'let me get you',
    'i can send you money',
    'want me to send you',
    "i'll send you a gift",
    'give you my credit card',
    'buy you a phone',
    'send you a gift card',
    'pay for your',
    "i'll pay for",
    'want some money',
    'need some cash',
  ],
  weight: 0.15,
};

/** Escalating intimacy language */
const INTIMACY_PATTERNS: PatternRule = {
  id: 'escalating_intimacy',
  description: 'Escalating intimacy and boundary-pushing language',
  keywords: [
    "you're so mature",
    "you're mature for your age",
    "you're not like other kids",
    "you're special",
    'send me a picture',
    'send a photo of you',
    'what are you wearing',
    'do you have a boyfriend',
    'do you have a girlfriend',
    'have you ever kissed',
    'turn on your camera',
    'show me',
    'let me see you',
    "you're so beautiful",
    "you're so pretty",
    'i love you',
    'we have a connection',
  ],
  weight: 0.2,
};

const ALL_PATTERNS: PatternRule[] = [
  AGE_PROBING_PATTERNS,
  ISOLATION_PATTERNS,
  SECRECY_PATTERNS,
  GIFT_PATTERNS,
  INTIMACY_PATTERNS,
];

/**
 * GroomingPatternDetector - Rule-based grooming detection
 *
 * Analyzes conversation messages for known grooming indicators using
 * deterministic keyword and structural pattern matching.
 * Returns a risk score (0-1) and list of matched indicators.
 *
 * This is NOT ML-based - uses explicit rules for legal defensibility
 * and transparency in how decisions are made.
 */
export class GroomingPatternDetector {
  /** Analyze a set of messages for grooming patterns */
  analyze(messages: ConversationMessage[]): GroomingDetectionResult {
    const matchedIndicators: string[] = [];
    let totalRisk = 0;

    const combinedText = messages.map((m) => m.text.toLowerCase()).join(' ');

    for (const pattern of ALL_PATTERNS) {
      const matchCount = pattern.keywords.filter((kw) => combinedText.includes(kw)).length;
      if (matchCount > 0) {
        matchedIndicators.push(pattern.description);
        // Boost weight for multiple matches in the same category (capped at 1.5x)
        const multiplier = Math.min(matchCount * 0.5, 1.5);
        totalRisk += pattern.weight * multiplier;
      }
    }

    // Structural patterns: check for rapid escalation (many patterns in short time)
    if (matchedIndicators.length >= 3) {
      totalRisk += 0.1;
    }

    // Check for repeated contact attempts (same sender, many messages)
    const senderCounts = new Map<string, number>();
    for (const msg of messages) {
      senderCounts.set(msg.senderId, (senderCounts.get(msg.senderId) ?? 0) + 1);
    }
    const maxMessageCount = Math.max(...Array.from(senderCounts.values()), 0);
    if (maxMessageCount > 10 && matchedIndicators.length > 0) {
      totalRisk += 0.1;
      if (!matchedIndicators.includes('Persistent contact pattern')) {
        matchedIndicators.push('Persistent contact pattern');
      }
    }

    // Clamp risk to [0, 1]
    const risk = Math.min(1, Math.max(0, totalRisk));

    return { risk, indicators: matchedIndicators };
  }

  /** Analyze a single message for grooming patterns (convenience method) */
  analyzeMessage(message: ConversationMessage): GroomingDetectionResult {
    return this.analyze([message]);
  }
}
