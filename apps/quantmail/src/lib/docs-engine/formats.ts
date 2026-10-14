/**
 * Quant Docs engine — which on-device engine (if any) previews a file.
 *
 * The engines are WebAssembly builds of the open-source ArtCraft document engines
 * (PdfCraft, WordCraft, DeckCraft, GridCraft — MIT OR Apache-2.0), wrapped by our own
 * typed adapters in `engines/`. They run in a Web Worker on the user's device: no upload,
 * no server render cost.
 */

export type DocsEngineKind = 'pdf' | 'word' | 'slides' | 'sheets';

const MIME_KINDS: Record<string, DocsEngineKind> = {
  'application/pdf': 'pdf',
  'application/x-pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.template': 'word',
  'application/vnd.ms-word.document.macroenabled.12': 'word',
  'application/msword': 'word',
  'application/vnd.oasis.opendocument.text': 'word',
  'application/rtf': 'word',
  'text/rtf': 'word',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'slides',
  'application/vnd.openxmlformats-officedocument.presentationml.slideshow': 'slides',
  'application/vnd.ms-powerpoint.presentation.macroenabled.12': 'slides',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'sheets',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.template': 'sheets',
  'application/vnd.ms-excel.sheet.macroenabled.12': 'sheets',
  'application/vnd.ms-excel.sheet.binary.macroenabled.12': 'sheets',
  'application/vnd.ms-excel': 'sheets',
  'application/vnd.oasis.opendocument.spreadsheet': 'sheets',
};

const EXT_KINDS: Record<string, DocsEngineKind> = {
  pdf: 'pdf',
  docx: 'word',
  docm: 'word',
  dotx: 'word',
  doc: 'word',
  odt: 'word',
  rtf: 'word',
  pptx: 'slides',
  ppsx: 'slides',
  pptm: 'slides',
  xlsx: 'sheets',
  xlsm: 'sheets',
  xltx: 'sheets',
  xlsb: 'sheets',
  xls: 'sheets',
  ods: 'sheets',
};

function extensionOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec((name || '').trim());
  return m ? m[1]!.toLowerCase() : '';
}

/**
 * The engine for a file, by MIME type first and then by extension (uploads often arrive as
 * `application/octet-stream`). CSV/TSV stay with the plain-text preview on purpose.
 */
export function docsEngineKindFor(mimeType: string | null | undefined, name: string | null | undefined): DocsEngineKind | null {
  const mime = (mimeType || '').toLowerCase().split(';')[0]!.trim();
  const byMime = MIME_KINDS[mime];
  if (byMime) return byMime;
  const ext = extensionOf(name || '');
  if (ext === 'csv' || ext === 'tsv') return null;
  return EXT_KINDS[ext] ?? null;
}

/** Human label for the engine kind ("Document", "Presentation", …). */
export function docsEngineLabel(kind: DocsEngineKind): string {
  switch (kind) {
    case 'pdf':
      return 'PDF';
    case 'word':
      return 'Document';
    case 'slides':
      return 'Presentation';
    case 'sheets':
      return 'Spreadsheet';
  }
}

/** Largest file the on-device engines are asked to open (bytes). */
export const DOCS_ENGINE_MAX_BYTES = 60 * 1024 * 1024;
