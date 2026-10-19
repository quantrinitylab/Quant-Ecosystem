// @vitest-environment jsdom
// ===========================================================================
// QM-FIX: Quanty voice/session surfaces — the 'band karein' aria-label family
// and the visible mic failure lines now follow the app locale (PR #868
// convention: English default, Devanagari when locale is 'hi').
//
// Before the fix these components hardcoded Roman-script Hinglish for every
// user — aria-labels ('Voice session band karein', 'Popup band karein',
// 'Copy ho gaya'/'Status share karein', 'Result band karein', 'Recent
// commands band karein'/'dekhein', 'Sunna band karein'/'Bol kar command
// dein', 'Command bhejein', 'Quanty ko command dein') and VISIBLE mic error
// lines ('Mic ki permission nahi mili…', 'Mic nahi mila…', …) — leaking into
// an otherwise English UI.
//
// The copy now lives in label maps in ./types.ts (X_LABEL / X_LABEL_HI) and
// is picked via useI18n(), same convention as the ActivityFeed/BrowserTab
// label fix. These tests render the REAL components and assert:
//   (a) en renders carry the English copy and zero Hinglish leakage;
//   (b) hi renders carry Devanagari copy and zero Roman-script Hinglish;
//   (c) the share button's title and aria-label stay the same string;
//   (d) a real SpeechRecognition error drives the visible, locale-following
//       failure line (mocked recognizer, honest failure path).
// ===========================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import { I18nContext } from '../i18n';
import {
  VOICE_SESSION_CLOSE_LABEL,
  VOICE_SESSION_CLOSE_LABEL_HI,
  POPUP_CLOSE_LABEL,
  POPUP_CLOSE_LABEL_HI,
  POPUP_SHARE_LABEL,
  POPUP_SHARE_LABEL_HI,
  RESULT_DISMISS_LABEL,
  RESULT_DISMISS_LABEL_HI,
  RECENT_TOGGLE_LABEL,
  RECENT_TOGGLE_LABEL_HI,
  COMMAND_INPUT_LABEL,
  COMMAND_INPUT_LABEL_HI,
  MIC_TOGGLE_LABEL,
  MIC_TOGGLE_LABEL_HI,
  COMMAND_SEND_LABEL,
  COMMAND_SEND_LABEL_HI,
  COMMAND_PLACEHOLDER,
  COMMAND_PLACEHOLDER_HI,
  MIC_ERROR,
  MIC_ERROR_HI,
  QuantyPopupHeader,
  QuantyResultCard,
  QuantyCommandBar,
  type MicErrorKind,
} from '../components/QuantyLiveAgent';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// framer-motion reads matchMedia (reduced motion), which jsdom does not
// implement. Test-environment shim only; product behaviour is untouched.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  delete (window as unknown as Record<string, unknown>).SpeechRecognition;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function providerProps(locale: 'en' | 'hi') {
  return {
    value: {
      locale,
      setLocale: () => undefined,
      t: (key: string) => key,
      supportedLocales: [],
    },
  };
}

function withLocale(locale: 'en' | 'hi', el: React.ReactElement): string {
  return renderToStaticMarkup(
    React.createElement(I18nContext.Provider, providerProps(locale), el),
  );
}

/** Roman-script Hinglish fragments that must never appear in either locale. */
const HINGLISH_LEAKS = [
  'band karein',
  'Band karein',
  'Copy ho gaya',
  'share karein',
  'Sunna band',
  'Bol kar command',
  'bhejein',
  'Quanty se kaho',
  'Mic ki permission',
  'Mic nahi mila',
  'type karke',
  'dobara',
  'sunai nahi',
];

function expectNoHinglish(html: string, where: string): void {
  for (const leak of HINGLISH_LEAKS) {
    expect(html, `${where} must not leak Hinglish: ${leak}`).not.toContain(leak);
  }
}

function expectDevanagari(s: string, where: string): void {
  expect(s, `${where} should be Devanagari`).toMatch(/[\u0900-\u097F]/);
}

// ---------------------------------------------------------------------------
// Label maps in types.ts
// ---------------------------------------------------------------------------

