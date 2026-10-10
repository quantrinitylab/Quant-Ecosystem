import { describe, it, expect } from 'vitest';
import {
  formatToolDuration,
  isToolConfirmationCard,
  isToolExecutionCard,
  isUnwiredToolFailure,
  toolExecutionToStepStatus,
  toolStepLabel,
  unwiredToolNote,
  UNWIRED_TOOL_ERROR_CODES,
  type AiChatToolExecutionCard,
} from '../quanty-agent-cards';

function card(overrides: Partial<AiChatToolExecutionCard> = {}): AiChatToolExecutionCard {
  return {
    toolName: 'read_file_blob',
    callId: 'call_1',
    status: 'succeeded',
    input: {},
    ...overrides,
  };
}

describe('toolExecutionToStepStatus', () => {
  it('maps the three ai-chat statuses onto the shared step vocabulary', () => {
    expect(toolExecutionToStepStatus('succeeded')).toBe('done');
    expect(toolExecutionToStepStatus('failed')).toBe('error');
    expect(toolExecutionToStepStatus('pending-confirmation')).toBe('waiting-confirm');
  });
});

describe('isUnwiredToolFailure', () => {
  it.each([...UNWIRED_TOOL_ERROR_CODES])('treats %s as an unwired-capability failure', (code) => {
    expect(
      isUnwiredToolFailure(card({ status: 'failed', error: { code, message: 'x' } })),
    ).toBe(true);
  });

  it('does not treat runtime failures as unwired', () => {
    expect(
      isUnwiredToolFailure(
        card({ status: 'failed', error: { code: 'EXECUTION_FAILED', message: 'boom' } }),
      ),
    ).toBe(false);
  });

  it('does not treat non-failed cards as unwired', () => {
    expect(
      isUnwiredToolFailure(card({ status: 'succeeded', error: { code: 'NOT_WIRED', message: 'x' } })),
    ).toBe(false);
  });

  it('handles a missing error object', () => {
    expect(isUnwiredToolFailure(card({ status: 'failed' }))).toBe(false);
  });
});

describe('unwiredToolNote', () => {
  it('states the tool is not wired and that nothing ran', () => {
    expect(unwiredToolNote('mail_search')).toBe(
      'Quanty doesn\'t have "mail_search" wired up yet — nothing was run.',
    );
  });
});

describe('toolStepLabel', () => {
  it('prefers the backend label', () => {
    expect(toolStepLabel(card({ label: 'Read "README.md" from demo (main)' }))).toBe(
      'Read "README.md" from demo (main)',
    );
  });

  it('falls back to a plain Ran label when the backend sent none', () => {
    expect(toolStepLabel(card({ label: undefined }))).toBe('Ran read_file_blob');
    expect(toolStepLabel(card({ label: '   ' }))).toBe('Ran read_file_blob');
  });
});

describe('formatToolDuration', () => {
  it('formats sub-second durations as ms', () => {
    expect(formatToolDuration(320)).toBe('320ms');
    expect(formatToolDuration(0)).toBe('0ms');
  });

  it('formats seconds with one decimal', () => {
    expect(formatToolDuration(1200)).toBe('1.2s');
  });

  it('returns empty for unknown durations', () => {
    expect(formatToolDuration(undefined)).toBe('');
    expect(formatToolDuration(NaN)).toBe('');
    expect(formatToolDuration(-5)).toBe('');
  });
});

describe('card shape guards', () => {
  it('accepts well-formed execution cards', () => {
    expect(isToolExecutionCard(card())).toBe(true);
    expect(isToolExecutionCard({ toolName: 'x' })).toBe(false);
    expect(isToolExecutionCard(null)).toBe(false);
    expect(
      isToolExecutionCard({ toolName: 'x', callId: 'c', status: 'exploded' }),
    ).toBe(false);
  });

  it('accepts well-formed confirmation cards', () => {
    expect(
      isToolConfirmationCard({
        id: 'c1',
        toolName: 'create_repository',
        title: 'Create repository',
        summary: 'Create repository "demo" (private)',
        args: {},
        expiresAt: '2026-10-10T00:00:00.000Z',
      }),
    ).toBe(true);
    expect(isToolConfirmationCard({ id: 'c1', toolName: 'x' })).toBe(false);
    expect(isToolConfirmationCard(null)).toBe(false);
  });
});
