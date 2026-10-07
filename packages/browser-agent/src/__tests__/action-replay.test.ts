import { ActionReplayRecorder } from '../audit/action-replay.js';
import type { ReplayEntry } from '../types.js';

describe('ActionReplayRecorder', () => {
  let recorder: ActionReplayRecorder;
  beforeEach(() => {
    recorder = new ActionReplayRecorder();
  });

  it('starts recording and records entries', () => {
    recorder.startRecording('s1');
    const entry: ReplayEntry = {
      timestamp: 1000,
      action: { type: 'click', selector: '#btn' },
      result: { success: true },
      screenshotUri: 'file:///snap.png',
    };
    recorder.record('s1', entry);
    expect(recorder.getReplay('s1')).toHaveLength(1);
  });

  it('throws when recording without starting', () => {
    expect(() =>
      recorder.record('nope', {
        timestamp: 1,
        action: { type: 'screenshot' },
        result: { success: true },
      }),
    ).toThrow();
  });

  it('exportAsJSON produces valid JSON', () => {
    recorder.startRecording('s1');
    recorder.record('s1', {
      timestamp: 1,
      action: { type: 'screenshot' },
      result: { success: true },
    });
    const json = recorder.exportAsJSON('s1');
    expect(JSON.parse(json)).toHaveLength(1);
  });

  it('getTimeline returns entries in chronological order', () => {
    recorder.startRecording('s1');
    recorder.record('s1', {
      timestamp: 300,
      action: { type: 'screenshot' },
      result: { success: true },
    });
    recorder.record('s1', {
      timestamp: 100,
      action: { type: 'click', selector: '#a' },
      result: { success: true },
    });
    recorder.record('s1', {
      timestamp: 200,
      action: { type: 'wait', ms: 50 },
      result: { success: true },
    });
    const timeline = recorder.getTimeline('s1');
    expect(timeline[0]!.timestamp).toBe(100);
    expect(timeline[2]!.timestamp).toBe(300);
  });

  it('stores screenshot URIs not base64', () => {
    recorder.startRecording('s1');
    recorder.record('s1', {
      timestamp: 1,
      action: { type: 'screenshot' },
      result: { success: true },
      screenshotUri: 's3://bucket/shot.png',
    });
    expect(recorder.getReplay('s1')[0]!.screenshotUri).not.toMatch(/^data:/);
  });
});
