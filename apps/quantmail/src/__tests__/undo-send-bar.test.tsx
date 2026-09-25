import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  UndoSendCountdownBar,
  UndoSendManager,
  UndoSendProvider,
  useUndoSend,
  UNDO_SEND_COUNTDOWN_SEC,
  MESSAGE_SENT_DISPLAY_MS,
  type QueueSendOptions,
  type PendingSendItem,
} from '../components/UndoSendCountdownBar';

describe('10-Second Undo-Send Countdown Bar Test Suite', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // --------------------------------------------------------------------------
  // 1. Static HTML Rendering & Visual Design Contracts
  // --------------------------------------------------------------------------
  describe('Visual Presentation & Static HTML Contracts', () => {
    it('renders null when status is idle or no pending item exists', () => {
      const html1 = renderToStaticMarkup(<UndoSendCountdownBar status="idle" pendingItem={null} />);
      expect(html1).toBe('');

      const html2 = renderToStaticMarkup(
        <UndoSendCountdownBar status="counting" pendingItem={null} />,
      );
      expect(html2).toBe('');
    });

    it('renders floating toast with "Sending message to {to}... ({remainingSeconds}s)"', () => {
      const pendingItem: PendingSendItem = {
        id: 'msg-99',
        to: 'alex@quantmail.in',
        subject: 'Confidential Strategy',
        body: 'Encrypted payload...',
        queuedAt: Date.now(),
      };

      const html = renderToStaticMarkup(
        <UndoSendCountdownBar
          status="counting"
          pendingItem={pendingItem}
          remainingSeconds={10}
          progressPercent={100}
        />,
      );

      // Verify Floating container styling and accessibility
      expect(html).toContain('data-testid="undo-send-bar"');
      expect(html).toContain('role="status"');
      expect(html).toContain('fixed bottom-6 right-6');

      // Verify exact message text pattern
      expect(html).toContain('Sending message to');
      expect(html).toContain('alex@quantmail.in');
      expect(html).toContain('(10s)');

      // Verify "Undo (Z)" button
      expect(html).toContain('data-testid="undo-button"');
      expect(html).toContain('Undo (Z)');

      // Verify "Send Now" button
      expect(html).toContain('data-testid="send-now-button"');
      expect(html).toContain('Send Now');

      // Verify Animated Progress Bar line
      expect(html).toContain('role="progressbar"');
      expect(html).toContain('data-testid="undo-send-progress"');
      expect(html).toContain('width:100%');
    });

    it('renders shrinking progress bar as countdown progresses', () => {
      const pendingItem: PendingSendItem = {
        id: 'msg-100',
        to: 'team@quantmail.in',
        queuedAt: Date.now(),
      };

      const html = renderToStaticMarkup(
        <UndoSendCountdownBar
          status="counting"
          pendingItem={pendingItem}
          remainingSeconds={5}
          progressPercent={50}
        />,
      );

      expect(html).toContain('(5s)');
      expect(html).toContain('width:50%');
    });

    it('displays "Message sent!" for status="sent"', () => {
      const pendingItem: PendingSendItem = {
        id: 'msg-101',
        to: 'kundan@quantmail.in',
        queuedAt: Date.now(),
      };

      const html = renderToStaticMarkup(
        <UndoSendCountdownBar
          status="sent"
          pendingItem={pendingItem}
          remainingSeconds={0}
          progressPercent={0}
        />,
      );

      expect(html).toContain('data-testid="undo-send-sent"');
      expect(html).toContain('Message sent!');
    });

    it('renders with props-driven handlers for custom integrations', () => {
      const onUndo = vi.fn();
      const onSendNow = vi.fn();
      const pendingItem: PendingSendItem = {
        id: 'msg-102',
        to: 'user@quantmail.in',
        queuedAt: Date.now(),
      };

      const html = renderToStaticMarkup(
        <UndoSendCountdownBar
          status="counting"
          pendingItem={pendingItem}
          remainingSeconds={10}
          progressPercent={100}
          onUndo={onUndo}
          onSendNow={onSendNow}
        />,
      );

      expect(html).toContain('data-testid="undo-send-bar"');
      expect(html).toContain('Undo (Z)');
      expect(html).toContain('Send Now');
    });
  });

  // --------------------------------------------------------------------------
  // 2. Behavioral Testing (UndoSendManager & State Engine)
  // --------------------------------------------------------------------------
  describe('UndoSendManager Engine & Lifecycle State Machine', () => {
    it('test queueing a send starts the 10s countdown', () => {
      const manager = new UndoSendManager();
      const onSendNow = vi.fn();
      const onUndo = vi.fn();

      expect(manager.getState().status).toBe('idle');
      expect(manager.getState().pendingItem).toBeNull();

      manager.queueSend({
        emailId: 'mail-001',
        to: 'recipient@quantmail.in',
        subject: 'Product Launch',
        body: 'Hello World',
        onSendNow,
        onUndo,
      });

      // Verify immediate state after queueing
      const state1 = manager.getState();
      expect(state1.status).toBe('counting');
      expect(state1.remainingSeconds).toBe(10);
      expect(state1.progressPercent).toBe(100);
      expect(state1.pendingItem?.to).toBe('recipient@quantmail.in');
      expect(state1.pendingItem?.subject).toBe('Product Launch');

      // Advance time by 3 seconds (3000ms)
      vi.advanceTimersByTime(3000);

      const state2 = manager.getState();
      expect(state2.remainingSeconds).toBe(7);
      expect(state2.progressPercent).toBeCloseTo(70, -1);
      expect(onSendNow).not.toHaveBeenCalled();
      expect(onUndo).not.toHaveBeenCalled();

      // Advance by another 4 seconds (total 7000ms)
      vi.advanceTimersByTime(4000);
      const state3 = manager.getState();
      expect(state3.remainingSeconds).toBe(3);
      expect(state3.progressPercent).toBeCloseTo(30, -1);

      manager.destroy();
    });

    it('test clicking "Undo" cancels send and triggers undo callback', () => {
      const manager = new UndoSendManager();
      const onSendNow = vi.fn();
      const onUndo = vi.fn();

      manager.queueSend({
        emailId: 'mail-undo-test',
        to: 'manager@quantmail.in',
        onSendNow,
        onUndo,
      });

      expect(manager.getState().status).toBe('counting');

      // Advance 4 seconds into countdown
      vi.advanceTimersByTime(4000);
      expect(manager.getState().remainingSeconds).toBe(6);

      // Trigger Undo
      manager.undoSend();

      // Assert undo callback executed immediately
      expect(onUndo).toHaveBeenCalledTimes(1);
      expect(onSendNow).not.toHaveBeenCalled();

      // Assert state reset to idle immediately and bar dismissed
      const postUndoState = manager.getState();
      expect(postUndoState.status).toBe('idle');
      expect(postUndoState.pendingItem).toBeNull();
      expect(postUndoState.remainingSeconds).toBe(UNDO_SEND_COUNTDOWN_SEC);

      // Advance past the 10s mark to ensure sendNow is NEVER called
      vi.advanceTimersByTime(10000);
      expect(onSendNow).not.toHaveBeenCalled();

      manager.destroy();
    });

    it('test pressing "Z" key triggers undo callback', () => {
      const listeners: Record<string, ((e: any) => void)[]> = {};
      const fakeWindow = {
        addEventListener: (type: string, listener: any) => {
          listeners[type] = listeners[type] || [];
          listeners[type].push(listener);
        },
        removeEventListener: (type: string, listener: any) => {
          if (listeners[type]) {
            listeners[type] = listeners[type].filter((l) => l !== listener);
          }
        },
      };

      const origWindow = (globalThis as any).window;
      (globalThis as any).window = fakeWindow;

      try {
        const manager = new UndoSendManager();
        const onSendNow = vi.fn();
        const onUndo = vi.fn();

        manager.queueSend({
          emailId: 'mail-key-z',
          to: 'partner@quantmail.in',
          onSendNow,
          onUndo,
        });

        expect(manager.getState().status).toBe('counting');

        // Simulate 'z' keydown event
        const keydownListeners = listeners['keydown'] || [];
        expect(keydownListeners.length).toBeGreaterThan(0);

        const preventDefault = vi.fn();
        keydownListeners.forEach((fn) =>
          fn({ key: 'z', preventDefault, target: { tagName: 'BODY' } }),
        );

        // Verify undo callback triggered
        expect(onUndo).toHaveBeenCalledTimes(1);
        expect(onSendNow).not.toHaveBeenCalled();
        expect(preventDefault).toHaveBeenCalled();
        expect(manager.getState().status).toBe('idle');

        // Queue another message and test uppercase 'Z'
        manager.queueSend({
          emailId: 'mail-key-Z-upper',
          to: 'partner2@quantmail.in',
          onSendNow,
          onUndo,
        });

        keydownListeners.forEach((fn) =>
          fn({ key: 'Z', preventDefault, target: { tagName: 'DIV' } }),
        );

        expect(onUndo).toHaveBeenCalledTimes(2);
        expect(manager.getState().status).toBe('idle');

        manager.destroy();
      } finally {
        (globalThis as any).window = origWindow;
      }
    });

    it('does not trigger undo on "Z" keypress when user is typing in INPUT or TEXTAREA', () => {
      const listeners: Record<string, ((e: any) => void)[]> = {};
      const fakeWindow = {
        addEventListener: (type: string, listener: any) => {
          listeners[type] = listeners[type] || [];
          listeners[type].push(listener);
        },
        removeEventListener: (type: string, listener: any) => {
          if (listeners[type]) {
            listeners[type] = listeners[type].filter((l) => l !== listener);
          }
        },
      };

      const origWindow = (globalThis as any).window;
      (globalThis as any).window = fakeWindow;

      try {
        const manager = new UndoSendManager();
        const onSendNow = vi.fn();
        const onUndo = vi.fn();

        manager.queueSend({
          emailId: 'mail-input-guard',
          to: 'guard@quantmail.in',
          onSendNow,
          onUndo,
        });

        const keydownListeners = listeners['keydown'] || [];

        // Keydown on input
        keydownListeners.forEach((fn) =>
          fn({ key: 'z', preventDefault: vi.fn(), target: { tagName: 'INPUT' } }),
        );
        expect(onUndo).not.toHaveBeenCalled();
        expect(manager.getState().status).toBe('counting');

        // Keydown on textarea
        keydownListeners.forEach((fn) =>
          fn({ key: 'Z', preventDefault: vi.fn(), target: { tagName: 'TEXTAREA' } }),
        );
        expect(onUndo).not.toHaveBeenCalled();
        expect(manager.getState().status).toBe('counting');

        // Keydown on contenteditable
        keydownListeners.forEach((fn) =>
          fn({ key: 'z', preventDefault: vi.fn(), target: { isContentEditable: true } }),
        );
        expect(onUndo).not.toHaveBeenCalled();
        expect(manager.getState().status).toBe('counting');

        manager.destroy();
      } finally {
        (globalThis as any).window = origWindow;
      }
    });

    it('test "Send Now" immediately flushes', () => {
      const manager = new UndoSendManager();
      const onSendNow = vi.fn();
      const onUndo = vi.fn();

      manager.queueSend({
        emailId: 'mail-flush-test',
        to: 'ceo@quantmail.in',
        onSendNow,
        onUndo,
      });

      expect(manager.getState().status).toBe('counting');

      // Click / invoke Send Now immediately
      manager.sendNow();

      // onSendNow executed immediately
      expect(onSendNow).toHaveBeenCalledTimes(1);
      expect(onUndo).not.toHaveBeenCalled();

      // Status transitioned to 'sent'
      expect(manager.getState().status).toBe('sent');
      expect(manager.getState().remainingSeconds).toBe(0);
      expect(manager.getState().progressPercent).toBe(0);

      // Verify that after 2s (MESSAGE_SENT_DISPLAY_MS), status becomes idle
      vi.advanceTimersByTime(MESSAGE_SENT_DISPLAY_MS);
      expect(manager.getState().status).toBe('idle');
      expect(manager.getState().pendingItem).toBeNull();

      manager.destroy();
    });

    it('after 10s without undo, automatically triggers onSendNow and displays "Message sent!" for 2s', () => {
      const manager = new UndoSendManager();
      const onSendNow = vi.fn();
      const onUndo = vi.fn();

      manager.queueSend({
        emailId: 'mail-auto-10s',
        to: 'director@quantmail.in',
        onSendNow,
        onUndo,
      });

      expect(manager.getState().status).toBe('counting');
      expect(onSendNow).not.toHaveBeenCalled();

      // Advance by 9.9 seconds
      vi.advanceTimersByTime(9900);
      expect(onSendNow).not.toHaveBeenCalled();
      expect(manager.getState().status).toBe('counting');

      // Advance past 10 seconds (total 10000ms)
      vi.advanceTimersByTime(150);

      // Automatically triggered onSendNow
      expect(onSendNow).toHaveBeenCalledTimes(1);
      expect(onUndo).not.toHaveBeenCalled();
      expect(manager.getState().status).toBe('sent');

      // Stays in 'sent' state for 2 seconds
      vi.advanceTimersByTime(1500);
      expect(manager.getState().status).toBe('sent');

      // Completes 2s display and returns to idle
      vi.advanceTimersByTime(500);
      expect(manager.getState().status).toBe('idle');
      expect(manager.getState().pendingItem).toBeNull();

      manager.destroy();
    });

    it('flushes previous pending message when a new queueSend is called during countdown', () => {
      const manager = new UndoSendManager();
      const onSendNow1 = vi.fn();
      const onSendNow2 = vi.fn();

      // Queue first email
      manager.queueSend({
        emailId: 'mail-1',
        to: 'first@quantmail.in',
        onSendNow: onSendNow1,
      });

      expect(manager.getState().status).toBe('counting');

      // Advance 2s
      vi.advanceTimersByTime(2000);

      // Queue second email before first expires
      manager.queueSend({
        emailId: 'mail-2',
        to: 'second@quantmail.in',
        onSendNow: onSendNow2,
      });

      // Previous email was flushed immediately
      expect(onSendNow1).toHaveBeenCalledTimes(1);
      expect(onSendNow2).not.toHaveBeenCalled();

      // Second email is now counting down from 10s
      expect(manager.getState().status).toBe('counting');
      expect(manager.getState().pendingItem?.to).toBe('second@quantmail.in');
      expect(manager.getState().remainingSeconds).toBe(10);

      manager.destroy();
    });

    it('notifies subscribers on state updates and supports unsubscription', () => {
      const manager = new UndoSendManager();
      const listener = vi.fn();

      const unsubscribe = manager.subscribe(listener);

      manager.queueSend({
        emailId: 'sub-test',
        to: 'sub@quantmail.in',
      });

      expect(listener).toHaveBeenCalled();
      const callCount = listener.mock.calls.length;

      // Advance timer
      vi.advanceTimersByTime(200);
      expect(listener.mock.calls.length).toBeGreaterThan(callCount);

      // Unsubscribe
      unsubscribe();
      const countAfterUnsub = listener.mock.calls.length;

      vi.advanceTimersByTime(200);
      expect(listener.mock.calls.length).toBe(countAfterUnsub);

      manager.destroy();
    });
  });

  // --------------------------------------------------------------------------
  // 3. React Context & useUndoSend Hook Contract
  // --------------------------------------------------------------------------
  describe('React Context Provider & Hook Contract', () => {
    it('throws error when useUndoSend is used outside of UndoSendProvider', () => {
      function OrphanComponent() {
        useUndoSend();
        return null;
      }

      expect(() => renderToStaticMarkup(<OrphanComponent />)).toThrow(
        'useUndoSend must be used within an UndoSendProvider',
      );
    });

    it('renders children and floating bar when wrapped in UndoSendProvider', () => {
      const html = renderToStaticMarkup(
        <UndoSendProvider>
          <div data-testid="inbox-content">Inbox Messages</div>
        </UndoSendProvider>,
      );

      // Children are rendered
      expect(html).toContain('Inbox Messages');
      expect(html).toContain('data-testid="inbox-content"');
      // Bar is idle, so no floating toast yet
      expect(html).not.toContain('data-testid="undo-send-bar"');
    });

    it('renders active toast when custom manager with pending item is supplied', () => {
      const manager = new UndoSendManager();
      manager.queueSend({
        emailId: 'provider-test',
        to: 'ceo@quantmail.in',
      });

      const html = renderToStaticMarkup(
        <UndoSendProvider manager={manager}>
          <div>App Content</div>
        </UndoSendProvider>,
      );

      expect(html).toContain('Sending message to');
      expect(html).toContain('ceo@quantmail.in');
      expect(html).toContain('(10s)');
      expect(html).toContain('Undo (Z)');
      expect(html).toContain('Send Now');

      manager.destroy();
    });
  });
});
