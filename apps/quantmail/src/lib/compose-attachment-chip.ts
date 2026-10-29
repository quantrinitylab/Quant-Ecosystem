// ============================================================================
// Compose attachment chips — Phase 1.5 (Compose slice, prep only).
//
// Pure labelling for the attachment chips both composers already render
// (EmailComposer's "Attached files" list and DockedComposer's attached-files
// strip). This file changes NO send behaviour and touches NO send gate: it
// only answers, for one attachment, "what kind is this, and how should its
// chip read it out".
//
// Why a shared helper, not two inline copies: the two composers used to
// render the same attachment as just `name (size)`, with no kind at all, so
// a PDF, a photo and a ZIP all looked identical until opened. The kind
// label is what lets a sender spot "I attached the wrong file" before
// sending — which is exactly when it is cheap to fix.
//
// Kind resolution order: file extension first (the name is what the sender
// recognises), MIME type as fallback (Drive-backed attachments can arrive
// with a generic name but a real MIME type), anything else is `other`.
// Extension matching is case-insensitive: `PHOTO.JPG` is an image, not a
// mystery file.
// ============================================================================

import { formatBytes } from './format-bytes';

export type AttachmentKind =
  | 'pdf'
  | 'image'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'archive'
  | 'audio'
  | 'video'
  | 'code'
  | 'other';

export const ATTACHMENT_KIND_LABELS: Record<AttachmentKind, string> = {
  pdf: 'PDF',
  image: 'Image',
  document: 'Document',
  spreadsheet: 'Spreadsheet',
  presentation: 'Presentation',
  archive: 'Archive',
  audio: 'Audio',
  video: 'Video',
  code: 'Code',
  other: 'File',
};

const EXTENSION_KINDS: Record<string, AttachmentKind> = {
  pdf: 'pdf',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  avif: 'image',
  bmp: 'image',
  heic: 'image',
  doc: 'document',
  docx: 'document',
  odt: 'document',
  rtf: 'document',
  txt: 'document',
  md: 'document',
  xls: 'spreadsheet',
  xlsx: 'spreadsheet',
  ods: 'spreadsheet',
  csv: 'spreadsheet',
  ppt: 'presentation',
  pptx: 'presentation',
  odp: 'presentation',
  zip: 'archive',
  rar: 'archive',
  '7z': 'archive',
  tar: 'archive',
  gz: 'archive',
  mp3: 'audio',
  wav: 'audio',
  ogg: 'audio',
  flac: 'audio',
  m4a: 'audio',
  mp4: 'video',
  mov: 'video',
  webm: 'video',
  mkv: 'video',
  js: 'code',
  ts: 'code',
  jsx: 'code',
  tsx: 'code',
  py: 'code',
  java: 'code',
  json: 'code',
  xml: 'code',
  html: 'code',
  css: 'code',
};

function extensionOf(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const dot = base.lastIndexOf('.');
  // No dot, or a leading dot with nothing before it (`.gitignore`), or a
  // trailing dot (`report.`) — none of these carry an extension.
  if (dot <= 0 || dot === base.length - 1) return '';
  return base.slice(dot + 1).toLowerCase();
}

function kindFromMime(mimeType: string | undefined): AttachmentKind | null {
  const mime = (mimeType ?? '').trim().toLowerCase();
  if (!mime) return null;
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'application/zip' || mime.includes('compressed') || mime.includes('archive')) {
    return 'archive';
  }
  return null;
}

/**
 * The kind of one attachment, from its filename first and its MIME type
 * second. Never throws on a missing/odd filename — an attachment with no
 * usable name is `other`, not a crash in the middle of rendering a draft.
 */
export function attachmentKind(
  filename: string | undefined | null,
  mimeType?: string | undefined | null,
): AttachmentKind {
  const ext = extensionOf(filename ?? '');
  if (ext && EXTENSION_KINDS[ext]) return EXTENSION_KINDS[ext];
  return kindFromMime(mimeType ?? undefined) ?? 'other';
}

export interface AttachmentChipInput {
  name?: string | undefined | null;
  filename?: string | undefined | null;
  size?: number | undefined | null;
  mimeType?: string | undefined | null;
  type?: string | undefined | null;
}

export interface AttachmentChipDescription {
  /** The label the chip shows: the file name, or 'Unnamed file' when absent. */
  label: string;
  kind: AttachmentKind;
  /** Human kind label, e.g. 'PDF', 'Image', 'File'. */
  kindLabel: string;
  /** Human size label via the app's single formatBytes, e.g. '1.5 MB'. */
  sizeLabel: string;
  /** Full readout for screen readers: name, kind and size in one string. */
  ariaLabel: string;
}

/**
 * Everything a composer attachment chip needs to render, derived from the
 * attachment alone — no state, no counting, no send logic. The composers
 * keep owning the remove action and the size budget; this only labels.
 */
export function describeAttachmentChip(
  attachment: AttachmentChipInput,
): AttachmentChipDescription {
  const label = attachment.filename || attachment.name || 'Unnamed file';
  const kind = attachmentKind(
    attachment.filename ?? attachment.name,
    attachment.mimeType ?? attachment.type,
  );
  const kindLabel = ATTACHMENT_KIND_LABELS[kind];
  const sizeLabel = formatBytes(
    typeof attachment.size === 'number' ? attachment.size : null,
  );
  return {
    label,
    kind,
    kindLabel,
    sizeLabel,
    ariaLabel: `Attachment ${label}, ${kindLabel}, ${sizeLabel}`,
  };
}
