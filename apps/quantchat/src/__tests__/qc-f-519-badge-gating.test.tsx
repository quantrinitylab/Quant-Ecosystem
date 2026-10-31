// @vitest-environment jsdom
// ============================================================================
// QC-F-519 — badge gating: SummarizeButton + MessageTranslate rendered the
// "AI-generated" badge UNCONDITIONALLY on every successful result, so
// hand-written canned output carried the AI stamp. The badge may render
// ONLY when the backend result is flagged isAIGenerated === true (real
// inference). The honest-empty summarize result (isAIGenerated:false) and
// the unavailable path (fetcher null on a 503) must stay unbadged.
//
// Negative control: on the original components the isAIGenerated:false
// cases FAIL (badge renders unconditionally). The isAIGenerated:true cases
// PASS on both versions (control).
// ============================================================================

import { describe, it, expect, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SummarizeButton, type SummaryResponse } from '../components/chat/SummarizeButton';
import { MessageTranslate, type TranslateResponse } from '../components/chat/MessageTranslate';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
});

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function render(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(node);
  });
}

function clickButton(ariaLabel: string) {
  const btn = container!.querySelector(`button[aria-label="${ariaLabel}"]`);
  expect(btn, `button ${ariaLabel}`).not.toBeNull();
  act(() => {
    btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

const badge = () => container!.querySelector('[data-ai-generated]');

const summaryData = (isAIGenerated: boolean): SummaryResponse['data'] => ({
  summary: 'A short summary.',
  keyTopics: ['dinner'],
  messageCount: 3,
  isAIGenerated,
});

const translateData = (isAIGenerated: boolean): TranslateResponse['data'] => ({
  translatedText: 'bonjour',
  detectedSourceLanguage: 'en',
  targetLanguage: 'fr',
  isAIGenerated,
  confidence: 0.9,
});

describe('QC-F-519 SummarizeButton badge gating (T-519-8)', () => {
  it('isAIGenerated:false result → summary shows, badge does NOT', async () => {
    render(
      <SummarizeButton
        conversationId="c1"
        messages={[{ sender: 'alice', content: 'hi' }]}
        fetchSummary={async () => summaryData(false)}
      />,
    );
    clickButton('Summarize conversation');
    await flush();
    expect(container!.textContent).toContain('A short summary.');
    expect(badge()).toBeNull();
  });

  it('isAIGenerated:true result → badge shows (control)', async () => {
    render(
      <SummarizeButton
        conversationId="c1"
        messages={[{ sender: 'alice', content: 'hi' }]}
        fetchSummary={async () => summaryData(true)}
      />,
    );
    clickButton('Summarize conversation');
    await flush();
    expect(container!.textContent).toContain('A short summary.');
    expect(badge()).not.toBeNull();
  });

  it('fetcher null (503 unavailable path) → no badge, honest empty text', async () => {
    render(
      <SummarizeButton
        conversationId="c1"
        messages={[{ sender: 'alice', content: 'hi' }]}
        fetchSummary={async () => null}
      />,
    );
    clickButton('Summarize conversation');
    await flush();
    expect(container!.textContent).toContain("Couldn't generate a summary right now.");
    expect(badge()).toBeNull();
  });
});

describe('QC-F-519 MessageTranslate badge gating (T-519-8)', () => {
  it('isAIGenerated:false result → translation shows, badge does NOT', async () => {
    render(
      <MessageTranslate
        text="hello"
        preferredLanguage="fr"
        translate={async () => translateData(false)}
      />,
    );
    clickButton('Translate message');
    await flush();
    expect(container!.textContent).toContain('bonjour');
    expect(badge()).toBeNull();
  });

  it('isAIGenerated:true result → badge shows (control)', async () => {
    render(
      <MessageTranslate
        text="hello"
        preferredLanguage="fr"
        translate={async () => translateData(true)}
      />,
    );
    clickButton('Translate message');
    await flush();
    expect(container!.textContent).toContain('bonjour');
    expect(badge()).not.toBeNull();
  });
});
