import type { ContentRating } from '../types.js';

interface AgeGateResult {
  allowed: boolean;
  reason: string;
  requiredRating: ContentRating;
  userRating: ContentRating;
}

const RATING_LEVELS: Record<ContentRating, number> = {
  all_ages: 0,
  teen: 13,
  mature: 18,
};

export class AgeGate {
  private userAge: number;
  private parentalControlsEnabled: boolean;
  private parentalMaxRating: ContentRating;

  constructor(options: {
    userAge: number;
    parentalControlsEnabled?: boolean;
    parentalMaxRating?: ContentRating;
  }) {
    this.userAge = options.userAge;
    this.parentalControlsEnabled = options.parentalControlsEnabled ?? false;
    this.parentalMaxRating = options.parentalMaxRating ?? 'mature';
  }

  check(requiredRating: ContentRating): AgeGateResult {
    const requiredAge = RATING_LEVELS[requiredRating];
    const userRating = this.getUserRating();

    if (this.parentalControlsEnabled) {
      const maxAllowedLevel = RATING_LEVELS[this.parentalMaxRating];
      if (requiredAge > maxAllowedLevel) {
        return {
          allowed: false,
          reason: 'parental_controls_restrict',
          requiredRating,
          userRating,
        };
      }
    }

    if (this.userAge < requiredAge) {
      return {
        allowed: false,
        reason: 'age_restriction',
        requiredRating,
        userRating,
      };
    }

    return {
      allowed: true,
      reason: 'permitted',
      requiredRating,
      userRating,
    };
  }

  getUserRating(): ContentRating {
    if (this.userAge >= 18) return 'mature';
    if (this.userAge >= 13) return 'teen';
    return 'all_ages';
  }

  setParentalControls(enabled: boolean, maxRating?: ContentRating): void {
    this.parentalControlsEnabled = enabled;
    if (maxRating) this.parentalMaxRating = maxRating;
  }
}
