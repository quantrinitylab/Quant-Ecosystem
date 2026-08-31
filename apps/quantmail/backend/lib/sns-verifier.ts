/**
 * AWS SNS message signature verification.
 *
 * The inbound-mail webhook is a public endpoint — SNS cannot present a bearer
 * token, so the signature *is* the authentication. Without this check anyone who
 * knows the URL can POST a hand-written "notification" and have the payload
 * treated as delivered mail. The `x-amz-sns-message-type` header proves nothing:
 * the sender chooses it.
 *
 * The algorithm, per the SNS docs:
 *   1. Build a canonical string from the signable fields, in a fixed order, each
 *      as "<Name>\n<Value>\n". Which fields are signable depends on `Type`.
 *   2. Fetch the X.509 certificate named by `SigningCertURL`.
 *   3. Verify the base64 `Signature` over that string — SHA1 for
 *      SignatureVersion 1, SHA256 for version 2.
 *
 * Step 2 is where a naive implementation goes wrong twice over: an unpinned
 * certificate URL lets an attacker sign with their own key *and* turns the
 * verifier into an SSRF primitive that fetches whatever host the body names. So
 * the URL is pinned to an `sns.<region>.amazonaws.com` host over HTTPS before
 * anything is fetched, and the same predicate guards `SubscribeURL`.
 */

import { createVerify } from 'node:crypto';

/** The three message shapes SNS posts to an HTTPS subscription. */
export type SnsMessageType =
  | 'Notification'
  | 'SubscriptionConfirmation'
  | 'UnsubscribeConfirmation';

/**
 * The SNS envelope as it arrives on the wire. Everything is optional because a
 * forged body is exactly the case we are here to reject — the verifier must be
 * able to describe an envelope missing any field rather than throw on it.
 */
export interface SnsEnvelope {
  Type?: string;
  MessageId?: string;
  TopicArn?: string;
  Subject?: string;
  Message?: string;
  Timestamp?: string;
  SignatureVersion?: string;
  Signature?: string;
  SigningCertURL?: string;
  /** SNS has used both casings over the years; accept either. */
  SigningCertUrl?: string;
  SubscribeURL?: string;
  Token?: string;
}

/** Why verification failed. Logged, and never returned to the caller. */
export type SnsVerifyFailure =
  | 'unknown-type'
  | 'missing-fields'
  | 'missing-signature'
  | 'unsupported-signature-version'
  | 'untrusted-cert-url'
  | 'cert-fetch-failed'
  | 'stale-timestamp'
  | 'signature-mismatch';

export interface SnsVerifyResult {
  ok: boolean;
  reason?: SnsVerifyFailure;
  detail?: string;
}

/** Fetches a PEM certificate for a URL already proven to be an AWS SNS URL. */
export type CertificateFetcher = (url: string) => Promise<string>;

export interface VerifySnsOptions {
  /** Injectable so the tests can verify against a locally generated key pair. */
  fetchCertificate?: CertificateFetcher;
  /**
   * Reject a signature older than this. SNS signatures do not expire on their
   * own, so without a bound a captured notification can be replayed forever.
   * AWS's own SDKs use one hour; mail delivery has no reason to need more.
   */
  maxAgeMs?: number;
  now?: () => number;
}

/**
 * Signable fields, in the order SNS signs them. `Subject` is included only when
 * present — appending an empty one changes the digest and fails every
 * notification published without a subject.
 */
const SIGNABLE_FIELDS: Record<SnsMessageType, readonly (keyof SnsEnvelope)[]> = {
  Notification: ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'],
  SubscriptionConfirmation: [
    'Message',
    'MessageId',
    'SubscribeURL',
    'Timestamp',
    'Token',
    'TopicArn',
    'Type',
  ],
  UnsubscribeConfirmation: [
    'Message',
    'MessageId',
    'SubscribeURL',
    'Timestamp',
    'Token',
    'TopicArn',
    'Type',
  ],
};

