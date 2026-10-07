// ============================================================================
// Moderation - Age Gate Service
// Age verification with step-up requirements for minors
// ============================================================================

import type {
  AgeGroup,
  AgeVerificationResult,
  StepUpVerification,
  StepUpMethod,
  AgeRestriction,
} from '../types';

/** Features restricted by age group */
const RESTRICTED_FEATURES: AgeRestriction[] = [
  // Under-13 restrictions (COPPA compliance)
  {
    feature: 'random_chat',
    minAgeGroup: 'under13',
    requiresStepUp: true,
    stepUpMethod: 'parental_consent',
  },
  {
    feature: 'dating',
    minAgeGroup: 'under13',
    requiresStepUp: true,
    stepUpMethod: 'parental_consent',
  },
  {
    feature: 'direct_messages',
    minAgeGroup: 'under13',
    requiresStepUp: true,
    stepUpMethod: 'parental_consent',
  },
  {
    feature: 'live_streaming',
    minAgeGroup: 'under13',
    requiresStepUp: true,
    stepUpMethod: 'parental_consent',
  },
  {
    feature: 'marketplace',
    minAgeGroup: 'under13',
    requiresStepUp: true,
    stepUpMethod: 'parental_consent',
  },
  {
    feature: 'payments',
    minAgeGroup: 'under13',
    requiresStepUp: true,
    stepUpMethod: 'parental_consent',
  },
  {
    feature: 'profile_public',
    minAgeGroup: 'under13',
    requiresStepUp: true,
    stepUpMethod: 'parental_consent',
  },
  {
    feature: 'group_creation',
    minAgeGroup: 'under13',
    requiresStepUp: true,
    stepUpMethod: 'parental_consent',
  },
  {
    feature: 'video_calls',
    minAgeGroup: 'under13',
    requiresStepUp: true,
    stepUpMethod: 'parental_consent',
  },
  {
    feature: 'location_sharing',
    minAgeGroup: 'under13',
    requiresStepUp: true,
    stepUpMethod: 'parental_consent',
  },
  // Under-16 restrictions
  { feature: 'random_chat', minAgeGroup: 'under16', requiresStepUp: true, stepUpMethod: 'phone' },
  { feature: 'dating', minAgeGroup: 'under16', requiresStepUp: true, stepUpMethod: 'phone' },
  {
    feature: 'live_streaming',
    minAgeGroup: 'under16',
    requiresStepUp: true,
    stepUpMethod: 'phone',
  },
  { feature: 'marketplace', minAgeGroup: 'under16', requiresStepUp: true, stepUpMethod: 'phone' },
  // Under-18 restrictions
  { feature: 'random_chat', minAgeGroup: 'under18', requiresStepUp: true, stepUpMethod: 'phone' },
  { feature: 'dating', minAgeGroup: 'under18', requiresStepUp: true, stepUpMethod: 'id_upload' },
  {
    feature: 'adult_content',
    minAgeGroup: 'under18',
    requiresStepUp: true,
    stepUpMethod: 'id_upload',
  },
];

/** Age group priority ordering (most restrictive first) */
const AGE_GROUP_ORDER: AgeGroup[] = ['under13', 'under16', 'under18', 'adult'];

/**
 * AgeGateService - Age verification and feature restriction
 *
 * Determines age group from date of birth and restricts access
 * to age-inappropriate features. Supports step-up verification
 * methods (ID upload, parental consent, phone verification).
 */
export class AgeGateService {
  /** Verify age and determine restrictions */
  verifyAge(dateOfBirth: Date): AgeVerificationResult {
    const age = this.calculateAge(dateOfBirth);
    const ageGroup = this.getAgeGroup(age);
    const restrictions = this.getRestrictedFeatures(ageGroup);

    return { ageGroup, restrictions };
  }

  /** Determine if step-up verification is required for a feature */
  requireStepUpVerification(
    userId: string,
    feature: string,
    ageGroup: AgeGroup,
  ): StepUpVerification {
    void userId;

    if (ageGroup === 'adult') {
      return { required: false, method: 'phone' };
    }

    // Find the most specific restriction for this feature and age group
    const restriction = this.findRestriction(feature, ageGroup);

    if (restriction) {
      return {
        required: true,
        method: restriction.stepUpMethod || 'phone',
      };
    }

    return { required: false, method: 'phone' };
  }

  /** Get list of restricted features for an age group */
  getRestrictedFeatures(ageGroup: AgeGroup): string[] {
    if (ageGroup === 'adult') return [];

    const restrictedSet = new Set<string>();
    const groupIndex = AGE_GROUP_ORDER.indexOf(ageGroup);

    for (const restriction of RESTRICTED_FEATURES) {
      const restrictionIndex = AGE_GROUP_ORDER.indexOf(restriction.minAgeGroup);
      // Feature is restricted if the restriction applies to this age group or a less restrictive one
      if (restrictionIndex >= groupIndex) {
        restrictedSet.add(restriction.feature);
      }
    }

    return Array.from(restrictedSet);
  }

  /** Get the age group for a given age in years */
  getAgeGroup(age: number): AgeGroup {
    if (age < 13) return 'under13';
    if (age < 16) return 'under16';
    if (age < 18) return 'under18';
    return 'adult';
  }

  /** Get available step-up methods for an age group */
  getStepUpMethods(ageGroup: AgeGroup): StepUpMethod[] {
    switch (ageGroup) {
      case 'under13':
        return ['parental_consent'];
      case 'under16':
        return ['parental_consent', 'phone'];
      case 'under18':
        return ['id_upload', 'phone'];
      case 'adult':
        return ['id_upload', 'phone'];
    }
  }

  // --- Private methods ---

  private calculateAge(dateOfBirth: Date): number {
    const today = new Date();
    let age = today.getFullYear() - dateOfBirth.getFullYear();
    const monthDiff = today.getMonth() - dateOfBirth.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())) {
      age--;
    }

    return age;
  }

  private findRestriction(feature: string, ageGroup: AgeGroup): AgeRestriction | undefined {
    // Find restrictions that match this feature and apply to this age group
    return RESTRICTED_FEATURES.find((r) => r.feature === feature && r.minAgeGroup === ageGroup);
  }
}
