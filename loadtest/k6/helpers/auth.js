import encoding from 'k6/encoding';
import crypto from 'k6/crypto';

const DEFAULT_SECRET = __ENV.JWT_SECRET || 'dev-only-change-me-in-production!!!';

export function generateJWT(payload, secret) {
  const sec = secret || DEFAULT_SECRET;
  const header = { alg: 'HS256', typ: 'JWT' };

  const now = Math.floor(Date.now() / 1000);
  const tokenPayload = {
    ...payload,
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = encoding.b64encode(JSON.stringify(header), 'rawurl');
  const encodedPayload = encoding.b64encode(JSON.stringify(tokenPayload), 'rawurl');
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  // Compute real HMAC-SHA256 signature for valid HS256 JWT
  const signatureHex = crypto.hmac('sha256', sec, signingInput, 'hex');
  const signatureBytes = [];
  for (let i = 0; i < signatureHex.length; i += 2) {
    signatureBytes.push(parseInt(signatureHex.substring(i, i + 2), 16));
  }
  const signature = encoding.b64encode(new Uint8Array(signatureBytes).buffer, 'rawurl');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function getAuthHeaders(userId) {
  const token = generateJWT({ sub: userId || 'load-test-user', role: 'user' });
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}
