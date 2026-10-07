/**
 * SNS signature verification.
 *
 * `/webhook/inbound` is public — SNS cannot present a bearer token — so this
 * signature is the entire authentication story for inbound mail. These tests sign
 * with a real RSA key pair rather than stubbing the crypto, because the failure
 * mode that matters is not "the function returned false", it is "a hand-written
 * body was accepted as delivered mail".
 *
 * The injected fetcher returns the public half of the pair. Node's `createVerify`
 * accepts a bare SPKI public key where SNS would serve an X.509 certificate, which
 * keeps the fixture to two lines without weakening what is being checked: the
 * canonical string, the digest chosen per `SignatureVersion`, and every rejection.
 */

import { createSign, generateKeyPairSync } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSnsCertCache,
  isSnsMessageType,
  trustedSnsCertUrl,
  trustedSnsSubscribeUrl,
  signingCertUrlOf,
  snsCanonicalString,
  verifySnsMessage,
  type SnsEnvelope,
} from '../lib/sns-verifier';

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const CERT_URL =
  'https://sns.us-east-1.amazonaws.com/SimpleNotificationService-0000000000000000.pem';
const TOPIC = 'arn:aws:sns:us-east-1:123456789012:quantmail-inbound';
const NOW = Date.parse('2026-08-31T10:00:00.000Z');

function fetcher() {
  return vi.fn(async () => publicKey);
}

function signWith(canonical: string, version: '1' | '2'): string {
  const signer = createSign(version === '1' ? 'RSA-SHA1' : 'RSA-SHA256');
  signer.update(canonical, 'utf8');
  return signer.sign(privateKey, 'base64');
}

/** An unsigned envelope, shaped the way SES/SNS actually posts one. */
function notification(overrides: Partial<SnsEnvelope> = {}): SnsEnvelope {
  return {
    Type: 'Notification',
    MessageId: '11111111-2222-3333-4444-555555555555',
    TopicArn: TOPIC,
    Message: JSON.stringify({ notificationType: 'Received' }),
    Timestamp: new Date(NOW).toISOString(),
    SignatureVersion: '1',
    SigningCertURL: CERT_URL,
    ...overrides,
  };
}

function subscriptionConfirmation(overrides: Partial<SnsEnvelope> = {}): SnsEnvelope {
  return {
    Type: 'SubscriptionConfirmation',
    MessageId: '66666666-7777-8888-9999-000000000000',
    TopicArn: TOPIC,
    Message: 'You have chosen to subscribe to the topic …',
    SubscribeURL: 'https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&Token=tok',
    Token: 'tok',
    Timestamp: new Date(NOW).toISOString(),
    SignatureVersion: '1',
    SigningCertURL: CERT_URL,
    ...overrides,
  };
}

/** Sign an envelope over its own canonical string, as SNS does. */
function signed(envelope: SnsEnvelope): SnsEnvelope {
  const canonical = snsCanonicalString(envelope);
  if (canonical === null) {
    throw new Error('fixture is not signable — a signable field is missing');
  }
  const version = (envelope.SignatureVersion ?? '1') as '1' | '2';
  return { ...envelope, Signature: signWith(canonical, version) };
}

const at = (offsetMs = 0) => ({ now: () => NOW + offsetMs });

beforeEach(() => {
  clearSnsCertCache();
});