/** Digest per SignatureVersion. Version 1 is SHA1; version 2 is SHA256. */
const SIGNATURE_ALGORITHMS: Record<string, string> = {
  '1': 'RSA-SHA1',
  '2': 'RSA-SHA256',
};

/**
 * Every hostname AWS publishes SNS signing certificates and confirmation
 * callbacks on, written out in full.
 *
 * This was a regex — `^sns\.([a-z0-9-]{1,32})\.amazonaws\.com(\.cn)?$` — and the
 * validated region was interpolated back into the URL. That is safe, and it still
 * reads as unsafe: the authority of the URL handed to `fetch` contained a
 * substring of the request body, so `js/request-forgery` flagged both call sites
 * and a reviewer had to reason about a capture group to disprove it. A literal
 * list makes the authority entirely program text. It also happens to be tighter:
 * a region is now a name AWS actually operates, not any 32 characters of
 * lowercase and dashes.
 *
 * A new AWS region needs a line here. The failure mode is loud — inbound mail is
 * refused with `untrusted-cert-url` and the offending URL is logged — rather than
 * silent, which is the right way round for a list that gates authentication.
 */
const SNS_HOSTS: readonly string[] = [
  'sns.af-south-1.amazonaws.com',
  'sns.ap-east-1.amazonaws.com',
  'sns.ap-northeast-1.amazonaws.com',
  'sns.ap-northeast-2.amazonaws.com',
  'sns.ap-northeast-3.amazonaws.com',
  'sns.ap-south-1.amazonaws.com',
  'sns.ap-south-2.amazonaws.com',
  'sns.ap-southeast-1.amazonaws.com',
  'sns.ap-southeast-2.amazonaws.com',
  'sns.ap-southeast-3.amazonaws.com',
  'sns.ap-southeast-4.amazonaws.com',
  'sns.ap-southeast-5.amazonaws.com',
  'sns.ap-southeast-7.amazonaws.com',
  'sns.ca-central-1.amazonaws.com',
  'sns.ca-west-1.amazonaws.com',
  'sns.cn-north-1.amazonaws.com.cn',
  'sns.cn-northwest-1.amazonaws.com.cn',
  'sns.eu-central-1.amazonaws.com',
  'sns.eu-central-2.amazonaws.com',
  'sns.eu-north-1.amazonaws.com',
  'sns.eu-south-1.amazonaws.com',
  'sns.eu-south-2.amazonaws.com',
  'sns.eu-west-1.amazonaws.com',
  'sns.eu-west-2.amazonaws.com',
  'sns.eu-west-3.amazonaws.com',
  'sns.il-central-1.amazonaws.com',
  'sns.me-central-1.amazonaws.com',
  'sns.me-south-1.amazonaws.com',
  'sns.mx-central-1.amazonaws.com',
  'sns.sa-east-1.amazonaws.com',
  'sns.us-east-1.amazonaws.com',
  'sns.us-east-2.amazonaws.com',
  'sns.us-gov-east-1.amazonaws.com',
  'sns.us-gov-west-1.amazonaws.com',
  'sns.us-west-1.amazonaws.com',
  'sns.us-west-2.amazonaws.com',
];

/**
 * The entry of {@link SNS_HOSTS} equal to `hostname`, or null.
 *
 * The return value is the element from the list, never the argument, so what the
 * callers go on to build a URL out of is a string literal from this file. `URL`
 * has already lowercased and punycoded the hostname by the time it gets here, so
 * a plain equality test is the whole comparison.
 */
function trustedSnsHost(hostname: string): string | null {
  for (const host of SNS_HOSTS) {
    if (host === hostname) {
      return host;
    }
  }
  return null;
}

/**
 * The only path shape an SNS signing certificate is ever published at. AWS names
 * these `SimpleNotificationService-<32 hex>.pem`; older messages carry a longer
 * hex, so the length is a range rather than exactly 32.
 */
