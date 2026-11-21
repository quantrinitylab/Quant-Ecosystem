// @vitest-environment jsdom
// ============================================================================
// QC-F-429 — Channels page: Create aur Join forms ka error alag-alag card me
// ============================================================================
// Dosh (origin/main @ a19fe7ea9 par firsthand): ChannelList ke dono forms ek
// hi `formError` state baant-te the aur uska ekmatra render Create-card ke
// andar tha — Join ki galti (galat ID par 'Channel not found') page ke sabse
// upar Create form me prakat hoti thi, Join ke paas koi feedback NAHI tha,
// aur ek form ka submit dusre ki chipki galti ko mita/badal deta tha.
// Fix (specialist-qc-f-429-buildprep §2, BAND): createError sirf Create-card
// me, joinError sirf Join-card me (section wrapper-restructure ke saath);
// koi handler dusre ke state ko NAHI chhoota.
// Harness: QC-F-449 pattern — createRoot + act, module-level stable mocks,
// ASAL useChannels hooks mocked apiClient ke khilaf (hook↔UI ek saath pin).
// Saari assertions SECTION-SCOPED hain (brief §3.1): fix ke baad do alert ka
// ek-saath hona sahi vyavhaar hai, isiliye global alert gin-ti par koi
// assertion NAHI hai.
// NC signature (original code): T1/T2/T4/T5 FAIL, T3/T6 control-PASS.
// Note: brief ki disk copy §3.2 T5 ke beech me kati hai; T6 yahan §2.4 ke
// band success-vyavhaar (field-saaf + refetch, koi sandesh NAHI) par ek
// control case hai — dono code-roopon par PASS rehna chahiye.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({
  getChannels: vi.fn(),
  getChannelMessages: vi.fn(),
  createChannel: vi.fn(),
  subscribeChannel: vi.fn(),
  unsubscribeChannel: vi.fn(),
  publishToChannel: vi.fn(),
}));

vi.mock('../services/api-client', () => ({ apiClient: apiMocks }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
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
  LoadingState: ({ text }: { text?: string }) => <div>{text ?? 'loading'}</div>,
  ErrorState: ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
    <div data-testid="error-state">
      <div role="alert">{message}</div>
      {onRetry ? <button onClick={onRetry}>Retry</button> : null}
    </div>
  ),
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));

import ChannelsPage from '../app/channels/page';

function ok(data: unknown) {
  return { success: true, data };
}

function fail(message: string) {
  return { success: false, error: { message } };
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

async function typeInto(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await settle(0);
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === text,
  ) as HTMLButtonElement | undefined;
}

function createSection(container: HTMLElement): HTMLElement {
  const input = container.querySelector('input[aria-label="Channel name"]');
  expect(input, 'Create form ka naam-input milna chahiye').toBeTruthy();
  return input!.closest('section') as HTMLElement;
}

function joinSection(container: HTMLElement): HTMLElement {
  const input = container.querySelector('#joinId');
  expect(input, 'Join form ka ID-input milna chahiye').toBeTruthy();
  return input!.closest('section') as HTMLElement;
}

function alertTextIn(section: HTMLElement): string | null {
  const alert = section.querySelector('[role="alert"]');
  return alert ? (alert.textContent ?? '') : null;
}

