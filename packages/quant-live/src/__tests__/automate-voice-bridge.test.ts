import { describe, it, expect } from 'vitest';
import { AutomateVoiceBridge } from '../integrations/automate-voice-bridge.js';

describe('AutomateVoiceBridge', () => {
  it('creates automation from schedule voice command', async () => {
    const bridge = new AutomateVoiceBridge();
    const result = await bridge.handleAutomationCommand('every day at 9am post a reel');
    expect(result.success).toBe(true);
    expect(result.action).toBe('create');
    expect(result.automationId).toBeDefined();
    expect(result.spokenResponse).toContain('Automation created');
  });

  it('lists automations', async () => {
    const bridge = new AutomateVoiceBridge();
    await bridge.handleAutomationCommand('every morning send a summary');
    const list = bridge.listAutomations();
    expect(list.success).toBe(true);
    expect(list.spokenResponse).toContain('1 automations');
  });

  it('toggles automation on/off', async () => {
    const bridge = new AutomateVoiceBridge();
    await bridge.handleAutomationCommand('every day at 9am post a reel');
    const result = bridge.toggleAutomation('reel', false);
    expect(result.success).toBe(true);
    expect(result.spokenResponse).toContain('paused');
  });

  it('gets automation status', async () => {
    const bridge = new AutomateVoiceBridge();
    await bridge.handleAutomationCommand('every weekday do send report');
    const status = bridge.getAutomationStatus('report');
    expect(status.success).toBe(true);
    expect(status.spokenResponse).toContain('active');
  });

  it('creates event-triggered automation', async () => {
    const bridge = new AutomateVoiceBridge();
    const result = await bridge.handleAutomationCommand('when I get email forward to chat');
    expect(result.success).toBe(true);
    expect(result.action).toBe('create');
    expect(result.spokenResponse).toContain('when');
  });

  it('returns empty list message', () => {
    const bridge = new AutomateVoiceBridge();
    const list = bridge.listAutomations();
    expect(list.spokenResponse).toContain('no automations');
  });
});
