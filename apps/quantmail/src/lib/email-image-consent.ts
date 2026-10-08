'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Remote-image consent for HTML email (QM-UIUX-042).
 *
 * Every remote `<img>` in a received message is a silent read receipt: the
 * sender's server learns the reader's IP and the exact open timestamp the
 * moment the image loads. So remote images are BLOCKED by default and only
 * load after an explicit reader action:
 *
 * - one tap on "Show images" reveals them for the open message only, or
 * - "Always show images from {domain}" adds the sender's domain to a
 *   persistent allowlist (localStorage).
 *
 * `data:` and `cid:` images are inline content — they make no network request
 * and are never blocked. This module is DOM-free on purpose: the input is
 * already DOMPurify-sanitized HTML, so a tag-level transform is predictable
 * and the whole module stays unit-testable in a node environment.
 */

/** localStorage key for sender domains trusted to load remote images. */
const TRUSTED_SENDERS_KEY = 'qm-trusted-image-senders';

/**
 * True when an image `src` would hit the network (and therefore the sender's
 * server). Inline (`data:`) and attached (`cid:`) images make no request.
 */
export function isRemoteImageSrc(src: string): boolean {
  const s = src.trim().toLowerCase();
  return (
    s.startsWith('http://') || s.startsWith('https://') || s.startsWith('//')
  );
}

/** Extracts the lowercase domain from a sender address (`Name <a@b.com>` ok). */
export function getSenderDomain(from?: string | null): string {
  if (!from) return '';
  const m = from.trim().match(/@([^@\s>]+)\s*>?$/);
  return m ? m[1].toLowerCase() : '';
}

/** Sender domains the reader has trusted, from localStorage. Never throws. */
export function getTrustedImageSenders(): string[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(TRUSTED_SENDERS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (d): d is string => typeof d === 'string' && d.length > 0,
    );
  } catch {
    return [];
  }
}

/** Persists a trusted sender domain. Never throws (private mode, quota, SSR). */
export function addTrustedImageSender(domain: string): void {
  const d = domain.trim().toLowerCase();
  if (!d) return;
  try {
    if (typeof localStorage === 'undefined') return;
    const current = getTrustedImageSenders();
    if (current.includes(d)) return;
    localStorage.setItem(TRUSTED_SENDERS_KEY, JSON.stringify([...current, d]));
  } catch {
    // Storage unavailable — the trust just won't persist past this session.
  }
}

// Matches one <img ...> tag, tolerating `>` inside quoted attribute values.
// Safe on DOMPurify output, which is normalized markup.
const IMG_TAG_RE = /<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
const SRC_ATTR_RE = /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

// Neutral placeholder: no network request, no sender-controlled content.
const BLOCKED_PLACEHOLDER =
  '<span class="qm-blocked-remote-image" role="img" aria-label="Blocked image"></span>';

export interface BlockedImagesResult {
  html: string;
  blockedCount: number;
}

/**
 * Rewrites remote `<img>` tags to inert placeholders. Returns the rewritten
 * HTML plus how many images were blocked (0 means nothing changed).
 */
export function blockRemoteImages(html: string): BlockedImagesResult {
  let blockedCount = 0;
  const out = html.replace(IMG_TAG_RE, (tag) => {
    const m = SRC_ATTR_RE.exec(tag);
    const src = m ? (m[1] ?? m[2] ?? m[3] ?? '') : '';
    if (!isRemoteImageSrc(src)) return tag;
    blockedCount += 1;
    return BLOCKED_PLACEHOLDER;
  });
  return { html: out, blockedCount };
}

export interface EmailImageConsent {
  /** HTML to render: remote images blocked unless the reader consented. */
  html: string;
  /** True when the consent banner should be offered. */
  showBanner: boolean;
  /** Sender domain for the "always show" affordance ('' when unknown). */
  senderDomain: string;
  /** One-tap consent for this message only. */
  revealImages: () => void;
  /** Trust this sender's domain persistently (also reveals this message). */
  trustSender: () => void;
}

/**
 * Per-message remote-image consent state for one rendered email body.
 *
 * @param safeHtml  DOMPurify-sanitized body HTML (may contain remote `<img>`).
 * @param senderEmail  raw `From` value, used to key the sender allowlist.
 */
export function useEmailImageConsent(
  safeHtml: string,
  senderEmail?: string | null,
): EmailImageConsent {
  const [revealed, setRevealed] = useState(false);
  const [trustedDomains, setTrustedDomains] = useState<string[]>(() =>
    getTrustedImageSenders(),
  );
  const senderDomain = useMemo(() => getSenderDomain(senderEmail), [senderEmail]);
  const isTrusted = senderDomain !== '' && trustedDomains.includes(senderDomain);

  // Per-message consent: a newly opened message starts blocked again.
  useEffect(() => {
    setRevealed(false);
  }, [safeHtml]);

  const blocked = useMemo(() => blockRemoteImages(safeHtml), [safeHtml]);
  const imagesAllowed = revealed || isTrusted;

  const revealImages = useCallback(() => setRevealed(true), []);

  const trustSender = useCallback(() => {
    if (!senderDomain) return;
    addTrustedImageSender(senderDomain);
    setTrustedDomains(getTrustedImageSenders());
    setRevealed(true);
  }, [senderDomain]);

  return {
    html: imagesAllowed ? safeHtml : blocked.html,
    showBanner: !imagesAllowed && blocked.blockedCount > 0,
    senderDomain,
    revealImages,
    trustSender,
  };
}
