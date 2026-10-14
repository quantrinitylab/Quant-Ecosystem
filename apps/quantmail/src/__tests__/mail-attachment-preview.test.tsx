// @vitest-environment jsdom
// Mail attachments open where they belong: documents in the on-device engine (the same one
// Drive uses), images in the lightbox, nothing for parts whose bytes were never kept — and
// "Save to Drive" only for real AttachmentService ids.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import type { Root } from 'react-dom/client';

const engine = vi.hoisted(() => ({
  props: [] as Array<{ kind: string; name: string; size?: number | null; loadBytes: (s: AbortSignal) => Promise<ArrayBuffer>; onDownload?: () => void }>,
}));
const auth = vi.hoisted(() => ({ authenticatedFetch: vi.fn() }));

vi.mock('../components/drive/DocumentEnginePreview', () => ({
  DocumentEnginePreview: (props: (typeof engine.props)[number]) => {
    engine.props.push(props);
    return <div data-testid="engine" data-kind={props.kind} data-name={props.name} />;
  },
}));
vi.mock('../services/browser-auth-session', () => ({ browserAuthSession: auth }));

import { AttachmentPreview } from '../components/AttachmentPreview';
import { buildThreadViewCommands, THREAD_KEYBOARD_SCOPE } from '../hooks/useThreadViewKeyboard';
import { keyboardEngine } from '../lib/keyboard/engine';
import { registerCommands } from '../lib/keyboard/command-registry';
import {
  attachmentByteSource,
  attachmentServiceId,
  decodeDataUrl,
  loadAttachmentBytes,
} from '../lib/mail-attachments';

const SERVICE_ID = 'att_550e8400-e29b-41d4-a716-446655440000';
const toDataUrl = (mime: string, text: string) => `data:${mime};base64,${btoa(text)}`;
const text = (buffer: ArrayBuffer) => new TextDecoder().decode(new Uint8Array(buffer));

let container: HTMLDivElement;
let root: Root;

async function mount(element: React.ReactElement) {
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
}

async function clickChip(name: string) {
  const { act } = await import('react');
  const chip = Array.from(container.querySelectorAll<HTMLButtonElement>('.attachment-preview-item')).find(
    (b) => b.title === name,
  )!;
  await act(async () => {
    chip.click();
  });
  for (let i = 0; i < 3; i++) await act(async () => Promise.resolve());
  return chip;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  engine.props.length = 0;
  auth.authenticatedFetch.mockReset();
});

