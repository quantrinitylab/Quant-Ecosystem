/**
 * QuantMail Drive — search operator parsing.
 *
 * Google-Drive-style search operators extracted from a free-text query BEFORE
 * any semantic / name-based search runs. The semantic-NL default keeps working
 * untouched: operators are parsed out and forwarded as structured filters
 * alongside the residual free text.
 *
 * Supported operators (case-insensitive, values may be double-quoted):
 *   type:pdf | type:image | type:document | type:spreadsheet | type:presentation
 *   | type:video | type:audio | type:text | type:archive | type:folder
 *   name:<text>        — restricts the match to file/folder names
 *   owner:me           — items owned by the current user (default search scope)
 *   owner:shared       — items with any share activity (shared by me / with me)
 *   owner:<email>      — items with share activity with that email, either
 *                        direction (shared by me with them, or shared with me
 *                        by them); revoked shares never surface on either side
 *   before:YYYY-MM-DD  — modified before this date
 *   after:YYYY-MM-DD   — modified after this date
 *
 * Unknown `word:token` shapes are left in the free text on purpose — eating
 * them would corrupt real queries like "10:30" or "ratio: 16:9".
 */

export interface DriveSearchFilters {
  /** Google-Drive-style type keyword, e.g. 'pdf', 'image', 'document', 'folder'. */
  type?: string;
  /** Restricts matching to the item name (from `name:`). */
  name?: string;
  /** 'me' | 'shared' | '<email>' (from `owner:`). */
  owner?: string;
  /** ISO date string YYYY-MM-DD (from `before:`). */
  before?: string;
  /** ISO date string YYYY-MM-DD (from `after:`). */
  after?: string;
}

export interface ParsedDriveSearchQuery {
  /** Free text left after operators were removed. */
  text: string;
  /** Structured filters parsed out of the query. */
  filters: DriveSearchFilters;
  /** True when the query carried at least one operator. */
  hasOperators: boolean;
}

export const DRIVE_SEARCH_OPERATORS = ['type', 'name', 'owner', 'before', 'after'] as const;

/**
 * Canonical type keywords accepted by `type:`. Anything else is left in the
 * free text so a typo ("type:pdff") still searches by name instead of
 * silently returning nothing.
 */
const KNOWN_TYPES = new Set([
  'pdf',
  'document',
  'doc',
  'spreadsheet',
  'sheet',
  'presentation',
  'slide',
  'image',
  'photo',
  'video',
  'audio',
  'text',
  'archive',
  'zip',
  'folder',
]);

const OPERATOR_RE =
  /(^|\s)(type|name|owner|before|after):("[^"]*"|[^\s"]+)/gi;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function unquote(value: string): string {
  const v = value.trim();
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
    return v.slice(1, -1).trim();
  }
  return v;
}

export function parseDriveSearchQuery(query: string): ParsedDriveSearchQuery {
  const filters: DriveSearchFilters = {};
  let hasOperators = false;

  const text = query
    .replace(OPERATOR_RE, (match, leading: string, op: string, rawValue: string) => {
      const key = op.toLowerCase();
      const value = unquote(rawValue);

      if (key === 'type') {
        const t = value.toLowerCase();
        if (KNOWN_TYPES.has(t)) {
          filters.type = t;
          hasOperators = true;
          return leading;
        }
        // Unknown type keyword: keep the whole token as free text.
        return match;
      }
      if (key === 'name') {
        if (value) {
          filters.name = value;
          hasOperators = true;
          return leading;
        }
        return match;
      }
      if (key === 'owner') {
        const o = value.toLowerCase();
        if (o === 'me' || o === 'shared' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o)) {
          filters.owner = o;
          hasOperators = true;
          return leading;
        }
        return match;
      }
      if (key === 'before' || key === 'after') {
        if (isRealDate(value)) {
          filters[key] = value;
          hasOperators = true;
          return leading;
        }
        return match;
      }
      return match;
    })
    .replace(/\s+/g, ' ')
    .trim();

  return { text, filters, hasOperators };
}

/**
 * Remove one operator family (e.g. 'type') from a raw query string, keeping
 * everything else intact. Used by the operator-chip "×" affordance.
 */
export function removeDriveSearchOperator(query: string, operator: string): string {
  const op = operator.toLowerCase();
  const re = new RegExp(`(^|\\s)${op}:("[^"]*"|[^\\s"]+)`, 'gi');
  return query
    .replace(re, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Render the structured filters back into operator syntax, e.g. for URL
 * previews. Free text is preserved as-is.
 */
export function formatDriveSearchFilters(filters: DriveSearchFilters): string {
  const parts: string[] = [];
  if (filters.type) parts.push(`type:${filters.type}`);
  if (filters.name) parts.push(`name:"${filters.name}"`);
  if (filters.owner) parts.push(`owner:${filters.owner}`);
  if (filters.before) parts.push(`before:${filters.before}`);
  if (filters.after) parts.push(`after:${filters.after}`);
  return parts.join(' ');
}
