// ============================================================================
// QuantAI — F-009: Voice modal must never fabricate assistant transcript on
// STT failure, and must never leak raw error strings to the user.
// Failures render as system/status rows with safe, user-friendly copy.
// ============================================================================

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  classifySttFailure,
  describeSttFailure,
  type TranscriptItem,
} from '../voice-personas';
import { VoiceModeModal } from '../VoiceModeModal';

describe('F-009: STT failure classification (never leaks raw internals)', () => {
  it("classifies auth failures (401/403/unauthorized/key problems) as 'auth'", () => {
    expect(classifySttFailure(new Error('401 Unauthorized'))).toBe('auth');
    expect(classifySttFailure(new Error('stt-http-403'))).toBe('auth');
    expect(classifySttFailure(new Error('Invalid API key'))).toBe('auth');
    expect(classifySttFailure(new Error('Not authenticated'))).toBe('auth');
  });

  it("classifies timeouts and aborts as 'timeout'", () => {
    expect(classifySttFailure(new Error('Transcription timed out'))).toBe('timeout');
    expect(classifySttFailure(new Error('The operation timed out'))).toBe('timeout');
    const abort = new Error('The user aborted a request.');
    abort.name = 'AbortError';
    expect(classifySttFailure(abort)).toBe('timeout');
  });

  it("classifies connectivity problems as 'network'", () => {
    expect(classifySttFailure(new TypeError('Failed to fetch'))).toBe('network');
    expect(classifySttFailure(new Error('socket hang up'))).toBe('network');
    expect(classifySttFailure(new Error('Network request failed'))).toBe('network');
  });

  it("classifies empty STT results as 'empty'", () => {
    expect(classifySttFailure(new Error('stt-empty-result'))).toBe('empty');
  });

  it("classifies malformed STT payloads as 'malformed'", () => {
    expect(classifySttFailure(new Error('stt-malformed-result'))).toBe('malformed');
    expect(classifySttFailure(new Error('Unexpected token < in JSON at position 0'))).toBe(
      'malformed',
    );
  });

  it("falls back to 'unknown' for unrecognized errors (safe default)", () => {
    expect(classifySttFailure(new Error('Transcription failed'))).toBe('unknown');
    expect(classifySttFailure(new Error('stt-http-429'))).toBe('unknown');
    expect(classifySttFailure(new Error('stt-http-500'))).toBe('unknown');
    expect(classifySttFailure(new Error('weird new SDK error shape'))).toBe('unknown');
  });

  it('handles non-Error thrown values without crashing', () => {
    expect(classifySttFailure('plain string boom')).toBe('unknown');
    expect(classifySttFailure(null)).toBe('unknown');
    expect(classifySttFailure(undefined)).toBe('unknown');
    expect(classifySttFailure(42)).toBe('unknown');
  });

  it('NEVER leaks raw error internals into the user-facing message', () => {
    const nasty = new Error(
      'ECONNRESET: socket hang up at db.internal.corp:5432, token=sk-secret-abc123',
    );
    const info = describeSttFailure(nasty);
    expect(info.userMessage).not.toContain('ECONNRESET');
    expect(info.userMessage).not.toContain('db.internal.corp');
    expect(info.userMessage).not.toContain('5432');
    expect(info.userMessage).not.toContain('sk-secret-abc123');
    expect(info.userMessage).not.toContain('socket hang up');
    expect(info.userMessage.length).toBeGreaterThan(0);
  });

  it('never renders HTTP status codes or server error bodies verbatim', () => {
    for (const kind of ['auth', 'timeout', 'network', 'empty', 'malformed', 'unknown'] as const) {
      const info = describeSttFailure(new Error(`stt-probe-${kind}`));
      expect(info.userMessage).not.toMatch(/stt-/);
      expect(info.userMessage).not.toContain('Transcription failed');
    }
  });

  it('provides a non-empty user message for every failure kind', () => {
    const probes: Array<[unknown, string]> = [
      [new Error('401'), 'auth'],
      [new Error('timed out'), 'timeout'],
      [new Error('Failed to fetch'), 'network'],
      [new Error('stt-empty-result'), 'empty'],
      [new Error('stt-malformed-result'), 'malformed'],
      [new Error('???'), 'unknown'],
    ];
    for (const [err, expectedKind] of probes) {
      const info = describeSttFailure(err);
      expect(info.kind).toBe(expectedKind);
      expect(info.userMessage.length).toBeGreaterThan(10);
    }
  });

  it('auth message guides the user to sign back in (no raw internals)', () => {
    const info = describeSttFailure(new Error('401 Unauthorized: jwt expired at 2026-10-11'));
    expect(info.kind).toBe('auth');
    expect(info.userMessage).toMatch(/sign back in/i);
    expect(info.userMessage).not.toContain('jwt');
    expect(info.userMessage).not.toContain('2026-10-11');
  });
});

describe('F-009: system/status row rendering in the transcript ticker', () => {
  const systemItem: TranscriptItem = {
    id: 'err-1',
    speaker: 'system',
    text: "Couldn't transcribe that recording — tap retry to try again.",
    timestamp: '12:01 PM',
  };

  it("accepts speaker 'system' on TranscriptItem (type-level contract)", () => {
    const item: TranscriptItem = {
      id: 'x',
      speaker: 'system',
      text: 'status',
      timestamp: 'now',
    };
    expect(item.speaker).toBe('system');
  });

  it('renders a system item as a status row with a retry affordance', () => {
    const html = renderToStaticMarkup(
      React.createElement(VoiceModeModal, {
        isOpen: true,
        onClose: () => {},
        initialPersonaId: 'aura',
        initialTranscripts: [
          {
            id: 'u-1',
            speaker: 'user',
            text: 'Hello there',
            timestamp: '12:00 PM',
          },
          systemItem,
        ],
      }),
    );

    expect(html).toContain('data-testid="transcript-status-row"');
    expect(html).toContain('role="status"');
    expect(html).toContain('data-testid="stt-retry-button"');
    expect(html).toContain('aria-label="Retry voice transcription"');
    // renderToStaticMarkup HTML-escapes the apostrophe (Couldn't → Couldn&#x27;t),
    // so assert on the distinctive substrings instead of the raw string.
    expect(html).toContain('transcribe that recording');
    expect(html).toContain('tap retry to try again');
    // Status label, not a fabricated persona voice line.
    expect(html).toContain('Status');
  });

  it('does not render a system item as assistant speech (no persona label)', () => {
    const html = renderToStaticMarkup(
      React.createElement(VoiceModeModal, {
        isOpen: true,
        onClose: () => {},
        initialPersonaId: 'aura',
        initialTranscripts: [systemItem],
      }),
    );

    // The ticker must not attribute the status row to the persona.
    expect(html).not.toContain('Aura:');
  });

  it('keeps user/assistant rows rendering exactly as before (regression guard)', () => {
    const html = renderToStaticMarkup(
      React.createElement(VoiceModeModal, {
        isOpen: true,
        onClose: () => {},
        initialPersonaId: 'vesper',
        initialTranscripts: [
          { id: 'u-1', speaker: 'user', text: 'Ping', timestamp: '12:00 PM' },
          {
            id: 'a-1',
            speaker: 'assistant',
            personaId: 'vesper',
            text: 'Pong, with precision.',
            timestamp: '12:00 PM',
          },
        ],
      }),
    );

    expect(html).toContain('You:');
    expect(html).toContain('Vesper:');
    expect(html).toContain('Pong, with precision.');
    expect(html).not.toContain('data-testid="transcript-status-row"');
  });
});