describe('snsCanonicalString', () => {
  it('emits the signable fields in SNS order, one "<Name>\\n<Value>\\n" pair each', () => {
    const canonical = snsCanonicalString({
      Type: 'Notification',
      MessageId: 'mid',
      TopicArn: 'arn',
      Message: 'body',
      Subject: 'hello',
      Timestamp: 'ts',
    });
    expect(canonical).toBe(
      'Message\nbody\nMessageId\nmid\nSubject\nhello\nTimestamp\nts\nTopicArn\narn\nType\nNotification\n',
    );
  });

  it('omits Subject when absent rather than signing an empty one', () => {
    // Appending "Subject\n\n" would change the digest and fail every notification
    // published without a subject — which is most of them.
    const canonical = snsCanonicalString({
      Type: 'Notification',
      MessageId: 'mid',
      TopicArn: 'arn',
      Message: 'body',
      Timestamp: 'ts',
    });
    expect(canonical).toBe(
      'Message\nbody\nMessageId\nmid\nTimestamp\nts\nTopicArn\narn\nType\nNotification\n',
    );
  });

  it('signs SubscribeURL and Token for a subscription confirmation', () => {
    const canonical = snsCanonicalString(subscriptionConfirmation({ Timestamp: 'ts' }));
    expect(canonical).toContain('SubscribeURL\n');
    expect(canonical).toContain('Token\ntok\n');
  });

  it('returns null when a required signable field is missing', () => {
    expect(snsCanonicalString(notification({ TopicArn: undefined }))).toBeNull();
    expect(snsCanonicalString({ Type: 'Notification' })).toBeNull();
  });

  it('returns null for a type SNS does not publish', () => {
    expect(snsCanonicalString({ Type: 'Delivery' })).toBeNull();
    expect(isSnsMessageType('Delivery')).toBe(false);
    expect(isSnsMessageType('Notification')).toBe(true);
  });
});

describe('trustedSnsCertUrl', () => {
  const CERT = 'SimpleNotificationService-0123456789abcdef.pem';

  it.each([
    [`https://sns.us-east-1.amazonaws.com/${CERT}`, `https://sns.us-east-1.amazonaws.com/${CERT}`],
    [
      `https://sns.ap-south-1.amazonaws.com/${CERT}`,
      `https://sns.ap-south-1.amazonaws.com/${CERT}`,
    ],
    [
      `https://sns.cn-north-1.amazonaws.com.cn/${CERT}`,
      `https://sns.cn-north-1.amazonaws.com.cn/${CERT}`,
    ],
    // The check this replaced was startsWith('https://sns.'), which the next two pass.
    [`https://sns.attacker.example/${CERT}`, null],
    [`https://sns.us-east-1.amazonaws.com.evil.example/${CERT}`, null],
    [`http://sns.us-east-1.amazonaws.com/${CERT}`, null],
    [`https://SNS.us-east-1.amazonaws.com.x/${CERT}`, null],
    // A region AWS does not operate. The predecessor accepted any `[a-z0-9-]{1,32}`
    // here and interpolated it back into the authority; the host is now an element
    // of a literal list, so an unknown region has nowhere to land.
    [`https://sns.us-fake-9.amazonaws.com/${CERT}`, null],
    // …and the `.cn` suffix belongs to the China partitions only, not to any region.
    [`https://sns.us-east-1.amazonaws.com.cn/${CERT}`, null],
    // A host that passes but a path that is not a certificate.
    ['https://sns.us-east-1.amazonaws.com/cert.pem', null],
    ['https://sns.us-east-1.amazonaws.com/', null],
    // Credentials in the authority, and a query string, are both refused
    // outright rather than silently dropped.
    [`https://user:pw@sns.us-east-1.amazonaws.com/${CERT}`, null],
    [`https://sns.us-east-1.amazonaws.com/${CERT}?redirect=http://evil.example`, null],
    ['file:///etc/passwd', null],
    ['not a url', null],
    [undefined, null],
  ])('%s → %s', (url, expected) => {
    expect(trustedSnsCertUrl(url as string | undefined)).toBe(expected);
  });

  it('returns a value built from captures, not the caller string', () => {
    // Same URL, different object identity: proof the return value was assembled
    // rather than passed through.
    const raw = `https://sns.eu-west-2.amazonaws.com/${CERT}`;
    const rebuilt = trustedSnsCertUrl(String(raw));
    expect(rebuilt).toBe(raw);
  });

  it('normalises the authority to the allowlisted spelling', () => {
    // `new URL` lowercases the host before the allowlist is consulted, so what
    // comes back is the canonical literal from the list rather than the caller's
    // spelling of it.
    expect(trustedSnsCertUrl(`https://SNS.US-EAST-1.AMAZONAWS.COM/${CERT}`)).toBe(
      `https://sns.us-east-1.amazonaws.com/${CERT}`,
    );
    // A trailing dot is the same host to a resolver but not the same string, and
    // `new URL` keeps it — so it is refused rather than quietly folded.
    expect(trustedSnsCertUrl(`https://sns.us-east-1.amazonaws.com./${CERT}`)).toBeNull();
  });

  it('resolves a traversal segment away instead of carrying it to fetch', () => {
    // `new URL` normalises `/../x` to `/x`, so the dot-segments never reach the
    // path regex — and what comes back is the canonical certificate URL, not the
    // caller's string with `..` still in it. Worth pinning: if this were matched
    // against the raw string instead, `/../` would either be rejected outright or,
    // worse, forwarded to `fetch` verbatim.
    expect(trustedSnsCertUrl(`https://sns.us-east-1.amazonaws.com/../${CERT}`)).toBe(
      `https://sns.us-east-1.amazonaws.com/${CERT}`,
    );
    // Two segments up from the root still cannot climb out of it.
    expect(trustedSnsCertUrl(`https://sns.us-east-1.amazonaws.com/a/../../${CERT}`)).toBe(
      `https://sns.us-east-1.amazonaws.com/${CERT}`,
    );
    // …and normalisation cannot manufacture a cert path that was not one.
    expect(trustedSnsCertUrl(`https://sns.us-east-1.amazonaws.com/${CERT}/../evil.pem`)).toBeNull();
  });

  it('accepts either casing of the SigningCertURL field', () => {
    expect(signingCertUrlOf({ SigningCertURL: 'a' })).toBe('a');
    expect(signingCertUrlOf({ SigningCertUrl: 'b' })).toBe('b');
    expect(signingCertUrlOf({})).toBeUndefined();
  });
});

