import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  TASK_STATUS_DOT,
  TASK_STATUS_LABEL,
  TASK_STATUS_TO_BUBBLE,
  loadRecentCommands,
  saveRecentCommand,
  QuantyAvatar,
  QuantyModeChooser,
  QuantyActionHighlight,
  QuantyPopup,
  QuantyPopupHeader,
  QuantyPopupTabs,
  QuantyActivityTab,
  QuantyApprovalsTab,
  QuantyBrowserTab,
  QuantyScheduleTab,
  QuantyIdentityTab,
  QuantyActivityFeed,
  QuantyLiveAgent,
  useQuantyAgent,
  formatClockTime,
  formatRelativeTime,
  dayBucket,
  type UseQuantyAgent,
  type QuantyTaskStatus,
} from '../components/QuantyLiveAgent';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('QuantyLiveAgent types', () => {
  const statuses: QuantyTaskStatus[] = ['idle', 'thinking', 'working', 'waiting-confirm', 'done', 'failed'];

  it('maps every task status to a bubble state, dot color and Hinglish label', () => {
    for (const s of statuses) {
      expect(TASK_STATUS_TO_BUBBLE[s], `bubble for ${s}`).toBeTruthy();
      expect(TASK_STATUS_DOT[s], `dot for ${s}`).toMatch(/^bg-/);
      expect(TASK_STATUS_LABEL[s], `label for ${s}`).toBeTruthy();
    }
  });

  it('uses amber for waiting-confirm and red for failed', () => {
    expect(TASK_STATUS_DOT['waiting-confirm']).toContain('amber');
    expect(TASK_STATUS_DOT.failed).toContain('red');
  });
});

describe('quantyTime helpers', () => {
  it('formats clock time like 5:48pm', () => {
    const out = formatClockTime('2026-10-06T17:48:00+05:30');
    expect(out).toMatch(/\d{1,2}:\d{2}(am|pm)/);
  });

  it('formats relative time', () => {
    const now = new Date('2026-10-06T18:00:00+05:30');
    expect(formatRelativeTime('2026-10-06T17:30:00+05:30', now)).toBe('30m ago');
    expect(formatRelativeTime('2026-10-06T11:00:00+05:30', now)).toBe('7h ago');
    expect(formatRelativeTime('2026-10-06T17:59:30+05:30', now)).toBe('just now');
  });

  it('buckets days into today/yesterday/older', () => {
    const now = new Date('2026-10-06T18:00:00+05:30');
    expect(dayBucket('2026-10-06T09:00:00+05:30', now)).toBe('today');
    expect(dayBucket('2026-10-05T09:00:00+05:30', now)).toBe('yesterday');
    expect(dayBucket('2026-09-01T09:00:00+05:30', now)).toBe('older');
  });
});

describe('recent commands storage', () => {
  it('returns [] when window is unavailable (SSR)', () => {
    expect(loadRecentCommands()).toEqual([]);
  });

  it('saves, dedupes and caps at 5', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    });
    expect(saveRecentCommand('a')).toEqual(['a']);
    expect(saveRecentCommand('b')).toEqual(['b', 'a']);
    expect(saveRecentCommand('a')).toEqual(['a', 'b']); // dedupe, newest first
    saveRecentCommand('c');
    saveRecentCommand('d');
    saveRecentCommand('e');
    const six = saveRecentCommand('f');
    expect(six).toHaveLength(5);
    expect(six[0]).toBe('f');
    expect(loadRecentCommands()).toEqual(six);
  });
});

describe('QuantyAvatar', () => {
  it('renders nothing when the session is not active', () => {
    const html = renderToStaticMarkup(React.createElement(QuantyAvatar, { active: false }));
    expect(html).toBe('');
  });

  it('renders nothing by default (contextual, not always floating)', () => {
    const html = renderToStaticMarkup(React.createElement(QuantyAvatar, {}));
    expect(html).toBe('');
  });

  it('renders the avatar with the live action label when active', () => {
    const html = renderToStaticMarkup(
      React.createElement(QuantyAvatar, { active: true, status: 'working', actionLabel: '5 emails archive kar raha...' }),
    );
    expect(html).toContain('5 emails archive kar raha...');
    expect(html).toContain('aria-label="Quanty — 5 emails archive kar raha...');
  });

  it('falls back to the status label without an action label', () => {
    const html = renderToStaticMarkup(
      React.createElement(QuantyAvatar, { active: true, status: 'working' }),
    );
    expect(html).toContain('Kaam chal raha hai');
  });

  it('shows the waiting-confirm caption when permission is needed', () => {
    const html = renderToStaticMarkup(
      React.createElement(QuantyAvatar, { active: true, status: 'waiting-confirm' }),
    );
    expect(html).toContain('Aapki permission chahiye');
  });
});

