// QM-M39-008: per-file activity/history view (M39 screen 25).
//
// Shows the backend-written event log for one file: upload, rename, move,
// share change, version restore. Events are recorded by the drive backend on
// real actions only — nothing is backfilled or invented. A file with no
// recorded events renders an honest empty state, never placeholder rows.
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { browserApiRequest } from '../../services/browser-api-request';

export type FileActivityAction =
  | 'upload'
  | 'rename'
  | 'move'
  | 'share_added'
  | 'share_updated'
  | 'share_revoked'
  | 'version_restored';

export interface FileActivityActor {
  userId: string;
  name: string | null;
  email: string | null;
}

export interface ActivityEventItem {
  id: string;
  fileId: string;
  action: FileActivityAction | string;
  actor: FileActivityActor;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface ActivityState {
  events: ActivityEventItem[];
  isLoading: boolean;
  error: string | null;
}

export interface ActivityManagerOptions {
  fileId?: string;
  apiFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  initialEvents?: ActivityEventItem[];
}

/**
 * Headless ActivityManager — encapsulates event fetching and state
 * subscription independently of UI components.
 */
export class ActivityManager {
  readonly fileId: string;
  private apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  private listeners = new Set<(state: ActivityState) => void>();
  private state: ActivityState;

  constructor(
    fileIdOrOptions: string | ActivityManagerOptions,
    options?: ActivityManagerOptions,
  ) {
    if (typeof fileIdOrOptions === 'string') {
      this.fileId = fileIdOrOptions;
      this.apiFetch = options?.apiFetch ?? browserApiRequest;
      this.state = {
        events: options?.initialEvents ?? [],
        isLoading: false,
        error: null,
      };
    } else {
      this.fileId = fileIdOrOptions.fileId ?? '';
      this.apiFetch = fileIdOrOptions.apiFetch ?? browserApiRequest;
      this.state = {
        events: fileIdOrOptions.initialEvents ?? [],
        isLoading: false,
        error: null,
      };
    }
  }

  getState(): ActivityState {
    return { ...this.state };
  }

  getEvents(): ActivityEventItem[] {
    return [...this.state.events];
  }

