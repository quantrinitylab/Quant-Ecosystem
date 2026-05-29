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
});
