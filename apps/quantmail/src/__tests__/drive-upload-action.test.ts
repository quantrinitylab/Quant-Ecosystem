// ============================================================================
// drive-upload-action.test.ts — QM fix: `/drive?action=upload` deep link must
// open the upload picker (super-app header quick action).
//
// The picker trigger lives in DrivePageContent and is exercised here through
// the pure param helpers it uses: isUploadAction gates the one-shot effect,
// driveUrlAfterConsumingAction builds the cleaned URL the effect replaces
// with so the picker doesn't reopen.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { isUploadAction, driveUrlAfterConsumingAction } from '../lib/drive-action-params';

describe('drive action=upload deep link', () => {
  it('recognizes the upload action param', () => {
    expect(isUploadAction('upload')).toBe(true);
    expect(isUploadAction('UPLOAD')).toBe(true);
    expect(isUploadAction('  upload  ')).toBe(true);
  });

  it('rejects non-upload actions and missing values', () => {
    expect(isUploadAction(null)).toBe(false);
    expect(isUploadAction(undefined)).toBe(false);
    expect(isUploadAction('')).toBe(false);
    expect(isUploadAction('new')).toBe(false);
    expect(isUploadAction('download')).toBe(false);
  });

  it('consumes the action param while preserving other params (e.g. tab)', () => {
    expect(driveUrlAfterConsumingAction('action=upload&tab=shared')).toBe('/drive?tab=shared');
    expect(driveUrlAfterConsumingAction('tab=shared&action=upload')).toBe('/drive?tab=shared');
  });

  it('defaults to the home tab when no tab param is present', () => {
    expect(driveUrlAfterConsumingAction('action=upload')).toBe('/drive?tab=home');
    expect(driveUrlAfterConsumingAction('')).toBe('/drive?tab=home');
  });

  it('round-trips: the cleaned URL no longer triggers the upload gate', () => {
    const cleaned = driveUrlAfterConsumingAction('action=upload');
    const nextParams = new URLSearchParams(cleaned.split('?')[1] ?? '');
    expect(isUploadAction(nextParams.get('action'))).toBe(false);
  });
});
