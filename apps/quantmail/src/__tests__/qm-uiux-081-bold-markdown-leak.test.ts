// ============================================================================
// QM-UIUX-081 — Bold formatting must not leak literal Markdown
// ============================================================================
//
// Personal deep audit 2026-10-09 (M-P1-1): selecting text in the docked
// composer and clicking Bold wrapped it in literal "**" asterisks as plain
// text — not rendered bold — and those markers were stored in bodyText, from
// where they surfaced in list snippets, thread previews and the Contacts mail
// history. The full composer's toggles had the mirror defect: they restyled
// only the <textarea> and were dropped entirely on Send.
//
// The fix keeps the edited text marker-free and records formatting as ranges
// (applyInlineFormat / adjustRangesForEdit), renders real HTML at the single
// conversion point (composeMessageBodies), and strips markers from snippets
// of mail that already carries them (sanitizeSnippetText). These tests pin
// all three layers: if any one regresses, raw "**" reaches a reader again.

import { describe, it, expect } from 'vitest';
import {
  adjustRangesForEdit,
  applyInlineFormat,
  composeMessageBodies,
  type InlineFormatRange,
} from '../lib/email-body';
import { sanitizeSnippetText, stripFormattingMarkersForSnippet } from '../lib/threading';

describe('applyInlineFormat — the docked composer Bold button', () => {
  it('records a bold range instead of wrapping the selection in "**"', () => {
    const result = applyInlineFormat('Please review the report today', [], 18, 24, 'bold');
    // The text itself is untouched: no asterisks are inserted, ever.
    expect(result.text).toBe('Please review the report today');
    expect(result.text).not.toContain('*');
    expect(result.ranges).toEqual([{ start: 18, end: 24, kind: 'bold' }]);
  });

  it('toggles formatting off when pressed over an already-bold selection', () => {
    const ranges: InlineFormatRange[] = [{ start: 0, end: 5, kind: 'bold' }];
    const result = applyInlineFormat('Hello world', ranges, 0, 5, 'bold');
    expect(result.ranges).toEqual([]);
  });

  it('inserts a placeholder and formats it when nothing is selected', () => {
    const result = applyInlineFormat('Hi ', [], 3, 3, 'bold');
    expect(result.text).toBe('Hi bold text');
    expect(result.ranges).toEqual([{ start: 3, end: 12, kind: 'bold' }]);
    expect(result.selectionStart).toBe(3);
    expect(result.selectionEnd).toBe(12);
  });

  it('italic and underline are ranges too — no "*" or "<u>" enters the text', () => {
    const italic = applyInlineFormat('some words here', [], 5, 10, 'italic');
    expect(italic.text).toBe('some words here');
    expect(italic.ranges).toEqual([{ start: 5, end: 10, kind: 'italic' }]);
    const underline = applyInlineFormat('some words here', [], 5, 10, 'underline');
    expect(underline.text).not.toContain('<u>');
    expect(underline.ranges).toEqual([{ start: 5, end: 10, kind: 'underline' }]);
  });

  it('list formatting snaps to whole lines and inserts no bullet characters', () => {
    const text = 'intro\nfirst item\nsecond item';
    const result = applyInlineFormat(text, [], 8, 13, 'list');
    expect(result.text).toBe(text);
    expect(result.ranges).toEqual([{ start: 6, end: 16, kind: 'list' }]);
  });
});

describe('adjustRangesForEdit — ranges stay glued to their words while typing', () => {
  const ranges: InlineFormatRange[] = [{ start: 6, end: 11, kind: 'bold' }];

  it('shifts a range when text is inserted before it', () => {
    expect(adjustRangesForEdit(ranges, 'Hello world', 'Well Hello world')).toEqual([
      { start: 11, end: 16, kind: 'bold' },
    ]);
  });

  it('grows a range when text is inserted strictly inside it', () => {
    expect(adjustRangesForEdit(ranges, 'Hello world', 'Hello woXYZrld')).toEqual([
      { start: 6, end: 14, kind: 'bold' },
    ]);
  });

  it('drops a range whose text was deleted', () => {
    expect(adjustRangesForEdit(ranges, 'Hello world', 'Hello ')).toEqual([]);
  });

  it('returns the ranges untouched when the text did not change', () => {
    expect(adjustRangesForEdit(ranges, 'Hello world', 'Hello world')).toBe(ranges);
  });
});

