'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  apiClient,
  type DataExportManifest,
  type DataExportRequestRecord,
  type DataExportStatus,
} from '../../../services/api-client';
import { SettingsSection } from '../SettingsPrimitives';

/**
 * Data export (QM-UIUX-091) — the Account page's control for the QM-BACK-006
 * export center in `backend/routes/data-lifecycle.ts`.
 *
 * The backend's lifecycle is the whole UI: an export is `requested`, then a
 * build call generates the inventory manifest and the record becomes
 * `completed` (or `failed`, with the backend's error on the record). Every
 * row rendered here is re-read from `GET /data-lifecycle/exports` after each
 * action — nothing is shown from local optimism. The v1 artifact is a
 * counts-only manifest delivered inline by the build response; there is no
 * download URL and no email delivery in the backend contract, so the UI
 * offers neither and promises no timeline.
 */

type LoadStatus = 'loading' | 'idle' | 'error';

const STATUS_LABELS: Record<DataExportStatus, string> = {
  requested: 'Requested',
  completed: 'Completed',
  failed: 'Failed',
};

const STATUS_BADGE_CLASSES: Record<DataExportStatus, string> = {
  requested: 'border-[var(--quant-border)] text-[var(--quant-muted-foreground)]',
  completed: 'border-[var(--brand-soft-border)] bg-[var(--brand-soft)] text-[var(--brand-primary)]',
  failed: 'border-[var(--quant-destructive)] text-[var(--quant-destructive)]',
};

const SCOPE_LABELS: Record<string, string> = {
  'mailbox-inventory': 'Mailbox inventory',
};

function scopeLabel(scope: string): string {
  return SCOPE_LABELS[scope] ?? scope;
}

/** The backend's status enum is closed, but this is a network payload: an
 * unrecognised value renders as itself rather than crashing the section. */
function statusLabel(status: DataExportStatus): string {
  return STATUS_LABELS[status] ?? String(status);
}

function badgeClasses(status: DataExportStatus): string {
  return (
    STATUS_BADGE_CLASSES[status] ??
    'border-[var(--quant-border)] text-[var(--quant-muted-foreground)]'
  );
}

function formatDate(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function ManifestSummary({ manifest }: { manifest: DataExportManifest }) {
  const classes: Array<[string, number]> = [
    ['Emails', manifest.classes.emails.count],
    ['Threads', manifest.classes.threads.count],
    ['Contacts', manifest.classes.contacts.count],
    ['Drive files', manifest.classes.driveFiles.count],
  ];
  return (
    <div className="mt-3 space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {classes.map(([label, count]) => (
          <div
            key={label}
            className="rounded-md border border-[var(--quant-border)] bg-[var(--quant-background)] p-2"
          >
            <div className="text-sm font-semibold text-[var(--quant-foreground)]">{count}</div>
            <div className="text-[10px] text-[var(--quant-muted-foreground)]">{label}</div>
          </div>
        ))}
      </div>
      <p className="text-[10px] leading-relaxed text-[var(--quant-muted-foreground)]">
        {manifest.note}
      </p>
    </div>
  );
}

const PRIMARY_BUTTON_CLASSES =
  'inline-flex items-center justify-center rounded-lg border border-[var(--brand-soft-border)] bg-[var(--brand-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--brand-primary)] transition-colors hover:bg-[var(--brand-primary)] hover:text-black disabled:cursor-not-allowed disabled:opacity-50';

const SUBTLE_BUTTON_CLASSES =
  'inline-flex items-center justify-center rounded-lg border border-[var(--quant-border)] px-3 py-1.5 text-xs font-medium text-[var(--quant-foreground)] transition-colors hover:bg-[var(--quant-surface-elevated)] disabled:cursor-not-allowed disabled:opacity-50';

