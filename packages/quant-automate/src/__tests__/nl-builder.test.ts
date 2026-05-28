import { describe, it, expect } from 'vitest';
import { NLAutomationBuilder } from '../nl-builder.js';

describe('NLAutomationBuilder', () => {
  const builder = new NLAutomationBuilder();

  it('should parse schedule-based automation from natural language', () => {
    const result = builder.parse('Every Monday send email summary to the team');

    expect(result.confidence).toBe('high');
    expect(result.automation.trigger?.type).toBe('schedule');
    if (result.automation.trigger?.type === 'schedule') {
      expect(result.automation.trigger.cron.expression).toContain('1'); // Monday
    }
    expect(result.automation.steps?.length).toBeGreaterThan(0);
    expect(result.automation.steps?.[0]?.toolId).toBe('mail.send');
  });

  it('should parse event-based automation from natural language', () => {
    const result = builder.parse('When a new email is received, send a notification');

    expect(result.confidence).toBe('high');
    expect(result.automation.trigger?.type).toBe('event');
    if (result.automation.trigger?.type === 'event') {
      expect(result.automation.trigger.eventName).toBe('email.received');
    }
    expect(result.automation.steps?.length).toBeGreaterThan(0);
  });

  it('should parse multi-step automation', () => {
    const result = builder.parse('Every day summarize inbox and send email report and notify team');

    expect(result.confidence).toBe('high');
    expect(result.automation.trigger?.type).toBe('schedule');
    expect(result.automation.steps?.length).toBeGreaterThanOrEqual(2);
  });

  it('should handle ambiguous input with low confidence', () => {
    const result = builder.parse('do something cool later');

    expect(result.confidence).toBe('low');
    expect(result.suggestions).toBeDefined();
    expect(result.suggestions!.length).toBeGreaterThan(0);
  });

  it('should return draft status for unparseable input', () => {
    const result = builder.parse('');

    expect(result.automation.status).toBe('draft');
    expect(result.confidence).toBe('low');
    expect(result.suggestions).toBeDefined();
  });

  it('should parse webhook automation', () => {
    const result = builder.parse('On webhook /deploy run tests and send notification');

    expect(result.confidence).toBe('high');
    expect(result.automation.trigger?.type).toBe('webhook');
    if (result.automation.trigger?.type === 'webhook') {
      expect(result.automation.trigger.path).toBe('/deploy');
    }
    expect(result.automation.steps?.length).toBeGreaterThanOrEqual(1);
  });

  it('should parse daily automation with time', () => {
    const result = builder.parse('Every day at 9am send email digest');

    expect(result.automation.trigger?.type).toBe('schedule');
    if (result.automation.trigger?.type === 'schedule') {
      expect(result.automation.trigger.cron.expression).toContain('9');
    }
  });

  it('should parse file upload event automation', () => {
    const result = builder.parse('When a file is uploaded, analyze and send notification');

    expect(result.automation.trigger?.type).toBe('event');
    if (result.automation.trigger?.type === 'event') {
      expect(result.automation.trigger.eventName).toBe('file.uploaded');
    }
    expect(result.automation.steps?.length).toBeGreaterThanOrEqual(1);
  });
});
