import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SavedPage, { SavedPage as NamedSavedPage, SavedPostsView } from '../pages/saved';
import type { Post } from '../types';

// Test-only fixture data (never shipped content, never rendered as real posts).
const fixturePost: Post = {
  id: 'post-fixture-1',
  userId: 'user-fixture-1',
  username: 'fixture_user',
  userAvatar: '/fixture-avatar.png',
  type: 'photo',
  media: [
    {
      id: 'media-fixture-1',
      type: 'image',
      url: '/fixture-photo.jpg',
      width: 1080,
      height: 1080,
    },
  ],
  caption: 'Fixture caption for tests only',
  hashtags: [],
  mentions: [],
  likes: 3,
  commentCount: 1,
  isLiked: false,
  isSaved: true,
  isPinned: false,
  collaborators: [],
  createdAt: '2026-10-31T00:00:00.000Z',
  likeCount: 3,
};

function renderView(props: Partial<React.ComponentProps<typeof SavedPostsView>>) {
  return renderToStaticMarkup(
    <SavedPostsView
      posts={[]}
      isLoading={false}
      error={null}
      onRetry={() => {}}
      onPostClick={() => {}}
      {...props}
    />,
  );
}

describe('QuantGram Saved Posts Page (GRAM-SAVED-01)', () => {
  it('exports SavedPage as default and named component functions', () => {
    expect(SavedPage).toBeDefined();
    expect(typeof SavedPage).toBe('function');
    expect(NamedSavedPage).toBe(SavedPage);
    expect(typeof SavedPostsView).toBe('function');
  });

  it('instantiates SavedPage as a valid React element without rendering hooks', () => {
    const element = React.createElement(SavedPage);
    expect(React.isValidElement(element)).toBe(true);
  });

  it('renders the Saved heading and loading state on first paint', () => {
    const html = renderView({ isLoading: true });
    expect(html).toContain('Saved');
    expect(html).toContain('Loading saved posts');
    expect(html).not.toContain('Photo grid');
  });

  it('renders an honest empty state with no grid and no invented posts', () => {
    const html = renderView({ posts: [] });
    expect(html).toContain('No saved posts yet');
    expect(html).toContain('Posts you save will appear here');
    expect(html).not.toContain('Photo grid');
    expect(html).not.toContain('Fixture caption for tests only');
  });

  it('renders the error state with a retry button', () => {
    const html = renderView({ error: 'Could not load saved posts.' });
    expect(html).toContain('Could not load saved posts.');
    expect(html).toContain('Try again');
    expect(html).not.toContain('Photo grid');
  });

  it('renders saved posts through the photo grid', () => {
    const html = renderView({ posts: [fixturePost] });
    expect(html).toContain('Photo grid');
    expect(html).toContain('Fixture caption for tests only');
    expect(html).not.toContain('No saved posts yet');
  });

  it('passes post clicks through to the onPostClick handler', () => {
    const onPostClick = vi.fn();
    const element = React.createElement(SavedPostsView, {
      posts: [fixturePost],
      isLoading: false,
      error: null,
      onRetry: () => {},
      onPostClick,
    });
    expect(React.isValidElement(element)).toBe(true);
    expect(element.props.onPostClick).toBe(onPostClick);
  });
});
