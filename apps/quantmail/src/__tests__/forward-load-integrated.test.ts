// Forward compose state machine (integrated #1555 head): one load, honest
// failures, correct precedence, A->B reset, and a send gate that is
// disabled exactly while attachments resolve. These are behavior tests over
// the pure machine in lib/forward-load.ts — the same reducer + resolver the
// compose page runs — not wiring pins: every transition asserted here is a
// transition the page renders (error screen, loading screen, disabled Send).
import { describe, it, expect } from 'vitest';
import {
  classifyForwardLoadFailure,
  FORWARD_LOAD_FAILURE_COPY,
  forwardComposeReducer,
  forwardPrefillFor,
  forwardSendDisabledReason,
  initialForwardComposeState,
  normalizeForwardOriginal,
  pickLatestMessage,
  resolveForwardOriginal,
  type ForwardComposeState,
  type ForwardFetchers,
  type ForwardOriginal,
} from '../lib/forward-load';

const ORIGINAL: ForwardOriginal = {
  from: { email: 'jane@example.com', name: 'Jane' },
  to: [{ email: 'bob@example.com' }],
  subject: 'Hello',
  bodyText: 'Original words',
  attachments: [],
};

function fetchers(impl: Partial<ForwardFetchers>): ForwardFetchers {
  return {
    getEmail: impl.getEmail ?? (async () => ({ success: false, error: { statusCode: 404 } })),
    getThread: impl.getThread ?? (async () => ({ success: false, error: { statusCode: 404 } })),
  };
}

function messageResult(message: unknown) {
  return { success: true, data: message };
}

function threadResult(messages: unknown[], subject = 'Thread subject') {
  return { success: true, data: { subject, messages } };
}

function errorResult(statusCode: number) {
  return { success: false, error: { statusCode, message: `HTTP ${statusCode}` } };
}

/** Drive the reducer through the page's happy path for one forward run. */
function runHappyPath(state: ForwardComposeState, runId: string): ForwardComposeState {
  let s = forwardComposeReducer(state, { type: 'start-run', runId });
  s = forwardComposeReducer(s, {
    type: 'original-loaded',
    subject: 'Fwd: Hello',
    body: 'forwarded body',
    hasAttachments: true,
  });
  return s;
}

