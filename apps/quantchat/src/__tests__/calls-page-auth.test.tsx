// @vitest-environment jsdom
// ============================================================================
// QuantChat - /calls must never leak a raw backend auth error (P1)
//
// Live audit 2026-10-11: the logged-out /calls page rendered the backend's
// raw "Missing or invalid authorization header" message with a Retry that
// could only fail again. The page now maps a 401 to a friendly sign-in
// prompt and sanitizes every other error before rendering it.
//
// Api/router mocks are module-level hoisted objects with stable identities.
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({
  getCallHistory: vi.fn(),
  getMe: vi.fn(),
}));

vi.mock('../services/api-client', () => ({
  apiClient: {
    getCallHistory: apiMocks.getCallHistory,
    getMe: apiMocks.getMe,
  },
}));

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/router', () => ({
  useRouter: () => routerMocks,
}));

import { CallsPage } from '../pages/calls';

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('CallsPage auth/error states', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    apiMocks.getCallHistory.mockReset();
    apiMocks.getMe.mockReset();
    apiMocks.getMe.mockResolvedValue({ success: false, error: { code: 'X', message: 'x', statusCode: 401 } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderPage() {
    await act(async () => {
      root.render(<CallsPage />);
    });
    await act(async () => {
      await flushPromises();
    });
  }

  it('maps a 401 to a sign-in prompt and never shows the raw backend message', async () => {
    apiMocks.getCallHistory.mockResolvedValue({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid authorization header',
        statusCode: 401,
      },
    });

    await renderPage();

    expect(container.textContent).toContain('Sign in to see your calls');
    expect(container.textContent).not.toContain('Missing or invalid authorization header');
  });

  it('sanitizes non-401 errors before rendering them (no internal hosts leak)', async () => {
    apiMocks.getCallHistory.mockResolvedValue({
      success: false,
      error: {
        code: 'INTERNAL',
        message: 'connect ECONNREFUSED backend:9000 at quantchat-backend.internal:4000',
        statusCode: 500,
      },
    });

    await renderPage();

    // The sanitizer strips the internal host:port shapes (rendered as
    // "[host]") and the page shows the cleaned remainder — the security
    // contract is that no internal host leaks verbatim, not a specific
    // literal message.
    expect(container.textContent).not.toContain('backend:9000');
    expect(container.textContent).not.toContain('quantchat-backend.internal');
    expect(container.textContent).not.toContain('connect ECONNREFUSED backend');
    expect(container.textContent).toContain('Retry');
  });

  it('renders the honest empty state when the history is empty', async () => {
    apiMocks.getCallHistory.mockResolvedValue({ success: true, data: { calls: [] } });

    await renderPage();

    expect(container.textContent).toContain('No calls yet');
  });
});
