import type { ActivationEvent, ActivationMetrics } from './types.js';

const ACTIVATION_RATE_TARGET = 0.4;
const MAX_ONBOARDING_STEPS = 3;

const ALL_ACTIVATION_EVENTS: ActivationEvent[] = [
  'first_message_sent',
  'first_doc_created',
  'first_file_uploaded',
  'first_invite_sent',
  'first_integration_connected',
  'profile_completed',
  'first_search',
  'first_ai_interaction',
];

export class ActivationTracker {
  private metrics: ActivationMetrics;

  constructor(userId: string) {
    this.metrics = {
      userId,
      totalEvents: ALL_ACTIVATION_EVENTS.length,
      completedEvents: [],
      activationRate: 0,
      activationRateTarget: ACTIVATION_RATE_TARGET,
      activated: false,
      onboardingStepsCompleted: 0,
      maxOnboardingSteps: MAX_ONBOARDING_STEPS,
      skippedAll: false,
      timestamp: new Date(),
    };
  }

  trackEvent(event: ActivationEvent): void {
    if (this.metrics.completedEvents.includes(event)) {
      return;
    }
    this.metrics.completedEvents.push(event);
    this.metrics.activationRate = this.metrics.completedEvents.length / this.metrics.totalEvents;
    this.metrics.activated = this.metrics.activationRate >= this.metrics.activationRateTarget;
    this.metrics.timestamp = new Date();
  }

  completeOnboardingStep(): void {
    if (this.metrics.onboardingStepsCompleted < this.metrics.maxOnboardingSteps) {
      this.metrics.onboardingStepsCompleted += 1;
    }
  }

  skipEverything(): void {
    this.metrics.skippedAll = true;
    this.metrics.onboardingStepsCompleted = this.metrics.maxOnboardingSteps;
  }

  isActivated(): boolean {
    return this.metrics.activated;
  }

  meetsActivationGate(): boolean {
    return this.metrics.activationRate >= ACTIVATION_RATE_TARGET;
  }

  getMetrics(): ActivationMetrics {
    return { ...this.metrics };
  }

  getCompletedEvents(): ActivationEvent[] {
    return [...this.metrics.completedEvents];
  }

  getRemainingEvents(): ActivationEvent[] {
    return ALL_ACTIVATION_EVENTS.filter((e) => !this.metrics.completedEvents.includes(e));
  }

  isOnboardingComplete(): boolean {
    return (
      this.metrics.onboardingStepsCompleted >= this.metrics.maxOnboardingSteps ||
      this.metrics.skippedAll
    );
  }
}

export function createActivationTracker(userId: string): ActivationTracker {
  return new ActivationTracker(userId);
}

export function getAllActivationEvents(): ActivationEvent[] {
  return [...ALL_ACTIVATION_EVENTS];
}
