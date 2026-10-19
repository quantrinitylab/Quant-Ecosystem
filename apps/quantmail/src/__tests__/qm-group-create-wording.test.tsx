import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { GroupEditorModal } from '../components/GroupEditorModal';
import { AddFolderModal } from '../components/AddFolderModal';

// QM-FIX-LOOP — group-creation wording consistency (fix/qm-group-create-wording).
// Locked wording (PR #904, contacts page): the create action reads "+ New Group"
// with title "Create a new group" — never "Folder", never "Add Folder", never
// "Create group". This suite fails loudly if any covered surface reintroduces
// the old mixed verb set.
//   - mail lens-row button (src/app/page.tsx, data-testid="add-folder-button")
//   - group-creation modal (AddFolderModal, opened from the mail button)
//   - GroupEditorModal create-mode submit + heading
//   - desktop + mobile context-rail Groups tab aria-labels
// Deliberately NOT flagged (different concept, stays "Folder"):
//   - Drive's "Create Folder" (real filesystem folder in Drive)
//   - mail search-scope "Search folder" controls (Inbox/Sent/Trash folders)

const SRC = path.resolve(__dirname, '..');

function readSource(relative: string): string {
  return fs.readFileSync(path.join(SRC, relative), 'utf8');
}

describe('group-creation wording lock: "+ New Group" / "Create a new group"', () => {
  it('GroupEditorModal create mode submits "New Group" (not "Create group")', () => {
    const html = renderToStaticMarkup(
      <GroupEditorModal group={null} onClose={() => {}} onSave={async () => {}} onDelete={async () => {}} />,
    );
    expect(html).toContain('New Group');
    expect(html).not.toContain('Create group');
    expect(html).not.toContain('Add Folder');
  });

  it('GroupEditorModal edit mode keeps "Save changes"', () => {
    const html = renderToStaticMarkup(
      <GroupEditorModal
        group={{ id: 'g1', name: 'Family', emails: [], color: null, createdAt: 0, updatedAt: 0 } as never}
        onClose={() => {}}
        onSave={async () => {}}
        onDelete={async () => {}}
      />,
    );
    expect(html).toContain('Save changes');
  });

  it('AddFolderModal (mail flow) reads "New Group" everywhere user-visible', () => {
    const html = renderToStaticMarkup(
      <AddFolderModal isOpen={true} onClose={() => {}} onSave={() => {}} />,
    );
    expect(html).toContain('New Group');
    expect(html).not.toContain('Add Custom Folder');
    expect(html).not.toContain('Create Folder');
    expect(html).not.toContain('Folder Name');
  });

  // ContactGroupModal renders inside @quant/shared-ui's Modal, which returns
  // null under SSR (no document) and portals throw in renderToStaticMarkup,
  // so its wording is locked at the source level like the page.tsx button.
  it('ContactGroupModal (contacts page) create mode reads "New Group"', () => {
    const src = readSource('app/contacts/components/ContactGroupModal.tsx');
    expect(src).toContain("'New Group'");
    expect(src).not.toContain("'Create Group'");
    expect(src).not.toContain("'Create Contact Group'");
  });

  it('mail lens-row create button uses the locked wording', () => {
    const src = readSource('app/page.tsx');
    const start = src.indexOf('data-testid="add-folder-button"');
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf('</button>', start);
    const block = src.slice(Math.max(0, start - 400), end);
    expect(block).toContain('<span>New Group</span>');
    expect(block).toContain('aria-label="New Group"');
    expect(block).toContain('title="Create a new group"');
    expect(block).not.toContain('<span>Folder</span>');
    expect(block).not.toContain('aria-label="Add Folder"');
    expect(block).not.toContain('Create custom folder or contact filter');
  });

  it('mail page has no leftover lowercase "New group" create labels', () => {
    const src = readSource('app/page.tsx');
    // The only remaining lowercase "group" prose is the groups-view subtitle
    // ("start a new group chat") — every create ACTION reads "New Group".
    const stray = src
      .split('\n')
      .filter((line) => /New group(?! chat)/.test(line) && !line.includes('New Group'));
    expect(stray).toEqual([]);
  });

  it('desktop + mobile Groups rail tabs carry the locked aria-label', () => {
    for (const file of ['components/desktopContextTabs.tsx', 'components/ContextBottomNavBar.tsx']) {
      const src = readSource(file);
      expect(src, file).toContain("ariaLabel: 'Groups (New Group)'");
      expect(src, file).not.toContain('Groups (Add Folder / Add Group)');
    }
  });

  it('contacts page keeps the PR #904 locked "+ New Group" wording (regression guard)', () => {
    const src = readSource('app/contacts/page.tsx');
    expect(src).toContain('+ New Group');
    expect(src).toContain('title="Create a new group"');
  });
});
