// ============================================================================
// Moderation - Safety Microfeatures
// One-tap actions, distress detection, mass-unfollow protection, crisis hotlines
// ============================================================================

/** One-tap action types */
export type OneTapAction = 'hide' | 'mute' | 'block' | 'report';

/** Result of a one-tap action */
export interface OneTapActionResult {
  userId: string;
  targetId: string;
  action: OneTapAction;
  escalatedFrom?: OneTapAction;
  timestamp: number;
}

/** Usage metrics for distress detection */
export interface UsageMetrics {
  sessionDurationMinutes: number;
  negativeInteractionsCount: number;
  reportsSentRecently: number;
  rapidScrolling: boolean;
  lateNightUsage: boolean;
}

/** Distress detection result */
export interface DistressResult {
  showBreakSurface: boolean;
  reason: string;
}

/** Mass unfollow protection result */
export interface MassUnfollowResult {
  blocked: boolean;
  reason: string;
}

/** Self-harm redirect result */
export interface SelfHarmRedirectResult {
  redirect: boolean;
  hotlineUrl?: string;
  hotlineNumber?: string;
}

/** Crisis hotline information */
export interface CrisisHotline {
  number: string;
  url: string;
  name: string;
}

/** Grooming detection result */
export interface GroomingDetectionResult {
  risk: number;
  indicators: string[];
}

/** Crisis hotlines for 25+ countries */
const CRISIS_HOTLINES: Record<string, CrisisHotline> = {
  US: { number: '988', url: 'https://988lifeline.org', name: 'Suicide & Crisis Lifeline' },
  UK: { number: '116 123', url: 'https://www.samaritans.org', name: 'Samaritans' },
  CA: { number: '988', url: 'https://988.ca', name: 'Suicide Crisis Helpline' },
  AU: { number: '13 11 14', url: 'https://www.lifeline.org.au', name: 'Lifeline Australia' },
  NZ: { number: '1737', url: 'https://1737.org.nz', name: 'Need to Talk?' },
  IE: { number: '116 123', url: 'https://www.samaritans.org', name: 'Samaritans Ireland' },
  DE: {
    number: '0800 111 0 111',
    url: 'https://www.telefonseelsorge.de',
    name: 'Telefonseelsorge',
  },
  FR: { number: '3114', url: 'https://3114.fr', name: 'Numero National de Prevention du Suicide' },
  ES: {
    number: '024',
    url: 'https://www.sanidad.gob.es',
    name: 'Linea de Atencion a la Conducta Suicida',
  },
  IT: { number: '800 86 00 22', url: 'https://www.telefono-amico.it', name: 'Telefono Amico' },
  NL: { number: '113', url: 'https://www.113.nl', name: '113 Zelfmoordpreventie' },
  BE: { number: '1813', url: 'https://www.zelfmoord1813.be', name: 'Zelfmoordlijn 1813' },
  PT: { number: '808 200 204', url: 'https://www.sns24.gov.pt', name: 'SNS 24' },
  AT: { number: '142', url: 'https://www.telefonseelsorge.at', name: 'Telefonseelsorge' },
  CH: { number: '143', url: 'https://www.143.ch', name: 'Die Dargebotene Hand' },
  SE: { number: '90101', url: 'https://mind.se', name: 'Mind Sjalvmordslinjen' },
  NO: {
    number: '116 123',
    url: 'https://www.telefonlinjen.no',
    name: 'Mental Helses Hjelpetelefon',
  },
  DK: { number: '70 201 201', url: 'https://www.livslinien.dk', name: 'Livslinien' },
  FI: { number: '09 2525 0111', url: 'https://mieli.fi', name: 'MIELI Mental Health Finland' },
  JP: { number: '0570-064-556', url: 'https://www.mhlw.go.jp', name: 'Yorisoi Hotline' },
  KR: { number: '1393', url: 'https://www.129.go.kr', name: 'Korea Suicide Prevention Center' },
  IN: { number: '9820466726', url: 'https://www.aasra.info', name: 'AASRA' },
  BR: { number: '188', url: 'https://www.cvv.org.br', name: 'CVV' },
  MX: { number: '800 290 0024', url: 'https://www.saptel.org.mx', name: 'SAPTEL' },
  ZA: { number: '0800 567 567', url: 'https://www.sadag.org', name: 'SADAG' },
};

