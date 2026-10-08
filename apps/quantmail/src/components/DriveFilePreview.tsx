'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetchRaw } from '@quant/api-client';

import { FileScanDetail, normalizeScanStatus } from '../app/drive/components/FileScanBadge';
import type { DownloadOutcome } from '../hooks/useDrive';
import { formatBytes } from '../lib/format-bytes';

// ============================================================================
// DriveFilePreview — QM-M39-004 (M39 screens 9–14: capability-aware preview)
// ============================================================================
//
// M39 preview principle: preview is progressive and capability-aware. A file
// can exist while preview, download, or scan is unavailable — never collapse
// these into one generic loading state.
//
// This component renders one explicit state per capability:
//   - image (screen 10), video (screen 11), PDF (screen 12), audio (screen 13),
//     office/document formats (screen 12), text/code (screen 12),
//     unsupported files (screen 14 — honest state naming what still works).
//   - scan state (screen 9/29) is its own indicator strip, wired to the real
//     backend scanStatus (pending/scanning/clean/quarantined/unknown, #663).
//     Quarantined files gate preview AND download, consistent with the
//     backend's 403 FILE_QUARANTINED. Scan-pending never blocks preview —
//     it is shown as a separate indicator, not a fake loading mask.
//   - download availability is tracked independently: the Download button has
//     its own state machine, and a failed download shows a download-
//     unavailable indicator with the backend's real instruction — never a
//     generic error, and never confused with preview state.
//
// HONESTY CONTRACT (standing user rule): a spinner appears only while a real
// fetch is in flight. No skeleton pretends content is coming when it isn't.
// Every visible word is an instruction or a provable truth.

export interface PreviewFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number | null;
  modifiedAt?: string | null;
  scanStatus?: string | null;
  scanReason?: string | null;
}

export type PreviewKind =
  | 'image'
  | 'video'
  | 'pdf'
  | 'audio'
  | 'document'
  | 'text'
  | 'unsupported';

const OFFICE_DOCUMENT_MIMES: ReadonlySet<string> = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
  'application/rtf',
]);

const TEXT_MIME_HINTS = [
  'javascript',
  'typescript',
  'json',
  'xml',
  'yaml',
  'markdown',
  'sql',
  'x-sh',
  'x-python',
];

const TEXT_NAME_PATTERN =
  /\.(txt|md|markdown|json|js|jsx|ts|tsx|py|rs|go|java|c|cpp|h|hpp|cs|rb|php|sh|bash|zsh|yml|yaml|toml|ini|env|sql|graphql|prisma|html|css|scss|less|svg|xml|log|csv|tsv)$/i;

/**
 * Pure mapping from (mimeType, name) to the preview capability we can offer.
 * Exported for tests: capability decisions must be explicit, not incidental.
 */
export function resolvePreviewKind(
  mimeType: string | null | undefined,
  name: string | null | undefined,
): PreviewKind {
  const m = (mimeType || '').toLowerCase();
  const n = (name || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m === 'application/pdf') return 'pdf';
  if (m.startsWith('audio/')) return 'audio';
  if (OFFICE_DOCUMENT_MIMES.has(m)) return 'document';
  if (
    m.startsWith('text/') ||
    TEXT_MIME_HINTS.some((hint) => m.includes(hint)) ||
    TEXT_NAME_PATTERN.test(n)
  ) {
    return 'text';
  }
  return 'unsupported';
}

const KIND_LABEL: Record<PreviewKind, string> = {
  image: 'Image preview',
  video: 'Video preview',
  pdf: 'PDF preview',
  audio: 'Audio preview',
  document: 'Document preview',
  text: 'Text preview',
  unsupported: 'No preview available',
};

const MAX_TEXT_PREVIEW_CHARS = 1024 * 1024; // 1 MB preview ceiling

export interface DriveFilePreviewProps {
  file: PreviewFile;
  /** Authenticated URL the browser can render (<img>/<video>/<audio>/<iframe> src). */
  previewUrl: string;
  onClose: () => void;
  /**
   * Attempt the download; resolves an honest outcome. The component renders
   * the download-unavailable indicator itself — it never guesses from
   * preview state.
   */
  onDownload: (fileId: string) => Promise<DownloadOutcome>;
  /** False when the parent knows download is blocked (e.g. quarantined). */
  canDownload: boolean;
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10" role="status" aria-label={label}>
      <div className="w-6 h-6 border-2 border-[#FF8C42] border-t-transparent rounded-full animate-spin" />
      <p className="text-xs text-[#A1A4AC]">{label}</p>
    </div>
  );
}

