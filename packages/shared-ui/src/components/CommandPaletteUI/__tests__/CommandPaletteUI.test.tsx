// @vitest-environment jsdom
// ============================================================================
// Shared UI - CommandPaletteUI Tests
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CommandPaletteUI } from '../index';
import type { CommandPaletteItem } from '../index';

const mockCommands: CommandPaletteItem[] = [
  { id: '1', label: 'Open File', group: 'Files', shortcut: 'Cmd+O', action: vi.fn() },
  { id: '2', label: 'Save File', group: 'Files', shortcut: 'Cmd+S', action: vi.fn() },
  { id: '3', label: 'Toggle Theme', group: 'Settings', action: vi.fn() },
  { id: '4', label: 'Search Everywhere', group: 'Navigation', action: vi.fn() },
];

describe('CommandPaletteUI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders when isOpen is true', () => {
    render(<CommandPaletteUI isOpen={true} onClose={() => {}} commands={mockCommands} />);
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByLabelText('Command search')).toBeDefined();
  });

  it('does not render when isOpen is false', () => {
    render(<CommandPaletteUI isOpen={false} onClose={() => {}} commands={mockCommands} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders all commands grouped', () => {
    render(<CommandPaletteUI isOpen={true} onClose={() => {}} commands={mockCommands} />);
    expect(screen.getByText('Files')).toBeDefined();
    expect(screen.getByText('Settings')).toBeDefined();
    expect(screen.getByText('Navigation')).toBeDefined();
  });

  it('filters commands based on search query', () => {
    render(<CommandPaletteUI isOpen={true} onClose={() => {}} commands={mockCommands} />);
    const input = screen.getByLabelText('Command search');
    fireEvent.change(input, { target: { value: 'Toggle' } });
    // After filtering, only "Toggle Theme" should remain
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(screen.queryByText('Open File')).toBeNull();
    expect(screen.queryByText('Save File')).toBeNull();
  });

  it('shows empty state when no results match', () => {
    render(<CommandPaletteUI isOpen={true} onClose={() => {}} commands={mockCommands} />);
    const input = screen.getByLabelText('Command search');
    fireEvent.change(input, { target: { value: 'zzzxxx' } });
    expect(screen.getByText('No results found')).toBeDefined();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<CommandPaletteUI isOpen={true} onClose={onClose} commands={mockCommands} />);
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls action and onClose on Enter key', () => {
    const onClose = vi.fn();
    render(<CommandPaletteUI isOpen={true} onClose={onClose} commands={mockCommands} />);
    const input = screen.getByLabelText('Command search');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mockCommands[0]!.action).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('navigates with arrow keys', () => {
    render(<CommandPaletteUI isOpen={true} onClose={() => {}} commands={mockCommands} />);
    const input = screen.getByLabelText('Command search');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    // Second item should now be active
    const options = screen.getAllByRole('option');
    expect(options[1]!.getAttribute('aria-selected')).toBe('true');
  });

  it('executes action on item click', () => {
    const onClose = vi.fn();
    render(<CommandPaletteUI isOpen={true} onClose={onClose} commands={mockCommands} />);
    const options = screen.getAllByRole('option');
    fireEvent.click(options[2]!); // Toggle Theme
    expect(mockCommands[2]!.action).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('displays keyboard shortcuts', () => {
    render(<CommandPaletteUI isOpen={true} onClose={() => {}} commands={mockCommands} />);
    expect(screen.getByText('Cmd+O')).toBeDefined();
    expect(screen.getByText('Cmd+S')).toBeDefined();
  });

  it('uses custom placeholder', () => {
    render(
      <CommandPaletteUI
        isOpen={true}
        onClose={() => {}}
        commands={mockCommands}
        placeholder="Type here..."
      />,
    );
    expect(screen.getByPlaceholderText('Type here...')).toBeDefined();
  });

  // --------------------------------------------------------------------------
  // The ARIA 1.2 combobox contract. Everything below this line pins what the
  // rewrite fixed: a field that drove a list it never named, and a cursor that
  // was a 1.05:1 background tint — invisible to a sighted keyboard user and
  // completely silent to a screen reader, who pressed Down, heard nothing, then
  // pressed Enter and ran a command they had never been told about.
  // --------------------------------------------------------------------------

  // `useId` values contain colons, so `#${id}` is not a valid CSS selector and
  // querySelector throws on it. getElementById is the only lookup that works.
  function byId(id: string | null) {
    expect(id).toBeTruthy();
    return document.getElementById(id!);
  }

  function listboxOf() {
    const listbox = byId(screen.getByLabelText('Command search').getAttribute('aria-controls'));
    expect(listbox).not.toBeNull();
    return listbox!;
  }

  it('names the list it controls', () => {
    render(<CommandPaletteUI isOpen={true} onClose={() => {}} commands={mockCommands} />);
    const input = screen.getByLabelText('Command search');
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(listboxOf().getAttribute('role')).toBe('listbox');
  });

  it('points aria-activedescendant at the row Enter will fire', () => {
    render(<CommandPaletteUI isOpen={true} onClose={() => {}} commands={mockCommands} />);
    const input = screen.getByLabelText('Command search');
    const options = screen.getAllByRole('option');
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0]!.id);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe(options[1]!.id);
    // ...and it resolves to something actually rendered, not a dangling IDREF.
    expect(byId(input.getAttribute('aria-activedescendant'))).toBe(options[1]);
  });

  it('drops aria-activedescendant rather than dangling it when nothing matches', () => {
    render(<CommandPaletteUI isOpen={true} onClose={() => {}} commands={mockCommands} />);
    const input = screen.getByLabelText('Command search');
    fireEvent.change(input, { target: { value: 'zzzxxx' } });
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('fires nothing on Enter when the list is empty', () => {
    const onClose = vi.fn();
    render(<CommandPaletteUI isOpen={true} onClose={onClose} commands={mockCommands} />);
    const input = screen.getByLabelText('Command search');
    fireEvent.change(input, { target: { value: 'zzzxxx' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    for (const cmd of mockCommands) expect(cmd.action).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not run the command it merely arrows onto', () => {
    render(<CommandPaletteUI isOpen={true} onClose={() => {}} commands={mockCommands} />);
    const input = screen.getByLabelText('Command search');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    for (const cmd of mockCommands) expect(cmd.action).not.toHaveBeenCalled();
  });

  it('leaves Home and End to the caret', () => {
    render(<CommandPaletteUI isOpen={true} onClose={() => {}} commands={mockCommands} />);
    const input = screen.getByLabelText('Command search');
    // fireEvent returns false when the handler called preventDefault(). In a text
    // field these keys move the caret; the palette must not steal them to jump
    // the cursor to the ends of the list.
    expect(fireEvent.keyDown(input, { key: 'End' })).toBe(true);
    expect(fireEvent.keyDown(input, { key: 'Home' })).toBe(true);
    expect(input.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[0]!.id);
  });

  it('keeps every option out of the tab sequence, and out of any enclosing form', () => {
    render(<CommandPaletteUI isOpen={true} onClose={() => {}} commands={mockCommands} />);
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(mockCommands.length);
    for (const option of options) {
      // Real buttons, so without tabIndex -1 the palette has one tab stop per
      // command and Tab walks out of the field that owns the keyboard.
      expect(option.tagName).toBe('BUTTON');
      expect(option.getAttribute('type')).toBe('button');
      expect((option as HTMLButtonElement).tabIndex).toBe(-1);
      expect(option.id).not.toBe('');
    }
  });

  it('wraps each group in a role=group named by its own heading', () => {
    render(<CommandPaletteUI isOpen={true} onClose={() => {}} commands={mockCommands} />);
    const groups = screen.getAllByRole('group');
    expect(groups.map((g) => byId(g.getAttribute('aria-labelledby'))?.textContent)).toEqual([
      'Files',
      'Settings',
      'Navigation',
    ]);
    // A listbox's children may only be options or groups. They used to be
    // unroled <div>s, which hid every row one level down inside something the
    // role vocabulary has no name for.
    const listbox = listboxOf();
    expect(listbox.children).toHaveLength(groups.length);
    groups.forEach((group, i) => expect(listbox.children[i]).toBe(group));
  });

  it('builds a group id that survives a space in the group name', () => {
    render(
      <CommandPaletteUI
        isOpen={true}
        onClose={() => {}}
        commands={[{ id: 'a', label: 'Alpha', group: 'My Files', action: vi.fn() }]}
      />,
    );
    // Slugging the name would have put a space in the id, which is not an id.
    const id = screen.getByRole('group').getAttribute('aria-labelledby');
    expect(id).not.toMatch(/\s/);
    expect(byId(id)?.textContent).toBe('My Files');
  });

  it('keeps the empty state outside the listbox', () => {
    render(<CommandPaletteUI isOpen={true} onClose={() => {}} commands={mockCommands} />);
    const listbox = listboxOf();
    fireEvent.change(screen.getByLabelText('Command search'), { target: { value: 'zzzxxx' } });

    // The listbox stays mounted, so `aria-controls` never dangles — it is just
    // empty, which is what an empty listbox is supposed to look like.
    expect(document.body.contains(listbox)).toBe(true);
    expect(listbox.children).toHaveLength(0);
    expect(listbox.contains(screen.getByText('No results found'))).toBe(false);
  });

  it('announces how many commands are left', () => {
    render(<CommandPaletteUI isOpen={true} onClose={() => {}} commands={mockCommands} />);
    const input = screen.getByLabelText('Command search');
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('aria-atomic')).toBe('true');
    expect(region.textContent).toBe('4 results');

    fireEvent.change(input, { target: { value: 'Toggle' } });
    // Same node, new text: a region mounted alongside its own first content is
    // the case screen readers most often miss entirely.
    expect(screen.getByRole('status')).toBe(region);
    expect(region.textContent).toBe('1 result');

    fireEvent.change(input, { target: { value: 'zzzxxx' } });
    expect(region.textContent).toBe('No results');
  });

  it('hides the count with inline styles, not a class the consumer must generate', () => {
    render(<CommandPaletteUI isOpen={true} onClose={() => {}} commands={mockCommands} />);
    const region = screen.getByRole('status');
    // `sr-only` is a Tailwind utility the *consumer's* build has to emit, and a
    // consumer that does not scan @quant/shared-ui would render this visibly in
    // the middle of the palette. Six apps mount this component.
    expect(region.className).toBe('');
    expect(region.style.position).toBe('absolute');
    expect(region.style.width).toBe('1px');
    expect(region.style.overflow).toBe('hidden');
  });

  it('moves focus inside the dialog on open', () => {
    render(<CommandPaletteUI isOpen={true} onClose={() => {}} commands={mockCommands} />);
    // jsdom has no layout, so useFocusTrap's visibility filter matches nothing and
    // falls back to the container itself — the assertion has to be the loose one.
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });

  it('resets the cursor onto a row that still exists when the query changes', () => {
    render(<CommandPaletteUI isOpen={true} onClose={() => {}} commands={mockCommands} />);
    const input = screen.getByLabelText('Command search');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    fireEvent.change(input, { target: { value: 'File' } });
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0]!.id);
    expect(options[0]!.getAttribute('aria-selected')).toBe('true');
  });

  it('draws a cursor a sighted keyboard user can actually see', () => {
    render(<CommandPaletteUI isOpen={true} onClose={() => {}} commands={mockCommands} />);
    const input = screen.getByLabelText('Command search');
    const options = screen.getAllByRole('option') as HTMLButtonElement[];
    // The tint alone was a 1.05:1 change on a white card.
    expect(options[0]!.style.outline).toContain('2px');
    expect(options[1]!.style.outline).toBe('');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(options[1]!.style.outline).toContain('2px');
  });

  it('clears the query on close so the old one does not flash back on reopen', () => {
    const { rerender } = render(
      <CommandPaletteUI isOpen={true} onClose={() => {}} commands={mockCommands} />,
    );
    fireEvent.change(screen.getByLabelText('Command search'), { target: { value: 'Toggle' } });
    rerender(<CommandPaletteUI isOpen={false} onClose={() => {}} commands={mockCommands} />);
    rerender(<CommandPaletteUI isOpen={true} onClose={() => {}} commands={mockCommands} />);
    for (const field of screen.getAllByLabelText('Command search')) {
      expect((field as HTMLInputElement).value).toBe('');
    }
  });

  it('hides the decorative magnifier from the accessible tree', () => {
    const { container } = render(
      <CommandPaletteUI isOpen={true} onClose={() => {}} commands={mockCommands} />,
    );
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});
