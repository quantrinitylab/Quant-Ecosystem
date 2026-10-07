// @vitest-environment jsdom
// ============================================================================
// P1 mobile fixes — regression tests for tap-to-reveal chat actions and the
// TopBar profile entry point.
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatBubble } from '../components/Chat/ChatBubble';
import { TopBar } from '../components/Navigation/TopBar';

describe('ChatBubble tap-to-reveal actions (mobile P1)', () => {
  it('shows a 44px ⋯ toggle and reveals actions on tap', () => {
    const onReply = vi.fn();
    render(<ChatBubble message="hi" sender="other" timestamp="10:00" onReply={onReply} />);

    const toggle = screen.getByLabelText('Message actions');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // 44px minimum touch target
    expect(toggle.className).toMatch(/min-h-\[44px\]/);
    expect(toggle.className).toMatch(/min-w-\[44px\]/);

    // actions hidden (inert container) before tap
    const replyBefore = screen.getByLabelText('Reply to message');
    expect(replyBefore.parentElement?.className).toMatch(/hidden/);

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const reply = screen.getByLabelText('Reply to message');
    expect(reply.parentElement?.className).toMatch(/flex/);
    expect(reply.className).toMatch(/min-h-\[44px\]/);
    fireEvent.click(reply);
    expect(onReply).toHaveBeenCalledTimes(1);
    // actions collapse (container hidden) after firing
    expect(reply.parentElement?.className).toMatch(/hidden/);
  });

  it('renders no action chrome when there are no actions', () => {
    render(<ChatBubble message="hi" sender="self" timestamp="10:00" />);
    expect(screen.queryByLabelText('Message actions')).not.toBeInTheDocument();
  });
});

describe('TopBar profile entry point (mobile P1)', () => {
  it('renders a 44px profile avatar linking to /profile when profileHref is set', () => {
    render(<TopBar title="QuantChat" profileHref="/profile" />);
    const avatar = screen.getByLabelText('Profile');
    expect(avatar.tagName).toBe('A');
    expect(avatar).toHaveAttribute('href', '/profile');
    expect(avatar.className).toMatch(/min-h-\[44px\]/);
    expect(avatar.className).toMatch(/min-w-\[44px\]/);
  });

  it('renders no profile avatar when profileHref is absent', () => {
    render(<TopBar title="QuantChat" />);
    expect(screen.queryByLabelText('Profile')).not.toBeInTheDocument();
  });

  it('gives the back button a 44px hit area', () => {
    render(<TopBar title="Chat" onBack={() => {}} />);
    const back = screen.getByLabelText('Go back');
    expect(back.className).toMatch(/min-h-\[44px\]/);
    expect(back.className).toMatch(/min-w-\[44px\]/);
  });
});
