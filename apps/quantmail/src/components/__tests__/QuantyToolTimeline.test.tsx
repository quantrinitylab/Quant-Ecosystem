import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QuantyToolTimeline } from '../QuantyToolTimeline';
import type { AiChatToolExecutionCard } from '../quanty-agent-cards';

function card(overrides: Partial<AiChatToolExecutionCard> = {}): AiChatToolExecutionCard {
  return {
    toolName: 'read_file_blob',
    callId: 'call_1',
    status: 'succeeded',
    label: 'Read "README.md" from demo (main)',
    input: {},
    durationMs: 320,
    ...overrides,
  };
}

describe('QuantyToolTimeline', () => {
  it('renders nothing when the turn carried no tool runs', () => {
    expect(renderToStaticMarkup(React.createElement(QuantyToolTimeline, { executions: [] }))).toBe(
      '',
    );
  });

  it('renders each run with its label and duration', () => {
    const html = renderToStaticMarkup(
      React.createElement(QuantyToolTimeline, {
        executions: [
          card(),
          card({
            callId: 'call_2',
            toolName: 'create_repository',
            status: 'pending-confirmation',
            label: 'Create repository "demo" (private)',
            durationMs: 0,
          }),
        ],
      }),
    );
    // React escapes quotes in SSR output.
    expect(html).toContain('Read &quot;README.md&quot; from demo (main)');
    expect(html).toContain('320ms');
    expect(html).toContain('Create repository &quot;demo&quot; (private)');
  });

  it('marks pending-confirmation steps as not executed', () => {
    const html = renderToStaticMarkup(
      React.createElement(QuantyToolTimeline, {
        executions: [card({ status: 'pending-confirmation', label: 'Create repository "demo"' })],
      }),
    );
    expect(html).toContain('Waiting for your approval — nothing has been executed.');
  });

  it('renders the honest unwired note for unknown/disallowed/unwired tools', () => {
    const html = renderToStaticMarkup(
      React.createElement(QuantyToolTimeline, {
        executions: [
          card({
            toolName: 'mail_search',
            status: 'failed',
            label: 'Attempted "mail_search"',
            error: { code: 'UNKNOWN_TOOL', message: '"mail_search" is not wired yet — nothing was run.' },
          }),
        ],
      }),
    );
    expect(html).toContain('Quanty doesn&#x27;t have &quot;mail_search&quot; wired up yet');
    expect(html).toContain('nothing was run.');
  });

  it('shows the real error message for wired tools that failed at runtime', () => {
    const html = renderToStaticMarkup(
      React.createElement(QuantyToolTimeline, {
        executions: [
          card({
            status: 'failed',
            label: 'Attempted: Read "nope.md" from demo (main)',
            error: { code: 'EXECUTION_FAILED', message: 'Repository inspection service unavailable' },
          }),
        ],
      }),
    );
    expect(html).toContain('Repository inspection service unavailable');
    expect(html).not.toContain('wired up yet');
  });
});
