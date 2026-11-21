// @vitest-environment jsdom
/**
 * QC-F-050 — QuantChat ecosystem interconnection, Slice-1.
 *
 * Negative-control note: T1 and T2 FAIL on the pre-fix code (the palette's
 * commands were `action: () => {}` stubs with `search`/`settings` listed —
 * see the standalone probe RUN 1 in the build-prep brief, and the NC scratch
 * spec that asserts these same pins against the verbatim original array).
 * T3–T6 pin the fixed behaviour.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockState = vi.hoisted(() => ({
  capturedSwitcherProps: null as unknown,
}));

vi.mock('@quant/shared-ui', () => ({
  UniversalAppSwitcher: (props: unknown) => {
    mockState.capturedSwitcherProps = props;
    return React.createElement('div', { 'data-testid': 'app-switcher-stub' });
  },
}));

// Imported after mocks are registered.
import { buildCommands } from '../lib/ecosystem-commands';
import {
  AppSwitcherMount,
  toQuantUserSession,
} from '../components/ecosystem/AppSwitcherMount';
import type { SwitcherIdentity } from '../components/ecosystem/AppSwitcherMount';
import { UniversalSSOTokenBridge } from '../../../../packages/shared-ui/src/interconnection/UniversalSSOTokenBridge';

const EMPTY_BODY = /=>\s*\{\s*\}$/;

const mockIdentity: SwitcherIdentity = {
  id: 'u-123',
  email: 'user@example.com',
  username: 'user',
  displayName: 'Test User',
  avatarUrl: 'https://example.com/avatar.png',
};

describe('QC-F-050 palette commands', () => {
  it('T1 — no dead actions: every command action has a real body', () => {
    const cmds = buildCommands(vi.fn(), vi.fn());
    expect(cmds.length).toBeGreaterThan(0);
    for (const cmd of cmds) {
      const src = cmd.action.toString();
      expect(src, `command '${cmd.id}' must not be a dead stub`).not.toMatch(EMPTY_BODY);
      expect(src, `command '${cmd.id}' must not return undefined`).not.toContain('=> undefined');
      expect(src, `command '${cmd.id}' must not return null`).not.toContain('=> null');
    }
  });

  it('T2 — id pin: exactly the real commands, no dead entries', () => {
    const cmds = buildCommands(vi.fn(), vi.fn());
    expect(cmds.map((c) => c.id)).toEqual(['new-chat', 'open-mail', 'open-ai']);
    expect(cmds.map((c) => c.id)).not.toContain('search');
    expect(cmds.map((c) => c.id)).not.toContain('settings');
  });

  it('T3 — behavior: each action calls through with the right target', () => {
    const navigate = vi.fn();
    const openApp = vi.fn();
    const cmds = buildCommands(navigate, openApp);
    const byId = Object.fromEntries(cmds.map((c) => [c.id, c]));

    byId['new-chat'].action();
    expect(navigate).toHaveBeenCalledWith('/new-chat');
    expect(openApp).not.toHaveBeenCalled();

    byId['open-mail'].action();
    expect(openApp).toHaveBeenCalledWith('quantmail');

    byId['open-ai'].action();
    expect(openApp).toHaveBeenCalledWith('quantai');
  });

  it('T4 — real bridge URL (no mock): jsdom localhost -> dev quantmail URL', () => {
    expect(window.location.hostname).toBe('localhost');
    const url = UniversalSSOTokenBridge.getInstance().buildCrossAppJumpUrl('quantmail');
    expect(url.startsWith('http://localhost:')).toBe(true);
    expect(url).toContain('/inbox');
  });
});

describe('QC-F-050 AppSwitcherMount', () => {
  it('T5 — adapter pin: only contract fields, nothing invented', () => {
    const session = toQuantUserSession(mockIdentity);
    expect(session).toEqual({
      userId: 'u-123',
      email: 'user@example.com',
      displayName: 'Test User',
      username: 'user',
      avatarUrl: 'https://example.com/avatar.png',
      currentApp: 'quantchat',
    });
    // toEqual above pins the exact shape — any invented extra field would fail.
  });

  it('T6 — mount: identity renders switcher as quantchat; null renders nothing', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(AppSwitcherMount, { user: mockIdentity }));
    });
    const props = mockState.capturedSwitcherProps as {
      currentApp: string;
      user: { userId: string };
    };
    expect(props.currentApp).toBe('quantchat');
    expect(props.user.userId).toBe('u-123');
    expect(container.querySelector('[data-testid="app-switcher-stub"]')).not.toBeNull();
    await act(async () => {
      root.unmount();
    });
    container.remove();

    // Logged out -> fail-closed: renders nothing, switcher never mounted.
    mockState.capturedSwitcherProps = null;
    const container2 = document.createElement('div');
    document.body.appendChild(container2);
    const root2: Root = createRoot(container2);
    await act(async () => {
      root2.render(React.createElement(AppSwitcherMount, { user: null }));
    });
    expect(container2.innerHTML).toBe('');
    expect(mockState.capturedSwitcherProps).toBeNull();
    await act(async () => {
      root2.unmount();
    });
    container2.remove();
  });
});
