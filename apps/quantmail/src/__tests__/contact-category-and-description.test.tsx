/**
 * contact-category-and-description.test.tsx
 *
 * Tests for:
 *   - ContactCategoryPicker & ContactModalSheet (inline pills, Categorise list
 *     with Search & Show all, New category form with 25-colour swatch grid,
 *     Business address, Personal web page, Notes, and + Add Field / Birthday).
 *   - EventDescriptionEditor (Summary row with preview, Edit Description
 *     sheet with bottom formatting bar: Aa, B, I, U, Body, Bullet, Numbered,
 *     and Add Link sheet).
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import {
  ContactCategoryPicker,
  ContactModalSheet,
  CATEGORY_25_COLORS,
  DEFAULT_CONTACT_CATEGORIES,
  ADD_FIELD_SECTIONS,
  parseTagsCsv,
  serializeTagsCsv,
} from '../app/contacts/components/ContactCategoryPicker';
import {
  EventDescriptionEditor,
  EventLocationPicker,
  DEFAULT_LOCATION_SUGGESTIONS,
  applyDescriptionFormat,
} from '../app/calendar/components/EventDescriptionEditor';
import {
  INITIAL_MOBILE_FOLDERS,
  MobileDeletedFolderView,
  MobileEmailDetailView,
  MobileFolderEditSheet,
} from '../components/MobileFolderAndEmailActionsSuite';
import {
  MobileCalendarFlowSuite,
  INITIAL_MOBILE_CALENDAR_EVENTS,
} from '../components/MobileCalendarFlowSuite';
import {
  MobileInboxFlowSuite,
  FILTER_OPTIONS,
  PHOTO_FILTER_PRESETS,
  AVAILABLE_TIME_SLOTS,
} from '../components/MobileInboxFlowSuite';

describe('ContactCategoryPicker & ContactModalSheet', () => {
  it('exposes the 25-colour circular swatch grid and Add Field sections', () => {
    expect(CATEGORY_25_COLORS).toHaveLength(25);
    expect(DEFAULT_CONTACT_CATEGORIES.length).toBeGreaterThanOrEqual(5);
    expect(ADD_FIELD_SECTIONS.map((s) => s.section)).toEqual([
      'Name',
      'Email',
      'Phone',
      'Work',
      'Address',
      'Other',
    ]);
  });

  it('parses and serializes comma-separated category tags cleanly', () => {
    expect(parseTagsCsv('VIP, Blue category,  Team ')).toEqual([
      'VIP',
      'Blue category',
      'Team',
    ]);
    expect(serializeTagsCsv(['VIP', 'VIP', 'Blue category'])).toBe(
      'VIP, Blue category',
    );
  });

  it('renders Screen 0 & 6 (New Contact sheet with Categorise, Business address, Notes, and + Add Field)', () => {
    const html = renderToStaticMarkup(
      <ContactModalSheet
        formData={{
          name: 'Alex Smith',
          email: 'alex.smith@quantrinity.in',
          phone: '+16502137390',
          company: 'Quantrinity',
          tags: 'VIP, Blue category',
          avatar: '',
        }}
        onChangeFormData={() => {}}
        onSave={() => {}}
        onCancel={() => {}}
        isEditing={false}
      />,
    );
    expect(html).toContain('New Contact');
    expect(html).toContain('First name');
    expect(html).toContain('Surname');
    expect(html).toContain('Email type');
    expect(html).toContain('Phone type');
    expect(html).toContain('Company');
    expect(html).toContain('Categorise');
    expect(html).toContain('VIP');
    expect(html).toContain('Blue category');
    expect(html).toContain('Business address');
    expect(html).toContain('Personal web page');
    expect(html).toContain('Notes');
    expect(html).toContain('Add Field');
  });

  it('renders Screen 1 & 5 (Categorise list with Search, coloured categories, Show all, and New category)', () => {
    const html = renderToStaticMarkup(
      <ContactCategoryPicker
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
    expect(html).toContain('New category');
  });

  it('renders Screen 2, 3 & 4 (New category sheet with Name input and 25-colour radiogroup)', () => {
    const html = renderToStaticMarkup(
      <ContactCategoryPicker
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

describe('EventDescriptionEditor', () => {
  it('renders Screen 0 & 3 (Description summary row with preview text)', () => {
    const html = renderToStaticMarkup(
      <EventDescriptionEditor
        value="Daily team sync for updates and blockers."
        onChange={() => {}}
        initialStep="summary"
      />,
    );
    expect(html).toContain('Description');
    expect(html).toContain('Daily team sync for updates and blockers.');
  });

  it('renders Screen 1 & 2 (Edit Description sheet with Aa, B, I, U, Body, List, Link toolbar)', () => {
    const html = renderToStaticMarkup(
      <EventDescriptionEditor
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
    expect(html).toContain('Add link');
  });

  it('applies formatting helpers accurately and renders Add Link sheet', () => {
    expect(applyDescriptionFormat('Sync', 'bold')).toBe('Sync**bold**');
    expect(applyDescriptionFormat('Sync', 'bullet')).toBe('Sync\n• ');
    expect(applyDescriptionFormat('## Heading', 'body')).toBe('Heading');

    const addLinkHtml = renderToStaticMarkup(
      <EventDescriptionEditor
        value="Daily team sync"
        onChange={() => {}}
        initialStep="add_link"
      />,
    );
    expect(addLinkHtml).toContain('Add Link');
    expect(addLinkHtml).toContain('Text');
    expect(addLinkHtml).toContain('Link');
  });

  it('renders EventLocationPicker summary and 7 place suggestions (Flow #7)', () => {
    expect(DEFAULT_LOCATION_SUGGESTIONS).toHaveLength(7);
    const html = renderToStaticMarkup(
      <EventLocationPicker value="1226 University Dr" onChange={() => {}} />,
    );
    expect(html).toContain('1226 University Dr');
  });

  it('renders MobileInboxFlowSuite with Focused/Other tabs, 7 filter options, 5 photo filters, and availability slots (Flows #5, #8, #11, #12, #40, #48)', () => {
    expect(FILTER_OPTIONS).toHaveLength(7);
    expect(PHOTO_FILTER_PRESETS).toHaveLength(5);
    expect(AVAILABLE_TIME_SLOTS).toHaveLength(3);
    const html = renderToStaticMarkup(<MobileInboxFlowSuite />);
    expect(html).toContain('Inbox');
    expect(html).toContain('Focused');
    expect(html).toContain('Other');
    expect(html).toContain('Filter');
    expect(html).toContain('Faire');
    expect(html).toContain('Rotten Tomatoes');
  });

  it('renders Batch 4 MobileFolderEditSheet, MobileDeletedFolderView, and MobileEmailDetailView (Flows #28, #30, #31, #32, #33, #43, #58, #60, #61, #67, #92)', () => {
    expect(INITIAL_MOBILE_FOLDERS).toHaveLength(7);

    const folderEditHtml = renderToStaticMarkup(<MobileFolderEditSheet onClose={() => {}} />);
    expect(folderEditHtml).toContain('Search Folders &amp; People');
    expect(folderEditHtml).toContain('Favourites');
    expect(folderEditHtml).toContain('Create Folder');

    const deletedHtml = renderToStaticMarkup(<MobileDeletedFolderView onGoToInbox={() => {}} />);
    expect(deletedHtml).toContain('Deleted');
    expect(deletedHtml).toContain('Empty Folder');
    expect(deletedHtml).toContain('Verify your new Amazon account');

    const detailHtml = renderToStaticMarkup(
      <MobileEmailDetailView onBack={() => {}} onDeleteEmail={() => {}} />,
    );
    expect(detailHtml).toContain('Follow-Up on Work');
    expect(detailHtml).toContain('Not at this time. Thank you.');
    expect(detailHtml).toContain('Thank you, I will let you know.');
  });

  it('renders Batch 5 MobileCalendarFlowSuite (Flows #15, #16, #18, #26, #36, #42, #43, #77, #80, #91, #95, #104)', () => {
    expect(INITIAL_MOBILE_CALENDAR_EVENTS.length).toBeGreaterThanOrEqual(6);
    const calendarHtml = renderToStaticMarkup(<MobileCalendarFlowSuite onBackToEmail={() => {}} />);
    expect(calendarHtml).toContain('February');
    expect(calendarHtml).toContain('Daily standup');
    expect(calendarHtml).toContain('Project Fortuna');
    expect(calendarHtml).toContain('Lunch');
    expect(calendarHtml).toContain('+1 more');
  });
});
