// ============================================================================
// Privacy-First Ads Package - Barrel Export
// ============================================================================

export * from './types';
export { OnDeviceRankerService, RankCandidatesSchema } from './services/on-device-ranker.service';
export {
  ContextualTargetingService,
  ExtractSignalsSchema,
  MatchAdsByContextSchema,
} from './services/contextual-targeting.service';
export {
  BehavioralOptInService,
  SetConsentSchema,
  GetConsentSchema,
  InMemoryConsentStore,
} from './services/behavioral-opt-in.service';
export type { ConsentStore } from './services/behavioral-opt-in.service';
export { AdDisclosureService, GenerateDisclosureSchema } from './services/ad-disclosure.service';
export { PrivacyEnforcerService, ValidateRequestSchema } from './services/privacy-enforcer.service';
export {
  BrandSafetyService,
  ClassifyContentSchema,
  IsAdSafeSchema,
} from './services/brand-safety.service';
