import DOMPurify from 'dompurify';

/**
 * Sanitizes HTML content for safe rendering (emails, documents, rich text).
 * Strips dangerous elements (scripts, event handlers, etc.) while preserving safe HTML.
 * Returns the input unchanged during SSR (no window available).
 */
export function sanitizeHtmlContent(html: string): string {
  if (typeof window === 'undefined') {
    // Fail-closed: DOMPurify needs a DOM. On the server we cannot sanitize,
    // so never emit raw HTML (would be an XSS sink in SSR output). The client
    // re-runs sanitization on hydration and renders the real content.
    return '';
  }
  return DOMPurify.sanitize(html);
}

/**
 * Tags that have no legitimate place in a received email body. `USE_PROFILES`
 * already drops SVG and MathML (the two richest mXSS surfaces); this list closes
 * the interactive and metadata surfaces that the HTML profile would otherwise
 * keep — a `<form>` in a message body is phishing, not formatting.
 */
const EMAIL_FORBID_TAGS = [
  'style',
  'form',
  'input',
  'button',
  'select',
  'option',
  'textarea',
  'label',
  'fieldset',
  'base',
  'link',
  'meta',
  'title',
  'template',
  'slot',
] as const;

/** Attributes that turn a passive body into a request the reader did not make. */
const EMAIL_FORBID_ATTR = [
  'srcdoc',
  'formaction',
  'action',
  'background',
  'ping',
  'autofocus',
  'srcset',
] as const;

/**
 * Sanitizes a received email body for rendering.
 *
 * Stricter than {@link sanitizeHtmlContent}: mail arrives from third parties over
 * SMTP, so this drops SVG/MathML entirely, forbids interactive and metadata tags,
 * and then hardens what survives — links open in a new tab without leaking the
 * opener, and remote images load lazily without a referrer, so a tracking pixel
 * cannot learn which message was opened from which mailbox.
 *
 * Returns '' during SSR (no DOM to sanitize against); callers render their
 * plain-text fallback until the browser can clean the markup.
 */
export function sanitizeEmailHtml(html: string): string {
  if (typeof window === 'undefined') return '';

  const fragment = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: [...EMAIL_FORBID_TAGS],
    FORBID_ATTR: [...EMAIL_FORBID_ATTR],
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target', 'rel'],
    RETURN_DOM_FRAGMENT: true,
  });

  for (const anchor of Array.from(fragment.querySelectorAll('a[href]'))) {
    anchor.setAttribute('target', '_blank');
    anchor.setAttribute('rel', 'noopener noreferrer nofollow');
  }
  for (const image of Array.from(fragment.querySelectorAll('img'))) {
    image.setAttribute('loading', 'lazy');
    image.setAttribute('decoding', 'async');
    image.setAttribute('referrerpolicy', 'no-referrer');
  }

  const host = document.createElement('div');
  host.appendChild(fragment);
  return host.innerHTML;
}

/**
 * Sanitizes HTML output from syntax highlighters.
 * Only allows <span> with class attributes and <br> tags.
 * Returns the input unchanged during SSR (no window available).
 */
export function sanitizeCodeHighlight(html: string): string {
  if (typeof window === 'undefined') {
    // Fail-closed: DOMPurify needs a DOM. On the server we cannot sanitize,
    // so never emit raw HTML (would be an XSS sink in SSR output). The client
    // re-runs sanitization on hydration and renders the real content.
    return '';
  }
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['span', 'br'],
    ALLOWED_ATTR: ['class'],
  });
}
