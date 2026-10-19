// ============================================================================
// useQuantyAgent locale-following error copy (qm-auto findings-queue P2).
//
// Before the fix, submitCommand threw `Error('Command khaali hai')` and set
// `Quanty se baat nahi ho payi (HTTP …)` — Roman-script Hinglish surfaced to
// English-UI users. Error copy now flows through quantyAgentCopy(locale):
// English default, Devanagari for 'hi' (PR #868 convention, same as the
// CopilotDrawer's quantyDraftSendCopy / quantyConfirmCardCopy).
// ============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nContext, type I18nContextType } from '../../i18n';
import {
  useQuantyAgent,
  quantyAgentCopy,
  type UseQuantyAgent,
} from '../QuantyLiveAgent/useQuantyAgent';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function i18nValue(locale: 'en' | 'hi'): I18nContextType {
  return {
    locale,
    setLocale: () => undefined,
    t: (key) => key,
    supportedLocales: [],
  };
}

function probe(locale: 'en' | 'hi'): UseQuantyAgent {
  let captured: UseQuantyAgent | null = null;
  function Probe() {
    captured = useQuantyAgent();
    return null;
  }
  renderToStaticMarkup(
    React.createElement(
      I18nContext.Provider,
      { value: i18nValue(locale) },
      React.createElement(Probe),
    ),
  );
  if (!captured) throw new Error('hook did not render');
  return captured;
}

describe('quantyAgentCopy: locale-following error copy', () => {
  it('English default has no Roman-script Hinglish', () => {
    const copy = quantyAgentCopy('en');
    expect(copy.emptyCommand).toBe('Command cannot be empty');
    const failed = copy.submitFailed(503);
    expect(failed).toBe('Could not reach Quanty (HTTP 503)');
    expect(`${copy.emptyCommand} ${failed}`).not.toMatch(/khaali|nahi|payi|karein/i);
  });

  it('Hindi locale uses Devanagari (no Roman Hinglish)', () => {
    const copy = quantyAgentCopy('hi');
    expect(copy.emptyCommand).toBe('कमांड खाली है');
    expect(copy.submitFailed(503)).toBe('Quanty से बात नहीं हो पाई (HTTP 503)');
  });
});

describe('useQuantyAgent submitCommand: surfaced errors follow the app locale', () => {
  it('rejects an empty command in English by default (no provider)', async () => {
    const agent = probe('en');
    vi.stubGlobal('fetch', vi.fn());
    await expect(agent.submitCommand('   ')).rejects.toThrow('Command cannot be empty');
  });

  it('rejects an empty command in Devanagari Hindi under the hi locale', async () => {
    const agent = probe('hi');
    vi.stubGlobal('fetch', vi.fn());
    await expect(agent.submitCommand('   ')).rejects.toThrow('कमांड खाली है');
  });

  it('surfaces the HTTP failure in the app locale on the throw', async () => {
    const fetchSpy = vi.fn(async () => ({ ok: false, status: 503 }));
    vi.stubGlobal('fetch', fetchSpy);
    const agent = probe('en');
    await expect(agent.submitCommand('hello')).rejects.toThrow(
      'Could not reach Quanty (HTTP 503)',
    );
  });
});
