// ============================================================================
// QuantMail — minimal safe Markdown renderer for the email reader.
//
// Plain-text message bodies increasingly arrive as Markdown (AI-written mail
// loves `**bold**`), and `EmailLetterCard` used to print those markers
// verbatim. This turns the common Markdown subset into HTML and runs the
// result through the same DOMPurify email sanitizer as `bodyHtml`, because
// message text is attacker-controlled input from SMTP.
//
// Deliberately dependency-free: `react-markdown` would need a network install
// and a much larger bundle for a reader that only needs headings, emphasis,
// code, links, lists, quotes and rules. Raw HTML in the source is escaped
// *before* any Markdown transform runs, so `<script>` can never become markup,
// and links are restricted to http/https/mailto by the sanitizer's own
// hardening plus the scheme check in `renderInline`.
//
// `renderMarkdownToSafeHtml` fails closed ('') during SSR — same contract as
// `useSafeEmailHtml` — so callers keep their plain-text fallback until the
// browser can sanitize.
// ============================================================================

import { useMemo, useState } from 'react';
import { sanitizeEmailHtml } from '@quant/shared-ui';
import { escapeHtml } from './email-body';

const CODE_PLACEHOLDER = '\u0000CODE\u0000';

/** Strong Markdown signals — enough to justify rich rendering over pre-wrap. */
const MARKDOWN_SIGNALS = [
  /\*\*[^*\s][^*]*\*\*/, // **bold**
  /__[^_\s][^_]*__/, // __bold__
  /~~[^~\s][^~]*~~/, // ~~strike~~
  /^#{1,6}\s+\S/m, // # Heading
  /\[[^\]]+\]\((https?:|mailto:)[^)]+\)/, // [text](url)
  /^```/m, // fenced code block
  /^\s{0,3}\d+[.)]\s+\S/m, // 1. ordered list
  /^\s{0,3}[-*+]\s+\S/m, // - unordered list
  /^>\s+\S/m, // > quote
];

/**
 * Heuristic: does this plain-text body look like Markdown worth rendering?
 * Plain prose ("2 * 3 = 6", "call_mom_later") must NOT match — only paired
 * delimiters, line-leading markers and real link syntax count.
 */
export function looksLikeMarkdown(text: string): boolean {
  if (!text) return false;
  return MARKDOWN_SIGNALS.some((re) => re.test(text));
}

function sanitizeLinkUrl(url: string): string | null {
  const trimmed = url.trim();
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  return null;
}

function renderInline(escaped: string): string {  // Code spans are extracted first so `**` inside backticks is never emphasis.
  const codeSpans: string[] = [];
  let out = escaped.replace(/`([^`\n]+)`/g, (_, code: string) => {
    codeSpans.push(`<code>${code}</code>`);
    return `${CODE_PLACEHOLDER}${codeSpans.length - 1}${CODE_PLACEHOLDER}`;
  });

  // Images become links: a Markdown-sourced <img> is a tracking pixel with
  // better PR, and the reader shows remote media behind its own consent UI.
  out = out.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
    (_m, alt: string, url: string) => {
      const safe = sanitizeLinkUrl(url);
      const label = alt || 'image';
      return safe ? `<a href="${safe}">${label}</a>` : label;
    },
  );

  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, text: string, url: string) => {
    const safe = sanitizeLinkUrl(url);
    return safe ? `<a href="${safe}">${text}</a>` : text;
  });

  // Autolinks: <https://…> and <mail@…>.
  out = out.replace(/&lt;(https?:[^&\s]+)&gt;/g, '<a href="$1">$1</a>');
  out = out.replace(
    /&lt;([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})&gt;/g,
    '<a href="mailto:$1">$1</a>',
  );

  // Strong before emphasis: `***x***` must not leave a dangling `*`.
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  // Single `*`/`_` emphasis only at word boundaries, so `2 * 3` and
  // `snake_case_names` survive untouched.
  out = out.replace(/(?<!\w)\*([^*\n]+?)\*(?!\w)/g, '<em>$1</em>');
  out = out.replace(/(?<!\w)_([^_\n]+?)_(?!\w)/g, '<em>$1</em>');

  out = out.replace(new RegExp(`${CODE_PLACEHOLDER}(\\d+)${CODE_PLACEHOLDER}`, 'g'), (_, i: string) =>
    codeSpans[Number(i)] ?? '',
  );

  return out;
}

/**
 * Markdown → HTML, pure and DOM-free: escapes raw HTML first, then transforms
 * blocks and inline spans. Exported so the transform is unit-testable without
 * a DOM; production callers must use {@link renderMarkdownToSafeHtml}, which
 * runs this through the email sanitizer.
 */
