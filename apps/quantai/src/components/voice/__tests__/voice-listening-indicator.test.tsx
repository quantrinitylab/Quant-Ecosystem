// ============================================================================
// F-047 — Dead interim-transcript ticker removed from VoiceModeModal.
// The STT pipeline here is getUserMedia + AudioWorklet PCM capture -> WAV ->
// POST /api/voice/stt (server-side Meta STT). There is no Web Speech
// recognition anywhere in this modal, so interim results cannot exist. The
// old "Listening: ..." ticker could never render. It is replaced by an
// honest listening indicator driven by the REAL capture state, plus a real
// elapsed-recording-time display (improvement pass, F-047).
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { VoiceModeModal, formatCaptureElapsed } from '../VoiceModeModal';

const captureMock = vi.hoisted(() => ({
  state: 'idle' as 'idle' | 'requesting' | 'capturing' | 'denied' | 'error',
  error: null as string | null,
}));

vi.mock('../../../hooks/useVoiceCapture', () => ({
  useVoiceCapture: () => ({
    state: captureMock.state,
    audioLevel: captureMock.state === 'capturing' ? 0.4 : 0,
    error: captureMock.error,
    startCapture: async () => {},
    stopCapture: async () => null,
    cancelCapture: () => {},
  }),
}));

function renderModal(): string {
  return renderToStaticMarkup(
    React.createElement(VoiceModeModal, {
      isOpen: true,
      onClose: vi.fn(),
      initialPersonaId: 'aura',
    }),
  );
}

describe('F-047: honest listening indicator (no fake interim transcripts)', () => {
  beforeEach(() => {
    captureMock.state = 'idle';
    captureMock.error = null;
  });

  describe('formatCaptureElapsed', () => {
    it('formats whole seconds as mm:ss', () => {
      expect(formatCaptureElapsed(0)).toBe('00:00');
      expect(formatCaptureElapsed(5)).toBe('00:05');
      expect(formatCaptureElapsed(59)).toBe('00:59');
      expect(formatCaptureElapsed(60)).toBe('01:00');
      expect(formatCaptureElapsed(65)).toBe('01:05');
      expect(formatCaptureElapsed(600)).toBe('10:00');
      expect(formatCaptureElapsed(3599)).toBe('59:59');
    });

    it('clamps negatives and floors fractions', () => {
      expect(formatCaptureElapsed(-3)).toBe('00:00');
      expect(formatCaptureElapsed(5.9)).toBe('00:05');
    });
  });

  describe('dead interim ticker is gone', () => {
    it('never renders the old "Listening:" interim row when idle', () => {
      expect(renderModal()).not.toContain('Listening:');
    });

    it('never renders the old "Listening:" interim row while capturing', () => {
      captureMock.state = 'capturing';
      expect(renderModal()).not.toContain('Listening:');
    });

    it('never renders the old "Listening:" interim row when capture is denied', () => {
      captureMock.state = 'denied';
      captureMock.error = 'Microphone access denied. Allow mic permission to use voice mode.';
      expect(renderModal()).not.toContain('Listening:');
    });
  });

  describe('honest listening indicator driven by real capture state', () => {
    it('shows the listening indicator with elapsed time while capturing', () => {
      captureMock.state = 'capturing';
      const html = renderModal();
      expect(html).toContain('data-testid="listening-indicator"');
      expect(html).toContain('role="status"');
      expect(html).toContain('Listening');
      // Effects don't run under SSR, so elapsed starts at the real 0 baseline.
      expect(html).toContain('00:00');
      expect(html).toContain('tap mic again to transcribe');
      expect(html).toContain('aria-label="Listening, recording 00:00"');
    });

    it('hides the listening indicator when idle', () => {
      expect(renderModal()).not.toContain('data-testid="listening-indicator"');
    });

    it('hides the listening indicator while permission is being requested', () => {
      captureMock.state = 'requesting';
      expect(renderModal()).not.toContain('data-testid="listening-indicator"');
    });

    it('hides the listening indicator on capture error', () => {
      captureMock.state = 'error';
      captureMock.error = 'Could not start microphone.';
      const html = renderModal();
      expect(html).not.toContain('data-testid="listening-indicator"');
      // The honest mic-error state is still shown instead.
      expect(html).toContain('Could not start microphone.');
    });
  });

  describe('mic permission denied state (edge case)', () => {
    it('shows the permission-denied message instead of any listening UI', () => {
      captureMock.state = 'denied';
      captureMock.error = 'Microphone access denied. Allow mic permission to use voice mode.';
      const html = renderModal();
      expect(html).toContain('Microphone access denied.');
      expect(html).not.toContain('data-testid="listening-indicator"');
    });
  });
});