describe('QuantyModeChooser', () => {
  it('renders nothing when closed', () => {
    const html = renderToStaticMarkup(
      React.createElement(QuantyModeChooser, { open: false, onSelect: () => undefined }),
    );
    expect(html).toBe('');
  });

  it('offers Chat and Voice Live Agent when open', () => {
    const html = renderToStaticMarkup(
      React.createElement(QuantyModeChooser, { open: true, onSelect: () => undefined }),
    );
    expect(html).toContain('>Chat<');
    expect(html).toContain('Voice Live Agent');
    expect(html).toContain('role="dialog"');
  });
});

describe('QuantyActionHighlight', () => {
  it('renders nothing when inactive', () => {
    const html = renderToStaticMarkup(
      React.createElement(QuantyActionHighlight, { selector: '[data-x]', label: 'test', active: false }),
    );
    expect(html).toBe('');
  });

  it('renders nothing without a measurable target (SSR-safe)', () => {
    // No document in node — the effect never runs, so no rect, no markup.
    const html = renderToStaticMarkup(
      React.createElement(QuantyActionHighlight, { selector: '[data-x]', label: 'test', active: true }),
    );
    expect(html).toBe('');
  });
});

describe('QuantyPopup', () => {
  it('renders nothing when closed', () => {
    const html = renderToStaticMarkup(React.createElement(QuantyPopup, { open: false }));
    expect(html).toBe('');
  });

  it('renders the inspector with header and 5 tabs when open', () => {
    const html = renderToStaticMarkup(React.createElement(QuantyPopup, { open: true, liveStatus: '5 emails archive kar raha...' }));
    // Header
    expect(html).toContain('Quanty');
    expect(html).toContain('5 emails archive kar raha...');
    expect(html).toContain('aria-label="Quanty details"');
    // 5 tabs
    for (const label of ['Activity', 'Approvals', 'Browser', 'Schedule', 'Identity']) {
      expect(html).toContain(label);
    }
    // Activity tab default content (honest empty state, no fake rows)
    expect(html).toContain('Abhi kuch nahi hua');
  });

  it('shows the live status line in the header', () => {
    const html = renderToStaticMarkup(React.createElement(QuantyPopupHeader, { status: 'Planning...' }));
    expect(html).toContain('Planning...');
  });
});

describe('QuantyPopupTabs', () => {
  it('marks the active tab selected', () => {
    const html = renderToStaticMarkup(
      React.createElement(QuantyPopupTabs, { active: 'schedule' }),
    );
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('role="tablist"');
  });
});