describe('voice-session locale copy maps', () => {
  const errorKinds: MicErrorKind[] = [
    'noSpeechApi',
    'permission',
    'noSpeech',
    'noMic',
    'network',
    'unknown',
    'startFailed',
  ];

  it('defines every mic failure line in both locales', () => {
    for (const kind of errorKinds) {
      expect(MIC_ERROR[kind], `en mic error ${kind}`).toBeTruthy();
      expect(MIC_ERROR_HI[kind], `hi mic error ${kind}`).toBeTruthy();
      expectDevanagari(MIC_ERROR_HI[kind], `hi mic error ${kind}`);
    }
  });

  it('keeps Roman-script Hinglish out of the English copy', () => {
    const enStrings = [
      VOICE_SESSION_CLOSE_LABEL,
      POPUP_CLOSE_LABEL,
      POPUP_SHARE_LABEL.share,
      POPUP_SHARE_LABEL.copied,
      RESULT_DISMISS_LABEL,
      RECENT_TOGGLE_LABEL.open,
      RECENT_TOGGLE_LABEL.close,
      COMMAND_INPUT_LABEL,
      MIC_TOGGLE_LABEL.start,
      MIC_TOGGLE_LABEL.stop,
      COMMAND_SEND_LABEL,
      COMMAND_PLACEHOLDER,
      ...errorKinds.map((k) => MIC_ERROR[k]),
    ];
    for (const s of enStrings) {
      for (const leak of HINGLISH_LEAKS) {
        expect(s, `en copy "${s}" must not contain "${leak}"`).not.toContain(leak);
      }
    }
  });

  it('keeps Roman-script Hinglish out of the Hindi copy — Devanagari only', () => {
    const hiStrings = [
      VOICE_SESSION_CLOSE_LABEL_HI,
      POPUP_CLOSE_LABEL_HI,
      POPUP_SHARE_LABEL_HI.share,
      POPUP_SHARE_LABEL_HI.copied,
      RESULT_DISMISS_LABEL_HI,
      RECENT_TOGGLE_LABEL_HI.open,
      RECENT_TOGGLE_LABEL_HI.close,
      COMMAND_INPUT_LABEL_HI,
      MIC_TOGGLE_LABEL_HI.start,
      MIC_TOGGLE_LABEL_HI.stop,
      COMMAND_SEND_LABEL_HI,
      COMMAND_PLACEHOLDER_HI,
      ...errorKinds.map((k) => MIC_ERROR_HI[k]),
    ];
    for (const s of hiStrings) {
      expectDevanagari(s, `hi copy`);
      for (const leak of HINGLISH_LEAKS) {
        expect(s, `hi copy "${s}" must not contain "${leak}"`).not.toContain(leak);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// QuantyPopupHeader
// ---------------------------------------------------------------------------

describe('QuantyPopupHeader locale', () => {
  it('renders English close/share copy with no Hinglish leakage (default locale)', () => {
    const html = withLocale('en', React.createElement(QuantyPopupHeader, { onClose: () => undefined }));
    expect(html).toContain('aria-label="Close popup"');
    expect(html).toContain('aria-label="Share"');
    // Title and aria-label share one locale-following string (never drift).
    expect(html).toContain('title="Share"');
    expectNoHinglish(html, 'popup header (en)');
  });

  it('renders Devanagari close/share copy when the app locale is hi', () => {
    const html = withLocale('hi', React.createElement(QuantyPopupHeader, { onClose: () => undefined }));
    expect(html).toContain('aria-label="पॉपअप बंद करें"');
    expect(html).toContain('aria-label="साझा करें"');
    expect(html).toContain('title="साझा करें"');
    expectNoHinglish(html, 'popup header (hi)');
  });
});

// ---------------------------------------------------------------------------
// QuantyResultCard
// ---------------------------------------------------------------------------

describe('QuantyResultCard locale', () => {
  const doneTask = {
    id: 't1',
    command: 'archive my unread emails',
    status: 'done' as const,
    steps: [],
    reversible: false,
    createdAt: '2026-10-19T10:00:00+05:30',
    updatedAt: '2026-10-19T10:00:05+05:30',
  };

  it('renders an English dismiss aria-label with no Hinglish leakage (default locale)', () => {
    const html = withLocale(
      'en',
      React.createElement(QuantyResultCard, { task: doneTask, onDismiss: () => undefined }),
    );
    expect(html).toContain('aria-label="Dismiss result"');
    expectNoHinglish(html, 'result card (en)');
  });

  it('renders a Devanagari dismiss aria-label when the app locale is hi', () => {
    const html = withLocale(
      'hi',
      React.createElement(QuantyResultCard, { task: doneTask, onDismiss: () => undefined }),
    );
    expect(html).toContain('aria-label="परिणाम बंद करें"');
    expectNoHinglish(html, 'result card (hi)');
  });
});

// ---------------------------------------------------------------------------
// QuantyCommandBar — labels + default placeholder
// ---------------------------------------------------------------------------

describe('QuantyCommandBar locale', () => {
  it('renders English labels and placeholder with no Hinglish leakage (default locale)', () => {
    const html = withLocale('en', React.createElement(QuantyCommandBar, { onSubmit: () => undefined }));
    expect(html).toContain('aria-label="Give Quanty a command"');
    expect(html).toContain('aria-label="Speak your command"');
    expect(html).toContain('aria-label="Send command"');
    expect(html).toContain('aria-label="Show recent commands"');
    expect(html).toContain('placeholder="Tell Quanty…');
    expectNoHinglish(html, 'command bar (en)');
  });

  it('renders Devanagari labels and placeholder when the app locale is hi', () => {
    const html = withLocale('hi', React.createElement(QuantyCommandBar, { onSubmit: () => undefined }));
    expect(html).toContain('aria-label="क्वांटी को कमांड दें"');
    expect(html).toContain('aria-label="बोलकर कमांड दें"');
    expect(html).toContain('aria-label="कमांड भेजें"');
    expect(html).toContain('aria-label="हाल के कमांड देखें"');
    expect(html).toContain('क्वांटी से कहें');
    expectNoHinglish(html, 'command bar (hi)');
  });

  it('keeps an explicitly passed placeholder untouched (prop wins over locale)', () => {
    const html = withLocale(
      'hi',
      React.createElement(QuantyCommandBar, {
        onSubmit: () => undefined,
        placeholder: 'Type here',
      }),
    );
    expect(html).toContain('placeholder="Type here"');
  });
});

// ---------------------------------------------------------------------------
// Mic failure lines — honest, visible, locale-following (jsdom + mocked
// SpeechRecognition). The component must never swallow a voice failure and
// must explain it in the user's language.
// ---------------------------------------------------------------------------

interface FakeRecognizer {
  onresult: ((e: unknown) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
}

let instances: FakeRecognizer[] = [];
let root: Root | null = null;
let host: HTMLDivElement | null = null;

function installFakeSpeechRecognition(): void {
  instances = [];
  class FakeSR implements FakeRecognizer {
    lang = '';
    interimResults = false;
    maxAlternatives = 1;
    onresult: ((e: unknown) => void) | null = null;
    onend: (() => void) | null = null;
    onerror: ((e: { error?: string }) => void) | null = null;
    constructor() {
      instances.push(this);
    }
    start(): void {}
    stop(): void {}
  }
  (window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeSR;
}

function renderBar(locale: 'en' | 'hi'): HTMLDivElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      React.createElement(
        I18nContext.Provider,
        providerProps(locale),
        React.createElement(QuantyCommandBar, {
          onSubmit: () => undefined,
          autoStartListening: true,
        }),
      ),
    );
  });
  return host!;
}

function unmountBar(): void {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
}

describe('QuantyCommandBar mic failures', () => {
  it('explains a denied mic permission in English (default locale)', () => {
    installFakeSpeechRecognition();
    const el = renderBar('en');
    expect(instances.length).toBeGreaterThan(0);
    act(() => {
      instances[instances.length - 1].onerror?.({ error: 'not-allowed' });
    });
    const text = el.textContent ?? '';
    expect(text).toContain("Mic permission wasn't granted");
    expectNoHinglish(text, 'mic permission error (en)');
    unmountBar();
  });

  it('explains a denied mic permission in Devanagari when the app locale is hi', () => {
    installFakeSpeechRecognition();
    const el = renderBar('hi');
    act(() => {
      instances[instances.length - 1].onerror?.({ error: 'not-allowed' });
    });
    const text = el.textContent ?? '';
    expect(text).toContain('माइक की अनुमति नहीं मिली');
    expectNoHinglish(text, 'mic permission error (hi)');
    unmountBar();
  });

  it('explains a missing mic device honestly instead of failing silently', () => {
    installFakeSpeechRecognition();
    const el = renderBar('en');
    act(() => {
      instances[instances.length - 1].onerror?.({ error: 'audio-capture' });
    });
    expect(el.textContent ?? '').toContain("No mic found");
    unmountBar();
  });

  it('explains itself when the browser has no Web Speech API (mic tap, default locale)', () => {
    // No recognizer installed: the mic button stays tappable so the reason is
    // visible — a disabled button explains nothing on touch.
    const el = renderBar('en');
    const micButton = el.querySelector('button[aria-label="Speak your command"]');
    expect(micButton, 'mic button should be rendered and tappable').not.toBeNull();
    act(() => {
      micButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const text = el.textContent ?? '';
    expect(text).toContain("Voice input isn't available in this browser");
    expectNoHinglish(text, 'no-speech-api error (en)');
    unmountBar();
  });
});
