// ============================================================================
// QuantMail — compose Drive link insertion + send-time permission detector.
//
// Gmail parity piece: the composer can INSERT a Drive file as a live link
// (one shared copy; recipients see later edits) instead of only attaching a
// frozen copy, and before sending it checks that every recipient can actually
// open the linked files — prompting to grant view access when they cannot.
//
// Everything here hits real backend endpoints and throws the backend's own
// messages on failure; nothing invents sharing state. The `specific`-scope
// default for newly created links means inserting a link never silently
// world-shares a private file — access is granted explicitly, by the user,
// at send time.
// ============================================================================

import { apiFetchRaw } from '@quant/api-client';
import {
  createDriveLink,
  fetchDriveLinks,
  type DriveLinkEntry,
  type LinkScope,
} from '../app/(app)/drive/components/link-share-api';

/** A Drive file inserted into the composer body as a live share link. */
export interface DriveComposeLink {
  fileId: string;
  name: string;
  /** Absolute share URL inserted into the message body. */
  url: string;
  /** The `/drive/share/<token>` path portion — matches the same link pasted as a relative URL. */
  sharePath: string;
  /** Server-side link row id, when the link already existed. */
  linkId: string;
  scope: LinkScope;
}

/** One thing the send-time detector wants the user to decide about. */
export interface DrivePermissionIssue {
  /** Null when the link could not be resolved to a file at all. */
  fileId: string | null;
  fileName: string;
  /** Recipients who definitely lack access. Empty when the problem is different. */
  missingEmails: string[];
  /** True when sharing state could not be fully verified (not the owner, org-scoped link). */
  unverifiable: boolean;
  /** True when the link itself is dead (not found / expired / file deleted). */
  broken: boolean;
  brokenMessage?: string;
}

/** What the detector knows about who can open a file. */
export interface DriveFileAccess {
  fileId: string;
  anyoneCanOpen: boolean;
  /** Lowercased emails with access: direct people-shares + specific-link audiences. */
  accessibleEmails: string[];
  /** An org-scoped active link exists — org membership can't be verified client-side. */
  orgScoped: boolean;
  /** The people-share list could not be read (e.g. the sender is not the file owner). */
  peopleUnverifiable: boolean;
  /** The link list itself could not be read (network/auth failure). */
  checkFailed: boolean;
  /** The file itself is gone (404 on the share summary). */
  fileMissing: boolean;
}

export function absoluteShareUrl(shareUrl: string, origin: string): string {
  return `${origin}${shareUrl}`;
}

async function readJsonBody(res: Response): Promise<Record<string, any>> {
  return (await res.json().catch(() => ({}))) as Record<string, any>;
}

function backendMessage(data: Record<string, any>, fallback: string): string {
  if (typeof data?.message === 'string' && data.message) return data.message;
  if (typeof data?.error === 'string' && data.error) return data.error;
  return fallback;
}

/**
 * Return a link row the composer can safely insert: reuse the newest active
 * server link when one exists (preferring the widest scope), otherwise create
 * a viewer-only `specific`-scope link. Creating — not reusing — never happens
 * silently: this function's caller shows the result in the body and the
 * send-time detector verifies recipients before anything goes out.
 */
export async function ensureInsertableDriveLink(
  fileId: string,
  fileName: string,
  origin: string,
): Promise<DriveComposeLink> {
  const links = await fetchDriveLinks(fileId);
  const active = links.filter((l) => !l.expired);
  const reusable =
    active.find((l) => l.scope === 'anyone') ??
    active.find((l) => l.scope === 'specific') ??
    active.find((l) => l.scope === 'org');
  const link: DriveLinkEntry =
    reusable ??
    (await createDriveLink(fileId, {
      scope: 'specific',
      audienceEmails: [],
      role: 'viewer',
      expiresDate: null,
    }));
  return {
    fileId,
    name: fileName,
    url: absoluteShareUrl(link.shareUrl, origin),
    sharePath: link.shareUrl,
    linkId: link.id,
    scope: link.scope,
  };
}

/** Find QuantDrive share tokens in body text (relative or absolute URLs), deduped. */
export function extractDriveShareTokens(body: string): string[] {
  const re = /(?:https?:\/\/[^\s)"']+)?\/drive\/share\/([A-Za-z0-9_-]+)/g;
  const tokens: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const token = m[1];
    if (!seen.has(token)) {
      seen.add(token);
      tokens.push(token);
    }
  }
  return tokens;
}

export interface ResolvedShareToken {
  token: string;
  fileId: string;
  fileName: string;
  scope: LinkScope;
}