function PreviewShell({
  kind,
  scanStatus,
  children,
}: {
  kind: PreviewKind;
  scanStatus: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl bg-[#111318] p-4 shadow-[inset_0_0_0_1px_#282C35]"
      data-preview-kind={kind}
      data-scan-status={scanStatus}
    >
      {children}
    </div>
  );
}

function FileCaption({ file }: { file: PreviewFile }) {
  return (
    <div className="mt-3 text-center">
      <h4 className="text-sm font-bold text-[#F5F5F5] break-words">{file.name}</h4>
      <p className="text-xs text-[#A1A4AC] mt-1">
        {file.mimeType} · {formatBytes(file.size ?? 0)}
      </p>
    </div>
  );
}

/** Media viewer (image/video/audio): loading only while the browser fetches; honest failure state. */
function MediaViewer({
  kind,
  file,
  previewUrl,
}: {
  kind: 'image' | 'video' | 'audio';
  file: PreviewFile;
  previewUrl: string;
}) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    setState('loading');
  }, [previewUrl]);

  if (state === 'failed') {
    return (
      <div className="py-8 text-center">
        <p className="text-sm font-semibold text-[#F5F5F5]">Preview unavailable</p>
        <p className="text-xs text-[#A1A4AC] mt-2 max-w-md mx-auto">
          {KIND_LABEL[kind]} could not be loaded for “{file.name}”. The file may be
          corrupted, or the connection was interrupted. The file itself still
          exists — try downloading it instead.
        </p>
        <button
          type="button"
          onClick={() => setState('loading')}
          className="mt-4 px-3 py-1.5 rounded-lg bg-[#1D2027] border border-[#323642] text-xs font-semibold text-[#E0E2EC] hover:bg-[#252A33]"
        >
          Retry preview
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      {state === 'loading' && <Spinner label={`Loading ${KIND_LABEL[kind].toLowerCase()}…`} />}
      {kind === 'image' && (
        <img
          src={previewUrl}
          alt={file.name}
          className="max-h-96 mx-auto rounded-lg object-contain"
          loading="lazy"
          decoding="async"
          onLoad={() => setState('ready')}
          onError={() => setState('failed')}
        />
      )}
      {kind === 'video' && (
        <video
          controls
          src={previewUrl}
          className="max-h-96 w-full rounded-lg mx-auto"
          onLoadedData={() => setState('ready')}
          onError={() => setState('failed')}
        />
      )}
      {kind === 'audio' && (
        <div className="py-6">
          <audio
            controls
            src={previewUrl}
            className="w-full max-w-md mx-auto"
            onLoadedData={() => setState('ready')}
            onError={() => setState('failed')}
          />
        </div>
      )}
    </div>
  );
}

