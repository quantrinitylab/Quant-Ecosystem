// ============================================================================
// QuantAI Backend — Voice-to-Mail Workflow Service (QM-QUANTY-003)
//
// Orchestrates the voice-to-mail flow: transcript -> entity extraction ->
// recipient resolution -> risk assessment -> draft -> restatement ->
// (Sentinel confirmation via agent gateway) -> send -> sent-state verify.
//
// Confidence model (all scores in [0, 1], null = unknown, never guessed):
//   asrConfidence        from the STT provider (Meta turns[] average)
//   entityConfidence     from parse quality (explicit email > name > none)
//   recipientConfidence  from contact match quality (exact > fuzzy > none)
// Risk is derived from recipient + confidence, never hardcoded per user.
//
// This service does NOT send mail itself. Sending goes through the agent
// gateway's `quantmail.send` tool (tier 3 -> Sentinel confirmation), and
// verification reads the authoritative email record.
// ============================================================================

export interface VoiceMailEntities {
  recipientName: string | null;
  recipientEmail: string | null;
  subject: string | null;
  body: string | null;
  /** 0-1: how confident the parse is. Never guessed — derived from signals. */
  entityConfidence: number;
  /** Human-readable notes about what was ambiguous. */
  parseNotes: string[];
}

export interface ContactCandidate {
  id?: string;
  name: string;
  email: string;
}

export interface RecipientResolution {
  status: 'resolved' | 'ambiguous' | 'not_found';
  email: string | null;
  name: string | null;
  /** 0-1 match confidence. Null when not_found (nothing to score). */
  confidence: number | null;
  candidates: ContactCandidate[];
}

export interface VoiceMailRisk {
  /** 1 = internal/low, 2 = external/medium, 3 = external send (always 3 when sending). */
  tier: 1 | 2 | 3;
  reasons: string[];
}

export interface VoiceMailRestatement {
  to: string;
  subject: string;
  bodyPreview: string;
  warnings: string[];
}

export interface SentStateVerification {
  emailId: string;
  /** Authoritative state from the mail record. */
  status: 'sent' | 'queued' | 'failed' | 'unknown';
  deliveryStatus: string | null;
  verifiedAt: string;
}

export interface VoiceMailPrepareResult {
  entities: VoiceMailEntities;
  asrConfidence: number | null;
  recipient: RecipientResolution;
  risk: VoiceMailRisk;
  restatement: VoiceMailRestatement;
  /** True when the flow may proceed to draft + Sentinel confirmation. */
  canProceed: boolean;
  blockers: string[];
}

const EMAIL_RE =
  /[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]{1,255}\.[a-zA-Z]{2,24}/;

