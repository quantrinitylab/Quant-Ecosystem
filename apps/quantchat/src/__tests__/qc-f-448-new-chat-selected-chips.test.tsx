// @vitest-environment jsdom
// ============================================================================
// QC-F-448 — /new-chat group-create: chune hue members ki barkarar chips-row
// ============================================================================
// Chunav pehle sirf selectedIds Set me rehta tha aur uska render sirf do
// gin-ti thi ({N} selected + Create (N)) — dusri khoj karte hi pehle chuna
// vyakti results se gayab, chips/soochi/review kahin NAHI, hatane ka raasta
// sirf use dobara khojna tha. Fix: toggleSelect poora ChatContact snapshot
// Map (selectedContacts) bhi rakhta hai (keys == selectedIds invariant), aur
// search field ke neeche chips-row (avatar + displayName + @username + ✕)
// usi Map se render hoti hai — khoj badalne / fail hone / khaali hone par
// bhi barkarar. createConversation payload aparivartit.
// NC signature (original code par, firsthand): T448-01/02/04/05/06/07/08
// FAIL (08 ka DIRECT-bhaag control-PASS tha, chips-lautne wala hissa FAIL),
// T448-03 control-PASS.
// Harness: QC-F-397 ka hu-ba-hu pattern — createRoot + stable module-level
// mocks; searchUsers deferred kataar par (do queries ka kram test ke haath).

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

const searchHarness = vi.hoisted(() => ({
  calls: [] as Array<{
    query: string;
    resolve: (v: unknown) => void;
    reject: (e: unknown) => void;
  }>,
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
  TopBar: ({ title, onBack }: { title: string; onBack?: () => void }) => (
    <div>
      <span>{title}</span>
      {onBack ? <button onClick={onBack}>Back</button> : null}
    </div>
  ),
  BottomNav: () => null,
  useAuth: () => ({ user: { id: 'user_me', displayName: 'Me', username: 'me' } }),
  LoadingState: ({ text }: { text?: string }) => <div>{text ?? 'loading'}</div>,
  ErrorState: ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
    <div>
      <div role="alert">{message}</div>
      {onRetry ? <button onClick={onRetry}>Retry</button> : null}
    </div>
  ),
}));

import NewChatPage from '../app/new-chat/page';

const AARON = {
  id: 'user_aaron',
  username: 'aaron',
  displayName: 'Aaron A',
  avatarUrl: null,
  bio: null,
};
const BINA = {
  id: 'user_bina',
  username: 'bina',
  displayName: 'Bina B',
  avatarUrl: null,
  bio: null,
};
const SAM1 = {
  id: 'user_sam1',
  username: 'sam.one',
  displayName: 'Sam S',
  avatarUrl: 'https://example.test/sam1.png',
  bio: null,
};
const SAM2 = {
  id: 'user_sam2',
  username: 'sam.two',
  displayName: 'Sam S',
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

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  await settle(10);
}

