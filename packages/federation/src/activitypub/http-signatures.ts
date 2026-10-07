import { createHash, sign, verify, createPrivateKey, createPublicKey } from 'node:crypto';

function buildSigningString(
  method: string,
  url: string,
  headers: Record<string, string>,
  headerNames: string[],
): string {
  const parsedUrl = new URL(url);
  const lines: string[] = [];

  for (const name of headerNames) {
    if (name === '(request-target)') {
      lines.push(`(request-target): ${method.toLowerCase()} ${parsedUrl.pathname}`);
    } else {
      const value = headers[name] ?? headers[name.toLowerCase()] ?? '';
      lines.push(`${name.toLowerCase()}: ${value}`);
    }
  }

  return lines.join('\n');
}

function computeDigest(body: string): string {
  const hash = createHash('sha256').update(body).digest('base64');
  return `SHA-256=${hash}`;
}

export function signRequest(
  privateKey: string,
  keyId: string,
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string,
): Record<string, string> {
  const signedHeaders = { ...headers };

  if (body) {
    signedHeaders['digest'] = computeDigest(body);
  }

  const headerNames = ['(request-target)', 'host', 'date'];
  if (body) {
    headerNames.push('digest');
  }

  const signingString = buildSigningString(method, url, signedHeaders, headerNames);

  const key = createPrivateKey(privateKey);
  const keyType = key.asymmetricKeyType;

  let algorithm: string;
  let signature: string;

  if (keyType === 'ed25519') {
    algorithm = 'ed25519';
    const sig = sign(null, Buffer.from(signingString), key);
    signature = sig.toString('base64');
  } else {
    algorithm = 'rsa-sha256';
    const sig = sign('sha256', Buffer.from(signingString), key);
    signature = sig.toString('base64');
  }

  const signatureHeader = [
    `keyId="${keyId}"`,
    `algorithm="${algorithm}"`,
    `headers="${headerNames.join(' ')}"`,
    `signature="${signature}"`,
  ].join(',');

  signedHeaders['signature'] = signatureHeader;

  return signedHeaders;
}

export function verifySignature(
  publicKey: string,
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string,
): boolean {
  const signatureHeader = headers['signature'] ?? headers['Signature'];
  if (!signatureHeader) {
    return false;
  }

  const params: Record<string, string> = {};
  const parts = signatureHeader.split(',');
  for (const part of parts) {
    const eqIndex = part.indexOf('=');
    if (eqIndex === -1) continue;
    const key = part.slice(0, eqIndex).trim();
    const value = part.slice(eqIndex + 1).trim();
    // Strip surrounding quotes if present
    if (value.startsWith('"') && value.endsWith('"')) {
      params[key] = value.slice(1, -1);
    } else {
      params[key] = value;
    }
  }

  const headerNames = (params['headers'] ?? '').split(' ');
  const signatureB64 = params['signature'] ?? '';
  const algorithm = params['algorithm'] ?? 'ed25519';

  if (body) {
    const expectedDigest = computeDigest(body);
    const actualDigest = headers['digest'] ?? headers['Digest'] ?? '';
    if (actualDigest !== expectedDigest) {
      return false;
    }
  }

  const signingString = buildSigningString(method, url, headers, headerNames);
  const signatureBuffer = Buffer.from(signatureB64, 'base64');

  const key = createPublicKey(publicKey);

  if (algorithm === 'ed25519') {
    return verify(null, Buffer.from(signingString), key, signatureBuffer);
  } else {
    return verify('sha256', Buffer.from(signingString), key, signatureBuffer);
  }
}
