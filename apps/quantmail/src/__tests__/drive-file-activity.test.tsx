// QM-M39-008 — Drive per-file activity/history view (M39 screen 25) UI tests.
// Covers: ActivityManager loading, the honest empty state (no fabricated
// rows), truthful per-action descriptions from backend-recorded payloads,
// and timeline rendering.
//
// No fake activity: descriptions are built only from fields the backend
// recorded. Anything unknown is omitted, never invented.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  FileActivityModal,
  ActivityManager,
  describeActivity,
  type ActivityEventItem,
} from '../components/drive/FileActivityModal';

function makeEvent(partial: Partial<ActivityEventItem> & { id: string }): ActivityEventItem {
  return {
    fileId: 'file-1',
    action: 'upload',
    actor: { userId: 'user-owner', name: 'Owner Name', email: 'owner@quantmail.in' },
    details: {},
    createdAt: '2026-10-01T10:00:00.000Z',
    ...partial,
  };
}

const apiFetchOk = (events: ActivityEventItem[]) =>
  vi.fn(async () =>
    new Response(JSON.stringify({ fileId: 'file-1', events }), { status: 200 }),
  );

describe('QM-M39-008 Drive activity view', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('describeActivity', () => {
    it('describes an upload with the actor', () => {
      expect(describeActivity(makeEvent({ id: 'e1', action: 'upload' }))).toBe(
        'Uploaded by Owner Name',
      );
    });

    it('describes a rename with from/to names', () => {
      expect(
        describeActivity(
          makeEvent({
            id: 'e2',
            action: 'rename',
            details: { fromName: 'draft.pdf', toName: 'final.pdf' },
          }),
        ),
      ).toBe('Renamed from “draft.pdf” to “final.pdf” by Owner Name');
    });

    it('describes a move with folder names, falling back honestly when unknown', () => {
      expect(
        describeActivity(
          makeEvent({
            id: 'e3',
            action: 'move',
            details: { fromFolderName: 'Invoices', toFolderName: 'Archive' },
          }),
        ),
      ).toBe('Moved from “Invoices” to “Archive” by Owner Name');
      // Folders without recorded names: no folder name is invented.
      expect(describeActivity(makeEvent({ id: 'e4', action: 'move', details: {} }))).toBe(
        'Moved to Drive root by Owner Name',
      );
    });

    it('describes share changes without inventing missing fields', () => {
      expect(
        describeActivity(
          makeEvent({
            id: 'e5',
            action: 'share_added',
            details: { email: 'friend@quantmail.in', permission: 'view' },
          }),
        ),
      ).toBe('Shared with friend@quantmail.in (view) by Owner Name');
      expect(
        describeActivity(
          makeEvent({
            id: 'e6',
            action: 'share_revoked',
            details: { email: 'friend@quantmail.in' },
          }),
        ),
      ).toBe('Stopped sharing with friend@quantmail.in by Owner Name');
      // Unknown payload: no email invented.
      expect(
        describeActivity(makeEvent({ id: 'e7', action: 'share_revoked', details: {} })),
      ).toBe('Sharing removed by Owner Name');
    });

    it('describes a version restore with the recorded version number', () => {
      expect(
        describeActivity(
          makeEvent({ id: 'e8', action: 'version_restored', details: { versionNumber: 2 } }),
        ),
      ).toBe('Restored version 2 by Owner Name');
    });

    it('omits the actor attribution when the actor is unknown', () => {
      expect(
        describeActivity(
          makeEvent({
            id: 'e9',
            action: 'upload',
            actor: { userId: 'u', name: null, email: null },
          }),
        ),
      ).toBe('Uploaded');
    });
  });

  describe('ActivityManager', () => {
    it('loads events from the activity endpoint', async () => {
      const events = [makeEvent({ id: 'e1' }), makeEvent({ id: 'e2', action: 'rename' })];
      const manager = new ActivityManager({ fileId: 'file-1', apiFetch: apiFetchOk(events) });
      const loaded = await manager.loadEvents();
      expect(loaded).toHaveLength(2);
      expect(manager.getState().isLoading).toBe(false);
      expect(manager.getState().error).toBeNull();
    });

    it('captures fetch failures in state without throwing unhandled', async () => {
      const manager = new ActivityManager({
        fileId: 'file-1',
        apiFetch: vi.fn(async () => new Response('nope', { status: 500 })),
      });
      await expect(manager.loadEvents()).rejects.toThrow();
      expect(manager.getState().error).toBeTruthy();
      expect(manager.getState().events).toEqual([]);
    });

    it('notifies subscribers on state changes', async () => {
      const events = [makeEvent({ id: 'e1' })];
      const manager = new ActivityManager({ fileId: 'file-1', apiFetch: apiFetchOk(events) });
      const seen: boolean[] = [];
      manager.subscribe((s) => seen.push(s.isLoading));
      await manager.loadEvents();
      expect(seen).toContain(true);
      expect(seen[seen.length - 1]).toBe(false);
    });
  });

  describe('FileActivityModal', () => {
    it('renders nothing when closed', () => {
      const html = renderToStaticMarkup(
        <FileActivityModal isOpen={false} fileId="file-1" fileName="doc.pdf" onClose={() => {}} />,
      );
      expect(html).toBe('');
    });

    it('renders the honest empty state when no events were recorded', () => {
      const html = renderToStaticMarkup(
        <FileActivityModal
          isOpen
          fileId="file-1"
          fileName="doc.pdf"
          onClose={() => {}}
          initialEvents={[]}
        />,
      );
      expect(html).toContain('No activity recorded for this file yet');
      expect(html).toContain('data-testid="activity-empty"');
      // No fabricated rows anywhere in the output.
      expect(html).not.toContain('data-testid="activity-event-');
    });

    it('renders a timeline entry per recorded event', () => {
      const events = [
        makeEvent({ id: 'e1', action: 'upload', createdAt: '2026-10-01T10:00:00.000Z' }),
        makeEvent({
          id: 'e2',
          action: 'rename',
          details: { fromName: 'draft.pdf', toName: 'final.pdf' },
          createdAt: '2026-10-02T10:00:00.000Z',
        }),
      ];
      const html = renderToStaticMarkup(
        <FileActivityModal
          isOpen
          fileId="file-1"
          fileName="doc.pdf"
          onClose={() => {}}
          initialEvents={events}
        />,
      );
      expect(html).toContain('data-testid="activity-timeline"');
      expect(html).toContain('Uploaded by Owner Name');
      expect(html).toContain('Renamed from “draft.pdf” to “final.pdf” by Owner Name');
    });

    it('labels the dialog with the file name for accessibility', () => {
      const html = renderToStaticMarkup(
        <FileActivityModal
          isOpen
          fileId="file-1"
          fileName="quarterly-report.pdf"
          onClose={() => {}}
          initialEvents={[]}
        />,
      );
      expect(html).toContain('aria-label="Activity for quarterly-report.pdf"');
    });
  });
});
