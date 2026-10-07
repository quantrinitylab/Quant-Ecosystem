import { describe, expect, it } from 'vitest';
import { TutorialEngine, createTutorialEngine, getAppTutorialSteps } from '../tutorials.js';
import type { AppId } from '../types.js';

describe('Tutorial Overlays', () => {
  describe('tutorial step progression', () => {
    it('creates a tutorial for an app', () => {
      const engine = createTutorialEngine();
      const tutorial = engine.createTutorial('quant-chat');

      expect(tutorial.appId).toBe('quant-chat');
      expect(tutorial.steps.length).toBeGreaterThan(0);
      expect(tutorial.currentStepIndex).toBe(0);
      expect(tutorial.completed).toBe(false);
      expect(tutorial.dismissed).toBe(false);
    });

    it('advances through steps', () => {
      const engine = new TutorialEngine();
      const tutorial = engine.createTutorial('quant-mail');

      const step1 = engine.getCurrentStep(tutorial.id);
      expect(step1).not.toBeNull();
      expect(step1!.id).toBe('mail-welcome');

      const updated = engine.advanceStep(tutorial.id);
      expect(updated!.currentStepIndex).toBe(1);
      expect(updated!.progress).toBeGreaterThan(0);

      const step2 = engine.getCurrentStep(tutorial.id);
      expect(step2!.id).toBe('mail-compose');
    });

    it('completes tutorial after all steps', () => {
      const engine = new TutorialEngine();
      const tutorial = engine.createTutorial('quant-drive');
      const totalSteps = tutorial.steps.length;

      let current = tutorial;
      for (let i = 0; i < totalSteps; i++) {
        const next = engine.advanceStep(current.id);
        if (next) current = next;
      }

      expect(current.completed).toBe(true);
      expect(current.progress).toBe(1);
    });

    it('returns null for non-existent tutorial', () => {
      const engine = createTutorialEngine();
      const result = engine.advanceStep('non-existent');
      expect(result).toBeNull();
    });

    it('does not advance completed tutorials', () => {
      const engine = new TutorialEngine();
      const tutorial = engine.createTutorial('quant-drive');

      // Complete all steps
      for (let i = 0; i < tutorial.steps.length; i++) {
        engine.advanceStep(tutorial.id);
      }

      const afterComplete = engine.advanceStep(tutorial.id);
      expect(afterComplete!.completed).toBe(true);
    });
  });

  describe('dismiss and skip', () => {
    it('dismisses a tutorial', () => {
      const engine = createTutorialEngine();
      const tutorial = engine.createTutorial('quant-chat');

      const dismissed = engine.dismissTutorial(tutorial.id);
      expect(dismissed!.dismissed).toBe(true);
    });

    it('skips a tutorial', () => {
      const engine = createTutorialEngine();
      const tutorial = engine.createTutorial('quant-edits');

      const skipped = engine.skipTutorial(tutorial.id);
      expect(skipped!.dismissed).toBe(true);
    });

    it('returns null current step after dismiss', () => {
      const engine = createTutorialEngine();
      const tutorial = engine.createTutorial('quant-chat');
      engine.dismissTutorial(tutorial.id);

      const step = engine.getCurrentStep(tutorial.id);
      expect(step).toBeNull();
    });

    it('does not advance dismissed tutorials', () => {
      const engine = createTutorialEngine();
      const tutorial = engine.createTutorial('quant-mail');
      engine.dismissTutorial(tutorial.id);

      const result = engine.advanceStep(tutorial.id);
      expect(result!.dismissed).toBe(true);
      expect(result!.currentStepIndex).toBe(0);
    });
  });

  describe('per-app tutorial sequences', () => {
    const apps: AppId[] = [
      'quant-chat',
      'quant-mail',
      'quant-edits',
      'quant-drive',
      'quant-meet',
      'quant-calendar',
      'quant-tasks',
      'quant-code',
      'quant-social',
      'quant-ads',
      'quant-pay',
      'quant-photos',
      'quant-mobile',
    ];

    it.each(apps)('has tutorial steps for %s', (appId) => {
      const steps = getAppTutorialSteps(appId);
      expect(steps.length).toBeGreaterThan(0);
    });

    it('each step has required fields', () => {
      const steps = getAppTutorialSteps('quant-chat');
      for (const step of steps) {
        expect(step.id).toBeTruthy();
        expect(step.title).toBeTruthy();
        expect(step.content).toBeTruthy();
        expect(step.position).toBeTruthy();
        expect(typeof step.allowDismiss).toBe('boolean');
      }
    });

    it('first step of each app is a welcome step', () => {
      for (const appId of apps) {
        const steps = getAppTutorialSteps(appId);
        expect(steps[0]!.id).toContain('welcome');
      }
    });
  });

  describe('progress tracking', () => {
    it('starts at 0 progress', () => {
      const engine = createTutorialEngine();
      const tutorial = engine.createTutorial('quant-chat');
      expect(engine.getProgress(tutorial.id)).toBe(0);
    });

    it('tracks progress as steps advance', () => {
      const engine = createTutorialEngine();
      const tutorial = engine.createTutorial('quant-chat');

      engine.advanceStep(tutorial.id);
      const progress = engine.getProgress(tutorial.id);
      expect(progress).toBeGreaterThan(0);
      expect(progress).toBeLessThan(1);
    });

    it('reaches 1 when completed', () => {
      const engine = createTutorialEngine();
      const tutorial = engine.createTutorial('quant-drive');

      for (let i = 0; i < tutorial.steps.length; i++) {
        engine.advanceStep(tutorial.id);
      }

      expect(engine.getProgress(tutorial.id)).toBe(1);
    });
  });
});