export function renderMarkdownBlocks(source: string): string {
  const lines = source.split('\n');
  const html: string[] = [];
  let i = 0;

  const flushParagraph = (buffer: string[]) => {
    if (buffer.length === 0) return;
    html.push(`<p>${buffer.join('<br>')}</p>`);
  };

  let paragraph: string[] = [];

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Fenced code block.
    if (trimmed.startsWith('```')) {
      flushParagraph(paragraph);
      paragraph = [];
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        code.push(escapeHtml(lines[i]));
        i += 1;
      }
      i += 1; // consume closing fence
      html.push(`<pre><code>${code.join('\n')}</code></pre>`);
      continue;
    }

    // ATX heading.
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph(paragraph);
      paragraph = [];
      const level = Math.min(6, heading[1].length);
      html.push(`<h${level}>${renderInline(escapeHtml(heading[2]))}</h${level}>`);
      i += 1;
      continue;
    }

    // Horizontal rule.
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushParagraph(paragraph);
      paragraph = [];
      html.push('<hr>');
      i += 1;
      continue;
    }

    // Blockquote (the reader strips `>` replies into the accordion, but a
    // Markdown body can still quote inline).
    if (/^&gt;\s?/.test(escapeHtml(line))) {
      flushParagraph(paragraph);
      paragraph = [];
      const quote: string[] = [];
      while (i < lines.length && /^&gt;\s?/.test(escapeHtml(lines[i]))) {
        quote.push(escapeHtml(lines[i]).replace(/^&gt;\s?/, ''));
        i += 1;
      }
      html.push(`<blockquote>${quote.map((q) => renderInline(q)).join('<br>')}</blockquote>`);
      continue;
    }

    // Lists: consecutive marker lines become one list.
    const listMarker = /^(\s{0,3})([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (listMarker) {
      flushParagraph(paragraph);
      paragraph = [];
      const ordered = /\d/.test(listMarker[2]);
      const items: string[] = [];
      while (i < lines.length) {
        const m = /^(\s{0,3})([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (!m) break;
        // Task-list checkboxes render as plain markers; no interactive input.
        const text = m[3].replace(/^\[([ xX])\]\s+/, '[$1] ');
        items.push(`<li>${renderInline(escapeHtml(text))}</li>`);
        i += 1;
      }
      html.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }

    if (trimmed === '') {
      flushParagraph(paragraph);
      paragraph = [];
      i += 1;
      continue;
    }

    paragraph.push(renderInline(escapeHtml(line)));
    i += 1;
  }

  flushParagraph(paragraph);
  return html.join('\n');
}

/**
 * Markdown → sanitized HTML. Escapes raw HTML first, transforms, then runs
 * DOMPurify via `sanitizeEmailHtml` — the same email-hardened pipeline as
 * `bodyHtml` (forbids forms/scripts, forces `target=_blank rel=noopener` on
 * links). Returns '' when there is nothing safe to render (SSR, empty input).
 */
export function renderMarkdownToSafeHtml(markdown: string): string {
  if (!markdown || !markdown.trim()) return '';
  return sanitizeEmailHtml(renderMarkdownBlocks(markdown));
}

/**
 * Hook twin of {@link useSafeEmailHtml} for Markdown bodies: the `hasDom`
 * state keeps the first client render identical to the server render, so a
 * body that arrives client-side never flashes the pre-wrap fallback.
 */
export function useSafeMarkdownHtml(markdown: string | undefined, enabled: boolean): string {
  const [hasDom] = useState(() => typeof document !== 'undefined');
  return useMemo(
    () => (hasDom && enabled && markdown ? renderMarkdownToSafeHtml(markdown) : ''),
    [hasDom, enabled, markdown],
  );
}

/**
 * Strip HTML tags to recover the text content. Used when a `bodyHtml` is just
 * plain text wrapped in `<p>` tags — which is exactly what the composer
 * produces via `plainTextToHtml` — so Markdown signals hiding inside it can
 * be detected and rendered as rich text instead of printed verbatim.
 */
export function extractTextFromHtml(html: string | undefined): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * True when the HTML carries no real formatting — only structural wrappers
 * (`p`, `div`, `br`). Such HTML is what `plainTextToHtml` emits for
 * composer-sent mail, so its text content is eligible for Markdown rendering.
 * Any real formatting tag (`b`, `strong`, `a`, `ul`, `h1`…) means the sender
 * formatted the mail deliberately and the HTML must win as-is.
 */
export function isPlainWrapperHtml(html: string | undefined): boolean {
  if (!html) return true;
  const clean = html.replace(/<!--[\s\S]*?-->/g, '');
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(clean)) !== null) {
    const tag = m[1].toLowerCase();
    if (tag !== 'p' && tag !== 'div' && tag !== 'br') return false;
  }
  return true;
}
