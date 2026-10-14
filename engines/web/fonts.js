// Quant Docs engine fonts: which of the bundle's font files (fonts/index.json, built from
// engines/fonts/fonts.txt) a document needs, so the worker can hand them to its engine before
// the first page is drawn. The web builds compile in no document fonts (only a last-resort face).
//
// The choice follows how DeckCraft draws a deck's text (deckcraft-fonts `FontDb::document_face`
// at the rev pinned in engines/quant-slides/Cargo.toml — re-check this file on a bump):
//  - a family that is loaded is drawn as itself, so every family the bundle serves is loaded
//    under its own name (Lato, Montserrat, Liberation Sans, …);
//  - Calibri, Cambria, Arial/Helvetica, Times (New Roman) and Courier (New) are drawn in their
//    metric-compatible stand-ins: Carlito, Caladea, Liberation Sans / Serif / Mono — same advance
//    widths, so lines break where PowerPoint breaks them;
//  - Office's cloud fonts (Aptos, Bierstadt, Grandview, Seaford, Skeena, Tenorite) in Inter;
//  - any other missing family as PowerPoint draws one: in Calibri, i.e. Carlito.
// Inter Regular always comes too: DeckCraft prefers it for characters the chosen face lacks
// (arrows, symbols, ₹ …), which would otherwise draw as empty boxes.

/** Metric-compatible stand-ins (the first substitute DeckCraft tries for these families). */
const METRIC_TWINS = new Map([
  ['calibri', 'Carlito'],
  ['calibri light', 'Carlito'],
  ['cambria', 'Caladea'],
  ['cambria math', 'Caladea'],
  ['arial', 'Liberation Sans'],
  ['helvetica', 'Liberation Sans'],
  ['times new roman', 'Liberation Serif'],
  ['times', 'Liberation Serif'],
  ['courier new', 'Liberation Mono'],
  ['courier', 'Liberation Mono'],
]);

/** Families PowerPoint itself maps to Arial / Times New Roman / Courier New (`office_twin`). */
function officeTwin(f) {
  if (f === 'helv') return 'arial';
  if (f === 'tms rmn') return 'times new roman';
  const base = f.replace(/ (baltic|ce|cyr|greek|tur)$/, '');
  return base !== f && ['arial', 'courier new', 'times new roman'].includes(base) ? base : null;
}

const CLOUD_FONTS = /^(aptos|bierstadt|grandview|seaford|skeena|tenorite)/;

/** Symbol fonts: their bullets are drawn from whatever face covers them; Carlito wouldn't help. */
const SYMBOL_FONTS = /^(wingdings( [23])?|webdings|symbol|marlett|mt extra)$/;

export const FALLBACK_FAMILY = 'Inter';
export const MISSING_FONT_STAND_IN = 'Carlito';

/**
 * The served family `requested` is drawn in, or null when no font file would change how it is
 * drawn. `served` holds the lower-cased families the bundle has.
 */
export function familyFor(requested, served) {
  const f = String(requested || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!f || SYMBOL_FONTS.test(f)) return null;
  const pick = (family) => (served.has(family.toLowerCase()) ? family : null);
  if (served.has(f)) return served.get(f);
  if (METRIC_TWINS.has(f)) return pick(METRIC_TWINS.get(f));
  if (f === FALLBACK_FAMILY.toLowerCase() || CLOUD_FONTS.test(f)) return pick(FALLBACK_FAMILY);
  const twin = officeTwin(f);
  if (twin) return pick(METRIC_TWINS.get(twin));
  return pick(MISSING_FONT_STAND_IN);
}

/** Style names to try for a run, best first (static faces, then a variable font's file). */
function stylesFor(bold, italic) {
  if (bold && italic) return [['bold italic'], ['italic variable'], ['bold', 'italic'], ['variable'], ['regular']];
  if (bold) return [['bold'], ['variable'], ['semibold'], ['regular']];
  if (italic) return [['italic'], ['italic variable'], ['regular'], ['variable']];
  return [['regular'], ['variable']];
}

/**
 * Font files (paths relative to the bundle's fonts/ folder) for `used` — the engine's
 * `[{ family, bold, italic }]` — given the bundle's `index` (`[{ family, style, file }]`).
 * De-duplicated, in a stable order: Inter Regular (the fallback face) first.
 */
export function fontFilesFor(used, index) {
  const byFamily = new Map();
  const served = new Map();
  for (const e of Array.isArray(index) ? index : []) {
    if (!e || typeof e.family !== 'string' || typeof e.style !== 'string' || typeof e.file !== 'string') continue;
    const key = e.family.toLowerCase();
    served.set(key, e.family);
    if (!byFamily.has(key)) byFamily.set(key, new Map());
    byFamily.get(key).set(e.style.toLowerCase(), e.file);
  }
  const files = [];
  const add = (file) => {
    if (file && !files.includes(file)) files.push(file);
  };
  const addFace = (family, bold, italic) => {
    const styles = byFamily.get(family.toLowerCase());
    if (!styles) return;
    for (const group of stylesFor(bold, italic)) {
      const hits = group.map((s) => styles.get(s)).filter(Boolean);
      if (hits.length) {
        hits.forEach(add);
        return;
      }
    }
  };
  if (served.has(FALLBACK_FAMILY.toLowerCase())) addFace(FALLBACK_FAMILY, false, false);
  for (const u of Array.isArray(used) ? used : []) {
    if (!u || typeof u.family !== 'string') continue;
    const family = familyFor(u.family, served);
    if (family) addFace(family, !!u.bold, !!u.italic);
  }
  return files;
}
