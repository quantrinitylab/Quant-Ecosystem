// @vitest-environment jsdom
// ============================================================================
// Shared UI - UniversalSearch Component Tests
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UniversalSearch } from '../components/Shell/UniversalSearch';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, initial, animate, exit, transition, ...props }: any) => (
      <div {...props}>{children}</div>
    ),
  },
}));

describe('UniversalSearch', () => {
  const mockOnSearch = vi.fn().mockResolvedValue([]);
  const mockOnClose = vi.fn();
  const mockOnOpen = vi.fn();
  const mockOnSelect = vi.fn();

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    onOpen: mockOnOpen,
    onSearch: mockOnSearch,
    onSelectResult: mockOnSelect,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    render(<UniversalSearch {...defaultProps} isOpen={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders search dialog when open', () => {
    render(<UniversalSearch {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByLabelText('Search input')).toBeDefined();
  });

  it('shows recent searches when no query is entered', () => {
    render(
      <UniversalSearch {...defaultProps} recentSearches={['meeting notes', 'quarterly report']} />,
    );
    expect(screen.getByText('meeting notes')).toBeDefined();
    expect(screen.getByText('quarterly report')).toBeDefined();
  });

  it('shows empty state when no results found', async () => {
    mockOnSearch.mockResolvedValue([]);
    render(<UniversalSearch {...defaultProps} />);

    const input = screen.getByLabelText('Search input');
    fireEvent.change(input, { target: { value: 'nonexistent' } });

    await waitFor(() => {
      expect(screen.getByText(/No results found/)).toBeDefined();
    });
  });

  it('displays grouped search results by app', async () => {
    const results = [
      { id: '1', title: 'Email from Alice', app: 'Mail', description: 'Project update' },
      { id: '2', title: 'Chat with Bob', app: 'Chat', description: 'Quick sync' },
      { id: '3', title: 'Budget spreadsheet', app: 'Drive', description: 'Q4 numbers' },
    ];
    mockOnSearch.mockResolvedValue(results);

    render(<UniversalSearch {...defaultProps} />);
    const input = screen.getByLabelText('Search input');
    fireEvent.change(input, { target: { value: 'test' } });

    await waitFor(() => {
      expect(screen.getByText('Email from Alice')).toBeDefined();
      expect(screen.getByText('Chat with Bob')).toBeDefined();
      expect(screen.getByText('Budget spreadsheet')).toBeDefined();
    });

    // Group headers should be present
    expect(screen.getAllByText('Mail').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Chat').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Drive').length).toBeGreaterThanOrEqual(1);
  });

  it('handles keyboard navigation (ArrowDown, ArrowUp, Enter)', async () => {
    const results = [
      { id: '1', title: 'Result 1', app: 'Mail' },
      { id: '2', title: 'Result 2', app: 'Mail' },
    ];
    mockOnSearch.mockResolvedValue(results);

    render(<UniversalSearch {...defaultProps} />);
    const input = screen.getByLabelText('Search input');
    fireEvent.change(input, { target: { value: 'test' } });

    await waitFor(() => {
      expect(screen.getByText('Result 1')).toBeDefined();
    });

    // Navigate down
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    // Navigate up
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    // Select with Enter
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mockOnSelect).toHaveBeenCalledWith(results[0]);
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('triggers Cmd+K to toggle search', () => {
    render(<UniversalSearch {...defaultProps} isOpen={false} />);
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(mockOnOpen).toHaveBeenCalled();
  });

  it('calls onClose when Escape is pressed', () => {
    render(<UniversalSearch {...defaultProps} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(mockOnClose).toHaveBeenCalled();
  });
});
