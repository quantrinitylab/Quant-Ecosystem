import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { UniversalSearchResults, filePreviewHref, personDetailHref } from '../app/search/UniversalSearchResults';
import type {
  UniversalSearchResults as SearchResults,
  DriveFileHit,
} from '../hooks/useUniversalSearch';
import type { Contact } from '../types';

// QM-FIX-LOOP — universal search drive FILE hits must deep-link to the file
// (?file=<id>) instead of the bare /drive root, the same never-lose-the-hit
// pattern as personDetailHref (QM 2026-10-19) and the /drive/doc/<id> rows.
//
// Note on proof: FileRow's onClick fires only in a live browser, so the
// navigation target is pinned two ways — the pure filePreviewHref() function
// (the exact string that reaches router.push) is unit-tested, and a source
// guard asserts FileRow's onClick calls filePreviewHref instead of the old
// hard-coded '/drive' (renderToStaticMarkup cannot fire DOM events, and this
// package forbids @testing-library/react).

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));

const SRC = path.resolve(__dirname, '../app/search/UniversalSearchResults.tsx');

function fileFixture(overrides: Partial<DriveFileHit> = {}): DriveFileHit {
  return {
    id: 'file-123',
    name: 'Q3 report.pdf',
    mimeType: 'application/pdf',
    size: 204800,
    updatedAt: '2026-10-20T08:00:00Z',
    ...overrides,
  };
}

describe('filePreviewHref — drive FILE hit deep link', () => {
  it('builds a /drive?file=<id> deep link for a hit with an id', () => {
    expect(filePreviewHref(fileFixture({ id: 'file-123' }))).toBe('/drive?file=file-123');
  });

  it('URL-encodes ids with special characters', () => {
    expect(filePreviewHref(fileFixture({ id: 'a b/c?d' }))).toBe(
      `/drive?file=${encodeURIComponent('a b/c?d')}`,
    );
  });

  it('falls back to the bare drive list when the hit carries no id', () => {
    expect(filePreviewHref(fileFixture({ id: '' }))).toBe('/drive');
  });

  it('never returns the bare /drive root for a hit that has an id (old bug)', () => {
    const href = filePreviewHref(fileFixture({ id: 'file-123' }));
    expect(href).not.toBe('/drive');
    expect(href).toContain('file=file-123');
  });
});

describe('personDetailHref — regression guard (QM 2026-10-19 pattern)', () => {
  it('still deep-links people hits to /contacts?contact=<id>', () => {
    expect(personDetailHref({ id: 'c-9' } as Contact)).toBe('/contacts?contact=c-9');
  });
});

describe('UniversalSearchResults — FileRow wiring', () => {
  it("FileRow's onClick navigates via filePreviewHref, not the bare '/drive'", () => {
    const src = fs.readFileSync(SRC, 'utf8');
    const fileRowBlock = src.slice(src.indexOf('function FileRow'));
    expect(fileRowBlock).toContain('filePreviewHref(file)');
    expect(fileRowBlock, 'FileRow must not push the bare /drive root').not.toMatch(
      /router\.push\('\/drive'\)/,
    );
  });

  it('renders the drive section with the file hit name', () => {
    const results: SearchResults = {
      query: 'report',
      mail: { items: [], error: null },
      people: { items: [], error: null },
      calendar: { items: [], error: null },
      drive: { files: [fileFixture()], documents: [], error: null },
    };
    const html = renderToStaticMarkup(
      <UniversalSearchResults results={results} scope="drive" onOpenMail={() => {}} />,
    );
    expect(html).toContain('Q3 report.pdf');
    expect(html).toContain('Drive');
  });
});