/** Text/code viewer: fetches with auth; spinner only during the real fetch. */
function TextViewer({ file, previewUrl }: { file: PreviewFile; previewUrl: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setContent(null);
    setCopied(false);

    apiFetchRaw(previewUrl, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Preview request failed (status ${res.status})`);
        }
        const text = await res.text();
        if (text.length > MAX_TEXT_PREVIEW_CHARS) {
          setContent(
            text.slice(0, MAX_TEXT_PREVIEW_CHARS) +
              '\n\n/* … [Preview truncated: file exceeds the 1 MB preview limit. Download the full file to see everything.] … */',
          );
        } else {
          setContent(text);
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Could not load the text preview');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [previewUrl]);

  if (loading) return <Spinner label="Loading text preview…" />;

  if (error) {
    return (
      <div className="py-8 text-center text-xs text-rose-400 bg-rose-500/10 rounded-lg p-4 border border-rose-500/20">
        <p className="font-semibold mb-1">Preview unavailable</p>
        <p className="text-zinc-400">{error}</p>
        <p className="text-zinc-400 mt-2">
          The file still exists — try downloading it instead.
        </p>
      </div>
    );
  }

  const lineCount = content !== null ? content.split('\n').length : 0;

  return (
    <div className="text-left">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] text-[#A1A4AC] font-mono">
          {lineCount} {lineCount === 1 ? 'line' : 'lines'}
        </p>
        <button
          type="button"
          disabled={content === null}
          onClick={() => {
            if (!content) return;
            void navigator.clipboard
              .writeText(content)
              .then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              })
              .catch(() => {
                /* Clipboard unavailable — the text remains visible above. */
              });
          }}
          className="px-3 py-1.5 rounded-lg bg-[#1D2027] border border-[#323642] text-xs font-semibold text-[#E0E2EC] hover:bg-[#252A33] disabled:opacity-50"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div className="flex bg-[#0B0C0E] border border-[#282C35] rounded-lg max-h-[30rem] overflow-auto font-mono text-xs shadow-inner">
        <div className="select-none py-3 px-3 text-right text-[#4E525E] border-r border-[#22262E] bg-[#0E1014] leading-relaxed shrink-0">
          {(content ?? '').split('\n').map((_, idx) => (
            <div key={idx}>{idx + 1}</div>
          ))}
        </div>
        <pre className="p-3 text-[#E0E2EC] whitespace-pre overflow-x-auto min-w-0 flex-1 leading-relaxed">
          <code>{content}</code>
        </pre>
      </div>
    </div>
  );
}

/**
 * Honest state for files with no in-browser preview (screen 14). Names what
 * the user can still do — never a dead end, never a fake viewer.
 */
function UnsupportedViewer({
  file,
  canDownload,
  onDownloadClick,
  downloadUnavailable,
}: {
  file: PreviewFile;
  canDownload: boolean;
  onDownloadClick: () => void;
  downloadUnavailable: string | null;
}) {
  return (
    <div className="py-8 text-center">
      <p className="text-sm font-semibold text-[#F5F5F5]">No preview available for this file type</p>
      <p className="text-xs text-[#A1A4AC] mt-2 max-w-md mx-auto">
        {KIND_LABEL.unsupported}. The file is stored safely in your Drive — a
        missing preview does not mean a missing file.
      </p>
      <div className="mt-5 text-left max-w-md mx-auto rounded-lg bg-[#0B0C0E] border border-[#282C35] p-4">
        <p className="text-xs font-semibold text-[#E0E2EC] mb-2">What you can still do:</p>
        <ul className="text-xs text-[#A1A4AC] space-y-1.5 list-disc list-inside">
          {canDownload && !downloadUnavailable && (
            <li>
              <button
                type="button"
                onClick={onDownloadClick}
                className="text-[#FF8C42] hover:underline font-semibold"
              >
                Download the file
              </button>{' '}
              and open it in an app on your device.
            </li>
          )}
          {downloadUnavailable && <li>Download is currently unavailable ({downloadUnavailable}).</li>}
          {!canDownload && <li>Download is disabled for this file.</li>}
          <li>Find the file in your Drive list to share, rename, move, or star it.</li>
          <li>Check the scan status above — some previews unlock once a scan finishes.</li>
        </ul>
      </div>
    </div>
  );
}

export function DriveFilePreview({
  file,
  previewUrl,
  onClose,
  onDownload,
  canDownload,
}: DriveFilePreviewProps) {
  const scanStatus = normalizeScanStatus(file.scanStatus);
  const kind = resolvePreviewKind(file.mimeType, file.name);
  const quarantined = scanStatus === 'quarantined';

  const [downloadState, setDownloadState] = useState<'idle' | 'downloading' | 'failed'>('idle');
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleDownload = () => {
    if (!canDownload || downloadState === 'downloading') return;
    setDownloadState('downloading');
    setDownloadError(null);
    void onDownload(file.id).then((outcome) => {
      if (!mountedRef.current) return;
      if (outcome.ok) {
        setDownloadState('idle');
      } else {
        setDownloadState('failed');
        setDownloadError(outcome.message || 'Download failed.');
      }
    });
  };

  return (
    <div className="space-y-4 text-left">
      {/* Scan-state indicator (M39 screen 9/29): its own strip, wired to the
          real backend scanStatus. Independent of preview/download capability. */}
      <div className="rounded-xl bg-[#111318] px-4 py-3 shadow-[inset_0_0_0_1px_#282C35]">
        <FileScanDetail status={file.scanStatus} reason={file.scanReason} />
        {(scanStatus === 'pending' || scanStatus === 'scanning') && (
          <p className="text-[11px] text-[#A1A4AC] mt-1.5" data-scan-pending-note>
            The preview below is shown as-is — it has not been security-cleared yet.
          </p>
        )}
      </div>

      {quarantined ? (
        /* Quarantine gates preview AND download (#663): an instruction, not a
           broken viewer and not a generic error. */
        <div
          className="flex flex-col items-center justify-center rounded-xl bg-[#1A0E10] p-8 border border-[#EF4444]/40 text-center"
          role="alert"
          data-preview-kind="blocked-quarantine"
          data-scan-status="quarantined"
        >
          <span className="mb-3 text-[#EF4444]" aria-hidden="true">
            <svg className="w-14 h-14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
              />
            </svg>
          </span>
          <h4 className="text-sm font-bold text-[#F5F5F5]">This file is quarantined</h4>
          <p className="text-xs text-[#A1A4AC] mt-2 max-w-md">
            Preview and download are disabled for this file. It was flagged by a security scan as
            potentially harmful.
            {file.scanReason ? (
              <span className="block mt-1 text-[#D1D5DB]">Reason: {file.scanReason}</span>
            ) : null}
          </p>
          <p className="text-xs text-[#A1A4AC] mt-2 max-w-md">
            Contact your workspace administrator to request a security review — do not share this
            file.
          </p>
        </div>
      ) : (
        <PreviewShell kind={kind} scanStatus={scanStatus}>
          {kind === 'image' || kind === 'video' || kind === 'audio' ? (
            <>
              <MediaViewer kind={kind} file={file} previewUrl={previewUrl} />
              <FileCaption file={file} />
            </>
          ) : kind === 'pdf' ? (
            <>
              <iframe
                src={previewUrl}
                className="w-full h-96 rounded-lg border border-[var(--quant-border)] bg-white"
                title={file.name}
              />
              <p className="text-[11px] text-[#A1A4AC] mt-2 text-center">
                If the document does not display above, download it to view the full PDF.
              </p>
              <FileCaption file={file} />
            </>
          ) : kind === 'document' ? (
            <div className="py-8 text-center">
              <p className="text-sm font-semibold text-[#F5F5F5]">
                Document preview isn’t available for this format
              </p>
              <p className="text-xs text-[#A1A4AC] mt-2 max-w-md mx-auto">
                In-browser preview supports PDF and text files. This{' '}
                {file.mimeType || 'document'} file needs an app on your device.
              </p>
              <div className="mt-5 text-left max-w-md mx-auto rounded-lg bg-[#0B0C0E] border border-[#282C35] p-4">
                <p className="text-xs font-semibold text-[#E0E2EC] mb-2">What you can still do:</p>
                <ul className="text-xs text-[#A1A4AC] space-y-1.5 list-disc list-inside">
                  {canDownload && !downloadError && (
                    <li>
                      <button
                        type="button"
                        onClick={handleDownload}
                        className="text-[#FF8C42] hover:underline font-semibold"
                      >
                        Download the file
                      </button>{' '}
                      and open it in a document app.
                    </li>
                  )}
                  {downloadError && <li>Download is currently unavailable ({downloadError}).</li>}
                  {!canDownload && <li>Download is disabled for this file.</li>}
                  <li>Find the file in your Drive list to share, rename, move, or star it.</li>
                </ul>
              </div>
            </div>
          ) : kind === 'text' ? (
            <>
              <TextViewer file={file} previewUrl={previewUrl} />
              <FileCaption file={file} />
            </>
          ) : (
            <UnsupportedViewer
              file={file}
              canDownload={canDownload}
              onDownloadClick={handleDownload}
              downloadUnavailable={downloadError}
            />
          )}
        </PreviewShell>
      )}

      {/* Download capability: independent indicator. A failed download never
          masquerades as a preview problem, and vice versa. */}
      {!quarantined && (
        <div>
          {downloadState === 'failed' && downloadError && (
            <div
              className="mb-3 rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-xs"
              role="alert"
              data-download-state="unavailable"
            >
              <p className="font-semibold text-rose-400">Download unavailable</p>
              <p className="text-zinc-400 mt-1">{downloadError}</p>
            </div>
          )}
          <div className="flex items-center justify-end gap-2 flex-wrap">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-[#1D2027] border border-[#323642] text-xs font-semibold text-[#E0E2EC] hover:bg-[#252A33]"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!canDownload || downloadState === 'downloading'}
              title={
                !canDownload
                  ? 'Download is disabled for this file'
                  : downloadState === 'downloading'
                    ? 'Download in progress'
                    : 'Download this file'
              }
              className="px-4 py-2 rounded-lg bg-[#FF8C42] text-xs font-bold text-black hover:bg-[#ff9d5c] disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
              data-download-state={downloadState}
            >
              {downloadState === 'downloading' && (
                <span className="w-3.5 h-3.5 border-2 border-black/60 border-t-transparent rounded-full animate-spin" />
              )}
              {downloadState === 'downloading' ? 'Downloading…' : 'Download'}
            </button>
          </div>
          {!canDownload && (
            <p className="text-[11px] text-[#A1A4AC] mt-2 text-right">
              Download is disabled for this file.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