export function DataExportSettings() {
  const [exports, setExports] = useState<DataExportRequestRecord[]>([]);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [loadError, setLoadError] = useState('');
  const [creating, setCreating] = useState(false);
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  // Manifests exist only in the build response (the list rows carry just the
  // artifactRef), so they are kept per export for this session's builds.
  const [manifests, setManifests] = useState<Record<string, DataExportManifest>>({});

  const load = useCallback(async () => {
    setLoadStatus('loading');
    const response = await apiClient.listDataExports();
    if (response.success && Array.isArray(response.data)) {
      setExports(response.data);
      setLoadError('');
      setLoadStatus('idle');
    } else {
      setLoadError(response.error?.message || 'Your data exports could not be loaded.');
      setLoadStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const requestExport = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    setActionError('');
    const response = await apiClient.requestDataExport();
    setCreating(false);
    if (response.success) {
      // Re-read: the row the user sees is the server's record.
      await load();
    } else {
      setActionError(response.error?.message || 'The export request could not be created.');
    }
  }, [creating, load]);

  const buildExport = useCallback(
    async (exportId: string) => {
      if (buildingId) return;
      setBuildingId(exportId);
      setActionError('');
      const response = await apiClient.buildDataExport(exportId);
      setBuildingId(null);
      if (response.success && response.data) {
        const built = response.data;
        setManifests((previous) => ({ ...previous, [exportId]: built.manifest }));
      } else {
        setActionError(response.error?.message || 'The export could not be generated.');
      }
      // Either way the server's record is the truth — a failed build marks
      // the export `failed` with its error — so re-read the list.
      await load();
    },
    [buildingId, load],
  );

  const busy = creating || buildingId !== null;

  return (
    <SettingsSection
      title="Data export"
      description="Request an inventory of the data QuantMail holds for your account. The server generates a counts-only manifest — message bodies, file contents and secrets are never included."
      action={
        <button
          type="button"
          className={SUBTLE_BUTTON_CLASSES}
          onClick={() => void load()}
          disabled={loadStatus === 'loading'}
        >
          Refresh
        </button>
      }
    >
      {loadStatus === 'loading' && exports.length === 0 ? (
        <p className="text-xs text-[var(--quant-muted-foreground)]">Loading your data exports…</p>
      ) : loadStatus === 'error' && exports.length === 0 ? (
        <div className="space-y-3">
          <p className="text-xs text-[var(--quant-destructive)]" role="alert">
            {loadError}
          </p>
          <button type="button" className={SUBTLE_BUTTON_CLASSES} onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={PRIMARY_BUTTON_CLASSES}
              onClick={() => void requestExport()}
              disabled={busy}
            >
              {creating ? 'Requesting export…' : 'Request data export'}
            </button>
            <span className="text-[10px] text-[var(--quant-muted-foreground)]">
              A request creates a server record; generating the inventory is a separate step you
              start from the list below.
            </span>
          </div>

          {actionError && (
            <p className="text-xs text-[var(--quant-destructive)]" role="alert">
              {actionError}
            </p>
          )}

          {exports.length === 0 ? (
            <p className="text-xs text-[var(--quant-muted-foreground)]">
              No exports yet. Request one above to create your first inventory.
            </p>
          ) : (
            <ul className="space-y-3">
              {exports.map((row) => (
                <li
                  key={row.id}
                  className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[var(--quant-foreground)]">
                        {scopeLabel(row.scope)}
                      </div>
                      <div className="mt-0.5 text-[10px] text-[var(--quant-muted-foreground)]">
                        Requested {formatDate(row.requestedAt)}
                        {row.completedAt ? ` · Finished ${formatDate(row.completedAt)}` : ''}
                      </div>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badgeClasses(row.status)}`}
                    >
                      {statusLabel(row.status)}
                    </span>
                  </div>

                  {row.status === 'requested' && (
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        className={SUBTLE_BUTTON_CLASSES}
                        onClick={() => void buildExport(row.id)}
                        disabled={busy}
                      >
                        {buildingId === row.id ? 'Generating…' : 'Generate inventory'}
                      </button>
                      <span className="text-[10px] text-[var(--quant-muted-foreground)]">
                        Requested only — the inventory has not been generated yet.
                      </span>
                    </div>
                  )}

                  {row.status === 'failed' && row.error && (
                    <p className="mt-2 text-xs text-[var(--quant-destructive)]">{row.error}</p>
                  )}

                  {row.status === 'completed' &&
                    (manifests[row.id] ? (
                      <ManifestSummary manifest={manifests[row.id]} />
                    ) : (
                      <p className="mt-2 text-[10px] text-[var(--quant-muted-foreground)]">
                        Inventory manifest generated by the server
                        {row.artifactRef ? ` (${row.artifactRef})` : ''}. The manifest is delivered
                        with the generate step, so it is shown here in the session that generated
                        it.
                      </p>
                    ))}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </SettingsSection>
  );
}
