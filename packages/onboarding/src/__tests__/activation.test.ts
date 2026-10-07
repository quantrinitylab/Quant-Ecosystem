import { describe, expect, it } from 'vitest';
import {
  ActivationTracker,
  createActivationTracker,
  getAllActivationEvents,
} from '../activation.js';

describe('Activation Tracking', () => {
  describe('ActivationTracker', () => {
    it('creates a tracker with default metrics', () => {
      const tracker = createActivationTracker('user-1');
      const metrics = tracker.getMetrics();

      expect(metrics.userId).toBe('user-1');
      expect(metrics.completedEvents).toEqual([]);
      expect(metrics.activationRate).toBe(0);
      expect(metrics.activated).toBe(false);
      expect(metrics.activationRateTarget).toBe(0.4);
      expect(metrics.maxOnboardingSteps).toBe(3);
      expect(metrics.skippedAll).toBe(false);
    });

    it('tracks activation events', () => {
      const tracker = new ActivationTracker('user-2');
      tracker.trackEvent('first_message_sent');

      expect(tracker.getCompletedEvents()).toContain('first_message_sent');
      expect(tracker.getMetrics().activationRate).toBeGreaterThan(0);
    });

    it('does not duplicate events', () => {
      const tracker = new ActivationTracker('user-3');
      tracker.trackEvent('first_doc_created');
      tracker.trackEvent('first_doc_created');

      expect(tracker.getCompletedEvents()).toHaveLength(1);
    });

    it('calculates activation rate correctly', () => {
      const tracker = new ActivationTracker('user-4');
      const allEvents = getAllActivationEvents();
      const totalEvents = allEvents.length;

      tracker.trackEvent(allEvents[0]!);
      expect(tracker.getMetrics().activationRate).toBeCloseTo(1 / totalEvents);

      tracker.trackEvent(allEvents[1]!);
      expect(tracker.getMetrics().activationRate).toBeCloseTo(2 / totalEvents);
    });
  });

  describe('40% activation gate enforcement', () => {
    it('does not meet gate with no events', () => {
      const tracker = createActivationTracker('user-5');
      expect(tracker.meetsActivationGate()).toBe(false);
      expect(tracker.isActivated()).toBe(false);
    });

    it('meets gate when enough events are tracked', () => {
      const tracker = createActivationTracker('user-6');
      const allEvents = getAllActivationEvents();
      // 40% of 8 events = 3.2, so need 4 events
      const eventsNeeded = Math.ceil(allEvents.length * 0.4);

      for (let i = 0; i < eventsNeeded; i++) {
        tracker.trackEvent(allEvents[i]!);
      }

      expect(tracker.meetsActivationGate()).toBe(true);
      expect(tracker.isActivated()).toBe(true);
    });

    it('does not meet gate with insufficient events', () => {
      const tracker = createActivationTracker('user-7');
      const allEvents = getAllActivationEvents();
      const eventsNeeded = Math.ceil(allEvents.length * 0.4);

      // Track one fewer than needed
      for (let i = 0; i < eventsNeeded - 1; i++) {
        tracker.trackEvent(allEvents[i]!);
      }

      expect(tracker.meetsActivationGate()).toBe(false);
    });
  });

  describe('3-step-max onboarding with skip-everything', () => {
    it('limits onboarding to 3 steps', () => {
      const tracker = createActivationTracker('user-8');
      const metrics = tracker.getMetrics();
      expect(metrics.maxOnboardingSteps).toBe(3);
    });

    it('tracks onboarding step completion', () => {
      const tracker = createActivationTracker('user-9');
      tracker.completeOnboardingStep();
      tracker.completeOnboardingStep();

      expect(tracker.getMetrics().onboardingStepsCompleted).toBe(2);
      expect(tracker.isOnboardingComplete()).toBe(false);
    });

    it('does not exceed max steps', () => {
      const tracker = createActivationTracker('user-10');
      tracker.completeOnboardingStep();
      tracker.completeOnboardingStep();
      tracker.completeOnboardingStep();
      tracker.completeOnboardingStep(); // Should not increase beyond 3

      expect(tracker.getMetrics().onboardingStepsCompleted).toBe(3);
      expect(tracker.isOnboardingComplete()).toBe(true);
    });

    it('supports skip-everything', () => {
      const tracker = createActivationTracker('user-11');
      tracker.skipEverything();

      const metrics = tracker.getMetrics();
      expect(metrics.skippedAll).toBe(true);
      expect(metrics.onboardingStepsCompleted).toBe(3);
      expect(tracker.isOnboardingComplete()).toBe(true);
    });
  });

  describe('getRemainingEvents', () => {
    it('returns all events when none completed', () => {
      const tracker = createActivationTracker('user-12');
      const remaining = tracker.getRemainingEvents();
      expect(remaining).toHaveLength(getAllActivationEvents().length);
    });

    it('excludes completed events', () => {
      const tracker = createActivationTracker('user-13');
      tracker.trackEvent('first_search');
      const remaining = tracker.getRemainingEvents();
      expect(remaining).not.toContain('first_search');
      expect(remaining.length).toBe(getAllActivationEvents().length - 1);
    });
  });

  describe('getAllActivationEvents', () => {
    it('returns all available activation events', () => {
      const events = getAllActivationEvents();
      expect(events.length).toBe(8);
      expect(events).toContain('first_message_sent');
      expect(events).toContain('first_doc_created');
      expect(events).toContain('first_file_uploaded');
    });
  });
});