const SNS_CERT_PATH = /^\/(SimpleNotificationService-[a-f0-9]{16,64}\.pem)$/;

/** The path shape of a subscription-confirmation callback: `/?Action=ConfirmSubscription&…`. */
const SNS_CONFIRM_PATH = /^\/?$/;

const DEFAULT_MAX_AGE_MS = 60 * 60 * 1000;

export function isSnsMessageType(value: unknown): value is SnsMessageType {
  return (
    value === 'Notification' ||
    value === 'SubscriptionConfirmation' ||
    value === 'UnsubscribeConfirmation'
  );
}

/**
 * Rebuild an SNS signing-certificate URL from the parts that passed validation,
 * or return null.
 *
 * Returning a rebuilt string rather than a boolean is the point. A predicate
 * leaves the caller still holding the attacker's original string and merely
 * *trusting itself* to have checked it — and leaves a reader (or a static
 * analyser; CodeQL flagged both fetch sites as `js/request-forgery` while this
 * was a boolean) unable to see that the check happened at all. Nothing here is
 * carried over verbatim: the scheme and the whole authority are literals — the
 * host is the matching element of {@link SNS_HOSTS}, not the caller's hostname —
 * and only the certificate filename comes from the argument, as a hex capture,
 * below a host the caller cannot influence.
 *
 * The previous check was `startsWith('https://sns.')`, which
 * `https://sns.attacker.example/` satisfies.
 */
export function trustedSnsCertUrl(raw: string | undefined): string | null {
  if (!raw) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.search !== '' || url.username || url.password) {
    return null;
  }
  const host = trustedSnsHost(url.hostname);
  const file = SNS_CERT_PATH.exec(url.pathname);
  if (!host || !file) {
    return null;
  }
  return `https://${host}/${file[1]}`;
}

/**
 * Rebuild an SNS `SubscribeURL` from validated parts, or return null.
 *
 * The confirmation callback needs its query string, so this cannot simply drop
 * it. Instead every parameter is rebuilt: `Action` must be the one action this
 * endpoint is willing to perform, `TopicArn` must equal the topic the envelope
 * already declared (which the route has separately allowlisted), and `Token` is
 * constrained to the character class AWS actually uses. The host, as with the
 * certificate URL, is the matching literal from {@link SNS_HOSTS}. A URL that
 * reaches `fetch` from here cannot point anywhere but an SNS confirm endpoint for
 * a topic we accept.
 */
export function trustedSnsSubscribeUrl(
  raw: string | undefined,
  expectedTopicArn: string | undefined,
): string | null {
  if (!raw || !expectedTopicArn) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    return null;
  }
  const host = trustedSnsHost(url.hostname);
  if (!host || !SNS_CONFIRM_PATH.test(url.pathname)) {
    return null;
  }
  const token = url.searchParams.get('Token');
  if (
    url.searchParams.get('Action') !== 'ConfirmSubscription' ||
    url.searchParams.get('TopicArn') !== expectedTopicArn ||
    !token ||
    !/^[A-Za-z0-9]{1,1024}$/.test(token)
  ) {
    return null;
  }
  const query = new URLSearchParams({
    Action: 'ConfirmSubscription',
    TopicArn: expectedTopicArn,
    Token: token,
  });
  return `https://${host}/?${query.toString()}`;
}

/** The `SigningCertURL` under either casing, or undefined. */
export function signingCertUrlOf(message: SnsEnvelope): string | undefined {
  return message.SigningCertURL ?? message.SigningCertUrl;
}

/**
 * Build the exact byte string SNS signed, or null when the envelope is missing a
 * field that participates in the signature.
 */
