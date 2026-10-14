// Quant Docs engines — which files go to the on-device engines, and the bundle/version wiring
// between apps/quantmail and engines/ (the Docker build and the worker depend on these names).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  browserCanShowPdfInline,
  docsEngineKindFor,
  docsEngineLabel,
  DOCS_ENGINE_MAX_BYTES,
} from '../lib/docs-engine/formats';
import { DOCS_ENGINE_BASE, DOCS_ENGINE_NOTICES_URL, DOCS_ENGINE_VERSION, DOCS_ENGINE_WORKER_URL } from '../lib/docs-engine/version';

const ENGINES_DIR = resolve(__dirname, '../../../../engines');

describe('docsEngineKindFor', () => {
  it('maps Office and PDF MIME types to their engine', () => {
    expect(docsEngineKindFor('application/pdf', 'a.bin')).toBe('pdf');
    expect(docsEngineKindFor('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'x')).toBe('word');
    expect(docsEngineKindFor('application/vnd.openxmlformats-officedocument.presentationml.presentation', 'x')).toBe('slides');
    expect(docsEngineKindFor('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'x')).toBe('sheets');
    expect(docsEngineKindFor('application/msword', 'old.doc')).toBe('word');
    expect(docsEngineKindFor('application/vnd.ms-excel', 'old.xls')).toBe('sheets');
    expect(docsEngineKindFor('text/rtf', 'notes.rtf')).toBe('word');
  });

  it('ignores case and MIME parameters', () => {
    expect(docsEngineKindFor('Application/PDF; charset=binary', 'x')).toBe('pdf');
  });

  it('falls back to the extension for generic uploads', () => {
    expect(docsEngineKindFor('application/octet-stream', 'Report.DOCX')).toBe('word');
    expect(docsEngineKindFor('', 'deck.pptx')).toBe('slides');
    expect(docsEngineKindFor(undefined, 'budget.xlsb')).toBe('sheets');
    expect(docsEngineKindFor(null, 'scan.pdf')).toBe('pdf');
  });

  it('leaves CSV/TSV, text, images and legacy .ppt to the other previews', () => {
    expect(docsEngineKindFor('text/csv', 'data.csv')).toBeNull();
    expect(docsEngineKindFor('application/octet-stream', 'data.tsv')).toBeNull();
    expect(docsEngineKindFor('text/plain', 'readme.txt')).toBeNull();
    expect(docsEngineKindFor('image/png', 'a.png')).toBeNull();
    expect(docsEngineKindFor('application/vnd.ms-powerpoint', 'old.ppt')).toBeNull();
    expect(docsEngineKindFor('', '')).toBeNull();
  });
});

describe('browserCanShowPdfInline', () => {
  it('trusts navigator.pdfViewerEnabled when the browser reports it', () => {
    expect(browserCanShowPdfInline({ userAgent: 'Mozilla/5.0 (Linux; Android 14)', pdfViewerEnabled: true })).toBe(true);
    expect(browserCanShowPdfInline({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)', pdfViewerEnabled: false })).toBe(false);
  });

  it('assumes no inline viewer on mobile user agents otherwise', () => {
    expect(browserCanShowPdfInline({ userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile' })).toBe(false);
    expect(browserCanShowPdfInline({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' })).toBe(false);
    expect(browserCanShowPdfInline({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)' })).toBe(true);
  });

  it('defaults to the browser viewer when there is no navigator (server render)', () => {
    expect(browserCanShowPdfInline(undefined)).toBe(true);
  });
});

describe('labels and limits', () => {
  it('names each engine kind for people', () => {
    expect(docsEngineLabel('pdf')).toBe('PDF');
    expect(docsEngineLabel('word')).toBe('Document');
    expect(docsEngineLabel('slides')).toBe('Presentation');
    expect(docsEngineLabel('sheets')).toBe('Spreadsheet');
  });

  it('keeps the client size limit equal to the worker limit', () => {
    const worker = readFileSync(resolve(ENGINES_DIR, 'web/worker.js'), 'utf8');
    const m = /const MAX_BYTES = (\d+) \* 1024 \* 1024;/.exec(worker);
    expect(m).not.toBeNull();
    expect(DOCS_ENGINE_MAX_BYTES).toBe(Number(m![1]) * 1024 * 1024);
  });
});

describe('engine bundle wiring', () => {
  it('serves the bundle version that engines/VERSION builds', () => {
    const version = readFileSync(resolve(ENGINES_DIR, 'VERSION'), 'utf8').trim();
    expect(DOCS_ENGINE_VERSION).toBe(version);
    expect(DOCS_ENGINE_BASE).toBe(`/engines/docs/${version}`);
    expect(DOCS_ENGINE_WORKER_URL).toBe(`/engines/docs/${version}/worker.js`);
    expect(DOCS_ENGINE_NOTICES_URL).toBe(`/engines/docs/${version}/licenses/NOTICES.txt`);
  });

  it('loads each engine from the file names its crate builds', () => {
    const worker = readFileSync(resolve(ENGINES_DIR, 'web/worker.js'), 'utf8');
    for (const kind of ['pdf', 'word', 'slides', 'sheets']) {
      const cargo = readFileSync(resolve(ENGINES_DIR, `quant-${kind}/Cargo.toml`), 'utf8');
      expect(cargo).toMatch(new RegExp(`^name = "quant-${kind}-engine"$`, 'm'));
      expect(worker).toContain(`${kind}: '${kind}/quant_${kind}_engine'`);
    }
  });
});