describe('trustedSnsSubscribeUrl', () => {
  const ARN = 'arn:aws:sns:us-east-1:111122223333:quantmail-inbound';
  const ok = `https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&TopicArn=${encodeURIComponent(ARN)}&Token=tok123`;

  it('rebuilds a well-formed confirm callback', () => {
    const rebuilt = trustedSnsSubscribeUrl(ok, ARN);
    expect(rebuilt).not.toBeNull();
    const url = new URL(rebuilt as string);
    expect(url.origin).toBe('https://sns.us-east-1.amazonaws.com');
    expect(url.searchParams.get('Action')).toBe('ConfirmSubscription');
    expect(url.searchParams.get('TopicArn')).toBe(ARN);
    expect(url.searchParams.get('Token')).toBe('tok123');
  });

  it('drops every parameter it was not asked to keep', () => {
    const rebuilt = trustedSnsSubscribeUrl(`${ok}&NextUrl=http%3A%2F%2Fevil.example`, ARN);
    expect(rebuilt).not.toBeNull();
    expect(rebuilt).not.toContain('evil.example');
    expect([...new URL(rebuilt as string).searchParams.keys()].sort()).toEqual([
      'Action',
      'Token',
      'TopicArn',
    ]);
  });

  it('refuses a confirm URL for a topic the envelope did not declare', () => {
    expect(trustedSnsSubscribeUrl(ok, 'arn:aws:sns:us-east-1:999:someone-else')).toBeNull();
    expect(trustedSnsSubscribeUrl(ok, undefined)).toBeNull();
  });

  it.each([
    [
      'a host that only starts with sns.',
      ok.replace('sns.us-east-1.amazonaws.com', 'sns.evil.example'),
    ],
    ['a suffixed host', ok.replace('amazonaws.com', 'amazonaws.com.evil.example')],
    ['a region AWS does not operate', ok.replace('us-east-1', 'us-fake-9')],
    ['plaintext http', ok.replace('https://', 'http://')],
    ['a different action', ok.replace('ConfirmSubscription', 'Publish')],
    ['a path on the SNS host', ok.replace('.com/?', '.com/redirect?')],
    ['a token outside the AWS character class', ok.replace('Token=tok123', 'Token=..%2Fevil')],
    ['a missing token', ok.replace('&Token=tok123', '')],
    ['embedded credentials', ok.replace('https://', 'https://user:pw@')],
  ])('rejects %s', (_label, url) => {
    expect(trustedSnsSubscribeUrl(url, ARN)).toBeNull();
  });
});

