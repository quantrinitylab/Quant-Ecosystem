// ============================================================================
// The two bodies a message carries — Tests
// ============================================================================
//
// These functions decide what a recipient actually reads, and every one of them
// exists because the composer used to send the same plain-text string as `body`,
// `bodyText` AND `bodyHtml`. `EmailLetterCard` takes the HTML branch as soon as
// `bodyHtml` is non-empty, and that branch has no `whitespace-pre-wrap` — so the
// assertions that matter are the ones that go red if a line break, a literal
// `<`, or the signature stops surviving the trip.

import { describe, it, expect } from 'vitest';
import {
  SIGNATURE_DELIMITER,
  composeMessageBodies,
  escapeHtml,
  htmlToPlainText,
  plainTextToHtml,
  stripTrailingSignature,
} from '../lib/email-body';

describe('escapeHtml', () => {
  it('encodes the five characters that would otherwise become markup', () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });

  it('encodes the ampersand once, not twice', () => {
    // `&` must be replaced before `<`, or `<` becomes `&amp;lt;` and the reader
    // shows the entity instead of the character.
    expect(escapeHtml('a < b && c')).toBe('a &lt; b &amp;&amp; c');
  });
});

describe('plainTextToHtml', () => {
  it('makes a blank line a paragraph and a single newline a break', () => {
    expect(plainTextToHtml('one\ntwo\n\nthree')).toBe('<p>one<br />two</p>\n<p>three</p>');
  });

  it('keeps a body that contains angle brackets readable', () => {
    // The defect this replaces: `if x < 3` sent as raw `bodyHtml` lost its middle,
    // because the browser read `< 3 && y >` as a tag.
    expect(plainTextToHtml('if x < 3 && y > 4')).toBe('<p>if x &lt; 3 &amp;&amp; y &gt; 4</p>');
  });

  it('returns empty for empty input rather than an empty paragraph', () => {
    // A non-empty `bodyHtml` makes the reader take the HTML branch, so `<p></p>`
    // here would hide a plain-text body that does exist.
    expect(plainTextToHtml('')).toBe('');
    expect(plainTextToHtml('   \n\n  ')).toBe('');
  });

  it('collapses three or more newlines to one paragraph break', () => {
    expect(plainTextToHtml('a\n\n\n\nb')).toBe('<p>a</p>\n<p>b</p>');
  });
});

describe('htmlToPlainText', () => {
  it('turns breaks and block ends into newlines', () => {
    expect(htmlToPlainText('<p>Kundan</p><p>Founder<br />Quantrinity</p>')).toBe(
      'Kundan\nFounder\nQuantrinity',
    );
  });

  it('keeps link text and drops the markup around it', () => {
    expect(htmlToPlainText('<a href="https://quantmail.in">quantmail.in</a>')).toBe('quantmail.in');
  });

  it('decodes entities without turning &amp;lt; into a bracket', () => {
    // Mirror image of escapeHtml's ordering: `&amp;` is decoded last, so
    // `&amp;lt;` survives as the literal text `&lt;` rather than becoming `<`.
    expect(htmlToPlainText('a &amp;&amp; b &lt;c&gt; &nbsp;d')).toBe('a && b <c>  d');
    expect(htmlToPlainText('&amp;lt;')).toBe('&lt;');
  });

  it('does not leave the runs of blank lines that stacked tags produce', () => {
    expect(htmlToPlainText('<div>a</div><br /><br /><br /><div>b</div>')).toBe('a\n\nb');
  });
});

describe('composeMessageBodies', () => {
  it('sends the typed text as text and the same content as markup', () => {
    const { bodyText, bodyHtml } = composeMessageBodies('Hello\n\nThanks');
    expect(bodyText).toBe('Hello\n\nThanks');
    expect(bodyHtml).toBe('<p>Hello</p>\n<p>Thanks</p>');
  });

  it('appends the signature to both halves', () => {
    const { bodyText, bodyHtml } = composeMessageBodies(
      'Ready for Monday.',
      '<p><b>Kundan</b><br />Quantrinity</p>',
    );

    // Plain text gets the RFC 3676 delimiter so a draft can be restored without it.
    expect(bodyText).toBe(`Ready for Monday.\n\n${SIGNATURE_DELIMITER}\nKundan\nQuantrinity`);
    // HTML keeps the signature's own markup — bold stays bold.
    expect(bodyHtml).toBe(
      '<p>Ready for Monday.</p>\n<hr />\n<p><b>Kundan</b><br />Quantrinity</p>',
    );
  });

  it('treats an empty or whitespace signature as no signature', () => {
    for (const signature of ['', '   ', '\n']) {
      const { bodyText, bodyHtml } = composeMessageBodies('Hi', signature);
      expect(bodyText).toBe('Hi');
      expect(bodyHtml).toBe('<p>Hi</p>');
      expect(bodyText).not.toContain(SIGNATURE_DELIMITER);
    }
  });

  it('does not escape the signature, which is already markup', () => {
    const { bodyHtml } = composeMessageBodies('Hi', '<a href="https://quantmail.in">Site</a>');
    expect(bodyHtml).toContain('<a href="https://quantmail.in">Site</a>');
  });

  it('still signs a message whose body is empty', () => {
    // Save-draft has no body guard, so this is reachable.
    const { bodyText, bodyHtml } = composeMessageBodies('', '<p>Kundan</p>');
    expect(bodyText).toBe(`\n\n${SIGNATURE_DELIMITER}\nKundan`);
    expect(bodyHtml).toBe('<hr />\n<p>Kundan</p>');
  });
});

describe('stripTrailingSignature', () => {
  it('removes exactly what composeMessageBodies appended', () => {
    const { bodyText } = composeMessageBodies('Ready for Monday.', '<p>Kundan</p>');
    expect(stripTrailingSignature(bodyText)).toBe('Ready for Monday.');
  });

  it('is a no-op on text that was never signed', () => {
    expect(stripTrailingSignature('Just a note')).toBe('Just a note');
  });

  it('needs the delimiter on its own line, trailing space included', () => {
    // "--" alone is a dash rule someone typed, not RFC 3676's separator.
    expect(stripTrailingSignature('a\n--\nb')).toBe('a\n--\nb');
    expect(stripTrailingSignature('a\n-- \nb')).toBe('a');
  });

  it('splits on the last delimiter, so a quoted one is kept', () => {
    const text = `They wrote:\n${SIGNATURE_DELIMITER}\nTheir sig\n\n${SIGNATURE_DELIMITER}\nMine`;
    expect(stripTrailingSignature(text)).toBe(`They wrote:\n${SIGNATURE_DELIMITER}\nTheir sig`);
  });

  it('survives a round trip twice without eating the body', () => {
    // The draft loop: save, reopen, save again. If the strip were off by a
    // newline the body would lose a character on every pass.
    const first = composeMessageBodies('Body line', '<p>Kundan</p>').bodyText;
    const restored = stripTrailingSignature(first);
    const second = composeMessageBodies(restored, '<p>Kundan</p>').bodyText;
    expect(second).toBe(first);
    expect(stripTrailingSignature(second)).toBe('Body line');
  });
});
