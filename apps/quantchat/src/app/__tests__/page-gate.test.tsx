// ============================================================================
// QuantChat — Phase 0 root-route gate tests
//
// page.tsx's default export (RootGate) decides what '/' shows:
//
//   - session still resolving -> "Checking sign-in status" splash
//   - verified session (user)  -> the signed-in chat list, unchanged
//   - anything else            -> the public LandingPage (fail open)
//
// The heavy chat-list machinery is mocked out; what is under test is the
// BRANCHING, not the chat list itself.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// Mutable auth state the mocked useAuth reads — set per test.
const authState: { user: { displayName: string; username: string } | null; isLoading: boolean } = {
  user: null,
  isLoading: false,
};

vi.mock('@quant/shared-ui', () => ({
  useAuth: () => authState,
  AppShell: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="chat-shell">{children}</div>
  ),
  TopBar: () => <div data-testid="topbar" />,
  BottomNav: () => <div data-testid="bottomnav" />,
  ChatList: () => null,
  LoadingState: ({ text }: { text?: string }) => <div data-testid="loading-state">{text}</div>,
  ErrorState: () => null,
  EmptyState: () => <div data-testid="empty-state" />,
  EmojiStatusBadge: () => null,
}));

vi.mock('framer-motion', async (importOriginal) => {
  const React = await import('react');
  const motion = new Proxy(
    {},
    {
      get: (_target, tag: string) => (props: Record<string, unknown>) =>
        React.createElement(tag, props),
    },
  );
  return {
    motion,
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    useMotionValue: () => ({ get: () => 0, set: () => undefined }),
    useTransform: () => 0,
  };
});

vi.mock('@quant/brand', () => ({ spring: { snappy: {}, gentle: {} } }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
}));

vi.mock('../../hooks/useConversations', () => ({
  useConversations: () => ({
    conversations: [],
    isLoading: false,
    error: null,
    refetch: async () => undefined,
  }),
}));

vi.mock('../../hooks/useMessageRequests', () => ({
  useMessageRequests: () => ({
    requests: [],
    isLoading: false,
    error: null,
    refetch: async () => undefined,
  }),
}));

vi.mock('../../components/MessageRequestsSection', () => ({ default: () => null }));
vi.mock('../../components/EmojiStatusBadge', () => ({ EmojiStatusBadge: () => null }));

vi.mock('../../services/api-client', () => ({
  apiClient: {
    acceptMessageRequest: async () => ({}),
    declineMessageRequest: async () => ({}),
  },
}));

vi.mock('@quant/api-client', () => ({
  apiFetchRaw: async () => ({ ok: true }),
}));

vi.mock('../../lib/auth', () => ({ getAuthHeaders: () => ({}) }));
vi.mock('../../hooks/usePresence', () => ({ usePresence: () => ({}) }));
vi.mock('../../hooks/useChatSocket', () => ({
  useChatSocket: () => ({ subscribe: () => undefined }),
}));
vi.mock('../../lib/navigation', () => ({ navItems: [], routes: {} }));
vi.mock('../../lib/motion-variants', () => ({
  listContainerVariants: {},
  listItemVariants: {},
}));

vi.mock('../../components/landing/LandingPage', () => ({
  LandingPage: () => <div data-testid="landing-page">Landing</div>,
}));

// Import AFTER the mocks above (vi.mock is hoisted, so this is safe).
import RootGate from '../page';

describe('RootGate (page.tsx default export)', () => {
  beforeEach(() => {
    authState.user = null;
    authState.isLoading = false;
  });

  it('shows the public landing page when signed out (fail open)', () => {
    const markup = renderToStaticMarkup(<RootGate />);
    expect(markup).toContain('data-testid="landing-page"');
    expect(markup).not.toContain('data-testid="chat-shell"');
  });

  it('shows the signed-in chat list for a verified session', () => {
    authState.user = { displayName: 'Test User', username: 'testuser' };
    const markup = renderToStaticMarkup(<RootGate />);
    expect(markup).toContain('data-testid="chat-shell"');
    expect(markup).not.toContain('data-testid="landing-page"');
  });

  it('shows a brief splash while the session check is still resolving', () => {
    authState.isLoading = true;
    const markup = renderToStaticMarkup(<RootGate />);
    expect(markup).toContain('Checking sign-in status');
    expect(markup).not.toContain('data-testid="landing-page"');
    expect(markup).not.toContain('data-testid="chat-shell"');
  });
});