export function snsCanonicalString(message: SnsEnvelope): string | null {
  if (!isSnsMessageType(message.Type)) {
    return null;
  }
  let canonical = '';
  for (const field of SIGNABLE_FIELDS[message.Type]) {
    const value = message[field];
    if (value === undefined || value === null) {
      // Subject is genuinely optional; every other field is required.
      if (field === 'Subject') {
        continue;
      }
      return null;
    }
    canonical += `${field}\n${String(value)}\n`;
  }
  return canonical;
}

// ---------------------------------------------------------------------------
// Certificate cache
// ---------------------------------------------------------------------------

interface CachedCert {
  pem: string;
  at: number;
}

const certCache = new Map<string, CachedCert>();
const CERT_TTL_MS = 60 * 60 * 1000;
const CERT_CACHE_MAX = 32;

/** Exposed for tests; production code never needs to clear the cache. */
export function clearSnsCertCache(): void {
  certCache.clear();
}

/**
 * Default fetcher. The URL it receives was assembled by
 * {@link trustedSnsCertUrl} out of a literal scheme, a literal host and a
 * validated filename — the authority contains nothing from the caller — so this
 * is a plain HTTPS GET, with a short timeout so a slow AWS endpoint cannot pin a
 * request handler open.
 */
async function fetchCertificateOverHttps(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) {
    throw new Error(`certificate fetch returned ${response.status}`);
  }
  return response.text();
}

async function loadCertificate(url: string, fetcher: CertificateFetcher): Promise<string> {
  const cached = certCache.get(url);
  const now = Date.now();
  if (cached && now - cached.at < CERT_TTL_MS) {
    return cached.pem;
  }
  const pem = await fetcher(url);
  if (certCache.size >= CERT_CACHE_MAX) {
    certCache.clear();
  }
  certCache.set(url, { pem, at: now });
  return pem;
}

/**
 * Verify that SNS really sent this message.
 *
 * Returns a result rather than throwing so the caller can log the precise reason
 * while still answering the request with an opaque rejection.
 */
export async function verifySnsMessage(
  message: SnsEnvelope,
  options: VerifySnsOptions = {},
): Promise<SnsVerifyResult> {
  if (!isSnsMessageType(message.Type)) {
    return { ok: false, reason: 'unknown-type', detail: String(message.Type) };
  }

  const version = message.SignatureVersion ?? '1';
  const algorithm = SIGNATURE_ALGORITHMS[version];
  if (!algorithm) {
    return { ok: false, reason: 'unsupported-signature-version', detail: version };
  }

  if (!message.Signature) {
    return { ok: false, reason: 'missing-signature' };
  }

  const claimedCertUrl = signingCertUrlOf(message);
  // From here on only `certUrl` is used. The claimed string is kept solely to
  // name the offending value in the rejection detail.
  const certUrl = trustedSnsCertUrl(claimedCertUrl);
  if (certUrl === null) {
    return { ok: false, reason: 'untrusted-cert-url', detail: claimedCertUrl ?? '(absent)' };
  }

  const canonical = snsCanonicalString(message);
  if (canonical === null) {
    return { ok: false, reason: 'missing-fields' };
  }

  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const now = options.now?.() ?? Date.now();
  const timestamp = message.Timestamp ? Date.parse(message.Timestamp) : Number.NaN;
  if (!Number.isFinite(timestamp) || now - timestamp > maxAgeMs) {
    return { ok: false, reason: 'stale-timestamp', detail: message.Timestamp ?? '(absent)' };
  }

  let pem: string;
  try {
    pem = await loadCertificate(certUrl, options.fetchCertificate ?? fetchCertificateOverHttps);
  } catch (error) {
    return { ok: false, reason: 'cert-fetch-failed', detail: String(error) };
  }

  let valid = false;
  try {
    const verifier = createVerify(algorithm);
    verifier.update(canonical, 'utf8');
    valid = verifier.verify(pem, message.Signature, 'base64');
  } catch (error) {
    return { ok: false, reason: 'signature-mismatch', detail: String(error) };
  }

  return valid ? { ok: true } : { ok: false, reason: 'signature-mismatch' };
}