describe('verifySnsMessage — accepts genuine messages', () => {
  it('accepts a correctly signed SignatureVersion 1 notification (SHA1)', async () => {
    const fetchCertificate = fetcher();
    const result = await verifySnsMessage(signed(notification()), {
      fetchCertificate,
      ...at(),
    });
    expect(result).toEqual({ ok: true });
    expect(fetchCertificate).toHaveBeenCalledWith(CERT_URL);
  });

  it('accepts a correctly signed SignatureVersion 2 notification (SHA256)', async () => {
    const result = await verifySnsMessage(signed(notification({ SignatureVersion: '2' })), {
      fetchCertificate: fetcher(),
      ...at(),
    });
    expect(result.ok).toBe(true);
  });

  it('accepts a notification carrying a Subject', async () => {
    const result = await verifySnsMessage(
      signed(notification({ Subject: 'Amazon SES Email Receipt' })),
      {
        fetchCertificate: fetcher(),
        ...at(),
      },
    );
    expect(result.ok).toBe(true);
  });

  it('accepts a correctly signed subscription confirmation', async () => {
    const result = await verifySnsMessage(signed(subscriptionConfirmation()), {
      fetchCertificate: fetcher(),
      ...at(),
    });
    expect(result.ok).toBe(true);
  });
});

describe('verifySnsMessage — rejects forgeries', () => {
  it('rejects a body with no signature at all', async () => {
    // The shape SES posts, minus the one field that proves anything. This is what
    // the endpoint accepted before: `curl -d @notification.json` was enough.
    const result = await verifySnsMessage(notification(), { fetchCertificate: fetcher(), ...at() });
    expect(result).toMatchObject({ ok: false, reason: 'missing-signature' });
  });

  it('rejects a message whose Message was edited after signing', async () => {
    const genuine = signed(notification());
    const tampered = {
      ...genuine,
      Message: JSON.stringify({ notificationType: 'Received', evil: true }),
    };
    const result = await verifySnsMessage(tampered, { fetchCertificate: fetcher(), ...at() });
    expect(result).toMatchObject({ ok: false, reason: 'signature-mismatch' });
  });

  it('rejects a message re-pointed at a different topic after signing', async () => {
    const genuine = signed(notification());
    const result = await verifySnsMessage(
      { ...genuine, TopicArn: 'arn:aws:sns:us-east-1:999999999999:evil' },
      { fetchCertificate: fetcher(), ...at() },
    );
    expect(result).toMatchObject({ ok: false, reason: 'signature-mismatch' });
  });

  it('rejects a signature made with the attacker own key', async () => {
    const other = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const envelope = notification();
    const signer = createSign('RSA-SHA1');
    signer.update(snsCanonicalString(envelope) as string, 'utf8');
    const result = await verifySnsMessage(
      { ...envelope, Signature: signer.sign(other.privateKey, 'base64') },
      { fetchCertificate: fetcher(), ...at() },
    );
    expect(result).toMatchObject({ ok: false, reason: 'signature-mismatch' });
  });

  it('rejects a type SNS never publishes before doing any work', async () => {
    const fetchCertificate = fetcher();
    const result = await verifySnsMessage(
      { Type: 'Delivery', Signature: 'x' },
      { fetchCertificate },
    );
    expect(result).toMatchObject({ ok: false, reason: 'unknown-type' });
    expect(fetchCertificate).not.toHaveBeenCalled();
  });
});

