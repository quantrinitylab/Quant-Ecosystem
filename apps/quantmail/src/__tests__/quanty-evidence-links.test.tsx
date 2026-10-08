// @vitest-environment node
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { QuantyEvidenceLinks } from '../components/QuantyEvidenceLinks';

/**
 * QM-QUANTY-002 — evidence links render exactly the refs the backend
 * returned: no invented sources, honest empty state, quotes exposed
 * accessibly.
 */
describe('QuantyEvidenceLinks', () => {
  it('renders nothing when there is no evidence', () => {
    expect(renderToStaticMarkup(createElement(QuantyEvidenceLinks, { evidence: [] }))).toBe('');
  });

  it('renders one chip per evidence ref with its label', () => {
    const html = renderToStaticMarkup(
      createElement(QuantyEvidenceLinks, {
        evidence: [
          { label: 'Re: launch', quote: 'see you at 3' },
          { label: 'Teammate' },
        ],
      }),
    );
    expect(html).toContain('Re: launch');
    expect(html).toContain('Teammate');
    expect(html).toContain('Sources');
    expect(html).toContain('aria-label="Based on 2 sources"');
  });

  it('exposes the verbatim quote in the tooltip', () => {
    const html = renderToStaticMarkup(
      createElement(QuantyEvidenceLinks, {
        evidence: [{ label: 'Re: launch', quote: 'see you at 3', quoteTruncated: true }],
      }),
    );
    expect(html).toContain('see you at 3');
    expect(html).toContain('(truncated)');
  });

  it('uses singular wording for a single source', () => {
    const html = renderToStaticMarkup(
      createElement(QuantyEvidenceLinks, { evidence: [{ label: 'Only' }] }),
    );
    expect(html).toContain('aria-label="Based on 1 source"');
  });

  it('includes the deep link ref in the tooltip for debugging', () => {
    const html = renderToStaticMarkup(
      createElement(QuantyEvidenceLinks, {
        evidence: [{ label: 'Re: launch', deepLink: 'quant://quantmail/resource/m-1' }],
      }),
    );
    expect(html).toContain('quant://quantmail/resource/m-1');
  });
});
