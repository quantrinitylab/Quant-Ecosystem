import { describe, it, expect, vi } from 'vitest';
import { VoiceIntentBridge } from '../voice/voice-intent-bridge.js';
import type { VoiceBridgeEvent } from '../voice/voice-intent-bridge.js';
import type { TranscriptionResult } from '../voice/types.js';

function createMockSTT(transcript = 'send an email to bob@test.com') {
  return {
    transcribe: vi.fn().mockResolvedValue({
      text: transcript,
      language: 'en',
      duration: 2.5,
      segments: [{ text: transcript, start: 0, end: 2.5, confidence: 0.95 }],
    } satisfies TranscriptionResult),
  };
}

function createMockOrchestrator() {
  return {
    processNaturalLanguage: vi.fn().mockResolvedValue({
      success: true,
      results: [{ success: true, data: { sent: true }, toolId: 'quantmail.send' }],
      plan: {
        id: 'plan-mock-1',
        steps: [{ stepId: 'step-1', toolId: 'quantmail.send', params: { to: 'bob@test.com' } }],
        description: 'Send email',
      },
      totalLatencyMs: 100,
    }),
  };
}

describe('VoiceIntentBridge', () => {
  it('processVoiceCommand transcribes then passes to orchestrator', async () => {
    const stt = createMockSTT();
    const orchestrator = createMockOrchestrator();
    const bridge = new VoiceIntentBridge(stt as any, orchestrator);

    const audio = Buffer.from('fake-audio-data');
    const result = await bridge.processVoiceCommand(audio, 'user-1', 'session-1');

    expect(stt.transcribe).toHaveBeenCalledWith(audio);
    expect(orchestrator.processNaturalLanguage).toHaveBeenCalledWith(
      'send an email to bob@test.com',
      { userId: 'user-1', sessionId: 'session-1' },
    );
    expect(result.transcript).toBe('send an email to bob@test.com');
    expect(result.results.length).toBeGreaterThan(0);
  });

  it('returns transcript alongside results', async () => {
    const stt = createMockSTT('schedule meeting tomorrow');
    const orchestrator = createMockOrchestrator();
    const bridge = new VoiceIntentBridge(stt as any, orchestrator);

    const result = await bridge.processVoiceCommand(Buffer.from('audio'), 'user-1', 'session-1');

    expect(result.transcript).toBe('schedule meeting tomorrow');
    expect(result.plan).toBeDefined();
    expect(result.plan.id).toBeTruthy();
    expect(result.totalLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it('handles STT failure gracefully (throws error)', async () => {
    const stt = {
      transcribe: vi.fn().mockRejectedValue(new Error('Microphone unavailable')),
    };
    const orchestrator = createMockOrchestrator();
    const bridge = new VoiceIntentBridge(stt as any, orchestrator);

    await expect(
      bridge.processVoiceCommand(Buffer.from('audio'), 'user-1', 'session-1'),
    ).rejects.toThrow('Transcription failed');

    expect(orchestrator.processNaturalLanguage).not.toHaveBeenCalled();
  });

  it('emits progress events (transcribing, planning, executing, complete)', async () => {
    const stt = createMockSTT();
    const orchestrator = createMockOrchestrator();
    const bridge = new VoiceIntentBridge(stt as any, orchestrator);

    const events: VoiceBridgeEvent[] = [];
    bridge.on((e) => events.push(e));

    await bridge.processVoiceCommand(Buffer.from('audio'), 'user-1', 'session-1');

    const eventTypes = events.map((e) => e.type);
    expect(eventTypes).toContain('transcribing');
    expect(eventTypes).toContain('planning');
    expect(eventTypes).toContain('executing');
    expect(eventTypes).toContain('complete');
  });

  it('passes userId/sessionId through to orchestrator', async () => {
    const stt = createMockSTT();
    const orchestrator = createMockOrchestrator();
    const bridge = new VoiceIntentBridge(stt as any, orchestrator);

    await bridge.processVoiceCommand(Buffer.from('audio'), 'user-42', 'sess-xyz');

    expect(orchestrator.processNaturalLanguage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ userId: 'user-42', sessionId: 'sess-xyz' }),
    );
  });

  it('unsubscribe stops receiving events', async () => {
    const stt = createMockSTT();
    const orchestrator = createMockOrchestrator();
    const bridge = new VoiceIntentBridge(stt as any, orchestrator);

    const events: VoiceBridgeEvent[] = [];
    const unsub = bridge.on((e) => events.push(e));
    unsub();

    await bridge.processVoiceCommand(Buffer.from('audio'), 'user-1', 'session-1');
    expect(events).toHaveLength(0);
  });
});
