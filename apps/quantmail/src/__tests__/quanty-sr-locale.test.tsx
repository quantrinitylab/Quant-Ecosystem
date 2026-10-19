// @vitest-environment node
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { I18nContext } from '../i18n';
import { QuantyActivityFeed } from '../components/QuantyLiveAgent/QuantyActivityFeed';
import { QuantyBrowserTab } from '../components/QuantyLiveAgent/tabs/QuantyBrowserTab';
import type {
  QuantyStep,
  QuantyStepStatus,
  QuantyBrowserTask,
} from '../components/QuantyLiveAgent/types';

const STATUSES: QuantyStepStatus[] = [
  'pending',
  'running',
  'done',
  'error',
  'waiting-confirm',
  'skipped',
];

function makeStep(id: string, status: QuantyStepStatus, extra?: Partial<QuantyStep>): QuantyStep {
  return {
    id,
    label: `Step ${id}`,
    status,
    updatedAt: '2026-10-11T14:30:05+05:30',
    ...extra,
  };
}

function makeTask(id: string, status: QuantyBrowserTask['status']): QuantyBrowserTask {
  return {
    id,
    title: `Task ${id}`,
    url: 'quantmail.in',
    status,
    startedAt: '2026-10-11T14:30:05+05:30',
  };
}

/** Render under a pinned locale without effects (renderToStaticMarkup never runs the provider's hydration effect). */
function withLocale(locale: 'en' | 'hi', node: React.ReactNode) {
  return createElement(
    I18nContext.Provider,
    {
      value: {
        locale,
        setLocale: () => {},
        t: (key: string) => key,
        supportedLocales: [],
      },
    },
    node,
  );
}

const HINGLISH_LEAKS = [
  'baki hai',
  'chal raha hai',
  'ho gaya',
  'fail hua',
  'permission chahiye',
  'chhod diya',
  'Saare steps dekhein',
  'Sirf latest step dekhein',
  'tap karke dekhein kahan kaam hua',
  'poora hua',
];

describe('QuantyActivityFeed SR labels follow the app locale', () => {
  it('en (default): step SR captions are English, not hardcoded Hinglish', () => {
    const steps = STATUSES.map((status, i) => makeStep(`s${i}`, status));
    const html = renderToStaticMarkup(
      withLocale('en', createElement(QuantyActivityFeed, { steps })),
    );
    expect(html).toContain('aria-label="Step s0 — Pending"');
    expect(html).toContain('aria-label="Step s1 — Running"');
    expect(html).toContain('aria-label="Step s2 — Done"');
    expect(html).toContain('aria-label="Step s3 — Failed"');
    expect(html).toContain('aria-label="Step s4 — Needs your confirmation"');
    expect(html).toContain('aria-label="Step s5 — Skipped"');
    for (const leak of HINGLISH_LEAKS) {
      expect(html).not.toContain(leak);
    }
  });

  it('en: tappable step hint is English, not Hinglish', () => {
    const steps = [
      makeStep('tap1', 'running', {
        targetSelector: '[data-thread-id="abc"]',
      }),
    ];
    const html = renderToStaticMarkup(
      withLocale(
        'en',
        createElement(QuantyActivityFeed, {
          steps,
          onStepTap: () => {},
        }),
      ),
    );
    expect(html).toContain('tap to see where the action happened');
    expect(html).not.toContain('tap karke dekhein kahan kaam hua');
  });

  it('en: collapse toggle aria-label matches its English visible copy', () => {
    const steps = [makeStep('s0', 'done')];
    const expanded = renderToStaticMarkup(
      withLocale(
        'en',
        createElement(QuantyActivityFeed, {
          steps,
          onToggleCollapse: () => {},
        }),
      ),
    );
    expect(expanded).toContain('aria-label="Collapse"');
    expect(expanded).toContain('>Collapse</button>');

    const collapsed = renderToStaticMarkup(
      withLocale(
        'en',
        createElement(QuantyActivityFeed, {
          steps,
          collapsed: true,
          onToggleCollapse: () => {},
        }),
      ),
    );
    expect(collapsed).toContain('aria-label="Expand"');
    expect(collapsed).toContain('>Expand</button>');
    expect(collapsed).not.toContain('Saare steps dekhein');
    expect(expanded).not.toContain('Sirf latest step dekhein');
  });

  it('hi: step SR captions and toggle copy are Devanagari', () => {
    const steps = STATUSES.map((status, i) => makeStep(`s${i}`, status));
    const html = renderToStaticMarkup(
      withLocale('hi', createElement(QuantyActivityFeed, { steps })),
    );
    expect(html).toContain('aria-label="Step s0 — बाकी है"');
    expect(html).toContain('aria-label="Step s1 — चल रहा है"');
    expect(html).toContain('aria-label="Step s2 — हो गया"');
    expect(html).toContain('aria-label="Step s3 — असफल हुआ"');
    expect(html).toContain('aria-label="Step s4 — आपकी अनुमति चाहिए"');
    expect(html).toContain('aria-label="Step s5 — छोड़ दिया गया"');
    for (const leak of HINGLISH_LEAKS) {
      expect(html).not.toContain(leak);
    }

    const collapsed = renderToStaticMarkup(
      withLocale(
        'hi',
        createElement(QuantyActivityFeed, {
          steps,
          collapsed: true,
          onToggleCollapse: () => {},
        }),
      ),
    );
    expect(collapsed).toContain('aria-label="विस्तार करें"');
    expect(collapsed).toContain('>विस्तार करें</button>');
  });
});

describe('QuantyBrowserTab status labels follow the app locale', () => {
  it('en (default): task SR status captions are English, not hardcoded Hinglish', () => {
    const tasks = [
      makeTask('t1', 'running'),
      makeTask('t2', 'done'),
      makeTask('t3', 'failed'),
    ];
    const html = renderToStaticMarkup(
      withLocale('en', createElement(QuantyBrowserTab, { tasks })),
    );
    expect(html).toContain('aria-label="Task t1 — Running"');
    expect(html).toContain('aria-label="Task t2 — Done"');
    expect(html).toContain('aria-label="Task t3 — Failed"');
    for (const leak of ['chal raha hai', 'poora hua', 'fail hua']) {
      expect(html).not.toContain(leak);
    }
  });

  it('hi: task SR status captions are Devanagari', () => {
    const tasks = [
      makeTask('t1', 'running'),
      makeTask('t2', 'done'),
      makeTask('t3', 'failed'),
    ];
    const html = renderToStaticMarkup(
      withLocale('hi', createElement(QuantyBrowserTab, { tasks })),
    );
    expect(html).toContain('aria-label="Task t1 — चल रहा है"');
    expect(html).toContain('aria-label="Task t2 — पूरा हुआ"');
    expect(html).toContain('aria-label="Task t3 — असफल हुआ"');
  });
});