// Hinglish/English recipient patterns, tried in order.
// "Rahul ko email likho" / "Rahul ko mail bhejo" / "email to Rahul" / "mail Rahul ko"
const RECIPIENT_PATTERNS: RegExp[] = [
  /([A-Za-z][A-Za-z .'-]{1,40}?)\s+ko\s+(?:email|mail)/i,
  /(?:email|mail)\s+(?:to\s+)?([A-Za-z][A-Za-z .'-]{1,40}?)(?:\s+ko)?\s*$/i,
  /(?:to|ko)\s+([A-Za-z][A-Za-z .'-]{1,40}?)\s*$/i,
];

// Command scaffolding stripped before body extraction (Hinglish + English).
const SCAFFOLD_RE =
  /\b(?:quanty|please|kripya|email|mail|likho|likh|bhejo|bhej|send|write|compose|bana|banao|kar|karo|do)\b/gi;

/**
 * Extract mail entities from a voice transcript.
 * Hinglish-aware: "Quanty, Rahul ko email likho aur bhejo."
 */
export function parseVoiceMailCommand(
  transcript: string,
  asrConfidence: number | null,
): VoiceMailEntities {
  const parseNotes: string[] = [];
  const text = transcript.trim();

  // 1. Explicit email address = highest entity confidence.
  const emailMatch = text.match(EMAIL_RE);
  const recipientEmail = emailMatch ? emailMatch[0] : null;

  // 2. Recipient name via Hinglish patterns.
  let recipientName: string | null = null;
  if (!recipientEmail) {
    for (const re of RECIPIENT_PATTERNS) {
      const m = text.match(re);
      if (m?.[1]) {
        recipientName = m[1].trim().replace(/[.,!?]+$/, '');
        break;
      }
    }
  } else {
    // Derive a display name from the local part when only an email is given.
    recipientName = recipientEmail.split('@')[0]!.replace(/[._-]+/g, ' ');
  }

  // 3. Subject: explicit "subject ..." / "vishay ..." marker.
  let subject: string | null = null;
  const subjectMatch = text.match(/(?:subject|vishay)\s*[:\-]?\s*([^.,;!?]{3,120})/i);
  if (subjectMatch?.[1]) {
    subject = subjectMatch[1].trim();
  }

  // 4. Body: transcript minus scaffolding, recipient, subject, email.
  let body = text
    .replace(SCAFFOLD_RE, ' ')
    .replace(EMAIL_RE, ' ')
    .replace(/(?:subject|vishay)\s*[:\-]?\s*[^.,;!?]{3,120}/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (recipientName) {
    body = body
      .split(recipientName)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  if (body.length < 3) body = '';

  // 5. Entity confidence from real signals only.
  let entityConfidence: number;
  if (recipientEmail) {
    entityConfidence = 0.95;
  } else if (recipientName && recipientName.length >= 2) {
    entityConfidence = 0.7;
    parseNotes.push(`Recipient "${recipientName}" parsed from speech; needs contact match.`);
  } else {
    entityConfidence = 0.2;
    parseNotes.push('No recipient found in transcript.');
  }
  if (!subject) {
    entityConfidence = Math.max(0.1, entityConfidence - 0.15);
    parseNotes.push('No subject found; a default will be used.');
  }
  if (!body) {
    entityConfidence = Math.max(0.1, entityConfidence - 0.1);
    parseNotes.push('No body text found; draft will be nearly empty.');
  }
  if (asrConfidence !== null && asrConfidence < 0.5) {
    entityConfidence = Math.max(0.1, entityConfidence - 0.2);
    parseNotes.push(`Low ASR confidence (${asrConfidence.toFixed(2)}); transcript may be wrong.`);
  }

  return {
    recipientName,
    recipientEmail,
    subject,
    body: body || null,
    entityConfidence: Math.round(entityConfidence * 100) / 100,
    parseNotes,
  };
}

/** Normalize for contact matching: lowercase, trim, collapse spaces. */
function norm(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Resolve a recipient name/email against contacts.
 * Scoring (real signals only):
 *   exact email match            -> 0.98
 *   exact name match             -> 0.95
 *   name starts with query       -> 0.8
 *   query starts with name token -> 0.7
 *   substring match              -> 0.55
 * Multiple matches above threshold -> ambiguous.
 */
export function resolveRecipient(
  nameOrEmail: string,
  contacts: ContactCandidate[],
): RecipientResolution {
  const q = norm(nameOrEmail);
  if (!q) {
    return { status: 'not_found', email: null, name: null, confidence: null, candidates: [] };
  }

  // Direct email hit.
  const emailHit = contacts.find((c) => norm(c.email) === q);
  if (emailHit) {
    return {
      status: 'resolved',
      email: emailHit.email,
      name: emailHit.name,
      confidence: 0.98,
      candidates: [emailHit],
    };
  }

  const scored: Array<{ c: ContactCandidate; score: number }> = [];
  for (const c of contacts) {
    const n = norm(c.name);
    const e = norm(c.email);
    let score = 0;
    if (n === q) score = 0.95;
    else if (n.startsWith(q) || e.startsWith(q)) score = 0.8;
    else if (q.split(' ').some((tok) => tok.length > 2 && n.startsWith(tok))) score = 0.7;
    else if (n.includes(q) || e.includes(q)) score = 0.55;
    if (score > 0) scored.push({ c, score });
  }
  scored.sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    // Not in contacts: if the query itself is an email, it is still usable
    // (external send) but at lower confidence.
    if (EMAIL_RE.test(nameOrEmail.trim())) {
      return {
        status: 'resolved',
        email: nameOrEmail.trim(),
        name: nameOrEmail.trim(),
        confidence: 0.6,
        candidates: [],
      };
    }
    return { status: 'not_found', email: null, name: null, confidence: null, candidates: [] };
  }

  const top = scored[0]!;
  // Ambiguous when the runner-up is close to the winner.
  const ambiguous = scored.length > 1 && scored[1]!.score >= top.score - 0.15;
  if (ambiguous) {
    return {
      status: 'ambiguous',
      email: null,
      name: null,
      confidence: Math.round(top.score * 100) / 100,
      candidates: scored.slice(0, 5).map((s) => s.c),
    };
  }
  return {
    status: 'resolved',
    email: top.c.email,
    name: top.c.name,
    confidence: Math.round(top.score * 100) / 100,
    candidates: [top.c],
  };
}

/**
 * Risk assessment for the voice-to-mail flow.
 * Sending external mail is always tier 3 (Sentinel confirmation required).
 * Internal/recognized recipients with high confidence stay lower.
 */
export function assessVoiceMailRisk(
  recipient: RecipientResolution,
  entityConfidence: number,
  asrConfidence: number | null,
  userDomain?: string,
): VoiceMailRisk {
  const reasons: string[] = [];

  // Any send is an external side effect -> tier 3 baseline per registry.
  let tier: 1 | 2 | 3 = 3;
  reasons.push('Email send is an external side effect (registry mail.send.execute = tier 3).');

  if (recipient.status === 'not_found') {
    reasons.push('Recipient not found in contacts; cannot proceed safely.');
  } else if (recipient.status === 'ambiguous') {
    reasons.push('Multiple contacts match; user must disambiguate before sending.');
  } else if (recipient.email && userDomain) {
    const domain = recipient.email.split('@')[1]?.toLowerCase();
    if (domain && domain !== userDomain.toLowerCase()) {
      reasons.push(`External recipient domain (${domain}); extra care needed.`);
    } else {
      reasons.push('Internal recipient; standard confirmation applies.');
    }
  }

  if (entityConfidence < 0.5) {
    reasons.push(`Low entity confidence (${entityConfidence.toFixed(2)}); restatement is critical.`);
  }
  if (asrConfidence !== null && asrConfidence < 0.5) {
    reasons.push(`Low ASR confidence (${asrConfidence.toFixed(2)}); transcript may be wrong.`);
  }

  return { tier, reasons };
}

/** Build the restatement card: critical entities the user must verify. */
export function buildRestatement(
  recipient: RecipientResolution,
  entities: VoiceMailEntities,
): VoiceMailRestatement {
  const to =
    recipient.status === 'resolved' && recipient.email
      ? `${recipient.name ?? recipient.email} <${recipient.email}>`
      : entities.recipientName ?? entities.recipientEmail ?? '(unknown recipient)';
  const warnings: string[] = [];
  if (recipient.status === 'ambiguous') {
    warnings.push(
      `Multiple contacts match: ${recipient.candidates.map((c) => `${c.name} <${c.email}>`).join(', ')}. Pick one.`,
    );
  }
  if (recipient.status === 'not_found') {
    warnings.push('Recipient not found in contacts.');
  }
  if (!entities.subject) warnings.push('No subject detected.');
  if (!entities.body) warnings.push('No body text detected.');
  const bodyPreview = entities.body
    ? entities.body.slice(0, 200) + (entities.body.length > 200 ? '…' : '')
    : '(empty)';
  return {
    to,
    subject: entities.subject ?? '(no subject)',
    bodyPreview,
    warnings,
  };
}

/**
 * Full prepare step: parse -> resolve -> risk -> restatement.
 * Pure logic; the caller supplies contacts (from the contacts search tool).
 */
export function prepareVoiceMail(
  transcript: string,
  asrConfidence: number | null,
  contacts: ContactCandidate[],
  userDomain?: string,
): VoiceMailPrepareResult {
  const entities = parseVoiceMailCommand(transcript, asrConfidence);
  const query = entities.recipientEmail ?? entities.recipientName ?? '';
  const recipient = resolveRecipient(query, contacts);
  const risk = assessVoiceMailRisk(recipient, entities.entityConfidence, asrConfidence, userDomain);
  const restatement = buildRestatement(recipient, entities);

  const blockers: string[] = [];
  if (recipient.status === 'not_found') blockers.push('Recipient could not be resolved.');
  if (recipient.status === 'ambiguous') blockers.push('Recipient is ambiguous.');
  if (!entities.subject && !entities.body) blockers.push('Nothing to send: no subject or body.');

  return {
    entities,
    asrConfidence,
    recipient,
    risk,
    restatement,
    canProceed: blockers.length === 0,
    blockers,
  };
}

/** Delivery statuses the quantmail backend reports (see emails.ts). */
const SENT_STATUSES = new Set(['sent', 'delivered']);
const FAILED_STATUSES = new Set(['failed', 'bounced']);

/**
 * Verify authoritative sent state from a mail record read-back.
 * The caller supplies the record (from GET /emails/:id); this function
 * interprets it honestly — never invents a "sent" state.
 */
export function verifySentState(
  emailId: string,
  record: { isSent?: unknown; deliveryStatus?: unknown } | null,
): SentStateVerification {
  const verifiedAt = new Date().toISOString();
  if (!record) {
    return { emailId, status: 'unknown', deliveryStatus: null, verifiedAt };
  }
  const deliveryStatus =
    typeof record.deliveryStatus === 'string' ? record.deliveryStatus : null;
  const isSent = record.isSent === true;

  let status: SentStateVerification['status'];
  if (deliveryStatus && SENT_STATUSES.has(deliveryStatus)) status = 'sent';
  else if (deliveryStatus && FAILED_STATUSES.has(deliveryStatus)) status = 'failed';
  else if (isSent || deliveryStatus === 'queued' || deliveryStatus === 'sending') status = 'queued';
  else status = 'unknown';

  return { emailId, status, deliveryStatus, verifiedAt };
}
