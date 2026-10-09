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

/**
 * Attributes that turn a passive body into a request the reader did not make.
 * `class` is here for a different reason (QM-UIUX-043): the body renders inside
 * the app DOM, so a sender's classes resolve against the app shell's own
 * utility stylesheet — `class="bg-white text-black"` would repaint the message
 * (or, with layout utilities, the shell around it) in the sender's styling.
 */
const EMAIL_FORBID_ATTR = [
  'srcdoc',
  'formaction',
  'action',
  'background',
  'ping',
  'autofocus',
  'srcset',
  'class',
] as const;

/**
 * Inline `style` properties that fight the app's dark theme. HTML mail authors
 * hardcode light-mode colors (`background:#ffffff`, `color:#333`), which render
 * as unreadable white boxes on a dark UI. Stripping them lets the body inherit
 * the app's own dark-mode text/background styles. Every other inline property
 * (font-size, padding, …) is left untouched.
 */
const DARK_MODE_STRIP_PROPS = [
  'color',
  'background',
  'background-color',
  'background-image',
] as const;

function stripDarkModeHostileStyles(root: ParentNode): void {
  for (const el of Array.from(root.querySelectorAll('[style]'))) {
    const style = (el as HTMLElement).style;
    for (const prop of DARK_MODE_STRIP_PROPS) style.removeProperty(prop);
    if (!style.length) el.removeAttribute('style');
  }
}

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

  // QM-UIUX-041: drop hardcoded light-mode colors so the body follows dark mode.
  stripDarkModeHostileStyles(fragment);

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