/** Self-harm related keywords for redirect detection */
const SELF_HARM_KEYWORDS = [
  'suicide',
  'kill myself',
  'end my life',
  'want to die',
  'self harm',
  'self-harm',
  'cut myself',
  'hurt myself',
  'no reason to live',
  'better off dead',
];

/** Threshold for mass unfollow protection (percentage of total follows in time window) */
const MASS_UNFOLLOW_THRESHOLD = 20;

/**
 * SafetyMicrofeatures - Quick safety actions and distress detection
 *
 * Provides one-tap actions, take-a-break surfaces, mass-unfollow protection,
 * self-harm search redirection, and crisis hotline localization.
 */
export class SafetyMicrofeatures {
  private actionHistory: Map<string, OneTapActionResult[]> = new Map();

  /** Execute a one-tap action with escalation tracking */
  oneTapAction(userId: string, targetId: string, action: OneTapAction): OneTapActionResult {
    const history = this.actionHistory.get(`${userId}:${targetId}`) ?? [];

    let escalatedFrom: OneTapAction | undefined;
    if (history.length > 0) {
      const lastEntry = history[history.length - 1];
      if (lastEntry) {
        const lastAction = lastEntry.action;
        const escalationOrder: OneTapAction[] = ['hide', 'mute', 'block', 'report'];
        const lastIdx = escalationOrder.indexOf(lastAction);
        const currentIdx = escalationOrder.indexOf(action);
        if (currentIdx > lastIdx) {
          escalatedFrom = lastAction;
        }
      }
    }

    const result: OneTapActionResult = {
      userId,
      targetId,
      action,
      escalatedFrom,
      timestamp: Date.now(),
    };

    history.push(result);
    this.actionHistory.set(`${userId}:${targetId}`, history);

    return result;
  }

  /** Detect distress patterns from usage metrics */
  detectDistressPatterns(usageMetrics: UsageMetrics): DistressResult {
    const reasons: string[] = [];

    if (usageMetrics.sessionDurationMinutes > 120) {
      reasons.push('extended session duration');
    }
    if (usageMetrics.negativeInteractionsCount > 5) {
      reasons.push('high negative interactions');
    }
    if (usageMetrics.reportsSentRecently > 3) {
      reasons.push('frequent reporting');
    }
    if (usageMetrics.rapidScrolling && usageMetrics.lateNightUsage) {
      reasons.push('rapid scrolling during late night');
    }

    const showBreakSurface = reasons.length >= 2;

    return {
      showBreakSurface,
      reason: showBreakSurface ? reasons.join('; ') : 'no distress indicators',
    };
  }

  /** Mass unfollow protection */
  massUnfollowProtection(
    _userId: string,
    unfollowCount: number,
    timeWindowMinutes: number,
  ): MassUnfollowResult {
    const rate = unfollowCount / Math.max(timeWindowMinutes, 1);

    if (unfollowCount >= MASS_UNFOLLOW_THRESHOLD) {
      return {
        blocked: true,
        reason: `Unfollowed ${unfollowCount} accounts in ${timeWindowMinutes} minutes (threshold: ${MASS_UNFOLLOW_THRESHOLD})`,
      };
    }

    if (rate > 5) {
      return {
        blocked: true,
        reason: `Unfollow rate too high: ${rate.toFixed(1)} per minute`,
      };
    }

    return { blocked: false, reason: 'within normal limits' };
  }

  /** Self-harm search redirect */
  selfHarmRedirect(query: string, countryCode: string = 'US'): SelfHarmRedirectResult {
    const lowerQuery = query.toLowerCase();
    const isHarmful = SELF_HARM_KEYWORDS.some((kw) => lowerQuery.includes(kw));

    if (!isHarmful) {
      return { redirect: false };
    }

    const hotline = this.getCrisisHotline(countryCode);
    return {
      redirect: true,
      hotlineUrl: hotline?.url,
      hotlineNumber: hotline?.number,
    };
  }

  /** Get crisis hotline for a country */
  getCrisisHotline(countryCode: string): CrisisHotline | undefined {
    return CRISIS_HOTLINES[countryCode.toUpperCase()];
  }

  /** Get all available crisis hotline country codes */
  getAvailableCountries(): string[] {
    return Object.keys(CRISIS_HOTLINES);
  }
}
