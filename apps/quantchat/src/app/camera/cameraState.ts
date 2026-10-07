/**
 * cameraState — pure state machine for the camera page.
 *
 * The camera page (`page.tsx`) coordinates several pieces of mutable UI state:
 * camera permission, which physical camera is active (facing mode), the flash
 * mode cycle, and whether a video recording is in progress. Those concerns are
 * inherently component-coupled (they drive `getUserMedia`, `MediaRecorder`,
 * etc.), but the *transition logic* itself is pure and can be modelled — and
 * unit-tested — independently of React and the browser media APIs.
 *
 * This module extracts that pure core as a small reducer so the transitions can
 * be validated deterministically (Task 1.6).
 */

/** Whether the user has granted camera access. */
export type PermissionStatus = 'prompt' | 'granted' | 'denied';

/** Which physical camera is selected. */
export type FacingMode = 'user' | 'environment';

/**
 * Flash behaviour. Cycles off -> torch (rear LED) -> screen (front-camera
 * white-screen flash) -> off, matching the control in `CameraControls.tsx`.
 */
export type FlashMode = 'off' | 'torch' | 'screen';

/** The full observable camera UI state. */
export interface CameraState {
  permissionStatus: PermissionStatus;
  facingMode: FacingMode;
  flashMode: FlashMode;
  /** True while a `MediaRecorder` session is active. */
  isRecording: boolean;
  /** True while a flip is mid-flight (stops re-entrant flips). */
  isFlipping: boolean;
}

/** Actions that drive camera state transitions. */
export type CameraAction =
  | { type: 'PERMISSION_GRANTED' }
  | { type: 'PERMISSION_DENIED' }
  | { type: 'PERMISSION_RESET' }
  | { type: 'TOGGLE_FLASH' }
  | { type: 'FLIP_START' }
  | { type: 'FLIP_COMPLETE' }
  | { type: 'FLIP_FAILED' }
  | { type: 'START_RECORDING' }
  | { type: 'STOP_RECORDING' };

/** The initial state when the camera page mounts. */
export const initialCameraState: CameraState = {
  permissionStatus: 'prompt',
  facingMode: 'user',
  flashMode: 'off',
  isRecording: false,
  isFlipping: false,
};

/**
 * The flash cycle: off -> torch -> screen -> off.
 * Mirrors `nextModeMap` in `page.tsx`.
 */
const NEXT_FLASH_MODE: Record<FlashMode, FlashMode> = {
  off: 'torch',
  torch: 'screen',
  screen: 'off',
};

/** Returns the opposite facing mode (user <-> environment). */
export function oppositeFacing(facing: FacingMode): FacingMode {
  return facing === 'user' ? 'environment' : 'user';
}

/** Returns the next flash mode in the off -> torch -> screen -> off cycle. */
export function nextFlashMode(mode: FlashMode): FlashMode {
  return NEXT_FLASH_MODE[mode];
}

/**
 * Pure reducer for the camera state machine.
 *
 * Transition rules:
 * - Permission: `prompt` may move to `granted` or `denied`; `PERMISSION_RESET`
 *   returns to `prompt`. Permission transitions are always allowed (re-prompt
 *   after denial is permitted), but never leave the three valid values.
 * - Flash: `TOGGLE_FLASH` advances the off -> torch -> screen -> off cycle.
 * - Flip: `FLIP_START` flips `facingMode` immediately and marks `isFlipping`;
 *   a flip that is already in progress is ignored (re-entrancy guard).
 *   `FLIP_COMPLETE` clears the flag; `FLIP_FAILED` reverts the facing change
 *   and clears the flag.
 * - Recording: `START_RECORDING` only succeeds when permission is `granted`
 *   and not already recording. `STOP_RECORDING` always clears recording.
 *
 * The reducer never mutates its input and always returns a valid state.
 */
export function cameraReducer(state: CameraState, action: CameraAction): CameraState {
  switch (action.type) {
    case 'PERMISSION_GRANTED':
      return { ...state, permissionStatus: 'granted' };

    case 'PERMISSION_DENIED':
      // A denied camera cannot be recording.
      return { ...state, permissionStatus: 'denied', isRecording: false };

    case 'PERMISSION_RESET':
      return { ...state, permissionStatus: 'prompt' };

    case 'TOGGLE_FLASH':
      return { ...state, flashMode: nextFlashMode(state.flashMode) };

    case 'FLIP_START': {
      // Ignore re-entrant flips — a flip already in flight must finish first.
      if (state.isFlipping) return state;
      return { ...state, facingMode: oppositeFacing(state.facingMode), isFlipping: true };
    }

    case 'FLIP_COMPLETE':
      return { ...state, isFlipping: false };

    case 'FLIP_FAILED':
      // Revert the optimistic facing change and clear the in-flight flag.
      if (!state.isFlipping) return state;
      return { ...state, facingMode: oppositeFacing(state.facingMode), isFlipping: false };

    case 'START_RECORDING': {
      // Can only record with a granted camera, and never start twice.
      if (state.permissionStatus !== 'granted' || state.isRecording) return state;
      return { ...state, isRecording: true };
    }

    case 'STOP_RECORDING':
      return { ...state, isRecording: false };

    default:
      return state;
  }
}
