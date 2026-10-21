// ============================================================================
// QuantDrive Document Editor — Types & Interfaces
// Adheres to Gates N-G1 through N-G5 in PHASE_N_COLLABORATION_MEMO.md
// ============================================================================

export type BlockType =
  | 'paragraph'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'todo'
  | 'bullet'
  | 'numbered'
  | 'code'
  | 'quote'
  | 'callout'
  | 'table'
  | 'divider';

export interface EditorBlock {
  id: string;
  type: BlockType;
  content: string;
  checked?: boolean;
  language?: string;
  calloutIcon?: string;
  calloutTone?: 'default' | 'info' | 'warning' | 'success' | 'danger';
  tableData?: string[][]; // Row x Col matrix
}

export interface DocumentCollaborator {
  clientId: string;
  userId?: string;
  name: string;
  color: string;
  cursorBlockId?: string;
  lastActive: number;
}

// Doc-load/save honesty contract: the header badge must NEVER show 'saved'
// for a document that was never written to the backend. A 404 on the initial
// load (new document — nothing persisted yet) resolves to 'unsaved', rendered
// as "Not saved yet"; 'saved' appears only after the backend actually accepts
// a write (PATCH or the 404 → POST create fallback).
export type SyncStatus = 'connected' | 'saving' | 'saved' | 'unsaved' | 'offline' | 'error';

// ============================================================================
// 404 intent contract — what a "not found" load MEANS and what the user may
// do about it. The backend returns 404 DOCUMENT_NOT_FOUND for BOTH
// never-existing and soft-deleted documents, so the client distinguishes them
// with the only honest signal it has: whether this account's local cache
// holds content for this docId (evidence the document existed in this
// browser before).
//
// - 'missing': 404 + no cached content → the document never existed here.
// - 'deleted': 404 + cached content present → it existed and is now gone
//   server-side (deleted elsewhere, or a create that never landed).
//
// DocLoadIntent is the actionable consequence:
// - 'existing': GET 200 — normal editing, PATCH saves.
// - 'authorized-new': the user may create content here. Reached for a fresh
//   ('missing') doc URL, or explicitly via authorizeNewDocument() from the
//   'deleted' state. The first edit's autosave POST-creates with the
//   canonical docId exactly once; a 404 load ALONE never fires a write.
// - 'deleted': autosave is DISABLED — a deleted deep link is never silently
//   recreated. The UI must offer an explicit "create new document" action;
//   only that explicit choice flips the intent to 'authorized-new'.
// ============================================================================
export type DocNotFoundKind = 'missing' | 'deleted';
export type DocLoadIntent = 'existing' | 'authorized-new' | 'deleted';

export interface DocumentMetadata {
  icon?: string;
  coverImage?: string;
  fullWidth?: boolean;
  tags?: string[];
  blocks?: EditorBlock[];
  parentId?: string | null;
  [key: string]: unknown;
}

export interface DocumentBreadcrumb {
  id: string;
  title: string;
}

export interface DocumentSubpage {
  id: string;
  title: string;
  metadata?: DocumentMetadata;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface DocumentData {
  id: string;
  title: string;
  content: string;
  metadata: DocumentMetadata;
  userId: string;
  isPublic: boolean;
  isDeleted?: boolean;
  createdAt: string;
  updatedAt: string;
  breadcrumbs?: DocumentBreadcrumb[];
  subpages?: DocumentSubpage[];
  collaborators?: Array<{
    id: string;
    userId: string;
    role: string;
    user?: {
      id: string;
      email: string;
      displayName?: string;
    };
  }>;
}

export interface SlashCommandOption {
  id: BlockType;
  title: string;
  description: string;
  icon: string;
  badge?: string;
  keywords: string[];
}
