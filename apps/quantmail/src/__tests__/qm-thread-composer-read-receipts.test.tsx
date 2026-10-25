/**
 * ThreadComposer read receipts (fix/qm-read-receipts).
 *
 * The person-thread bar previously had no open-tracking toggle, so its
 * replies always sent tracked. The send path now carries an explicit
 * per-message `trackOpens` when the composer has one — and, crucially,
 * stays byte-identical when it does not, so the older executeThreadSend
 * contract (and the server's read-receipts default) is untouched.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeThreadSend } from '../components/ThreadComposer';

const composeMock = vi.fn();
const sendMock = vi.fn();
const toastMock = vi.fn();

const conversation = {
  personKey: 'ada',
  name: 'Ada',
  email: 'ada@x.com',
  lastMessage: { id: 'msg-9', subject: 'Hi there' },
};

function deps() {
  return {
    composeEmail: composeMock,
    sendEmail: sendMock,
    toast: (text: string, type: 'success' | 'error') => toastMock({ text, type }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  composeMock.mockResolvedValue({ success: true, data: { id: 'draft-1' } });
  sendMock.mockResolvedValue({ success: true });
});

describe('executeThreadSend trackOpens (fix/qm-read-receipts)', () => {
  it('carries an explicit false through to the compose payload', async () => {
    const outcome = await executeThreadSend(
      deps(),
      conversation as never,
      'Re: Hi there',
      'hello',
      undefined,
      false,
    );
    expect(outcome.ok).toBe(true);
    expect(composeMock).toHaveBeenCalledWith(
      expect.objectContaining({ trackOpens: false }),
    );
  });

  it('carries an explicit true through to the compose payload', async () => {
    const outcome = await executeThreadSend(
      deps(),
      conversation as never,
      'Re: Hi there',
      'hello',
      undefined,
      true,
    );
    expect(outcome.ok).toBe(true);
    expect(composeMock).toHaveBeenCalledWith(
      expect.objectContaining({ trackOpens: true }),
    );
  });

  it('omits trackOpens entirely when the composer has no opinion, leaving the server default in charge', async () => {
    const outcome = await executeThreadSend(deps(), conversation as never, 'Re: Hi there', 'hello');
    expect(outcome.ok).toBe(true);
    const payload = composeMock.mock.calls[0][0] as Record<string, unknown>;
    expect('trackOpens' in payload).toBe(false);
    expect(payload).toEqual({
      to: [{ email: 'ada@x.com' }],
      subject: 'Re: Hi there',
      bodyText: 'hello',
      messageKind: 'chat',
      inReplyTo: 'msg-9',
    });
  });
});