describe('composeMessageBodies with formatting — what actually gets sent', () => {
  it('sends <strong> in bodyHtml and clean prose in bodyText for a bold range', () => {
    const { bodyText, bodyHtml } = composeMessageBodies('Please review the report today', '', {
      inline: [{ start: 18, end: 24, kind: 'bold' }],
    });
    expect(bodyHtml).toBe('<p>Please review the <strong>report</strong> today</p>');
    expect(bodyText).toBe('Please review the report today');
    expect(bodyText).not.toContain('**');
    expect(bodyHtml).not.toContain('**');
  });

  it('renders italic, underline and strikethrough ranges as real tags', () => {
    const { bodyHtml } = composeMessageBodies('a b c d', '', {
      inline: [
        { start: 0, end: 1, kind: 'italic' },
        { start: 2, end: 3, kind: 'underline' },
        { start: 4, end: 5, kind: 'strikethrough' },
      ],
    });
    expect(bodyHtml).toBe('<p><em>a</em> <u>b</u> <s>c</s> d</p>');
  });

  it('nests overlapping ranges instead of leaking either marker set', () => {
    const { bodyHtml, bodyText } = composeMessageBodies('very important words', '', {
      inline: [
        { start: 0, end: 14, kind: 'bold' },
        { start: 5, end: 14, kind: 'italic' },
      ],
    });
    expect(bodyHtml).toBe('<p><strong>very </strong><strong><em>important</em></strong> words</p>');
    expect(bodyText).toBe('very important words');
  });

  it('escapes HTML inside a formatted range — formatting is not an injection hole', () => {
    const { bodyHtml } = composeMessageBodies('x <script> y', '', {
      inline: [{ start: 0, end: 12, kind: 'bold' }],
    });
    expect(bodyHtml).toContain('<strong>x &lt;script&gt; y</strong>');
    expect(bodyHtml).not.toContain('<script>');
  });

  it('renders listed lines as a real list in HTML and honest bullets in text', () => {
    const text = 'Shopping:\nmilk\neggs';
    const { bodyText, bodyHtml } = composeMessageBodies(text, '', {
      inline: [{ start: 10, end: 19, kind: 'list' }],
    });
    expect(bodyHtml).toBe('<p>Shopping:</p>\n<ul><li>milk</li><li>eggs</li></ul>');
    expect(bodyText).toBe('Shopping:\n• milk\n• eggs');
  });

  it('carries the full composer whole-message Bold toggle into the sent HTML', () => {
    const { bodyText, bodyHtml } = composeMessageBodies('Hello\n\nThanks', '', { bold: true });
    expect(bodyHtml).toBe('<p><strong>Hello</strong></p>\n<p><strong>Thanks</strong></p>');
    expect(bodyText).toBe('Hello\n\nThanks');
  });

  it('wraps non-default presentation in a validated inline style', () => {
    const { bodyHtml } = composeMessageBodies('Hi', '', {
      color: '#f43f5e',
      fontFamily: 'Georgia, serif',
      fontSizePx: 16,
      textAlign: 'center',
    });
    expect(bodyHtml).toBe(
      '<div style="color:#f43f5e;font-family:Georgia, serif;font-size:16px;text-align:center"><p>Hi</p></div>',
    );
  });

  it('drops style values that are not plain presentation values', () => {
    const { bodyHtml } = composeMessageBodies('Hi', '', {
      color: 'red; background:url(evil)' as string,
      fontFamily: 'x; } </style><script>' as string,
    });
    expect(bodyHtml).toBe('<p>Hi</p>');
    expect(bodyHtml).not.toContain('evil');
    expect(bodyHtml).not.toContain('<script>');
  });

  it('shifts ranges for the trim the composer body carries', () => {
    // The editor holds "  Hello world  " and the selection covered "world";
    // compose trims before sending and the range must follow its word.
    const { bodyHtml } = composeMessageBodies('  Hello world  ', '', {
      inline: [{ start: 8, end: 13, kind: 'bold' }],
    });
    expect(bodyHtml).toBe('<p>Hello <strong>world</strong></p>');
  });

  it('appends the signature after formatted content in both halves', () => {
    const { bodyText, bodyHtml } = composeMessageBodies('Ready.', '<p>Kundan</p>', {
      inline: [{ start: 0, end: 5, kind: 'bold' }],
    });
    expect(bodyHtml).toBe('<p><strong>Ready</strong>.</p>\n<hr />\n<p>Kundan</p>');
    expect(bodyText).toContain('Ready.');
    expect(bodyText).not.toContain('**');
  });

  it('without formatting, output is byte-identical to the legacy conversion', () => {
    const { bodyText, bodyHtml } = composeMessageBodies('Hello\n\nThanks');
    expect(bodyText).toBe('Hello\n\nThanks');
    expect(bodyHtml).toBe('<p>Hello</p>\n<p>Thanks</p>');
  });
});

describe('end-to-end regression — the exact audit flow', () => {
  it('select → Bold → send produces no "**" anywhere a reader can see it', () => {
    // 1. The user selects "report" in the docked composer and clicks Bold.
    const edited = applyInlineFormat('Please review the report today', [], 18, 24, 'bold');
    // 2. The composer sends through the one conversion point.
    const { bodyText, bodyHtml } = composeMessageBodies(edited.text, '', {
      inline: edited.ranges,
    });
    // 3. Every surface a reader meets: the body, and the snippet derived
    //    from bodyText for list rows / previews / Contacts history.
    expect(bodyHtml).toContain('<strong>report</strong>');
    expect(bodyText).not.toContain('*');
    expect(sanitizeSnippetText(bodyText)).toBe('Please review the report today');
  });
});

describe('snippet hardening — mail that already carries markers', () => {
  it('strips bold/italic/code/link markers from snippets', () => {
    expect(sanitizeSnippetText('Please review the **attached report** today.')).toBe(
      'Please review the attached report today.',
    );
    expect(sanitizeSnippetText('This is *important* and `urgent`')).toBe(
      'This is important and urgent',
    );
    expect(sanitizeSnippetText('See [the plan](https://example.com/plan) now')).toBe(
      'See the plan now',
    );
  });

  it('strips the literal <u> tags the old underline button inserted', () => {
    expect(sanitizeSnippetText('<u>underlined text</u> shipped')).toBe('underlined text shipped');
  });

  it('leaves ordinary prose with asterisks and underscores untouched', () => {
    expect(stripFormattingMarkersForSnippet('2 * 3 = 6')).toBe('2 * 3 = 6');
    expect(stripFormattingMarkersForSnippet('call_mom_later please')).toBe('call_mom_later please');
    expect(stripFormattingMarkersForSnippet('if x < 3 && y > 4')).toBe('if x < 3 && y > 4');
  });
});
