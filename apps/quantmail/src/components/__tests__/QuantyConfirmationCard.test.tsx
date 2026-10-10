import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QuantyConfirmationCard } from '../QuantyConfirmationCard';
import type { AiChatToolConfirmationCard } from '../quanty-agent-cards';

const CARD: AiChatToolConfirmationCard = {
  id: 'confirm_1',
  toolName: 'create_repository',
  title: 'Create repository',
  summary: 'Create repository "demo" (private)',
  args: { name: 'demo', visibility: 'private' },
  expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
};

describe('QuantyConfirmationCard', () => {
  it('renders title, summary, input preview and both decision buttons', () => {
    const html = renderToStaticMarkup(React.createElement(QuantyConfirmationCard, { card: CARD }));
    expect(html).toContain('Create repository');
    expect(html).toContain('Create repository &quot;demo&quot; (private)');
    // Input preview: key + value.
    expect(html).toContain('name');
    expect(html).toContain('demo');
    expect(html).toContain('visibility');
    expect(html).toContain('Confirm');
    expect(html).toContain('Cancel');
  });

  it('does not render a result timeline before the user decides', () => {
    const html = renderToStaticMarkup(React.createElement(QuantyConfirmationCard, { card: CARD }));
    expect(html).not.toContain('Quanty actions');
  });

  it('truncates long argument values in the preview', () => {
    const long = 'x'.repeat(500);
    const html = renderToStaticMarkup(
      React.createElement(QuantyConfirmationCard, {
        card: { ...CARD, args: { content: long } },
      }),
    );
    expect(html).not.toContain(long);
    expect(html).toContain('…');
  });
});