describe('popup tab contents', () => {
  it('activity tab groups entries into Today/Yesterday', () => {
    const html = renderToStaticMarkup(
      React.createElement(QuantyActivityTab, {
        entries: [
          { id: '1', title: 'Avatar trigger for live agent', description: 'Updated Quanty avatar to appear on demand', timestamp: new Date().toISOString(), icon: 'code' },
          { id: '2', title: 'Old task', timestamp: '2020-01-01T00:00:00Z', icon: 'mail' },
        ],
      }),
    );
    expect(html).toContain('Today');
    expect(html).toContain('Older');
    expect(html).toContain('Avatar trigger for live agent');
  });

  it('activity tab shows honest empty state, never fake rows', () => {
    const html = renderToStaticMarkup(React.createElement(QuantyActivityTab, { entries: [] }));
    expect(html).toContain('Abhi kuch nahi hua');
    expect(html).not.toContain('<li');
  });

  it('approvals tab renders history rows', () => {
    const html = renderToStaticMarkup(
      React.createElement(QuantyApprovalsTab, {
        approvals: [
          { id: 'a1', title: 'Fill saved credentials in Browser', scope: 'Site always allowed', grantedAt: new Date(Date.now() - 7 * 3600e3).toISOString() },
        ],
      }),
    );
    expect(html).toContain('Approvals history');
    expect(html).toContain('Fill saved credentials in Browser');
    expect(html).toContain('Site always allowed');
    expect(html).toContain('7h ago');
  });

  it('browser tab shows task count and rows', () => {
    const html = renderToStaticMarkup(
      React.createElement(QuantyBrowserTab, {
        tasks: [
          { id: 'b1', title: 'Find defects and deploy agents', url: 'quantmail.in', status: 'running', startedAt: new Date().toISOString() },
        ],
      }),
    );
    expect(html).toContain('1 browser task');
    expect(html).toContain('Find defects and deploy agents');
    expect(html).toContain('quantmail.in');
  });

  it('schedule tab groups Daily/Interval/Weekly', () => {
    const html = renderToStaticMarkup(
      React.createElement(QuantyScheduleTab, {
        tasks: [
          { id: 's1', name: 'Quant deep audit daily', kind: 'daily', scheduleText: 'Every day · 9:41 AM' },
          { id: 's2', name: 'Agent coordination watch', kind: 'interval', scheduleText: 'Every 10 minutes' },
          { id: 's3', name: 'Quantmail weekly health check', kind: 'weekly', scheduleText: 'Monday' },
        ],
      }),
    );
    expect(html).toContain('Daily');
    expect(html).toContain('Interval');
    expect(html).toContain('Weekly');
    expect(html).toContain('Agent coordination watch');
    expect(html).toContain('Every 10 minutes');
  });

  it('identity tab renders SOUL and MEMORY cards with ACCESS WITH CARE', () => {
    const html = renderToStaticMarkup(
      React.createElement(QuantyIdentityTab, {
        identity: { soul: { updatedAt: new Date().toISOString() }, memory: { updatedAt: new Date().toISOString() } },
      }),
    );
    expect(html).toContain('SOUL');
    expect(html).toContain('MEMORY');
    // Rendered with CSS uppercase; DOM text is "Access with care".
    expect(html).toContain('Access with care');
    expect(html).toContain('uppercase');
    expect(html.match(/Edit/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe('QuantyLiveAgent', () => {
  it('renders nothing until the chooser is opened (hidden by default)', () => {
    const html = renderToStaticMarkup(React.createElement(QuantyLiveAgent, {}));
    expect(html).toBe('');
  });
});

describe('QuantyActivityFeed step linking', () => {
  const step = (over: Record<string, unknown> = {}) => ({
    id: 's1',
    label: '5 emails archive kiye',
    status: 'done' as const,
    updatedAt: new Date().toISOString(),
    ...over,
  });

  it('renders steps as buttons when they carry a targetSelector and onStepTap', () => {
    const html = renderToStaticMarkup(
      React.createElement(QuantyActivityFeed, {
        steps: [step({ targetSelector: '[data-thread-id="a"]' })],
        onStepTap: () => undefined,
      }),
    );
    expect(html).toContain('<button');
    expect(html).toContain('tap karke dekhein kahan kaam hua');
  });

  it('renders plain rows when steps have no targetSelector', () => {
    const html = renderToStaticMarkup(
      React.createElement(QuantyActivityFeed, {
        steps: [step()],
        onStepTap: () => undefined,
      }),
    );
    expect(html).not.toContain('<button type="button"');
  });
});

describe('useQuantyAgent', () => {
  function probe(): UseQuantyAgent {
    let captured: UseQuantyAgent | null = null;
    function Probe() {
      captured = useQuantyAgent();
      return null;
    }
    renderToStaticMarkup(React.createElement(Probe));
    if (!captured) throw new Error('hook did not render');
    return captured;
  }

  it('starts idle with no task', () => {
    const agent = probe();
    expect(agent.task).toBeNull();
    expect(agent.running).toBe(false);
    expect(agent.error).toBeNull();
  });

  it('rejects an empty command without touching the network', async () => {
    const agent = probe();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(agent.submitCommand('   ')).rejects.toThrow('Command khaali hai');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('submits a command and opens the SSE stream', async () => {
    const agent = probe();
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ taskId: 'task-1' }),
    }));
    vi.stubGlobal('fetch', fetchSpy);

    const seenUrls: string[] = [];
    class FakeEventSource {
      url: string;
      onmessage: ((e: { data: string }) => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(url: string) {
        this.url = url;
        seenUrls.push(url);
      }
      close() {}
    }
    vi.stubGlobal('EventSource', FakeEventSource);

    const taskId = await agent.submitCommand('mere unread emails archive kar do');
    expect(taskId).toBe('task-1');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/quanty/tasks',
      expect.objectContaining({ method: 'POST' }),
    );
    const opts = (fetchSpy.mock.calls[0] as unknown[])[1] as { body: string };
    const body = JSON.parse(opts.body) as { command: string };
    expect(body.command).toBe('mere unread emails archive kar do');
    expect(seenUrls[0]).toBe('/api/quanty/tasks/task-1/stream');
  });

  it('surfaces transport errors', async () => {
    const agent = probe();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500 })),
    );
    await expect(agent.submitCommand('hello')).rejects.toThrow('HTTP 500');
  });
});