describe('resolveForwardOriginal', () => {
  it('success: resolves the message id directly, never touches the thread', async () => {
    const calls: string[] = [];
    const result = await resolveForwardOriginal(
      fetchers({
        getEmail: async (id) => {
          calls.push(`email:${id}`);
          return messageResult({ ...ORIGINAL, subject: 'Hello' });
        },
        getThread: async () => {
          calls.push('thread');
          return errorResult(404);
        },
      }),
      'msg_1',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.via).toBe('message');
      expect(result.message.subject).toBe('Hello');
      expect(result.message.bodyText).toBe('Original words');
    }
    expect(calls).toEqual(['email:msg_1']);
  });

  it('thread fallback: a 404 message id falls back to the thread latest message', async () => {
    const result = await resolveForwardOriginal(
      fetchers({
        getEmail: async () => errorResult(404),
        getThread: async () =>
          threadResult([
            { ...ORIGINAL, subject: 'Old', receivedAt: '2026-01-01T00:00:00Z' },
            { ...ORIGINAL, subject: 'New', receivedAt: '2026-02-01T00:00:00Z' },
          ]),
      }),
      'thread_1',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.via).toBe('thread');
      expect(result.message.subject).toBe('New');
    }
  });

  it('thread fallback inherits the thread subject when the latest message names none', async () => {
    const result = await resolveForwardOriginal(
      fetchers({
        getEmail: async () => errorResult(404),
        getThread: async () =>
          threadResult([{ ...ORIGINAL, subject: '' }], 'Thread subject here'),
      }),
      'thread_1',
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.message.subject).toBe('Thread subject here');
  });

  it('403: both endpoints denied -> denied, never a blank composer', async () => {
    const result = await resolveForwardOriginal(
      fetchers({
        getEmail: async () => errorResult(403),
        getThread: async () => errorResult(403),
      }),
      'msg_denied',
    );
    expect(result).toEqual({ ok: false, kind: 'denied' });
    expect(FORWARD_LOAD_FAILURE_COPY.denied.title).toMatch(/access/);
  });

  it('404: both endpoints missing -> deleted', async () => {
    const result = await resolveForwardOriginal(
      fetchers({
        getEmail: async () => errorResult(404),
        getThread: async () => errorResult(404),
      }),
      'msg_gone',
    );
    expect(result).toEqual({ ok: false, kind: 'deleted' });
    expect(FORWARD_LOAD_FAILURE_COPY.deleted.body).toMatch(/deleted|moved/);
  });

  it('offline: a thrown network failure -> offline even when the other attempt 404s', async () => {
    const result = await resolveForwardOriginal(
      fetchers({
        getEmail: async () => {
          throw new Error('fetch failed');
        },
        getThread: async () => errorResult(404),
      }),
      'msg_offline',
    );
    expect(result).toEqual({ ok: false, kind: 'offline' });
    expect(FORWARD_LOAD_FAILURE_COPY.offline.title).toMatch(/offline/);
  });

  it('offline: statusCode 0 (apiClient network envelope) -> offline', async () => {
    const result = await resolveForwardOriginal(
      fetchers({
        getEmail: async () => ({ success: false, error: { statusCode: 0, message: 'Network request failed' } }),
        getThread: async () => ({ success: false, error: { statusCode: 0, message: 'Network request failed' } }),
      }),
      'msg_offline2',
    );
    expect(result).toEqual({ ok: false, kind: 'offline' });
  });

  it('unavailable: a bare 500 -> unavailable, not mislabeled denied or deleted', async () => {
    const result = await resolveForwardOriginal(
      fetchers({
        getEmail: async () => errorResult(500),
        getThread: async () => errorResult(500),
      }),
      'msg_500',
    );
    expect(result).toEqual({ ok: false, kind: 'unavailable' });
  });

  it('an aborted signal rejects so a superseded run never dispatches', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      resolveForwardOriginal(fetchers({}), 'msg_1', controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('classifyForwardLoadFailure', () => {
  it('denial outranks not-found; network outranks both', () => {
    expect(classifyForwardLoadFailure({ statuses: [404, 403], networkThrew: false })).toBe('denied');
    expect(classifyForwardLoadFailure({ statuses: [404], networkThrew: true })).toBe('offline');
    expect(classifyForwardLoadFailure({ statuses: [], networkThrew: false })).toBe('unavailable');
  });
});

describe('pickLatestMessage', () => {
  it('picks the newest by received date, ignoring order', () => {
    const picked = pickLatestMessage([
      { ...ORIGINAL, subject: 'New', receivedAt: '2026-03-01T00:00:00Z' },
      { ...ORIGINAL, subject: 'Old', receivedAt: '2026-01-01T00:00:00Z' },
    ]);
    expect(picked?.subject).toBe('New');
    expect(pickLatestMessage([])).toBeNull();
  });
});

describe('forwardPrefillFor (subject/body precedence)', () => {
  it('plain forward: Fwd: subject + quoted body', () => {
    const prefill = forwardPrefillFor({ original: ORIGINAL });
    expect(prefill.subject).toBe('Fwd: Hello');
    expect(prefill.body).toMatch(/Forwarded message/);
    expect(prefill.body).toMatch(/Original words/);
  });

  it('body-only prefill STILL loads the Fwd: subject (explicit body wins body only)', () => {
    const prefill = forwardPrefillFor({
      explicitBody: 'My own words above the forward',
      original: ORIGINAL,
    });
    // Body null = "caller keeps the explicit body"; subject still computed.
    expect(prefill.body).toBeNull();
    expect(prefill.subject).toBe('Fwd: Hello');
  });

  it('explicit subject wins over the forwarded subject', () => {
    const prefill = forwardPrefillFor({
      explicitSubject: 'Custom subject',
      original: ORIGINAL,
    });
    expect(prefill.subject).toBe('Custom subject');
    expect(prefill.body).toMatch(/Forwarded message/);
  });

  it('stacked Fwd: prefixes collapse to exactly one', () => {
    const prefill = forwardPrefillFor({
      original: { ...ORIGINAL, subject: 'Fwd: Fw: Hello' },
    });
    expect(prefill.subject).toBe('Fwd: Hello');
  });

  it('empty explicit body counts as absent — the quote still loads', () => {
    const prefill = forwardPrefillFor({ explicitBody: '', original: ORIGINAL });
    expect(prefill.body).toMatch(/Forwarded message/);
    expect(prefill.subject).toBe('Fwd: Hello');
  });

  it('empty subject stays empty rather than becoming a bare "Fwd: "', () => {
    const prefill = forwardPrefillFor({ original: { ...ORIGINAL, subject: '' } });
    expect(prefill.subject).toBe('');
  });
});

describe('forwardComposeReducer (page state machine)', () => {
  it('success path: loading-original -> resolving-attachments -> ready', () => {
    let s = runHappyPath(initialForwardComposeState, 'fwd_A');
    expect(s.phase).toBe('resolving-attachments');
    expect(s.subject).toBe('Fwd: Hello');
    expect(s.body).toBe('forwarded body');
    // Send is DISABLED while resolving — the whole point of phase 2.
    expect(forwardSendDisabledReason(s)).toMatch(/Still loading/);
    s = forwardComposeReducer(s, {
      type: 'attachments-settled',
      carried: [],
      dropped: [],
    });
    expect(s.phase).toBe('ready');
    expect(forwardSendDisabledReason(s)).toBeNull();
  });

  it('no-attachment original skips phase 2 straight to ready (send enabled)', () => {
    let s = forwardComposeReducer(initialForwardComposeState, {
      type: 'start-run',
      runId: 'fwd_plain',
    });
    s = forwardComposeReducer(s, {
      type: 'original-loaded',
      subject: 'Fwd: Hello',
      body: 'forwarded body',
      hasAttachments: false,
    });
    expect(s.phase).toBe('ready');
    expect(forwardSendDisabledReason(s)).toBeNull();
  });

  it('failed load: failed phase + kind, and send is never the question (no composer renders)', () => {
    let s = forwardComposeReducer(initialForwardComposeState, {
      type: 'start-run',
      runId: 'fwd_gone',
    });
    s = forwardComposeReducer(s, { type: 'original-failed', kind: 'deleted' });
    expect(s.phase).toBe('failed');
    expect(s.failureKind).toBe('deleted');
    expect(s.subject).toBeNull();
    expect(s.body).toBeNull();
    expect(s.attachments).toBeNull();
  });

  it('offline + Retry: a failed run retries from a clean loading state', () => {
    let s = forwardComposeReducer(initialForwardComposeState, {
      type: 'start-run',
      runId: 'fwd_off',
    });
    s = forwardComposeReducer(s, { type: 'original-failed', kind: 'offline' });
    expect(s.phase).toBe('failed');
    // Retry is a fresh start-run for the same id: failure cleared.
    s = forwardComposeReducer(s, { type: 'start-run', runId: 'fwd_off' });
    expect(s.phase).toBe('loading-original');
    expect(s.failureKind).toBeNull();
  });

  it('A->B reset: starting run B wipes ALL of A — body, subject, attachments, warnings, failure', () => {
    let s = runHappyPath(initialForwardComposeState, 'fwd_A');
    s = forwardComposeReducer(s, {
      type: 'attachments-settled',
      carried: [
        {
          id: 'att_fwd_1',
          name: 'a.pdf',
          filename: 'a.pdf',
          size: 10,
          type: 'application/pdf',
          mimeType: 'application/pdf',
          url: 'data:application/pdf;base64,xxx',
        },
      ],
      dropped: [{ filename: 'b.pdf', reason: 'its file could not be read' }],
    });
    expect(s.phase).toBe('ready');
    expect(s.attachments).toHaveLength(1);
    expect(s.warnings).toHaveLength(1);
    // Navigate A -> B: everything from A must be gone, immediately.
    s = forwardComposeReducer(s, { type: 'start-run', runId: 'fwd_B' });
    expect(s).toEqual({
      runId: 'fwd_B',
      phase: 'loading-original',
      failureKind: null,
      subject: null,
      body: null,
      attachments: null,
      warnings: [],
    });
  });

  it('A->B reset also clears a failure: B does not inherit A’s error screen', () => {
    let s = forwardComposeReducer(initialForwardComposeState, {
      type: 'start-run',
      runId: 'fwd_A',
    });
    s = forwardComposeReducer(s, { type: 'original-failed', kind: 'denied' });
    s = forwardComposeReducer(s, { type: 'start-run', runId: 'fwd_B' });
    expect(s.phase).toBe('loading-original');
    expect(s.failureKind).toBeNull();
  });

  it('clear: leaving the forward (reply/draft/plain compose) returns to idle', () => {
    const s = forwardComposeReducer(runHappyPath(initialForwardComposeState, 'fwd_A'), {
      type: 'clear',
    });
    expect(s).toEqual(initialForwardComposeState);
  });

  it('attachments-settled records carried files AND persistent warnings together', () => {
    let s = runHappyPath(initialForwardComposeState, 'fwd_A');
    s = forwardComposeReducer(s, {
      type: 'attachments-settled',
      carried: [
        {
          id: 'att_fwd_2',
          name: 'kept.txt',
          filename: 'kept.txt',
          size: 4,
          type: 'text/plain',
          mimeType: 'text/plain',
          url: 'data:text/plain;base64,aGk=',
        },
      ],
      dropped: [{ filename: 'lost.bin', reason: 'its file is empty' }],
    });
    expect(s.phase).toBe('ready');
    expect(s.attachments?.map((a) => a.filename)).toEqual(['kept.txt']);
    expect(s.warnings).toEqual([{ filename: 'lost.bin', reason: 'its file is empty' }]);
    expect(forwardSendDisabledReason(s)).toBeNull();
  });
});

describe('normalizeForwardOriginal', () => {
  it('defaults missing attachments to [] and drops non-objects', () => {
    expect(normalizeForwardOriginal({ subject: 'S' })?.attachments).toEqual([]);
    expect(normalizeForwardOriginal(null)).toBeNull();
    expect(normalizeForwardOriginal('nope')).toBeNull();
  });
});