afterEach(async () => {
  const { act } = await import('react');
  await act(async () => root?.unmount());
  container?.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('mail attachment byte sources', () => {
  it('recognises only real AttachmentService ids', () => {
    expect(attachmentServiceId(SERVICE_ID)).toBe(SERVICE_ID);
    // Composer ids and the formatter's positional fallbacks share the prefix, not the object.
    expect(attachmentServiceId('att_1760000000000_k3j4h5')).toBeNull();
    expect(attachmentServiceId('att_0_1760000000000')).toBeNull();
    expect(attachmentServiceId('att_0')).toBeNull();
    expect(attachmentServiceId(undefined)).toBeNull();
    expect(attachmentServiceId(42)).toBeNull();
  });

  it('reads stored rows by id, composer mail from its data: URL, metadata-only parts not at all', () => {
    expect(attachmentByteSource({ attachmentId: SERVICE_ID, url: 'data:x;base64,AA==' })).toEqual({
      kind: 'stored',
      attachmentId: SERVICE_ID,
    });
    expect(attachmentByteSource({ url: 'data:application/pdf;base64,JVBERi0=' })).toEqual({
      kind: 'inline',
      dataUrl: 'data:application/pdf;base64,JVBERi0=',
    });
    expect(attachmentByteSource({ url: 'https://example.com/a.pdf' })).toBeNull();
    expect(attachmentByteSource({ url: '' })).toBeNull();
    expect(attachmentByteSource({})).toBeNull();
  });

  it('reads a file inserted from QuantDrive through its Drive reference', () => {
    expect(attachmentByteSource({ url: '/api/drive/files/cmf0abc123_x-9/download' })).toEqual({
      kind: 'drive',
      fileId: 'cmf0abc123_x-9',
    });
    expect(attachmentByteSource({ url: '/api/drive/files/f1/download?inline=1' })).toEqual({
      kind: 'drive',
      fileId: 'f1',
    });
    // Only the exact reference shape: nothing that could walk to another route.
    expect(attachmentByteSource({ url: '/api/drive/files/../admin/download' })).toBeNull();
    expect(attachmentByteSource({ url: 'https://evil.example/api/drive/files/f1/download' })).toBeNull();
  });

  it('fetches Drive bytes with the session; a 404 says what it can know, a 403 is Drive’s own words', async () => {
    auth.authenticatedFetch.mockResolvedValueOnce(new Response(new TextEncoder().encode('%PDF').buffer, { status: 200 }));
    expect(text(await loadAttachmentBytes({ kind: 'drive', fileId: 'f1' }))).toBe('%PDF');
    expect(auth.authenticatedFetch).toHaveBeenCalledWith('/api/drive/files/f1/download', {});

    auth.authenticatedFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'File not found' } }), { status: 404 }),
    );
    await expect(loadAttachmentBytes({ kind: 'drive', fileId: 'f1' })).rejects.toThrow(
      /not available to you .* deleted, or it is in the sender\u2019s Drive and was not shared with you/,
    );

    auth.authenticatedFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'This file is quarantined and cannot be downloaded.' } }), {
        status: 403,
      }),
    );
    await expect(loadAttachmentBytes({ kind: 'drive', fileId: 'f1' })).rejects.toThrow(
      'This file is quarantined and cannot be downloaded.',
    );
  });

  it('decodes base64 and percent-encoded data: URLs, and refuses malformed ones', () => {
    expect(text(decodeDataUrl(toDataUrl('application/pdf', '%PDF-1.7')))).toBe('%PDF-1.7');
    expect(text(decodeDataUrl('data:text/plain,caf%C3%A9'))).toBe('café');
    expect(new Uint8Array(decodeDataUrl('data:application/octet-stream;base64,AP8=')).join()).toBe('0,255');
    expect(() => decodeDataUrl('data:application/pdf;base64,***')).toThrow('could not be read');
    expect(() => decodeDataUrl('https://example.com/a.pdf')).toThrow('could not be read');
  });

  it('fetches stored bytes with the session and surfaces the backend reason on refusal', async () => {
    const bytes = new TextEncoder().encode('PK').buffer;
    auth.authenticatedFetch.mockResolvedValueOnce(new Response(bytes, { status: 200 }));
    const signal = new AbortController().signal;
    expect(text(await loadAttachmentBytes({ kind: 'stored', attachmentId: SERVICE_ID }, signal))).toBe('PK');
    expect(auth.authenticatedFetch).toHaveBeenCalledWith(`/api/attachments/${SERVICE_ID}/download`, { signal });

    auth.authenticatedFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'Attachment blocked: malware detected (Eicar)' } }), { status: 422 }),
    );
    await expect(loadAttachmentBytes({ kind: 'stored', attachmentId: SERVICE_ID })).rejects.toThrow(
      'Attachment blocked: malware detected (Eicar)',
    );
  });
});

