/**
 * lib/email-labels — the working labelId-based label mutation path.
 *
 * useMail's addLabel/removeLabel used to hit POST /api/emails/{id}/labels and
 * DELETE /api/emails/{id}/labels/{name}, which had no route on either side and
 * 404'd on every call (the "optimistic rollback" never fired either, because
 * the transport resolves on HTTP errors). These tests pin the rewired path:
 *
 * - applyLabelRequest POSTs /api/labels/apply { emailId, labelId } and throws
 *   on HTTP errors (so the hook's rollback actually runs).
 * - removeLabelRequest POSTs /api/labels/remove { emailId, labelId } and
 *   throws on HTTP errors.
 * - withLabelAdded / withLabelRemoved are the optimistic state transitions:
 *   idempotent, scoped to one email, and rollback-safe (no phantom labels).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  applyLabelRequest,
  removeLabelRequest,
  withLabelAdded,
  withLabelRemoved,
} from '../email-labels';
import type { Email } from '../../types';

const { browserApiRequest } = vi.hoisted(() => ({
  browserApiRequest: vi.fn(),
}));

vi.mock('../../services/browser-api-request', () => ({
  browserApiRequest,
}));

const okResponse = (status = 200) =>
  ({ ok: status >= 200 && status < 300, status }) as Response;

function makeEmail(id: string, labels: string[] = []): Email {
  return {
    id,
    labels,
    isRead: false,
    isStarred: false,
    isArchived: false,
    isDraft: false,
    attachments: [],
    references: [],
    headers: {},
    receivedAt: new Date(),
  } as Email;
}

beforeEach(() => {
  vi.mocked(browserApiRequest).mockReset();
});

describe('applyLabelRequest', () => {
  it('POSTs to the working /api/labels/apply endpoint with { emailId, labelId }', async () => {
    vi.mocked(browserApiRequest).mockResolvedValue(okResponse());
    await applyLabelRequest('email-1', 'label-9');
    expect(browserApiRequest).toHaveBeenCalledTimes(1);
    expect(browserApiRequest).toHaveBeenCalledWith('/api/labels/apply', {
      method: 'POST',
      body: JSON.stringify({ emailId: 'email-1', labelId: 'label-9' }),
    });
  });

  it('never touches the dead /api/emails/{id}/labels path', async () => {
    vi.mocked(browserApiRequest).mockResolvedValue(okResponse());
    await applyLabelRequest('email-1', 'label-9');
    const url = String(vi.mocked(browserApiRequest).mock.calls[0][0]);
    expect(url).not.toContain('/api/emails/');
  });

  it('throws on HTTP errors so the optimistic update rolls back', async () => {
    vi.mocked(browserApiRequest).mockResolvedValue(okResponse(404));
    await expect(applyLabelRequest('email-1', 'label-9')).rejects.toThrow(/404/);
  });

  it('throws on server errors too', async () => {
    vi.mocked(browserApiRequest).mockResolvedValue(okResponse(500));
    await expect(applyLabelRequest('email-1', 'label-9')).rejects.toThrow(/500/);
  });
});

describe('removeLabelRequest', () => {
  it('POSTs to the working /api/labels/remove endpoint with { emailId, labelId }', async () => {
    vi.mocked(browserApiRequest).mockResolvedValue(okResponse());
    await removeLabelRequest('email-1', 'label-9');
    expect(browserApiRequest).toHaveBeenCalledTimes(1);
    expect(browserApiRequest).toHaveBeenCalledWith('/api/labels/remove', {
      method: 'POST',
      body: JSON.stringify({ emailId: 'email-1', labelId: 'label-9' }),
    });
  });

  it('never touches the dead DELETE /api/emails/{id}/labels/{name} path', async () => {
    vi.mocked(browserApiRequest).mockResolvedValue(okResponse());
    await removeLabelRequest('email-1', 'label-9');
    const [url, init] = vi.mocked(browserApiRequest).mock.calls[0];
    expect(String(url)).not.toContain('/api/emails/');
    expect((init as RequestInit).method).not.toBe('DELETE');
  });

  it('throws on HTTP errors so the optimistic update rolls back', async () => {
    vi.mocked(browserApiRequest).mockResolvedValue(okResponse(403));
    await expect(removeLabelRequest('email-1', 'label-9')).rejects.toThrow(/403/);
  });
});

describe('withLabelAdded', () => {
  it('adds the label id to the matching email only', () => {
    const emails = [makeEmail('a', ['l1']), makeEmail('b', ['l2'])];
    const next = withLabelAdded(emails, 'a', 'l9');
    expect(next.find((e) => e.id === 'a')!.labels).toEqual(['l1', 'l9']);
    expect(next.find((e) => e.id === 'b')!.labels).toEqual(['l2']);
  });

  it('dedupes: adding an id that is already present is a no-op', () => {
    const emails = [makeEmail('a', ['l1'])];
    expect(withLabelAdded(emails, 'a', 'l1')).toEqual(emails);
  });

  it('does not mutate the input array', () => {
    const emails = [makeEmail('a', [])];
    withLabelAdded(emails, 'a', 'l9');
    expect(emails[0].labels).toEqual([]);
  });
});

describe('withLabelRemoved', () => {
  it('removes the label id from the matching email only', () => {
    const emails = [makeEmail('a', ['l1', 'l9']), makeEmail('b', ['l9'])];
    const next = withLabelRemoved(emails, 'a', 'l9');
    expect(next.find((e) => e.id === 'a')!.labels).toEqual(['l1']);
    expect(next.find((e) => e.id === 'b')!.labels).toEqual(['l9']);
  });

  it('is a no-op when the label id is not present (rollback-safe: no phantom labels)', () => {
    const emails = [makeEmail('a', ['l1'])];
    const next = withLabelRemoved(emails, 'a', 'l9');
    expect(next).toEqual(emails);
  });
});

describe('optimistic round-trip', () => {
  it('add then failed-request rollback restores the original labels', () => {
    const emails = [makeEmail('a', ['l1'])];
    const optimistic = withLabelAdded(emails, 'a', 'l9');
    expect(optimistic[0].labels).toEqual(['l1', 'l9']);
    const rolledBack = withLabelRemoved(optimistic, 'a', 'l9');
    expect(rolledBack).toEqual(emails);
  });

  it('remove then failed-request rollback restores the label without duplication', () => {
    const emails = [makeEmail('a', ['l1', 'l9'])];
    const optimistic = withLabelRemoved(emails, 'a', 'l9');
    expect(optimistic[0].labels).toEqual(['l1']);
    const rolledBack = withLabelAdded(optimistic, 'a', 'l9');
    expect(rolledBack[0].labels).toEqual(['l1', 'l9']);
  });

  it('rollback re-add is dedupe-safe when the label came back through another path', () => {
    const emails = [makeEmail('a', ['l1', 'l9'])];
    const optimistic = withLabelRemoved(emails, 'a', 'l9');
    // While the remove request was in flight, the label was re-added
    // elsewhere; the rollback must not duplicate it.
    const raced = withLabelAdded(optimistic, 'a', 'l9');
    const rolledBack = withLabelAdded(raced, 'a', 'l9');
    expect(rolledBack[0].labels).toEqual(['l1', 'l9']);
  });
});