describe('QC-F-448 new-chat selected-member chips', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.clearAllMocks();
    searchHarness.calls.length = 0;
    apiMocks.searchUsers.mockImplementation(
      (q: string) =>
        new Promise((resolve, reject) => {
          searchHarness.calls.push({ query: q, resolve, reject });
        }),
    );
    apiMocks.getMessageRequestsSent.mockResolvedValue({ success: true, data: [] });
    apiMocks.createConversation.mockResolvedValue({
      success: true,
      data: { id: 'conv_1' },
    });
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

  function searchInput() {
    return container.querySelector<HTMLInputElement>('#new-chat-search')!;
  }

  async function typeAndFire(value: string) {
    const before = searchHarness.calls.length;
    await act(async () => {
      setValue(searchInput(), value);
    });
    await settle(450); // debounce 350ms paar
    expect(
      searchHarness.calls.length,
      `search '${value}' asal me in-flight honi chahiye`,
    ).toBe(before + 1);
    expect(searchHarness.calls[before].query).toBe(value);
    return before;
  }

  async function resolveCall(i: number, data: unknown[]) {
    await act(async () => {
      searchHarness.calls[i].resolve({ success: true, data });
    });
    await settle(10);
  }

  async function rejectCall(i: number, message: string) {
    await act(async () => {
      searchHarness.calls[i].reject(new Error(message));
    });
    await settle(10);
  }

  async function enterGroupMode() {
    const groupBtn = [...container.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('New group'),
    )!;
    expect(groupBtn, 'New group entry button').toBeTruthy();
    await click(groupBtn);
  }

  function rowByLabel(part: string) {
    return [...container.querySelectorAll('button')].find((b) =>
      (b.getAttribute('aria-label') ?? '').includes(part),
    )!;
  }

  function chips() {
    return [...container.querySelectorAll('[data-testid="selected-member-chip"]')];
  }

  function chipFor(id: string) {
    return container.querySelector(`[data-user-id="${id}"]`);
  }

  function createButton() {
    return [...container.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').trim().startsWith('Create group'),
    )! as HTMLButtonElement;
  }

  async function setGroupName(name: string) {
    const input = container.querySelector<HTMLInputElement>('#new-group-name')!;
    expect(input, 'group name input').toBeTruthy();
    await act(async () => {
      setValue(input, name);
    });
    await settle(10);
  }

  // Do alag queries se Aaron + Bina chunta hai; dusri khoj ke baad Aaron
  // current results me NAHI rehta.
  async function selectAaronAndBinaAcrossQueries() {
    await enterGroupMode();
    const i0 = await typeAndFire('a');
    await resolveCall(i0, [AARON]);
    await click(rowByLabel('@aaron'));
    const i1 = await typeAndFire('b');
    await resolveCall(i1, [BINA]);
    await click(rowByLabel('@bina'));
  }

  it('T448-01. do queries ka chunav — pehla chuna vyakti dusri khoj ke baad bhi chip me dikhta hai', async () => {
    await renderPage();
    await selectAaronAndBinaAcrossQueries();
    const box = container.querySelector('[data-testid="selected-members"]');
    expect(box, 'selected-members container').not.toBeNull();
    expect(chips().length).toBe(2);
    expect(chipFor('user_aaron'), 'Aaron chip (results me NAHI, phir bhi)').not.toBeNull();
    expect(chipFor('user_bina'), 'Bina chip').not.toBeNull();
    expect(container.textContent).toContain('2 members selected');
    expect(createButton().textContent).toContain('(2)');
  });

  it('T448-02. chip se hatana — gin-ti tala-mail aur payload me sirf bacha hua member', async () => {
    await renderPage();
    await selectAaronAndBinaAcrossQueries();
    const removeBtn = chipFor('user_aaron')!.querySelector(
      '[data-testid="selected-member-remove"]',
    )!;
    expect(removeBtn, 'Aaron chip remove button').toBeTruthy();
    await click(removeBtn);
    expect(chipFor('user_aaron')).toBeNull();
    expect(chips().length).toBe(1);
    expect(container.textContent).toContain('1 member selected');
    await setGroupName('Team');
    await click(createButton());
    expect(apiMocks.createConversation).toHaveBeenCalledTimes(1);
    expect(apiMocks.createConversation).toHaveBeenCalledWith(
      ['user_bina'],
      'Team',
      'group',
    );
  });

  it('T448-03. control — payload exact aparivartit: chunav-kram IDs + trim naam + group, safal par push', async () => {
    await renderPage();
    await selectAaronAndBinaAcrossQueries();
    await setGroupName('My Group');
    await click(createButton());
    expect(apiMocks.createConversation).toHaveBeenCalledTimes(1);
    expect(apiMocks.createConversation).toHaveBeenCalledWith(
      ['user_aaron', 'user_bina'],
      'My Group',
      'group',
    );
    expect(routerMocks.push).toHaveBeenCalledWith('/chat/conv_1');
  });

  it('T448-04. search-fail par chunav barkarar — chip + gin-ti aparivartit, Retry ke baad bhi', async () => {
    await renderPage();
    await enterGroupMode();
    const i0 = await typeAndFire('a');
    await resolveCall(i0, [AARON]);
    await click(rowByLabel('@aaron'));
    const i1 = await typeAndFire('zz');
    await rejectCall(i1, 'network down');
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(chipFor('user_aaron'), 'fail ke baad bhi Aaron chip').not.toBeNull();
    expect(container.textContent).toContain('1 member selected');
    const retryBtn = [...container.querySelectorAll('button')].find(
      (b) => (b.textContent ?? '').trim() === 'Retry',
    )!;
    expect(retryBtn, 'Retry button').toBeTruthy();
    await click(retryBtn);
    expect(searchHarness.calls.length).toBe(3);
    await resolveCall(2, [BINA]);
    expect(chipFor('user_aaron'), 'Retry-safal ke baad bhi Aaron chip').not.toBeNull();
    expect(container.textContent).toContain('1 member selected');
  });

  it('T448-05. row-toggle tala-mail — row se hatao to chip gayab; chip se hatao to row aria-pressed false', async () => {
    await renderPage();
    await enterGroupMode();
    const i0 = await typeAndFire('b');
    await resolveCall(i0, [BINA]);
    await click(rowByLabel('@bina'));
    expect(chipFor('user_bina')).not.toBeNull();
    // Usi row ko dobara tap — chip bhi gayab hona chahiye.
    await click(rowByLabel('@bina'));
    expect(chipFor('user_bina')).toBeNull();
    // Phir chuno, is baar chip se hatao — row ka aria-pressed false hona chahiye.
    await click(rowByLabel('@bina'));
    expect(chipFor('user_bina')).not.toBeNull();
    const removeBtn = chipFor('user_bina')!.querySelector(
      '[data-testid="selected-member-remove"]',
    )!;
    await click(removeBtn);
    expect(chipFor('user_bina')).toBeNull();
    expect(rowByLabel('@bina').getAttribute('aria-pressed')).toBe('false');
  });

  it('T448-06. khaali-chunav haal — container NAHI; aakhiri chip hatate hi container gayab + Create disabled + hint', async () => {
    await renderPage();
    await enterGroupMode();
    expect(container.querySelector('[data-testid="selected-members"]')).toBeNull();
    const i0 = await typeAndFire('a');
    await resolveCall(i0, [AARON]);
    await click(rowByLabel('@aaron'));
    expect(container.querySelector('[data-testid="selected-members"]')).not.toBeNull();
    const removeBtn = chipFor('user_aaron')!.querySelector(
      '[data-testid="selected-member-remove"]',
    )!;
    await click(removeBtn);
    expect(container.querySelector('[data-testid="selected-members"]')).toBeNull();
    expect(createButton().disabled).toBe(true);
    expect(container.textContent).toContain(
      'Search and select at least one member above',
    );
  });

  it('T448-07. hum-naam parkh — Sam S ke do chips par alag @username; avatar img vs initial-gola', async () => {
    await renderPage();
    await enterGroupMode();
    const i0 = await typeAndFire('sam');
    await resolveCall(i0, [SAM1, SAM2]);
    await click(rowByLabel('@sam.one'));
    await click(rowByLabel('@sam.two'));
    expect(chips().length).toBe(2);
    const chip1 = chipFor('user_sam1')!;
    const chip2 = chipFor('user_sam2')!;
    expect(chip1.textContent).toContain('Sam S');
    expect(chip1.textContent).toContain('@sam.one');
    expect(chip2.textContent).toContain('Sam S');
    expect(chip2.textContent).toContain('@sam.two');
    const img = chip1.querySelector('img');
    expect(img, 'SAM1 chip avatar img').not.toBeNull();
    expect(img!.getAttribute('src')).toBe('https://example.test/sam1.png');
    expect(chip2.querySelector('img')).toBeNull();
    expect(chip2.textContent).toContain('S');
  });

  it('T448-08. control — DIRECT mode me chips kabhi NAHI; group mode band karke kholne par chunav aparivartit lautta hai', async () => {
    await renderPage();
    const i0 = await typeAndFire('a');
    await resolveCall(i0, [AARON]);
    expect(container.querySelector('[data-testid="selected-members"]')).toBeNull();
    await enterGroupMode();
    await click(rowByLabel('@aaron'));
    expect(chipFor('user_aaron')).not.toBeNull();
    const backBtn = [...container.querySelectorAll('button')].find(
      (b) => (b.textContent ?? '').trim() === 'Back',
    )!;
    expect(backBtn, 'TopBar back button').toBeTruthy();
    await click(backBtn);
    expect(container.querySelector('[data-testid="selected-members"]')).toBeNull();
    await enterGroupMode();
    expect(chipFor('user_aaron'), 'lautne par Aaron chip aparivartit').not.toBeNull();
    expect(container.textContent).toContain('1 member selected');
  });
});
