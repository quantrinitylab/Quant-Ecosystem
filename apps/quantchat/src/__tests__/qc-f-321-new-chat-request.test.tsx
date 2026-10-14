// @vitest-environment jsdom
// ============================================================================
// QC-F-321 — new-chat message-request composer
// ============================================================================
// Pins the sender-side flow: a direct create refused with
// MESSAGE_NOT_ALLOWED opens the request composer (and sends NOTHING yet —
// the request leaves only when the user writes a message and taps Send
// request); a successful send shows the honest "Request sent" state and
// marks the row pending; a MESSAGE_REQUEST_DECLINED answer shows the
// honest declined line; an ordinary failure keeps the old error
// behaviour; and a contact with a request already pending never
// re-attempts a create.
// Harness: createRoot + stable module-level mocks (calls-page-auth /
// qc-f-317 pattern); apiClient and shared-ui are mocked, the page is real.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({
  createConversation: vi.fn(),
  searchUsers: vi.fn(),
  getMessageRequestsSent: vi.fn(),
  sendMessageRequest: vi.fn(),
}));

vi.mock('../services/api-client', () => ({
  apiClient: {
    createConversation: apiMocks.createConversation,
    searchUsers: apiMocks.searchUsers,
    getMessageRequestsSent: apiMocks.getMessageRequestsSent,
    sendMessageRequest: apiMocks.sendMessageRequest,
  },
}));

const routerMocks = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => routerMocks,
}));

vi.mock('@quant/shared-ui', () => ({
  AppShell: ({ children, topBar }: { children: React.ReactNode; topBar?: React.ReactNode }) => (
    <div>
      {topBar}
      {children}
    </div>
  ),
  TopBar: ({ title }: { title: string }) => <div>{title}</div>,
  BottomNav: () => null,
  useAuth: () => ({ user: { id: 'user_me', displayName: 'Me', username: 'me' } }),
  LoadingState: ({ text }: { text?: string }) => <div>{text ?? 'loading'}</div>,
  ErrorState: ({ message }: { message: string }) => <div role="alert">{message}</div>,
}));

import NewChatPage from '../app/new-chat/page';

const CONTACT = {
  id: 'user_tara',
  username: 'tara',
  displayName: 'Tara Target',
  avatarUrl: null,
  bio: null,
};

function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  setter.call(el, value);
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
}

async function settle(ms = 0) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

describe('QC-F-321 new-chat request composer', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.clearAllMocks();
    apiMocks.searchUsers.mockResolvedValue({ success: true, data: [CONTACT] });
    apiMocks.getMessageRequestsSent.mockResolvedValue({ success: true, data: [] });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  async function renderPage() {
    await act(async () => {
      root.render(<NewChatPage />);
    });
    await settle(10);
  }

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  async function searchAndTapContact() {
    const input = container.querySelector<HTMLInputElement>('#new-chat-search')!;
    await act(async () => {
      setValue(input, 'tara');
    });
    await settle(450); // debounce 350ms
    const row = [...container.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('Tara Target'),
    )!;
    expect(row, 'contact row should render after search').toBeTruthy();
    await act(async () => {
      row.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await settle(10);
  }

  it('N1. a MESSAGE_NOT_ALLOWED refusal opens the composer and sends NOTHING yet', async () => {
    apiMocks.createConversation.mockResolvedValue({
      success: false,
      error: { code: 'MESSAGE_NOT_ALLOWED', message: 'This user is not accepting new messages', statusCode: 403 },
    });
    await renderPage();
    await searchAndTapContact();
    expect(container.textContent).toContain("You can’t message Tara Target directly yet");
    expect(container.textContent).toContain('Send a message request');
    // Opening the composer is not consent to send: no request call yet.
    expect(apiMocks.sendMessageRequest).not.toHaveBeenCalled();
  });

  it('N2. Send request posts the typed text; success shows the honest sent state + pending badge', async () => {
    apiMocks.createConversation.mockResolvedValue({
      success: false,
      error: { code: 'MESSAGE_NOT_ALLOWED', message: 'denied', statusCode: 403 },
    });
    apiMocks.sendMessageRequest.mockResolvedValue({
      success: true,
      data: { id: 'req_1', status: 'PENDING' },
    });
    await renderPage();
    await searchAndTapContact();
    const textarea = container.querySelector<HTMLTextAreaElement>('#message-request-text')!;
    await act(async () => {
      setValue(textarea, 'salaam, mai dost banna chahta hoon');
    });
    const sendBtn = [...container.querySelectorAll('button')].find(
      (b) => (b.textContent ?? '').trim() === 'Send request',
    )!;
    await act(async () => {
      sendBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await settle(10);
    expect(apiMocks.sendMessageRequest).toHaveBeenCalledTimes(1);
    expect(apiMocks.sendMessageRequest).toHaveBeenCalledWith(
      'user_tara',
      'salaam, mai dost banna chahta hoon',
    );
    expect(container.textContent).toContain('Request sent to Tara Target');
    expect(container.textContent).toContain('Request pending');
  });

  it('N3. a MESSAGE_REQUEST_DECLINED answer closes the composer with the honest declined line', async () => {
    apiMocks.createConversation.mockResolvedValue({
      success: false,
      error: { code: 'MESSAGE_NOT_ALLOWED', message: 'denied', statusCode: 403 },
    });
    apiMocks.sendMessageRequest.mockResolvedValue({
      success: false,
      error: { code: 'MESSAGE_REQUEST_DECLINED', message: 'declined', statusCode: 403 },
    });
    await renderPage();
    await searchAndTapContact();
    const textarea = container.querySelector<HTMLTextAreaElement>('#message-request-text')!;
    await act(async () => {
      setValue(textarea, 'phir se koshish');
    });
    const sendBtn = [...container.querySelectorAll('button')].find(
      (b) => (b.textContent ?? '').trim() === 'Send request',
    )!;
    await act(async () => {
      sendBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await settle(10);
    expect(container.textContent).toContain(
      "Tara Target declined an earlier request, so a new one can't be sent.",
    );
    expect(container.querySelector('#message-request-text')).toBeNull();
  });

  it('N4. an ordinary failure keeps the old error behaviour — no composer opens', async () => {
    apiMocks.createConversation.mockResolvedValue({
      success: false,
      error: { code: 'UPSTREAM_UNAVAILABLE', message: 'Privacy preferences are temporarily unavailable', statusCode: 503 },
    });
    await renderPage();
    await searchAndTapContact();
    expect(container.querySelector('#message-request-text')).toBeNull();
    expect(container.textContent).not.toContain('directly yet');
  });

  it('N5. a contact with a PENDING sent request: tapping shows the pending state, create is NOT retried', async () => {
    apiMocks.getMessageRequestsSent.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'req_9',
          target: { id: 'user_tara', username: 'tara', displayName: 'Tara Target', avatarUrl: null },
          firstMessage: 'purana salaam',
          status: 'PENDING',
          conversationId: null,
          createdAt: new Date().toISOString(),
          respondedAt: null,
        },
      ],
    });
    await renderPage();
    await searchAndTapContact();
    expect(apiMocks.createConversation).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Request pending');
  });
});