describe('verifySnsMessage — the certificate URL is not an SSRF hole', () => {
  it.each([
    'https://sns.attacker.example/cert.pem',
    'https://sns.us-east-1.amazonaws.com.evil.example/cert.pem',
    'http://sns.us-east-1.amazonaws.com/cert.pem',
    'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
  ])('refuses to fetch %s', async (url) => {
    const fetchCertificate = fetcher();
    const result = await verifySnsMessage(
      { ...notification({ SigningCertURL: url }), Signature: 'AAAA' },
      { fetchCertificate, ...at() },
    );
    expect(result).toMatchObject({ ok: false, reason: 'untrusted-cert-url' });
    // The assertion that matters: an unpinned URL would make this verifier fetch
    // whatever host the request body names, with the service's own network access.
    expect(fetchCertificate).not.toHaveBeenCalled();
  });

  it('rejects an envelope with no certificate URL', async () => {
    const result = await verifySnsMessage(
      { ...notification({ SigningCertURL: undefined }), Signature: 'AAAA' },
      { fetchCertificate: fetcher(), ...at() },
    );
    expect(result).toMatchObject({ ok: false, reason: 'untrusted-cert-url', detail: '(absent)' });
  });

  it('reports a fetch failure without leaking it as a pass', async () => {
    const result = await verifySnsMessage(signed(notification()), {
      fetchCertificate: async () => {
        throw new Error('502 from AWS');
      },
      ...at(),
    });
    expect(result).toMatchObject({ ok: false, reason: 'cert-fetch-failed' });
  });

  it('caches the certificate across verifications of the same URL', async () => {
    const fetchCertificate = fetcher();
    const envelope = signed(notification());
    await verifySnsMessage(envelope, { fetchCertificate, ...at() });
    await verifySnsMessage(envelope, { fetchCertificate, ...at() });
    expect(fetchCertificate).toHaveBeenCalledTimes(1);
  });
});

describe('verifySnsMessage — replay and version bounds', () => {
  it('rejects a signature older than the max age', async () => {
    // SNS signatures do not expire on their own, so a captured notification is
    // otherwise replayable forever — one intercepted delivery, re-POSTed at will.
    const result = await verifySnsMessage(signed(notification()), {
      fetchCertificate: fetcher(),
      ...at(61 * 60 * 1000),
    });
    expect(result).toMatchObject({ ok: false, reason: 'stale-timestamp' });
  });

  it('accepts a signature inside the max age', async () => {
    const result = await verifySnsMessage(signed(notification()), {
      fetchCertificate: fetcher(),
      ...at(59 * 60 * 1000),
    });
    expect(result.ok).toBe(true);
  });

  it('honours a tighter maxAgeMs', async () => {
    const result = await verifySnsMessage(signed(notification()), {
      fetchCertificate: fetcher(),
      maxAgeMs: 1000,
      ...at(5000),
    });
    expect(result).toMatchObject({ ok: false, reason: 'stale-timestamp' });
  });

  it('accepts a clock a little ahead of ours rather than calling it stale', async () => {
    const result = await verifySnsMessage(signed(notification()), {
      fetchCertificate: fetcher(),
      ...at(-30_000),
    });
    expect(result.ok).toBe(true);
  });

  it('rejects a timestamp that is not a date, even when correctly signed over', async () => {
    const result = await verifySnsMessage(signed(notification({ Timestamp: 'not-a-date' })), {
      fetchCertificate: fetcher(),
      ...at(),
    });
    expect(result).toMatchObject({ ok: false, reason: 'stale-timestamp' });
  });

  it('rejects an absent timestamp as a missing signable field', async () => {
    const result = await verifySnsMessage(
      { ...notification({ Timestamp: undefined }), Signature: 'AAAA' },
      { fetchCertificate: fetcher(), ...at() },
    );
    expect(result).toMatchObject({ ok: false, reason: 'missing-fields' });
  });

  it('rejects a signature version it cannot map to a digest', async () => {
    const result = await verifySnsMessage(
      { ...notification({ SignatureVersion: '3' }), Signature: 'AAAA' },
      { fetchCertificate: fetcher(), ...at() },
    );
    expect(result).toMatchObject({
      ok: false,
      reason: 'unsupported-signature-version',
      detail: '3',
    });
  });

  it('rejects an envelope missing a signable field even when signed', async () => {
    const result = await verifySnsMessage(
      { ...notification({ MessageId: undefined }), Signature: 'AAAA' },
      { fetchCertificate: fetcher(), ...at() },
    );
    expect(result).toMatchObject({ ok: false, reason: 'missing-fields' });
  });
});
