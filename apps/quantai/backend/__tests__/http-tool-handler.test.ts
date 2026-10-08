// ============================================================================
// QM-QUANTY-003 — http-tool-handler: HTML escaping + param mappers
//
// The voice transcript is untrusted input. Embedding it raw in email HTML
// is an injection vector. These tests pin the escaping behavior.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  mapQuantMailSend,
  mapQuantMailDraft,
  mapQuantMailContactsSearch,
} from '../services/http-tool-handler';

describe('escapeHtml', () => {
  it('escapes the five HTML special chars', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    );
    expect(escapeHtml("a & b 'c'")).toBe('a &amp; b &#39;c&#39;');
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml('Hello Rahul, kaam ho gaya')).toBe('Hello Rahul, kaam ho gaya');
  });
});

describe('mapQuantMailSend', () => {
  it('escapes HTML in the body before wrapping in <p>', () => {
    const out = mapQuantMailSend({
      to: 'rahul@example.com',
      subject: 'hi',
      body: 'Hello <img src=x onerror=alert(1)>',
    });
    expect(out['bodyHtml']).toBe('<p>Hello &lt;img src=x onerror=alert(1)&gt;</p>');
    // Plain-text variant keeps the original for non-HTML clients.
    expect(out['bodyPlain']).toBe('Hello <img src=x onerror=alert(1)>');
  });

  it('converts newlines to <br/> after escaping', () => {
    const out = mapQuantMailSend({ to: 'a@b.com', subject: 's', body: 'a\nb' });
    expect(out['bodyHtml']).toBe('<p>a<br/>b</p>');
  });

  it('splits comma-separated recipients and sets send:true', () => {
    const out = mapQuantMailSend({
      to: 'a@x.com, b@x.com ',
      subject: 's',
      body: 'b',
    });
    expect(out['toAddresses']).toEqual(['a@x.com', 'b@x.com']);
    expect(out['send']).toBe(true);
  });
});

describe('mapQuantMailDraft', () => {
  it('maps to the compose contract with send:false and escaped HTML', () => {
    const out = mapQuantMailDraft({
      to: 'rahul@example.com',
      subject: 'draft',
      body: 'line1\nline2 <b>',
    });
    expect(out['toAddresses']).toEqual(['rahul@example.com']);
    expect(out['send']).toBe(false);
    expect(out['bodyHtml']).toBe('<p>line1<br/>line2 &lt;b&gt;</p>');
  });
});

describe('mapQuantMailContactsSearch', () => {
  it('passes the query through as q', () => {
    expect(mapQuantMailContactsSearch({ q: 'Rahul' })).toEqual({ q: 'Rahul' });
    expect(mapQuantMailContactsSearch({})).toEqual({ q: '' });
  });
});