describe('QC-F-429 channels Create/Join form errors', () => {
  let container: HTMLDivElement;
  let root: Root;
  let qc: QueryClient;

  beforeEach(async () => {
    vi.clearAllMocks();
    apiMocks.getChannels.mockResolvedValue(ok([]));
    apiMocks.createChannel.mockResolvedValue(ok({ id: 'ch-new' }));
    apiMocks.subscribeChannel.mockResolvedValue(ok({ subscribed: true }));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    await act(async () => {
      root.render(
        <QueryClientProvider client={qc}>
          <ChannelsPage />
        </QueryClientProvider>,
      );
    });
    await settle(20);
    // ChannelList render hua hai (koi channel selected NAHI)
    expect(container.querySelector('#joinId')).toBeTruthy();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    qc.clear();
    container.remove();
  });

  it('T1: Join validation galti Join card me dikhti hai, Create card saaf rehta hai', async () => {
    await click(buttonByText(container, 'Join')!);
    await settle(10);
    expect(alertTextIn(joinSection(container))).toBe('Enter a channel ID to join');
    expect(alertTextIn(createSection(container))).toBeNull();
  });

  it('T2: Join server galti (galat ID) Join card me dikhti hai, Create card saaf rehta hai', async () => {
    apiMocks.subscribeChannel.mockResolvedValue(fail('Channel not found'));
    await typeInto(container.querySelector('#joinId') as HTMLInputElement, 'ch-galat-id');
    await click(buttonByText(container, 'Join')!);
    await settle(10);
    expect(alertTextIn(joinSection(container))).toBe('Channel not found');
    expect(alertTextIn(createSection(container))).toBeNull();
  });

  it('T3 (control): Create validation galti sirf Create card me, Join card saaf', async () => {
    await click(buttonByText(container, 'Create channel')!);
    await settle(10);
    expect(alertTextIn(createSection(container))).toBe('Enter a channel name');
    expect(alertTextIn(joinSection(container))).toBeNull();
  });

  it('T4: cross-isolation Join → Create — dono galtiyaan ek saath, har ek apne card me', async () => {
    apiMocks.subscribeChannel.mockResolvedValue(fail('Channel not found'));
    await typeInto(container.querySelector('#joinId') as HTMLInputElement, 'ch-galat-id');
    await click(buttonByText(container, 'Join')!);
    await settle(10);
    expect(alertTextIn(joinSection(container))).toBe('Channel not found');

    // Naam khaali rakh kar Create dabao — Join wali galti mitni NAHI chahiye
    await click(buttonByText(container, 'Create channel')!);
    await settle(10);
    expect(alertTextIn(joinSection(container))).toBe('Channel not found');
    expect(alertTextIn(createSection(container))).toBe('Enter a channel name');
  });

  it('T5: cross-isolation Create → Join — ulta kram, dono galtiyaan ek saath barkarar', async () => {
    apiMocks.createChannel.mockResolvedValue(fail('Name already taken'));
    await typeInto(
      container.querySelector('input[aria-label="Channel name"]') as HTMLInputElement,
      'Quant News',
    );
    await click(buttonByText(container, 'Create channel')!);
    await settle(10);
    expect(alertTextIn(createSection(container))).toBe('Name already taken');

    // joinId khaali chhod kar Join dabao — Create wali galti mitni NAHI chahiye
    await click(buttonByText(container, 'Join')!);
    await settle(10);
    expect(alertTextIn(createSection(container))).toBe('Name already taken');
    expect(alertTextIn(joinSection(container))).toBe('Enter a channel ID to join');
  });

  it('T6 (control): safal Create aur Join par kahin koi alert NAHI, fields saaf ho jate hain', async () => {
    await typeInto(
      container.querySelector('input[aria-label="Channel name"]') as HTMLInputElement,
      'Quant News',
    );
    await click(buttonByText(container, 'Create channel')!);
    await settle(10);
    expect(alertTextIn(createSection(container))).toBeNull();
    expect(alertTextIn(joinSection(container))).toBeNull();
    expect(
      (container.querySelector('input[aria-label="Channel name"]') as HTMLInputElement).value,
    ).toBe('');

    await typeInto(container.querySelector('#joinId') as HTMLInputElement, 'ch-123');
    await click(buttonByText(container, 'Join')!);
    await settle(10);
    expect(alertTextIn(createSection(container))).toBeNull();
    expect(alertTextIn(joinSection(container))).toBeNull();
    expect((container.querySelector('#joinId') as HTMLInputElement).value).toBe('');
  });
});