describe('AttachmentPreview — opening attachments', () => {
  it('opens a sent PDF in the on-device engine, never in the image lightbox', async () => {
    await mount(
      <AttachmentPreview
        attachments={[
          { id: 'att_1760000000000_k3j4h5', filename: 'report.pdf', mimeType: 'application/pdf', size: 8, url: toDataUrl('application/pdf', '%PDF-1.7') },
        ]}
      />,
    );
    // A composer id is not a stored object: no Save button that could only 404.
    expect(container.textContent).not.toContain('Save to Drive');
    await clickChip('report.pdf');

    expect(document.querySelector('.attachment-lightbox')).toBeNull();
    const shown = document.querySelector('[data-testid="engine"]');
    expect(shown?.getAttribute('data-kind')).toBe('pdf');
    expect(shown?.getAttribute('data-name')).toBe('report.pdf');
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('report.pdf');
    const props = engine.props[engine.props.length - 1]!;
    expect(props.size).toBe(8);
    expect(text(await props.loadBytes(new AbortController().signal))).toBe('%PDF-1.7');
  });

  it('picks the engine by extension when the part is typed application/octet-stream', async () => {
    await mount(
      <AttachmentPreview
        attachments={[
          { id: 'a1', filename: 'deck.pptx', mimeType: 'application/octet-stream', size: 0, url: toDataUrl('application/octet-stream', 'PK') },
          { id: 'a2', filename: 'budget.xlsx', mimeType: 'application/octet-stream', size: 0, url: toDataUrl('application/octet-stream', 'PK') },
        ]}
      />,
    );
    await clickChip('deck.pptx');
    expect(document.querySelector('[data-testid="engine"]')?.getAttribute('data-kind')).toBe('slides');
    // Unknown size is passed as unknown, not as zero bytes.
    expect(engine.props[engine.props.length - 1]!.size).toBeNull();
  });

  it('reads a stored Word attachment through the authenticated download route', async () => {
    auth.authenticatedFetch.mockResolvedValue(new Response(new TextEncoder().encode('PK').buffer, { status: 200 }));
    await mount(
      <AttachmentPreview
        attachments={[
          { id: SERVICE_ID, attachmentId: SERVICE_ID, filename: 'contract.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 2 },
        ]}
      />,
    );
    expect(container.textContent).toContain('Save to Drive');
    await clickChip('contract.docx');
    expect(document.querySelector('[data-testid="engine"]')?.getAttribute('data-kind')).toBe('word');
    const props = engine.props[engine.props.length - 1]!;
    expect(text(await props.loadBytes(new AbortController().signal))).toBe('PK');
    expect(auth.authenticatedFetch.mock.calls[0]![0]).toBe(`/api/attachments/${SERVICE_ID}/download`);
  });

  it('keeps images in the zoomable lightbox', async () => {
    const url = toDataUrl('image/png', 'png');
    await mount(<AttachmentPreview attachments={[{ id: 'i1', filename: 'photo.png', mimeType: 'image/png', size: 3, url }]} />);
    await clickChip('photo.png');
    expect(document.querySelector('[data-testid="engine"]')).toBeNull();
    expect(document.querySelector('.attachment-lightbox img')?.getAttribute('src')).toBe(url);
  });

  it('opens a document inserted from QuantDrive in the engine, read through Drive', async () => {
    auth.authenticatedFetch.mockResolvedValue(new Response(new TextEncoder().encode('PK').buffer, { status: 200 }));
    await mount(
      <AttachmentPreview
        attachments={[
          { id: 'drive_f9_1760000000000', filename: 'plan.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 2, url: '/api/drive/files/f9/download' },
        ]}
      />,
    );
    const chip = await clickChip('plan.docx');
    expect(chip.getAttribute('aria-disabled')).toBeNull();
    expect(chip.textContent).not.toContain('unavailable');
    expect(document.querySelector('[data-testid="engine"]')?.getAttribute('data-kind')).toBe('word');
    const props = engine.props[engine.props.length - 1]!;
    expect(text(await props.loadBytes(new AbortController().signal))).toBe('PK');
    expect(auth.authenticatedFetch.mock.calls[0]![0]).toBe('/api/drive/files/f9/download');
  });

  it('shows a QuantDrive image from fetched bytes, not from a bare <img> that carries no session', async () => {
    auth.authenticatedFetch.mockResolvedValue(new Response(new Uint8Array([137, 80, 78, 71]).buffer, { status: 200 }));
    const createObjectURL = vi.fn(() => 'blob:https://quantmail.in/photo');
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL: vi.fn() }));
    await mount(
      <AttachmentPreview
        attachments={[{ id: 'drive_p1_1', filename: 'photo.png', mimeType: 'image/png', size: 4, url: '/api/drive/files/p1/download' }]}
      />,
    );
    // No thumbnail pointed at the Drive route: it would answer 401 and render broken.
    expect(container.querySelector('img[src*="/api/drive/"]')).toBeNull();
    await clickChip('photo.png');
    expect(auth.authenticatedFetch.mock.calls[0]![0]).toBe('/api/drive/files/p1/download');
    expect(document.querySelector('.attachment-lightbox img')?.getAttribute('src')).toBe(
      'blob:https://quantmail.in/photo',
    );
  });

  it('offers nothing for a metadata-only inbound part, and says so', async () => {
    await mount(
      <AttachmentPreview attachments={[{ id: 'part-0', filename: 'scan.pdf', mimeType: 'application/pdf', size: 4096, attachmentId: null }]} />,
    );
    const chip = await clickChip('scan.pdf');
    expect(chip.getAttribute('aria-disabled')).toBe('true');
    expect(chip.textContent).toContain('unavailable');
    expect(document.querySelector('[data-testid="engine"]')).toBeNull();
    expect(document.querySelector('.attachment-lightbox')).toBeNull();
    expect(auth.authenticatedFetch).not.toHaveBeenCalled();
  });
});

