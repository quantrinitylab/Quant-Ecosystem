import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ContactDetailSheet,
  ContactNotesEditor,
} from '../app/contacts/components/ContactsSubViews';

/**
 * Contact notes on the detail sheet (fix/qm-contacts-notes-field-r3).
 *
 * Static markup only proves render wiring — autosave timing and undo live
 * behind effects and user interaction, which renderToStaticMarkup never runs.
 * What it does prove: notes render, the editor appears exactly when a save
 * callback exists, and no editor appears (claiming to save) when none does.
 */
describe('ContactDetailSheet notes', () => {
  const contact = {
    id: 'c1',
    name: 'Aarav Sharma',
    email: 'aarav@example.com',
    phone: '+91 90000 00000',
    company: 'Quant',
    tags: ['vip'],
    isFavorite: false,
    notes: 'Met at Conf, prefers morning calls',
  };

  it('renders existing notes read-only when no save callback is supplied', () => {
    const html = renderToStaticMarkup(
      React.createElement(ContactDetailSheet, { contact: contact as any }),
    );
    expect(html).toContain('Notes');
    expect(html).toContain('Met at Conf, prefers morning calls');
    expect(html).not.toContain('Contact notes');
  });

  it('renders the autosaving editor when a save callback is supplied', () => {
    const html = renderToStaticMarkup(
      React.createElement(ContactDetailSheet, {
        contact: contact as any,
        onUpdateNotes: async () => {},
      }),
    );
    expect(html).toContain('Notes');
    expect(html).toContain('Edits save automatically');
    expect(html).toContain('Undo');
  });

  it('renders the editor for a contact with no notes yet, so notes can be added', () => {
    const html = renderToStaticMarkup(
      React.createElement(ContactDetailSheet, {
        contact: { ...contact, notes: null } as any,
        onUpdateNotes: async () => {},
      }),
    );
    expect(html).toContain('Notes');
    expect(html).toContain('Met at Conf, prefers morning calls…');
  });

  it('renders no notes section at all when there are no notes and no save callback', () => {
    const html = renderToStaticMarkup(
      React.createElement(ContactDetailSheet, {
        contact: { ...contact, notes: null } as any,
      }),
    );
    expect(html).not.toContain('Notes');
  });

  it('ContactNotesEditor starts with the saved note and Undo disabled', () => {
    const html = renderToStaticMarkup(
      React.createElement(ContactNotesEditor, {
        initialNotes: 'Met at Conf',
        onSave: vi.fn(),
      }),
    );
    expect(html).toContain('Met at Conf');
    expect(html).toContain('Edits save automatically');
    // Static markup cannot prove the disabled attribute survives hydration,
    // but the initial render must carry it: one-step undo starts disabled.
    expect(html).toContain('disabled');
  });
});