  subscribe(listener: (state: ActivityState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(partial: Partial<ActivityState>) {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) {
      listener(this.getState());
    }
  }

  async loadEvents(): Promise<ActivityEventItem[]> {
    this.setState({ isLoading: true, error: null });
    try {
      const res = await this.apiFetch(
        `/api/drive/files/${encodeURIComponent(this.fileId)}/activity`,
      );
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const msg =
          errBody.message || errBody.error || `Failed to fetch activity with HTTP ${res.status}`;
        throw new Error(msg);
      }
      const data = await res.json().catch(() => ({}));
      const rawList: ActivityEventItem[] = Array.isArray(data)
        ? data
        : Array.isArray(data.events)
          ? data.events
          : [];
      this.setState({ events: rawList, isLoading: false, error: null });
      return rawList;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch activity';
      this.setState({ isLoading: false, error: msg });
      throw err;
    }
  }
}

function detailString(details: Record<string, unknown>, key: string): string | null {
  const value = details[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function actorLabel(actor: FileActivityActor | undefined): string {
  if (!actor) return '';
  return actor.name || actor.email || '';
}

/**
 * Human-readable, truthful one-line description of an activity event.
 * Every word must be an instruction or a provable truth: fields come only
 * from backend-recorded event payloads, and anything unknown is omitted
 * rather than invented.
 */
export function describeActivity(event: ActivityEventItem): string {
  const details = event.details ?? {};
  const by = actorLabel(event.actor) ? ` by ${actorLabel(event.actor)}` : '';
  switch (event.action) {
    case 'upload':
      return `Uploaded${by}`;
    case 'rename': {
      const from = detailString(details, 'fromName');
      const to = detailString(details, 'toName');
      return from && to ? `Renamed from “${from}” to “${to}”${by}` : `Renamed${by}`;
    }
    case 'move': {
      const from = detailString(details, 'fromFolderName');
      const to = detailString(details, 'toFolderName');
      if (from && to) return `Moved from “${from}” to “${to}”${by}`;
      if (to) return `Moved to “${to}”${by}`;
      if (from) return `Moved out of “${from}”${by}`;
      return `Moved to Drive root${by}`;
    }
    case 'share_added': {
      const email = detailString(details, 'email');
      const permission = detailString(details, 'permission');
      const what = [email, permission ? `(${permission})` : null].filter(Boolean).join(' ');
      return what ? `Shared with ${what}${by}` : `Shared${by}`;
    }
    case 'share_updated': {
      const email = detailString(details, 'email');
      const permission = detailString(details, 'permission');
      const what = [email, permission ? `(${permission})` : null].filter(Boolean).join(' ');
      return what ? `Sharing updated for ${what}${by}` : `Sharing updated${by}`;
    }
    case 'share_revoked': {
      const email = detailString(details, 'email');
      return email ? `Stopped sharing with ${email}${by}` : `Sharing removed${by}`;
    }
    case 'version_restored': {
      const n = details.versionNumber;
      const versionLabel =
        typeof n === 'number' && Number.isFinite(n) ? ` version ${n}` : ' an earlier version';
      return `Restored${versionLabel}${by}`;
    }
    default:
      return `Updated${by}`;
  }
}

function formatActivityDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const ACTION_ICON_PATHS: Record<string, string> = {
  upload: 'M12 16V4m0 0l-4 4m4-4l4 4M4 20h16',
  rename: 'M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z',
  move: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7zM13 12h6m0 0l-2-2m2 2l-2 2',
  share_added: 'M12 4v16m8-8H4',
  share_updated: 'M4 4h16v16H4zM9 9h6M9 13h6',
  share_revoked: 'M18 6L6 18M6 6l12 12',
  version_restored: 'M3 12a9 9 0 109-9 9.7 9.7 0 00-6.7 2.8L3 8m0-5v5h5M12 7v5l3 3',
};

function ActionIcon({ action }: { action: string }) {
  const path = ACTION_ICON_PATHS[action] ?? 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z';
  return (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
    </svg>
  );
}

export interface FileActivityModalProps {
  isOpen: boolean;
  fileId: string;
  fileName: string;
  onClose: () => void;
  apiFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  initialEvents?: ActivityEventItem[];
}

export function FileActivityModal({
  isOpen,
  fileId,
  fileName,
  onClose,
  apiFetch,
  initialEvents,
}: FileActivityModalProps) {
  const [activeManager] = useState(
    () =>
      new ActivityManager({
        fileId,
        apiFetch: apiFetch ?? browserApiRequest,
        initialEvents,
      }),
  );
  const [state, setState] = useState<ActivityState>(() => activeManager.getState());

  useEffect(() => {
    const unsubscribe = activeManager.subscribe(setState);
    return unsubscribe;
  }, [activeManager]);

  useEffect(() => {
    if (isOpen && fileId) {
      activeManager.loadEvents().catch(() => {
        // Error is captured in manager state
      });
    }
  }, [isOpen, fileId, activeManager]);

  const events = useMemo(() => activeManager.getEvents(), [activeManager, state.events]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      data-testid="activity-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
      onClick={handleBackdropClick}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Activity for ${fileName}`}
        className="bg-[#16181D] border border-[#282C35] rounded-xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col text-[#F5F5F5] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#282C35] flex items-center justify-between gap-3 bg-[#16181D]">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[#F5F5F5] flex items-center gap-2">
              <span>Activity</span>
            </h2>
            <p
              className="text-xs text-[#9E9E9E] truncate max-w-md mt-0.5"
              title={fileName}
            >
              {fileName}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            data-testid="close-activity-btn"
            onClick={onClose}
            className="p-1.5 rounded-md text-[#9E9E9E] hover:text-[#F5F5F5] hover:bg-[#282C35] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          {state.error && (
            <div
              data-testid="activity-error"
              className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/50 text-rose-300 text-xs flex items-center justify-between gap-2"
            >
              <span>{state.error}</span>
              <button
                type="button"
                onClick={() => activeManager.loadEvents().catch(() => {})}
                className="text-xs font-medium underline hover:text-white"
              >
                Retry
              </button>
            </div>
          )}

          {state.isLoading && events.length === 0 ? (
            <div
              data-testid="activity-loading"
              className="py-12 flex flex-col items-center justify-center text-center gap-2 text-[#9E9E9E]"
            >
              <div className="w-6 h-6 border-2 border-[#FF8C42] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs">Loading activity...</span>
            </div>
          ) : events.length === 0 ? (
            <div
              data-testid="activity-empty"
              className="py-12 flex flex-col items-center justify-center text-center gap-2"
            >
              <span className="w-10 h-10 rounded-full bg-[#282C35] flex items-center justify-center text-[#9E9E9E]">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </span>
              <p className="text-sm font-medium text-[#F5F5F5]">
                No activity recorded for this file yet
              </p>
              <p className="text-xs text-[#9E9E9E] max-w-xs">
                Uploads, renames, moves, sharing changes, and version restores are recorded
                here as they happen.
              </p>
            </div>
          ) : (
            <ol data-testid="activity-timeline" className="relative ml-2 border-l border-[#282C35] pl-0">
              {events.map((event) => (
                <li
                  key={event.id}
                  data-testid={`activity-event-${event.action}`}
                  className="relative pl-8 pb-5 last:pb-0"
                >
                  <span className="absolute -left-[13px] top-0 w-6 h-6 rounded-full bg-[#282C35] text-[#FF8C42] flex items-center justify-center border border-[#383E4A]">
                    <ActionIcon action={event.action} />
                  </span>
                  <p className="text-sm text-[#F5F5F5] leading-snug">{describeActivity(event)}</p>
                  <p className="text-[11px] text-[#9E9E9E] mt-0.5">
                    {formatActivityDate(event.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
