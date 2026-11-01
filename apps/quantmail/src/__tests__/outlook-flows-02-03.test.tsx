/**
 * outlook-flows-02-03.test.tsx
 *
 * Tests for:
 *   - Flow #2: Microsoft Outlook iOS Adding a category.zip (Screens 0–6)
 *     via OutlookCategoryPicker (inline pills, Categorise list with Search &
 *     Show all, and New category form with 25-colour swatch grid).
 *   - Flow #3: Microsoft Outlook iOS Adding a description.zip (Screens 0–3)
 *     via OutlookDescriptionEditor (Summary row with preview + Edit Description
 *     sheet with bottom formatting bar: Aa, B, I, U, Body, Bullet, Numbered).
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import {
  OutlookCategoryPicker,
  OUTLOOK_25_CATEGORY_COLORS,
  DEFAULT_OUTLOOK_CATEGORIES,
  parseTagsCsv,
  serializeTagsCsv,
} from '../app/contacts/components/OutlookCategoryPicker';
import {
  OutlookDescriptionEditor,
  applyDescriptionFormat,
} from '../app/calendar/components/OutlookDescriptionEditor';

describe('Outlook Flow #2 — Adding a category (OutlookCategoryPicker)', () => {
  it('exposes the 25-colour circular swatch grid matching Outlook iOS New category', () => {
    expect(OUTLOOK_25_CATEGORY_COLORS).toHaveLength(25);
    expect(DEFAULT_OUTLOOK_CATEGORIES.length).toBeGreaterThanOrEqual(5);
  });

  it('parses and serializes comma-separated category tags cleanly', () => {
    expect(parseTagsCsv('Mobbin, Blue category,  VIP ')).toEqual([
      'Mobbin',
      'Blue category',
      'VIP',
    ]);
    expect(serializeTagsCsv(['Mobbin', 'Mobbin', 'Blue category'])).toBe(
      'Mobbin, Blue category',
    );
  });

  it('renders Screen 0 & 6 (inline Categorise row with removable category pills)', () => {
    const html = renderToStaticMarkup(
      <OutlookCategoryPicker
        tagsCsv="Mobbin, Blue category"
        onChangeTagsCsv={() => {}}
        initialStep="inline"
      />,
    );
    expect(html).toContain('Categorise');
    expect(html).toContain('Mobbin');
    expect(html).toContain('Blue category');
    expect(html).toContain('Remove category Mobbin');
  });

  it('renders Screen 1 & 5 (Categorise list with Search, coloured categories, Show all, and + New category)', () => {
    const html = renderToStaticMarkup(
      <OutlookCategoryPicker
        tagsCsv="Blue category"
        onChangeTagsCsv={() => {}}
        initialStep="list"
      />,
    );
    expect(html).toContain('Categorise');
    expect(html).toContain('Search categories');
    expect(html).toContain('Blue category');
    expect(html).toContain('Green category');
    expect(html).toContain('Orange category');
    expect(html).toContain('Purple category');
    expect(html).toContain('Red category');
    expect(html).toContain('Show all');
    expect(html).toContain('+ New category');
  });

  it('renders Screen 2, 3 & 4 (New category sheet with Name input and 25-colour radiogroup)', () => {
    const html = renderToStaticMarkup(
      <OutlookCategoryPicker
        tagsCsv=""
        onChangeTagsCsv={() => {}}
        initialStep="create"
      />,
    );
    expect(html).toContain('New category');
    expect(html).toContain('Name for your category');
    expect(html).toContain('Colour');
    expect(html).toContain('Category colour');
  });
});

describe('Outlook Flow #3 — Adding a description (OutlookDescriptionEditor)', () => {
  it('renders Screen 0 & 3 (Description summary row with preview text)', () => {
    const html = renderToStaticMarkup(
      <OutlookDescriptionEditor
        value="Daily team sync for updates and blockers."
        onChange={() => {}}
        initialStep="summary"
      />,
    );
    expect(html).toContain('Description');
    expect(html).toContain('Daily team sync for updates and blockers.');
  });

  it('renders Screen 1 & 2 (Edit Description sheet with Aa, B, I, U, Body, List toolbar)', () => {
    const html = renderToStaticMarkup(
      <OutlookDescriptionEditor
        value="Daily team sync for updates and blockers."
        onChange={() => {}}
        initialStep="editor"
      />,
    );
    expect(html).toContain('Edit Description');
    expect(html).toContain('Description formatting');
    expect(html).toContain('Aa');
    expect(html).toContain('Body');
    expect(html).toContain('• List');
    expect(html).toContain('1. List');
  });

  it('applies formatting helpers accurately', () => {
    expect(applyDescriptionFormat('Sync', 'bold')).toBe('Sync**bold**');
    expect(applyDescriptionFormat('Sync', 'bullet')).toBe('Sync\n• ');
    expect(applyDescriptionFormat('## Heading', 'body')).toBe('Heading');
  });
});