describe('AttachmentPreview — Escape closes the preview, not the conversation', () => {
  // The thread view's real bindings (Escape = close the conversation) behind the preview,
  // on the real engine listening on the document, the way a mounted thread view has them.
  let closeConversation: ReturnType<typeof vi.fn>;
  const releases: Array<() => void> = [];

  beforeEach(() => {
    closeConversation = vi.fn();
    releases.push(
      keyboardEngine.attach(document),
      registerCommands(
        buildThreadViewCommands({
          onArchive: vi.fn(),
          onMarkUnread: vi.fn(),
          onToggleStar: vi.fn(),
          onForward: vi.fn(),
          onFocusReply: vi.fn(),
          onSelect: vi.fn(),
          onClose: closeConversation,
        }),
      ),
      keyboardEngine.pushScope(THREAD_KEYBOARD_SCOPE),
    );
  });

  afterEach(() => {
    while (releases.length) releases.pop()!();
  });

  async function pressEscape() {
    const { act } = await import('react');
    await act(async () => {
      (document.activeElement ?? document.body).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }),
      );
    });
  }

  it('a document preview closes and the conversation stays open; the next Escape is the conversation’s', async () => {
    await mount(
      <AttachmentPreview
        attachments={[
          { id: 'att_1760000000000_k3j4h5', filename: 'report.pdf', mimeType: 'application/pdf', size: 8, url: toDataUrl('application/pdf', '%PDF-1.7') },
        ]}
      />,
    );
    await clickChip('report.pdf');
    expect(document.querySelector('[data-testid="engine"]')).not.toBeNull();

    await pressEscape();

    expect(document.querySelector('[data-testid="engine"]')).toBeNull();
    expect(closeConversation).not.toHaveBeenCalled();

    // Preview gone: Escape belongs to the conversation again.
    await pressEscape();
    expect(closeConversation).toHaveBeenCalledTimes(1);
  });

  it('the image lightbox closes on Escape without leaving the conversation', async () => {
    const url = toDataUrl('image/png', 'png');
    await mount(<AttachmentPreview attachments={[{ id: 'i1', filename: 'photo.png', mimeType: 'image/png', size: 3, url }]} />);
    await clickChip('photo.png');
    expect(document.querySelector('.attachment-lightbox img')).not.toBeNull();

    await pressEscape();

    expect(closeConversation).not.toHaveBeenCalled();
    await pressEscape();
    expect(closeConversation).toHaveBeenCalledTimes(1);
  });

  it('other conversation shortcuts are held while a preview is open', async () => {
    const archive = vi.fn();
    releases.push(
      registerCommands([
        { id: 'test.archive', label: 'Archive', group: 'Conversation', keys: 'e', scope: THREAD_KEYBOARD_SCOPE, run: archive },
      ]),
    );
    await mount(
      <AttachmentPreview
        attachments={[
          { id: 'a1', filename: 'deck.pptx', mimeType: 'application/octet-stream', size: 0, url: toDataUrl('application/octet-stream', 'PK') },
        ]}
      />,
    );
    await clickChip('deck.pptx');
    const { act } = await import('react');
    await act(async () => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', code: 'KeyE', bubbles: true, cancelable: true }));
    });
    expect(archive).not.toHaveBeenCalled();
  });
});

