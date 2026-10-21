import { describe, it, expect } from 'vitest';
import {
  isDriveUploadAction,
  driveUrlWithoutAction,
  DRIVE_ACTION_UPLOAD,
} from '../drive-actions';

describe('drive-actions — /drive URL action param', () => {
  describe('isDriveUploadAction', () => {
    it('detects action=upload', () => {
      expect(isDriveUploadAction(new URLSearchParams('action=upload'))).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(isDriveUploadAction(new URLSearchParams('action=Upload'))).toBe(true);
      expect(isDriveUploadAction(new URLSearchParams('action=UPLOAD'))).toBe(true);
    });

    it('ignores other actions and missing params', () => {
      expect(isDriveUploadAction(new URLSearchParams('action=share'))).toBe(false);
      expect(isDriveUploadAction(new URLSearchParams('tab=files'))).toBe(false);
      expect(isDriveUploadAction(new URLSearchParams(''))).toBe(false);
      expect(isDriveUploadAction(null)).toBe(false);
      expect(isDriveUploadAction(undefined)).toBe(false);
    });

    it('does not false-positive on an empty action value', () => {
      expect(isDriveUploadAction(new URLSearchParams('action='))).toBe(false);
    });
  });

  describe('driveUrlWithoutAction', () => {
    it('strips action=upload while keeping tab and other params', () => {
      expect(driveUrlWithoutAction(new URLSearchParams('tab=starred&action=upload'))).toBe(
        '/drive?tab=starred',
      );
    });

    it('returns a bare /drive when action was the only param', () => {
      expect(driveUrlWithoutAction(new URLSearchParams('action=upload'))).toBe('/drive');
    });

    it('is a no-op without an action param', () => {
      expect(driveUrlWithoutAction(new URLSearchParams('tab=recent'))).toBe('/drive?tab=recent');
      expect(driveUrlWithoutAction(new URLSearchParams(''))).toBe('/drive');
      expect(driveUrlWithoutAction(null)).toBe('/drive');
    });

    it('respects a custom base path', () => {
      expect(
        driveUrlWithoutAction(new URLSearchParams('action=upload&tab=vault'), '/drive'),
      ).toBe('/drive?tab=vault');
    });
  });

  describe('constant', () => {
    it('exposes the canonical upload action token', () => {
      expect(DRIVE_ACTION_UPLOAD).toBe('upload');
    });
  });
});