/** Resolve a pasted `/drive/share/<token>` URL to its file via the real public endpoint. */
export async function resolveDriveShareToken(token: string): Promise<ResolvedShareToken> {
  const res = await apiFetchRaw(`/api/drive/public/share/${encodeURIComponent(token)}`);
  const data = await readJsonBody(res);
  if (!res.ok) throw new Error(backendMessage(data, 'Could not resolve this Drive link'));
  if (!data?.file?.id) throw new Error('Server did not return the linked file');
  return {
    token,
    fileId: String(data.file.id),
    fileName: typeof data.file.name === 'string' && data.file.name ? data.file.name : 'Drive file',
    scope: (data.scope ?? 'anyone') as LinkScope,
  };
}

/**
 * Read the real sharing state for a file: active link rows (scope/audience)
 * plus the owner-visible people-share list. Never invents access — anything
 * unreadable is reported as unverifiable, not as granted.
 */
export async function fetchDriveFileAccess(fileId: string): Promise<DriveFileAccess> {
  const access: DriveFileAccess = {
    fileId,
    anyoneCanOpen: false,
    accessibleEmails: [],
    orgScoped: false,
    peopleUnverifiable: false,
    checkFailed: false,
    fileMissing: false,
  };
  let links: DriveLinkEntry[];
  try {
    links = await fetchDriveLinks(fileId);
  } catch {
    access.checkFailed = true;
    return access;
  }
  const active = links.filter((l) => !l.expired);
  access.anyoneCanOpen = active.some((l) => l.scope === 'anyone');
  access.orgScoped = active.some((l) => l.scope === 'org');
  const emails = new Set<string>();
  for (const l of active) {
    for (const e of l.audienceEmails ?? []) {
      if (typeof e === 'string' && e) emails.add(e.toLowerCase());
    }
  }
  try {
    const res = await apiFetchRaw(`/api/drive/files/${encodeURIComponent(fileId)}/share`);
    const data = await readJsonBody(res);
    if (res.ok) {
      const shares = Array.isArray(data?.shares) ? data.shares : [];
      for (const s of shares) {
        if (typeof s?.email === 'string' && s.email) emails.add(s.email.toLowerCase());
      }
    } else if (res.status === 404) {
      access.fileMissing = true;
    } else {
      // 403 (not the owner) or anything else: the people list is unreadable.
      access.peopleUnverifiable = true;
    }
  } catch {
    access.peopleUnverifiable = true;
  }
  access.accessibleEmails = [...emails];
  return access;
}

/**
 * Turn access state + recipients into one user-facing issue, or null when
 * everyone can open the file. "Everyone can open" is only claimed on
 * positive evidence (an active anyone-scope link or a named grant).
 */
export function computeDrivePermissionIssues(
  fileName: string,
  fileId: string,
  access: DriveFileAccess,
  recipientEmails: string[],
): DrivePermissionIssue | null {
  if (access.fileMissing) {
    return {
      fileId,
      fileName,
      missingEmails: [],
      unverifiable: false,
      broken: true,
      brokenMessage: 'This file no longer exists in QuantDrive.',
    };
  }
  if (access.checkFailed) {
    return { fileId, fileName, missingEmails: [], unverifiable: true, broken: false };
  }
  const recipients = [...new Set(recipientEmails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (recipients.length === 0) return null;
  if (access.anyoneCanOpen) return null;
  const accessible = new Set(access.accessibleEmails);
  const missing = recipients.filter((r) => !accessible.has(r));
  const unverifiable = access.peopleUnverifiable || access.orgScoped;
  if (missing.length === 0 && !unverifiable) return null;
  return { fileId, fileName, missingEmails: missing, unverifiable, broken: false };
}

/** Grant view access to each email via the real people-share endpoint. */
export async function grantDriveViewAccess(
  fileId: string,
  emails: string[],
): Promise<{ granted: string[]; failed: Array<{ email: string; error: string }> }> {
  const granted: string[] = [];
  const failed: Array<{ email: string; error: string }> = [];
  for (const email of emails) {
    try {
      const res = await apiFetchRaw(`/api/drive/files/${encodeURIComponent(fileId)}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, permission: 'view' }),
      });
      if (!res.ok) {
        const data = await readJsonBody(res);
        throw new Error(backendMessage(data, 'Share failed'));
      }
      granted.push(email);
    } catch (err) {
      failed.push({ email, error: err instanceof Error ? err.message : 'Share failed' });
    }
  }
  return { granted, failed };
}
