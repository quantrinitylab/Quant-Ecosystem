import { describe, it, expect, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { readFileSync } from 'node:fs';

import { CalendarTrackersSubView } from '../components/CalendarSubViews';

/**
 * qm-calendar-indigo-sky-accents — Calendar surface accent classification.
 *
 * Calendar's locked pillar accent is blue #4285F4 (pillar-accents.ts:
 * Mail orange, Calendar blue, Drive green, Contacts amber, QuantGit purple).
 * A queued finding flagged every indigo/sky token on the Calendar surface as
 * a violation. Full-file review showed only ONE of them actually is:
 *
 *  - FIXED: the guests/attendees icon in CalendarEventForm used
 *    `text-indigo-400` — a generic event-form control icon whose sibling
 *    core controls (time, recurrence, reminders) all use
 *    `var(--app-accent)`. Indigo there carried no meaning, so it now uses
 *    the app-accent token too.
 *
 *  - DELIBERATE, kept (the finding itself allows "deliberate semantic
 *    category colors"): the rest are per-category / per-metric / per-card
 *    domain colors, not pillar accents —
 *      * Sleep chip + Sleep moon icon, indigo = night/sleep. In the event
 *        form Sleep sits in the CLUE tracker palette where EVERY category
 *        has its own hue (Period Flow rose, Intimate Health pink, Hot
 *        Flashes amber, Pain blue, Sleep indigo); recoloring Sleep to
 *        calendar blue would collide with Pain's blue and destroy the
 *        category distinction. In the Trackers subview Sleep sits next to
 *        Water (sky) and Resting HR (emerald) — per-metric colors.
 *      * Water Intake widget, sky = water. The droplet + ml progress bar
 *        is water data; sky distinguishes the metric inside the emerald
 *        Health & Vitals card.
 *      * Life Event Trackers card, sky = the card's domain color (the
 *        Trackers subview color-codes its three cards: cycle rose, health
 *        emerald, life-events sky) and the default `tone` for
 *        Countdown/Legal trackers (Recurring Cycle -> emerald,
 *        Medical/Health -> rose, else sky).
 *
 * These tests pin the fix AND the classification, so a future agent does
 * not "fix" the semantic colors (destroying health-data distinctions) or
 * regress the guests icon. DOM-free: renderToStaticMarkup only, no jsdom /
 * @testing-library/react (neither is a dependency of this package, so
 * importing them fails CI's frozen-lockfile gate).
 */

const EVENT_FORM_SRC = readFileSync(
  new URL('../app/calendar/components/CalendarEventForm.tsx', import.meta.url),
  'utf8',
);
const SUBVIEWS_SRC = readFileSync(
  new URL('../components/CalendarSubViews.tsx', import.meta.url),
  'utf8',
);
const PILLAR_SRC = readFileSync(
  new URL('../components/pillar-accents.ts', import.meta.url),
  'utf8',
);

/** Minimal StorageLike so the Trackers subview renders deterministically. */
class FakeStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  clear(): void {
    this.store.clear();
  }
}

function withGlobalStorage(s: FakeStorage | null): void {
  if (s === null) {
    delete (globalThis as Record<string, unknown>).localStorage;
  } else {
    (globalThis as Record<string, unknown>).localStorage = s;
  }
}

describe('qm-calendar-indigo-sky-accents: pillar lock', () => {
  it('locks Calendar to blue #4285F4', () => {
    expect(PILLAR_SRC).toContain("calendar: '#4285F4'");
  });
});

describe('qm-calendar-indigo-sky-accents: guests icon uses the app accent', () => {
  it('CalendarEventForm renders no indigo guests icon', () => {
    expect(EVENT_FORM_SRC).not.toContain('IconUsers className="size-4 text-indigo-400"');
    expect(EVENT_FORM_SRC).toContain(
      'IconUsers className="size-4 text-[var(--app-accent)]"',
    );
  });

  it('no indigo token remains anywhere in CalendarEventForm except the Sleep category', () => {
    const indigoLines = EVENT_FORM_SRC.split('\n').filter((l) =>
      l.includes('indigo'),
    );
    // Exactly the Sleep category header + selected-chip style.
    expect(indigoLines).toHaveLength(2);
    expect(indigoLines[0]).toContain('Sleep');
    expect(indigoLines[1]).toContain('bg-indigo-600/30');
  });
});

describe('qm-calendar-indigo-sky-accents: semantic health colors are deliberate, not violations', () => {
  it('Sleep stays indigo in the CLUE tracker palette (category color, not pillar accent)', () => {
    // The palette around it: rose (Period/Spotting), pink (Intimate),
    // amber (Hot Flashes), blue (Pain) — Sleep indigo is one category hue
    // among many, and must not be recolored to calendar blue.
    expect(EVENT_FORM_SRC).toContain('text-indigo-400" /> Sleep');
    expect(EVENT_FORM_SRC).toContain('bg-indigo-600/30 border-indigo-400 text-indigo-200');
    expect(EVENT_FORM_SRC).toContain('bg-amber-600/30 border-amber-400 text-amber-200');
    expect(EVENT_FORM_SRC).toContain('bg-pink-600/30 border-pink-400 text-pink-200');
    expect(EVENT_FORM_SRC).toContain('bg-blue-600/30 border-blue-400 text-blue-200');
  });

  it('Water Intake stays sky (water semantic) and Sleep moon stays indigo (night semantic)', () => {
    expect(SUBVIEWS_SRC).toContain('Water Intake');
    expect(SUBVIEWS_SRC).toContain('text-sky-400');
    expect(SUBVIEWS_SRC).toContain('bg-sky-500');
    expect(SUBVIEWS_SRC).toContain('text-sky-300 bg-sky-950/40');
    expect(SUBVIEWS_SRC).toContain('text-indigo-400 mb-1');
  });

  it('Life Event Trackers card stays sky (card domain color + default tracker tone)', () => {
    expect(SUBVIEWS_SRC).toContain('Life Event Trackers');
    expect(SUBVIEWS_SRC).toContain('border-sky-900/40');
    // Tone assignment: Recurring Cycle -> emerald, Medical/Health -> rose,
    // everything else (Countdown/Legal) -> sky.
    expect(SUBVIEWS_SRC).toContain("tone: 'rose' | 'emerald' | 'amber' | 'sky'");
  });
});

describe('qm-calendar-indigo-sky-accents: Trackers subview renders the semantic colors', () => {
  afterEach(() => withGlobalStorage(null));

  it('renders Water Intake in sky and Sleep in indigo', () => {
    withGlobalStorage(new FakeStorage());
    const html = renderToStaticMarkup(
      <CalendarTrackersSubView userId="qa-calendar-accent" />,
    );
    expect(html).toContain('Water Intake');
    expect(html).toContain('text-sky-400');
    expect(html).toContain('Sleep');
    expect(html).toContain('text-indigo-400');
    expect(html).toContain('Health &amp; Vitals Tracker');
  });
});
