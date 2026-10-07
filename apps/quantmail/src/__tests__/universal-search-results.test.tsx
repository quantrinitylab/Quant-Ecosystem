// @vitest-environment node
// ============================================================================
// K10 / M13 — UniversalSearchResults: per-source sections, partial-failure
// honesty, and no invented coverage.
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { UniversalSearchResults } from '../app/search/UniversalSearchResults';
import type { UniversalSearchResults as Results } from '../hooks/useUniversalSearch';

function results(overrides: Partial<Results> = {}): Results {
  return {
    query: 'invoice',
    mail: { items: [], error: null },
    people: { items: [], error: null },
    calendar: { items: [], error: null },
    drive: { files: [], documents: [], error: null },
    ...overrides,
  };
}

const noop = () => {};

describe('UniversalSearchResults', () => {
  it('renders one section per covered source on the All scope', () => {
    const html = renderToStaticMarkup(
      <UniversalSearchResults
        results={results({
          mail: { items: [{ id: 'm1', subject: 'Invoice #42', from: { email: 'a@b.co' } } as never], error: null },
          people: { items: [{ id: 'p1', name: 'Ada', email: 'ada@x.co' } as never], error: null },
          calendar: { items: [{ id: 'e1', title: 'Invoice review' } as never], error: null },
          drive: { files: [{ id: 'f1', name: 'invoice.pdf' }], documents: [{ id: 'd1', title: 'Invoices doc' }], error: null },
        })}
        scope="all"
        onOpenMail={noop}
      />,
    );
    expect(html).toContain('Mail');
    expect(html).toContain('People');
    expect(html).toContain('Calendar');
    expect(html).toContain('Drive');
    expect(html).toContain('Invoice #42');
    expect(html).toContain('Ada');
    expect(html).toContain('Invoice review');
    expect(html).toContain('invoice.pdf');
    expect(html).toContain('Invoices doc');
  });

  it('shows only the requested source on a single-source scope', () => {
    const html = renderToStaticMarkup(
      <UniversalSearchResults
        results={results({
          mail: { items: [{ id: 'm1', subject: 'Invoice #42' } as never], error: null },
          calendar: { items: [{ id: 'e1', title: 'Invoice review' } as never], error: null },
        })}
        scope="calendar"
        onOpenMail={noop}
      />,
    );
    expect(html).not.toContain('Invoice #42');
    expect(html).toContain('Calendar');
    expect(html).toContain('Invoice review');
  });

  it('names the failed source instead of dropping it silently', () => {
    const html = renderToStaticMarkup(
      <UniversalSearchResults
        results={results({ people: { items: [], error: 'timeout' } })}
        scope="all"
        onOpenMail={noop}
      />,
    );
    expect(html).toContain('Could not search this source right now');
    expect(html).toContain('timeout');
  });

  it('renders an honest empty state when every source is empty', () => {
    const html = renderToStaticMarkup(
      <UniversalSearchResults results={results()} scope="all" onOpenMail={noop} />,
    );
    expect(html).toContain('No results');
    expect(html).toContain('mail, people, calendar, or drive');
  });

  it('never claims QuantGit coverage', () => {
    const html = renderToStaticMarkup(
      <UniversalSearchResults results={results()} scope="all" onOpenMail={noop} />,
    );
    expect(html.toLowerCase()).not.toContain('quantgit');
    expect(html.toLowerCase()).not.toContain('>git<');
  });

  it('links drive documents to the doc preview route', () => {
    const html = renderToStaticMarkup(
      <UniversalSearchResults
        results={results({ drive: { files: [], documents: [{ id: 'd9', title: 'Plan' }], error: null } })}
        scope="drive"
        onOpenMail={noop}
      />,
    );
    expect(html).toContain('Plan');
  });
});
