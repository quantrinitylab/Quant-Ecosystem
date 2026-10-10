/**
 * htmlToPlainText — minimal, dependency-free HTML → plain text for UNTRUSTED
 * email bodies (snippets, previews, thread rows).
 *
 * Security contract:
 * - Strips ALL markup via a single-pass scanner (quote-aware tag parsing,
 *   spec-style script/style raw-text skipping) — NEVER regex-based stripping,
 *   which misses end tags like `</script >` and mishandles `>` inside
 *   quoted attributes.
 * - Decodes entities EXACTLY ONCE in the same pass. `&amp;lt;` becomes the
 *   literal text `&lt;`, never `<` — sequential `.replace(/&amp;/…,'&')`
 *   chains double-decode and must not be used here.
 * - The output is PLAIN TEXT. Render it as React text / textContent only;
 *   never pass it to dangerouslySetInnerHTML.
 *
 * Pure function: no DOM, no document — safe in SSR, workers, and tests.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  copy: '©',
  reg: '®',
  trade: '™',
};

function isAsciiLetter(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122); // A-Z a-z
}

function isAlphaNum(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) || // 0-9
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122) // a-z
  );
}

/**
 * Try to decode one entity starting at `html[start]` (which is `&`).
 * Returns the decoded text and the index just past the entity, or null when
 * there is no well-formed known entity here (caller emits `&` literally).
 * Unknown entities (e.g. `&foo;`) and malformed numerics are left as literal
 * text — decode is best-effort, never lossy, never double-applied.
 */
function decodeEntity(html: string, start: number): { text: string; next: number } | null {
  let i = start + 1;
  if (i >= html.length) return null;

  if (html[i] === '#') {
    i++;
    let hex = false;
    if (html[i] === 'x' || html[i] === 'X') {
      hex = true;
      i++;
    }
    let digits = '';
    while (i < html.length) {
      const c = html[i];
      const ok = hex
        ? (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')
        : c >= '0' && c <= '9';
      if (!ok) break;
      digits += c;
      i++;
    }
    if (!digits || html[i] !== ';') return null;
    const code = parseInt(digits, hex ? 16 : 10);
    if (!Number.isSafeInteger(code) || code < 0 || code > 0x10ffff) return null;
    const text = code === 0 || (code >= 0xd800 && code <= 0xdfff) ? '\uFFFD' : String.fromCodePoint(code);
    return { text, next: i + 1 };
  }

  let name = '';
  while (i < html.length && isAlphaNum(html[i])) {
    name += html[i];
    i++;
  }
  if (!name || html[i] !== ';') return null;
  const decoded = NAMED_ENTITIES[name.toLowerCase()];
  if (decoded === undefined) return null;
  return { text: decoded, next: i + 1 };
}

/**
 * Skip a script/style raw-text element starting at `from` (just past the
 * opening tag's `>`), per the HTML spec: content runs until `</name`
 * followed by whitespace, `/`, or `>` (case-insensitive). Returns the index
 * just past the end tag, or html.length when unterminated.
 */
function skipRawTextElement(html: string, from: number, tagName: string): number {
  const lower = html.toLowerCase();
  const needle = '</' + tagName;
  let idx = lower.indexOf(needle, from);
  while (idx !== -1) {
    const after = html[idx + needle.length];
    if (after === '>' || after === '/' || after === undefined || /\s/.test(after)) {
      // Consume through the end tag's '>' with quote awareness.
      let j = idx + needle.length;
      let quote: string | null = null;
      while (j < html.length) {
        const c = html[j];
        if (quote) {
          if (c === quote) quote = null;
        } else if (c === '"' || c === "'") {
          quote = c;
        } else if (c === '>') {
          return j + 1;
        }
        j++;
      }
      return html.length;
    }
    idx = lower.indexOf(needle, idx + 1);
  }
  return html.length;
}

/** Extract the lowercased tag name from a tag's inner text (no angle brackets). */
function tagNameOf(tagInner: string): string {
  const inner = tagInner.startsWith('/') ? tagInner.slice(1) : tagInner;
  const m = /^([^\s/>]+)/.exec(inner.trim());
  return m ? m[1].toLowerCase() : '';
}

/**
 * Convert untrusted HTML to plain text. Tags are dropped (block structure
 * collapses to single spaces), script/style/comment content is removed,
 * entities are decoded exactly once. Output is safe for text-only rendering.
 */
export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return '';
  const out: string[] = [];
  const n = html.length;
  let i = 0;

  while (i < n) {
    const ch = html[i];

    if (ch === '<') {
      const next = html[i + 1];
      // A '<' not followed by a letter, '/', '!' or '?' cannot open a tag
      // (HTML spec) — treat it as literal text, e.g. "if x < 3".
      if (next === undefined || (!isAsciiLetter(next) && next !== '/' && next !== '!' && next !== '?')) {
        out.push('<');
        i++;
        continue;
      }
      // HTML comment
      if (html.startsWith('<!--', i)) {
        const end = html.indexOf('-->', i + 4);
        i = end === -1 ? n : end + 3;
        out.push(' ');
        continue;
      }
      // DOCTYPE / other declarations and processing instructions
      if (html[i + 1] === '!' || html[i + 1] === '?') {
        const end = html.indexOf('>', i + 2);
        i = end === -1 ? n : end + 1;
        out.push(' ');
        continue;
      }
      // Parse the tag with quote awareness so `>` inside attributes
      // (e.g. <a title="a>b">) does not end the tag early.
      let j = i + 1;
      let quote: string | null = null;
      while (j < n) {
        const c = html[j];
        if (quote) {
          if (c === quote) quote = null;
        } else if (c === '"' || c === "'") {
          quote = c;
        } else if (c === '>') {
          break;
        }
        j++;
      }
      if (j >= n) {
        // Unterminated '<' — treat it as literal text, not markup.
        out.push('<');
        i++;
        continue;
      }
      const tagInner = html.slice(i + 1, j);
      const name = tagNameOf(tagInner);
      const isClosing = tagInner.trim().startsWith('/');
      if (!isClosing && (name === 'script' || name === 'style')) {
        i = skipRawTextElement(html, j + 1, name);
        out.push(' ');
        continue;
      }
      i = j + 1;
      out.push(' ');
      continue;
    }

    if (ch === '&') {
      const decoded = decodeEntity(html, i);
      if (decoded) {
        out.push(decoded.text);
        i = decoded.next;
        continue;
      }
      out.push('&');
      i++;
      continue;
    }

    out.push(ch);
    i++;
  }

  return out.join('').replace(/\s+/g, ' ').trim();
}
