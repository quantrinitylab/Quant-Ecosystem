// @vitest-environment jsdom
// ============================================================================
// Shared UI - CrossAppRelations and ActivityFeed Tests
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CrossAppRelations } from '../components/Shell/CrossAppRelations';
import { ActivityFeed } from '../components/Shell/ActivityFeed';

// Mock IntersectionObserver for jsdom environment
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();
vi.stubGlobal(
  'IntersectionObserver',
  vi.fn(function () {
    return {
      observe: mockObserve,
      disconnect: mockDisconnect,
      unobserve: vi.fn(),
    };
  }),
);

describe('CrossAppRelations', () => {
  const mockOnClose = vi.fn();
  const mockOnItemClick = vi.fn();

  const relatedItems = [
    {
      id: '1',
      title: 'Meeting with Alice',
      app: 'Calendar',
      type: 'Event',
      timestamp: Date.now() - 3600000,
    },
    {
      id: '2',
      title: 'Project Brief.pdf',
      app: 'Drive',
      type: 'File',
      timestamp: Date.now() - 7200000,
    },
    {
      id: '3',
      title: 'Discussion about project',
      app: 'Chat',
      type: 'Message',
      timestamp: Date.now() - 86400000,
    },
    {
      id: '4',
      title: 'Follow-up email',
      app: 'Calendar',
      type: 'Event',
      timestamp: Date.now() - 1800000,
    },
  ];

  const defaultProps = {
    contextTitle: 'Project Alpha Email',
    contextType: 'Email',
    relatedItems,
    isOpen: true,
    onClose: mockOnClose,
    onItemClick: mockOnItemClick,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    render(<CrossAppRelations {...defaultProps} isOpen={false} />);
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('renders the panel when open', () => {
    render(<CrossAppRelations {...defaultProps} />);
    expect(screen.getByRole('complementary', { name: /related items panel/i })).toBeDefined();
  });

  it('shows context information', () => {
    render(<CrossAppRelations {...defaultProps} />);
    expect(screen.getByText(/Email: Project Alpha Email/)).toBeDefined();
  });

  it('groups items by app', () => {
    render(<CrossAppRelations {...defaultProps} />);
    // Calendar section should show 2 items
    expect(screen.getByLabelText(/Calendar section, 2 items/i)).toBeDefined();
    // Drive section should show 1 item
    expect(screen.getByLabelText(/Drive section, 1 items/i)).toBeDefined();
    // Chat section should show 1 item
    expect(screen.getByLabelText(/Chat section, 1 items/i)).toBeDefined();
  });

  it('shows related items in each section', () => {
    render(<CrossAppRelations {...defaultProps} />);
    expect(screen.getByText('Meeting with Alice')).toBeDefined();
    expect(screen.getByText('Project Brief.pdf')).toBeDefined();
    expect(screen.getByText('Discussion about project')).toBeDefined();
  });

  it('calls onItemClick when an item is clicked', () => {
    render(<CrossAppRelations {...defaultProps} />);
    fireEvent.click(screen.getByText('Meeting with Alice'));
    expect(mockOnItemClick).toHaveBeenCalledWith(relatedItems[0]);
  });

  it('calls onClose when close button is clicked', () => {
    render(<CrossAppRelations {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Close related items panel'));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('shows empty state when no items', () => {
    render(<CrossAppRelations {...defaultProps} relatedItems={[]} />);
    expect(screen.getByText('No related items found.')).toBeDefined();
  });

  it('shows loading state', () => {
    render(<CrossAppRelations {...defaultProps} loading={true} relatedItems={[]} />);
    expect(screen.getByText('Finding related items...')).toBeDefined();
  });

  it('collapses and expands sections on click', () => {
    render(<CrossAppRelations {...defaultProps} />);
    const calendarSection = screen.getByLabelText(/Calendar section/i);
    // Initially expanded
    expect(screen.getByText('Meeting with Alice')).toBeDefined();
    // Collapse
    fireEvent.click(calendarSection);
    expect(screen.queryByText('Meeting with Alice')).toBeNull();
    // Expand again
    fireEvent.click(calendarSection);
    expect(screen.getByText('Meeting with Alice')).toBeDefined();
  });
});

describe('ActivityFeed', () => {
  const mockOnLoadMore = vi.fn();
  const mockOnActivityClick = vi.fn();
  const mockOnFilterAppsChange = vi.fn();
  const mockOnFilterTypesChange = vi.fn();

  const activities = [
    {
      id: '1',
      actor: 'Alice',
      action: 'sent an email',
      app: 'Mail',
      type: 'send',
      timestamp: Date.now() - 300000,
      description: 'Project update email',
    },
    {
      id: '2',
      actor: 'Bob',
      action: 'shared a file',
      app: 'Drive',
      type: 'share',
      timestamp: Date.now() - 3600000,
    },
    {
      id: '3',
      actor: 'Charlie',
      action: 'posted a message',
      app: 'Chat',
      type: 'post',
      timestamp: Date.now() - 7200000,
    },
  ];

  const defaultProps = {
    activities,
    onLoadMore: mockOnLoadMore,
    hasMore: true,
    onActivityClick: mockOnActivityClick,
    onFilterAppsChange: mockOnFilterAppsChange,
    onFilterTypesChange: mockOnFilterTypesChange,
    availableApps: ['Mail', 'Drive', 'Chat'],
    availableTypes: ['send', 'share', 'post'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the activity feed', () => {
    render(<ActivityFeed {...defaultProps} />);
    expect(screen.getByRole('feed', { name: /activity feed/i })).toBeDefined();
  });

  it('renders activity items', () => {
    render(<ActivityFeed {...defaultProps} />);
    expect(screen.getByText('Alice')).toBeDefined();
    expect(screen.getByText('sent an email')).toBeDefined();
    expect(screen.getByText('Bob')).toBeDefined();
    expect(screen.getByText('shared a file')).toBeDefined();
    expect(screen.getByText('Charlie')).toBeDefined();
  });

  it('shows description when available', () => {
    render(<ActivityFeed {...defaultProps} />);
    expect(screen.getByText('Project update email')).toBeDefined();
  });

  it('shows app name for each activity', () => {
    render(<ActivityFeed {...defaultProps} />);
    expect(screen.getAllByText('Mail').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Drive').length).toBeGreaterThanOrEqual(1);
  });

  it('calls onActivityClick when an activity is clicked', () => {
    render(<ActivityFeed {...defaultProps} />);
    fireEvent.click(screen.getByText('Alice').closest('[role="article"]')!);
    expect(mockOnActivityClick).toHaveBeenCalledWith(activities[0]);
  });

  it('shows empty state when no activities', () => {
    render(<ActivityFeed {...defaultProps} activities={[]} />);
    expect(screen.getByText('No activity to show.')).toBeDefined();
  });

  it('shows filter toggle button', () => {
    render(<ActivityFeed {...defaultProps} />);
    expect(screen.getByLabelText('Toggle filters')).toBeDefined();
  });

  it('shows filter panel when filter button is clicked', () => {
    render(<ActivityFeed {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Toggle filters'));
    expect(screen.getByRole('group', { name: /app filters/i })).toBeDefined();
    expect(screen.getByRole('group', { name: /type filters/i })).toBeDefined();
  });

  it('calls onFilterAppsChange when app filter is toggled', () => {
    render(<ActivityFeed {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Toggle filters'));
    const appFilters = screen.getByRole('group', { name: /app filters/i });
    const mailButton = appFilters.querySelector('button');
    fireEvent.click(mailButton!);
    expect(mockOnFilterAppsChange).toHaveBeenCalledWith(['Mail']);
  });

  it('filters activities by app when filterApps is set', () => {
    render(<ActivityFeed {...defaultProps} filterApps={['Mail']} />);
    expect(screen.getByText('Alice')).toBeDefined();
    expect(screen.queryByText('Bob')).toBeNull();
    expect(screen.queryByText('Charlie')).toBeNull();
  });

  it('shows loading indicator when loading', () => {
    render(<ActivityFeed {...defaultProps} loading={true} />);
    expect(screen.getByText('Loading more...')).toBeDefined();
  });
});
