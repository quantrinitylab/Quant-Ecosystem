/**
 * QuantMail Drive — shared search-filter helpers.
 *
 * Maps the Google-Drive-style `type:` keywords the frontend parses out of the
 * search box (see src/components/drive/drive-search-operators.ts) onto Prisma
 * `mimeType` predicates, and validates the `before:`/`after:` ISO date
 * strings before they touch a query.
 *
 * Matching is substring-based on the stored mimeType because real-world rows
 * carry vendor mime types (application/pdf, image/jpeg,
 * application/vnd.openxmlformats-officedocument.…); an exact-mime allowlist
 * would miss them.
 */

/** mimeType substrings (case-insensitive) for each `type:` keyword. */
const TYPE_MIME_PATTERNS: Record<string, string[]> = {
  pdf: ['pdf'],
  document: ['pdf', 'msword', 'wordprocessingml', 'opendocument.text', 'rtf', 'text/plain', 'markdown'],
  doc: ['pdf', 'msword', 'wordprocessingml', 'opendocument.text', 'rtf', 'text/plain', 'markdown'],
  spreadsheet: ['spreadsheet', 'sheet', 'excel', 'csv'],
  sheet: ['spreadsheet', 'sheet', 'excel', 'csv'],
  presentation: ['presentation', 'powerpoint'],
  slide: ['presentation', 'powerpoint'],
  image: ['image/'],
  photo: ['image/'],
  video: ['video/'],
  audio: ['audio/'],
  text: ['text/', 'json'],
  archive: ['zip', 'tar', 'rar', '7z', 'gzip'],
  zip: ['zip', 'tar', 'rar', '7z', 'gzip'],
};

/**
 * mimeType substring predicates for a `type:` keyword. Returns null for the
 * virtual 'folder' keyword (folders are matched by row kind, not mime) and
 * for unknown keywords (callers then leave the filter unapplied rather than
 * returning zero rows).
 */
export function mimePatternsForDriveType(type: string): string[] | null {
  if (type === 'folder') return [];
  return TYPE_MIME_PATTERNS[type] ?? null;
}

/**
 * Strict YYYY-MM-DD → Date at UTC midnight. Returns null for malformed or
 * impossible dates (e.g. 2025-02-30) so a bad operator never becomes a query.
 */
export function parseDriveDateParam(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return dt;
}

/** `before:2025-01-01` ⇒ modified strictly before the end of that UTC day. */
export function beforeCutoff(value: string | undefined): Date | null {
  const day = parseDriveDateParam(value);
  if (!day) return null;
  return new Date(day.getTime() + 24 * 60 * 60 * 1000);
}

/** `after:2025-01-01` ⇒ modified at or after the start of that UTC day. */
export function afterCutoff(value: string | undefined): Date | null {
  return parseDriveDateParam(value);
}
