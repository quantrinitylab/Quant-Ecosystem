// QM-M39-003 — UploadCenter component tests (M39 screen 15).
// Every visible word must be an instruction or a provable truth; progress
// values come only from real upload bytes.

import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { UploadCenter } from '../app/drive/components/UploadCenter';
import type { UploadProgress } from '../hooks/useDrive';

const entry = (overrides: Partial<UploadProgress>): UploadProgress => ({
  fileId: 'upload-1',
  fileName: 'report.pdf',
  fileSize: 2048,
  progress: 0,
  bytesUploaded: 0,
  status: 'queued',
  attempts: 1,
  ...overrides,
});

describe('UploadCenter component', () => {
  const handlers = {
    onRetry: vi.fn(),
    onCancel: vi.fn(),
    onDismiss: vi.fn(),
    onClearFinished: vi.fn(),
  };

  it('renders nothing when the queue is empty', () => {
    expect(renderToStaticMarkup(<UploadCenter uploads={[]} {...handlers} />)).toBe('');
  });

  it('renders every queue state with its honest label', () => {
    const html = renderToStaticMarkup(
      <UploadCenter
        uploads={[
          entry({ fileId: 'u1', status: 'queued' }),
          entry({ fileId: 'u2', status: 'uploading', progress: 42, bytesUploaded: 861, fileSize: 2048 }),
          entry({ fileId: 'u3', status: 'scanning', progress: 100 }),
          entry({ fileId: 'u4', status: 'available', progress: 100 }),
          entry({ fileId: 'u5', status: 'failed', error: 'Quota exceeded' }),
          entry({ fileId: 'u6', status: 'cancelled' }),
        ]}
        {...handlers}
      />,
    );
    for (const label of ['Queued', 'Uploading', 'Scanning', 'Available', 'Failed', 'Cancelled']) {
      expect(html).toContain(label);
    }
    // Real byte counts only: 861 of 2048 bytes renders from formatBytes.
    expect(html).toContain('861 B of 2 KB');
    // Progressbar carries the real value, not an animation.
    expect(html).toContain('aria-valuenow="42"');
    // The real backend error is shown; retry is offered for a normal failure.
    expect(html).toContain('Quota exceeded');
    expect(html).toContain('Retry');
    // Honest summary: 1 of 6 entries is available.
    expect(html).toContain('1 of 6 complete');
  });

  it('blocks retry for a quarantined file and shows the real reason', () => {
    const html = renderToStaticMarkup(
      <UploadCenter
        uploads={[
          entry({
            fileId: 'u1',
            status: 'failed',
            blocked: true,
            scanStatus: 'quarantined',
            scanReason: 'EICAR test signature',
            error: 'Quarantined: EICAR test signature',
          }),
        ]}
        {...handlers}
      />,
    );
    expect(html).toContain('Blocked — quarantined');
    expect(html).toContain('Quarantined: EICAR test signature');
    expect(html).not.toContain('Retry');
  });
});
