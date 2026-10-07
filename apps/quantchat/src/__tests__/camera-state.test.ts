import { describe, it, expect } from 'vitest';
import {
  cameraReducer,
  initialCameraState,
  nextFlashMode,
  oppositeFacing,
  type CameraState,
  type FlashMode,
} from '../app/camera/cameraState';

// Unit tests for the camera state machine transitions (Task 1.6):
// permission states, flash cycle, facing-mode flip, and recording start/stop.

describe('camera state machine — initial state', () => {
  it('starts in prompt / front-camera / flash-off / idle', () => {
    expect(initialCameraState).toEqual<CameraState>({
      permissionStatus: 'prompt',
      facingMode: 'user',
      flashMode: 'off',
      isRecording: false,
      isFlipping: false,
    });
  });
});

describe('camera state machine — permission transitions', () => {
  it('prompt -> granted', () => {
    const next = cameraReducer(initialCameraState, { type: 'PERMISSION_GRANTED' });
    expect(next.permissionStatus).toBe('granted');
  });

  it('prompt -> denied', () => {
    const next = cameraReducer(initialCameraState, { type: 'PERMISSION_DENIED' });
    expect(next.permissionStatus).toBe('denied');
  });

  it('denied -> prompt via reset (re-prompt allowed)', () => {
    const denied = cameraReducer(initialCameraState, { type: 'PERMISSION_DENIED' });
    const reset = cameraReducer(denied, { type: 'PERMISSION_RESET' });
    expect(reset.permissionStatus).toBe('prompt');
  });

  it('denying permission also stops any in-progress recording', () => {
    const granted = cameraReducer(initialCameraState, { type: 'PERMISSION_GRANTED' });
    const recording = cameraReducer(granted, { type: 'START_RECORDING' });
    expect(recording.isRecording).toBe(true);

    const denied = cameraReducer(recording, { type: 'PERMISSION_DENIED' });
    expect(denied.permissionStatus).toBe('denied');
    expect(denied.isRecording).toBe(false);
  });
});

describe('camera state machine — flash cycle (off -> torch -> screen -> off)', () => {
  it('advances through the full cycle and wraps back to off', () => {
    let state = initialCameraState;
    expect(state.flashMode).toBe<FlashMode>('off');

    state = cameraReducer(state, { type: 'TOGGLE_FLASH' });
    expect(state.flashMode).toBe<FlashMode>('torch');

    state = cameraReducer(state, { type: 'TOGGLE_FLASH' });
    expect(state.flashMode).toBe<FlashMode>('screen');

    state = cameraReducer(state, { type: 'TOGGLE_FLASH' });
    expect(state.flashMode).toBe<FlashMode>('off');
  });

  it('nextFlashMode helper matches the documented cycle', () => {
    expect(nextFlashMode('off')).toBe('torch');
    expect(nextFlashMode('torch')).toBe('screen');
    expect(nextFlashMode('screen')).toBe('off');
  });

  it('cycling flash three times is a no-op on flash mode', () => {
    let state = initialCameraState;
    for (let i = 0; i < 3; i++) {
      state = cameraReducer(state, { type: 'TOGGLE_FLASH' });
    }
    expect(state.flashMode).toBe('off');
  });
});

describe('camera state machine — facing-mode flip', () => {
  it('FLIP_START flips user -> environment and marks flipping', () => {
    const next = cameraReducer(initialCameraState, { type: 'FLIP_START' });
    expect(next.facingMode).toBe('environment');
    expect(next.isFlipping).toBe(true);
  });

  it('FLIP_COMPLETE clears the in-flight flag and keeps the new facing', () => {
    const flipping = cameraReducer(initialCameraState, { type: 'FLIP_START' });
    const done = cameraReducer(flipping, { type: 'FLIP_COMPLETE' });
    expect(done.facingMode).toBe('environment');
    expect(done.isFlipping).toBe(false);
  });

  it('a full flip cycle round-trips back to the front camera', () => {
    let state = cameraReducer(initialCameraState, { type: 'FLIP_START' });
    state = cameraReducer(state, { type: 'FLIP_COMPLETE' });
    state = cameraReducer(state, { type: 'FLIP_START' });
    state = cameraReducer(state, { type: 'FLIP_COMPLETE' });
    expect(state.facingMode).toBe('user');
    expect(state.isFlipping).toBe(false);
  });

  it('ignores a re-entrant FLIP_START while a flip is already in progress', () => {
    const flipping = cameraReducer(initialCameraState, { type: 'FLIP_START' });
    const reentrant = cameraReducer(flipping, { type: 'FLIP_START' });
    // Facing must NOT flip back; the second action is ignored.
    expect(reentrant.facingMode).toBe('environment');
    expect(reentrant).toBe(flipping);
  });

  it('FLIP_FAILED reverts the optimistic facing change', () => {
    const flipping = cameraReducer(initialCameraState, { type: 'FLIP_START' });
    const failed = cameraReducer(flipping, { type: 'FLIP_FAILED' });
    expect(failed.facingMode).toBe('user');
    expect(failed.isFlipping).toBe(false);
  });

  it('oppositeFacing helper toggles both directions', () => {
    expect(oppositeFacing('user')).toBe('environment');
    expect(oppositeFacing('environment')).toBe('user');
  });
});

describe('camera state machine — recording start/stop', () => {
  it('starts recording only after permission is granted', () => {
    const blocked = cameraReducer(initialCameraState, { type: 'START_RECORDING' });
    expect(blocked.isRecording).toBe(false);

    const granted = cameraReducer(initialCameraState, { type: 'PERMISSION_GRANTED' });
    const recording = cameraReducer(granted, { type: 'START_RECORDING' });
    expect(recording.isRecording).toBe(true);
  });

  it('does not double-start an already-running recording', () => {
    const granted = cameraReducer(initialCameraState, { type: 'PERMISSION_GRANTED' });
    const recording = cameraReducer(granted, { type: 'START_RECORDING' });
    const again = cameraReducer(recording, { type: 'START_RECORDING' });
    expect(again).toBe(recording);
  });

  it('stops recording on STOP_RECORDING', () => {
    const granted = cameraReducer(initialCameraState, { type: 'PERMISSION_GRANTED' });
    const recording = cameraReducer(granted, { type: 'START_RECORDING' });
    const stopped = cameraReducer(recording, { type: 'STOP_RECORDING' });
    expect(stopped.isRecording).toBe(false);
  });

  it('start -> stop round-trip returns to idle without other changes', () => {
    const granted = cameraReducer(initialCameraState, { type: 'PERMISSION_GRANTED' });
    const recording = cameraReducer(granted, { type: 'START_RECORDING' });
    const stopped = cameraReducer(recording, { type: 'STOP_RECORDING' });
    expect(stopped).toEqual({ ...granted, isRecording: false });
  });
});

describe('camera state machine — purity', () => {
  it('never mutates the input state object', () => {
    const frozen = Object.freeze({ ...initialCameraState });
    expect(() => cameraReducer(frozen, { type: 'TOGGLE_FLASH' })).not.toThrow();
    expect(frozen.flashMode).toBe('off');
  });

  it('unknown actions return the same state reference', () => {
    // @ts-expect-error — exercising the default branch with an invalid action.
    const next = cameraReducer(initialCameraState, { type: 'NOPE' });
    expect(next).toBe(initialCameraState);
  });
});
