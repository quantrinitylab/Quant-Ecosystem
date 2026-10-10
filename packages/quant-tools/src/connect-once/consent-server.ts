// ============================================================================
// Connect-once OAuth consent server (P1-2)
//
// Framework-agnostic node:http handlers wrapping @quant/federation's real
// OAuth2Provider (authorization-code flow with PKCE, refresh, revoke).
//
// Routes:
//   GET  /oauth/authorize           — validate params, require a signed-in
//                                     user (via the injected `resolveUser`
//                                     hook — the host app injects real Quant
//                                     SSO here), render the consent page.
//   POST /oauth/authorize/decision  — approve/deny form; approve mints an
//                                     authorization code via the provider and
//                                     302-redirects with it; deny redirects
//                                     with error=access_denied.
//   POST /oauth/token               — delegates grant validation to
//                                     provider.token(). For the
//                                     authorization_code and refresh_token
//                                     grants the opaque provider access token
//                                     is REPLACED on the wire with a signed
//                                     capability JWT carrying the same
//                                     scopes/userId/clientId — the capability
//                                     token IS the OAuth access token.
//   POST /oauth/revoke              — revokes the provider record (opaque
//                                     tokens) and adds the JWT jti to the
//                                     in-memory denylist.
//
// Honest limitations (all in-memory, like the underlying provider):
//   - `resolveUser` is an injection point: this module does NOT implement
//     Quant SSO itself. The host app must supply it; without it there is no
//     login and /oauth/authorize answers 401.
//   - Consent nonces, code→subject bindings, and refresh→subject bindings
//     live in process memory and are lost on restart (documented per map).
//   - The client_credentials grant passes the provider's opaque token
//     through unchanged — service-account tokens are NOT capability JWTs
//     (a provider-introspection resolver for the gateway is not wired yet).
// ============================================================================

import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { OAuth2Provider } from '@quant/federation';
import type { AuthorizeRequest, OAuth2Error, TokenRequest } from '@quant/federation';
import {
  isKnownScope,
  SCOPE_CATALOG,
} from './capability-scopes.js';
import {
  issueCapabilityToken,
  resolveCapabilitySecret,
  revokeCapabilityToken,
  verifyCapabilityToken,
} from './capability-token.js';

export interface ConsentUser {
  userId: string;
  displayName: string;
}

export interface ConnectOnceOptions {
  /** The OAuth2 provider (client registry, codes, token records). */
  provider: OAuth2Provider;
  /**
   * Resolve the signed-in Quant user for this request (e.g. from the host
   * app's session cookie). Return null when nobody is signed in.
   * NOT WIRED by default — the host app injects real Quant SSO here.
   */
  resolveUser: (req: IncomingMessage) => Promise<ConsentUser | null>;
  /** HS256 secret for capability JWTs; defaults to resolveCapabilitySecret(). */
  capabilitySecret?: string;
  /** Capability JWT lifetime in seconds; default 3600. */
  capabilityTtlSec?: number;
}

interface PendingConsent {
  userId: string;
  displayName: string;
  clientId: string;
  clientName: string;
  redirectUri: string;
  scopes: string[];
  state?: string;
  codeChallenge?: string;
  codeChallengeMethod?: 'S256' | 'plain';
  expiresAt: number;
}

interface SubjectBinding {
  userId: string;
  scopes: string[];
  clientId: string;
  expiresAt: number;
}

const CONSENT_TTL_MS = 10 * 60 * 1000; // matches the provider's auth-code TTL
const MAX_BODY_BYTES = 1024 * 1024;

/**
 * Build the request handler. Mount it in any node:http server, e.g.:
 *
 *   createServer((req, res) => void handler(req, res)).listen(3000)
 *
 * Paths outside /oauth/* answer 404 so the handler composes with other
 * routes on the same server.
 */
export function createConnectOnceHandler(
  options: ConnectOnceOptions,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  // In-memory, non-durable: lost on restart (same trade-off as the provider).
  const pendingConsents = new Map<string, PendingConsent>();
  // code -> subject, so /oauth/token can mint a JWT for the same user/scopes.
  const codeSubjects = new Map<string, SubjectBinding>();
  // refresh_token -> subject, so refresh grants can mint fresh JWTs.
  const refreshSubjects = new Map<string, SubjectBinding>();

  const ttlSec = options.capabilityTtlSec ?? 3600;

  function secret(): string {
    return options.capabilitySecret ?? resolveCapabilitySecret();
  }

  function sweep(map: Map<string, { expiresAt: number }>): void {
    const now = Date.now();
    for (const [key, value] of map) {
      if (value.expiresAt <= now) {
        map.delete(key);
      }
    }
  }

  async function handleAuthorize(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://internal');
    const q = url.searchParams;
    const clientId = q.get('client_id') ?? '';
    const redirectUri = q.get('redirect_uri') ?? '';
    const scopeParam = q.get('scope') ?? '';

    const fail = (title: string, detail: string): void => {
      sendHtml(res, 400, errorPage(title, detail));
    };

    if (q.get('response_type') !== 'code') {
      fail('Unsupported response type', 'This server only supports response_type=code.');
      return;
    }
    const client = options.provider.getClient(clientId);
    if (!client) {
      fail('Unknown client', 'The client_id is not registered with Quant.');
      return;
    }
    if (!client.redirectUris.includes(redirectUri)) {
      // Never redirect to an unregistered URI.
      fail('Invalid redirect URI', 'The redirect_uri is not registered for this client.');
      return;
    }

    const scopes = scopeParam.split(' ').map((s) => s.trim()).filter(Boolean);
    if (scopes.length === 0) {
      fail('No scopes requested', 'At least one capability scope is required.');
      return;
    }
    const unknown = scopes.filter((s) => !isKnownScope(s));
    if (unknown.length > 0) {
      fail(
        'Unknown scopes requested',
        `These scopes are not recognized: ${unknown.join(', ')}.`,
      );
      return;
    }

    const user = await options.resolveUser(req);
    if (!user) {
      sendHtml(res, 401, signInRequiredPage(client.name));
      return;
    }

    sweep(pendingConsents);
    const nonce = randomBytes(16).toString('hex');
    const codeChallengeMethod = q.get('code_challenge_method');
    pendingConsents.set(nonce, {
      userId: user.userId,
      displayName: user.displayName,
      clientId,
      clientName: client.name,
      redirectUri,
      scopes,
      state: q.get('state') ?? undefined,
      codeChallenge: q.get('code_challenge') ?? undefined,
      codeChallengeMethod:
        codeChallengeMethod === 'S256' || codeChallengeMethod === 'plain'
          ? codeChallengeMethod
          : undefined,
      expiresAt: Date.now() + CONSENT_TTL_MS,
    });

    sendHtml(res, 200, consentPage(client.name, user.displayName, scopes, ttlSec, nonce));
  }

  async function handleDecision(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const form = await readForm(req, res);
    if (!form) {
      return;
    }
    const fail = (title: string, detail: string): void => {
      sendHtml(res, 400, errorPage(title, detail));
    };

    const nonce = form.get('nonce') ?? '';
    const pending = pendingConsents.get(nonce);
    pendingConsents.delete(nonce);
    if (!pending || pending.expiresAt <= Date.now()) {
      fail('Session expired', 'This consent request expired or was already used. Start over.');
      return;
    }

    const user = await options.resolveUser(req);
    if (!user || user.userId !== pending.userId) {
      fail(
        'Sign-in changed',
        'The signed-in user changed while you were deciding. Start the authorization over.',
      );
      return;
    }

    if (form.get('decision') !== 'approve') {
      redirectWithParams(res, pending.redirectUri, {
        error: 'access_denied',
        ...(pending.state ? { state: pending.state } : {}),
      });
      return;
    }

    const authorizeRequest: AuthorizeRequest = {
      responseType: 'code',
      clientId: pending.clientId,
      redirectUri: pending.redirectUri,
      scope: pending.scopes.join(' '),
      state: pending.state,
      codeChallenge: pending.codeChallenge,
      codeChallengeMethod: pending.codeChallengeMethod,
    };
    const result = options.provider.authorize(authorizeRequest, user.userId);
    if (isOAuthError(result)) {
      redirectWithParams(res, pending.redirectUri, {
        error: result.error,
        error_description: result.error_description,
        ...(pending.state ? { state: pending.state } : {}),
      });
      return;
    }

    sweep(codeSubjects);
    codeSubjects.set(result.code, {
      userId: user.userId,
      scopes: pending.scopes,
      clientId: pending.clientId,
      expiresAt: Date.now() + CONSENT_TTL_MS,
    });
    redirectWithParams(res, pending.redirectUri, {
      code: result.code,
      ...(pending.state ? { state: pending.state } : {}),
    });
  }

  async function handleToken(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const form = await readForm(req, res);
    if (!form) {
      return;
    }

    const grantType = form.get('grant_type') ?? '';
    if (
      grantType !== 'authorization_code' &&
      grantType !== 'refresh_token' &&
      grantType !== 'client_credentials'
    ) {
      sendJson(res, 400, {
        error: 'unsupported_grant_type',
        error_description: 'Supported grants: authorization_code, refresh_token, client_credentials.',
      });
      return;
    }

    const basic = parseBasicAuth(req.headers['authorization']);
    const tokenRequest: TokenRequest = {
      grantType,
      clientId: basic?.username ?? form.get('client_id') ?? '',
      clientSecret: basic?.password ?? form.get('client_secret') ?? undefined,
      code: form.get('code') ?? undefined,
      redirectUri: form.get('redirect_uri') ?? undefined,
      codeVerifier: form.get('code_verifier') ?? undefined,
      refreshToken: form.get('refresh_token') ?? undefined,
      scope: form.get('scope') ?? undefined,
    };

    // For capability-grant flows we need the subject BEFORE the provider
    // consumes the code/refresh token, so look the bindings up first.
    let subject: SubjectBinding | undefined;
    if (grantType === 'authorization_code') {
      sweep(codeSubjects);
      subject = tokenRequest.code ? codeSubjects.get(tokenRequest.code) : undefined;
      if (!subject) {
        sendJson(res, 400, {
          error: 'invalid_grant',
          error_description:
            'Authorization session expired or unknown. Please re-authorize ' +
            '(code-to-subject bindings are in-memory and do not survive restarts).',
        });
        return;
      }
    } else if (grantType === 'refresh_token') {
      sweep(refreshSubjects);
      subject = tokenRequest.refreshToken
        ? refreshSubjects.get(tokenRequest.refreshToken)
        : undefined;
      if (!subject) {
        sendJson(res, 400, {
          error: 'invalid_grant',
          error_description:
            'Refresh session expired or unknown. Please re-authorize ' +
            '(refresh bindings are in-memory and do not survive restarts).',
        });
        return;
      }
    }

    const result = options.provider.token(tokenRequest);
    if (isOAuthError(result)) {
      sendJson(res, 400, result);
      return;
    }

    if (grantType === 'client_credentials') {
      // Service-account tokens stay opaque provider tokens — they are NOT
      // capability JWTs. A provider-introspection resolver for the gateway
      // is not wired yet; operators register such tokens via the gateway's
      // legacy registerToken path.
      sendJson(res, 200, result);
      return;
    }

    // authorization_code / refresh_token: the capability JWT IS the access token.
    const binding = subject as SubjectBinding;
    let signingSecret: string;
    try {
      signingSecret = secret();
    } catch (e) {
      sendJson(res, 500, {
        error: 'server_error',
        error_description: e instanceof Error ? e.message : 'Capability secret misconfigured',
      });
      return;
    }

    if (grantType === 'authorization_code' && tokenRequest.code) {
      codeSubjects.delete(tokenRequest.code);
    }
    if (grantType === 'refresh_token' && tokenRequest.refreshToken) {
      refreshSubjects.delete(tokenRequest.refreshToken);
    }

    const accessToken = issueCapabilityToken(
      {
        userId: binding.userId,
        scopes: binding.scopes,
        clientId: binding.clientId,
        ttlSec,
      },
      signingSecret,
    );
    if (result.refresh_token) {
      sweep(refreshSubjects);
      refreshSubjects.set(result.refresh_token, {
        userId: binding.userId,
        scopes: binding.scopes,
        clientId: binding.clientId,
        expiresAt: Date.now() + 30 * 24 * 3600 * 1000, // 30 days
      });
    }

    sendJson(res, 200, {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ttlSec,
      ...(result.refresh_token ? { refresh_token: result.refresh_token } : {}),
      scope: binding.scopes.join(' '),
    });
  }

  async function handleRevoke(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const form = await readForm(req, res);
    if (!form) {
      return;
    }
    const token = form.get('token') ?? '';
    if (!token) {
      sendJson(res, 400, {
        error: 'invalid_request',
        error_description: 'Missing token parameter.',
      });
      return;
    }

    // Opaque provider tokens (client_credentials passthrough, pre-JWT records).
    options.provider.revoke(token);

    // Capability JWTs: add the jti to the in-memory denylist.
    try {
      const claims = verifyCapabilityToken(token, secret());
      revokeCapabilityToken(claims.jti);
    } catch {
      // Not a capability JWT (or secret misconfigured) — nothing more to do.
      // RFC 7009: the endpoint still answers 200 for unknown/invalid tokens.
    }

    sendJson(res, 200, {});
  }

  return async function connectOnceHandler(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://internal');
    try {
      if (url.pathname === '/oauth/authorize' && req.method === 'GET') {
        await handleAuthorize(req, res);
      } else if (url.pathname === '/oauth/authorize/decision' && req.method === 'POST') {
        await handleDecision(req, res);
      } else if (url.pathname === '/oauth/token' && req.method === 'POST') {
        await handleToken(req, res);
      } else if (url.pathname === '/oauth/revoke' && req.method === 'POST') {
        await handleRevoke(req, res);
      } else {
        sendJson(res, 404, { error: 'not_found' });
      }
    } catch (e) {
      // Never leak internals; the consent flow must fail closed.
      sendJson(res, 500, {
        error: 'server_error',
        error_description: e instanceof Error ? e.message : 'Internal error',
      });
    }
  };
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function sendHtml(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function redirectWithParams(res: ServerResponse, base: string, params: Record<string, string>): void {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  res.writeHead(302, { Location: url.toString(), 'Content-Type': 'text/html; charset=utf-8' });
  res.end(
    `<html><body>Redirecting… <a href="${escapeHtml(url.toString())}">continue</a></body></html>`,
  );
}

async function readForm(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<URLSearchParams | null> {
  const contentType = req.headers['content-type'] ?? '';
  let body: string;
  try {
    body = await readBody(req);
  } catch (e) {
    sendJson(res, 400, {
      error: 'invalid_request',
      error_description: e instanceof Error ? e.message : 'Bad body',
    });
    return null;
  }
  try {
    if (contentType.includes('application/json')) {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string') {
          params.set(key, value);
        }
      }
      return params;
    }
    return new URLSearchParams(body);
  } catch {
    sendJson(res, 400, {
      error: 'invalid_request',
      error_description: 'Body is not valid form data or JSON.',
    });
    return null;
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    req.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        reject(new Error('Request body exceeds 1MB'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', (e) => reject(e));
  });
}

function parseBasicAuth(header: string | undefined): { username: string; password: string } | null {
  if (!header) {
    return null;
  }
  // Parse "Basic <credentials>" with a manual scan instead of
  // /^Basic\s+(.+)$/i: the overlapping \s+ and .+ quantifiers backtrack
  // polynomially on headers with long whitespace runs (CodeQL
  // js/polynomial-redos). This scan is linear-time and accepts exactly the
  // same headers (case-insensitive scheme, one-or-more whitespace, then the
  // credentials). The single-character /\s/ test has no quantifier, so it
  // cannot backtrack.
  const trimmed = header.trim();
  if (trimmed.length < 6 || trimmed.slice(0, 5).toLowerCase() !== 'basic') {
    return null;
  }
  let i = 5;
  if (!/\s/.test(trimmed.charAt(i))) {
    return null;
  }
  while (i < trimmed.length && /\s/.test(trimmed.charAt(i))) {
    i++;
  }
  const credentials = trimmed.slice(i);
  if (!credentials) {
    return null;
  }
  const decoded = Buffer.from(credentials, 'base64').toString('utf8');
  const colon = decoded.indexOf(':');
  if (colon < 0) {
    return null;
  }
  return { username: decoded.slice(0, colon), password: decoded.slice(colon + 1) };
}

function isOAuthError(result: unknown): result is OAuth2Error {
  return typeof result === 'object' && result !== null && 'error' in result;
}

// ---------------------------------------------------------------------------
// Consent + error pages (server-rendered, dark Quant style)
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pageShell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #000; color: #f5f5f5;
         font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .wrap { max-width: 520px; margin: 0 auto; padding: 40px 20px 64px; }
  .brand { font-size: 22px; font-weight: 700; letter-spacing: 0.5px; margin-bottom: 6px; }
  .brand span { color: #ff6a00; }
  h1 { font-size: 20px; font-weight: 600; margin: 18px 0 8px; }
  p { color: #b5b5b5; font-size: 14px; line-height: 1.55; margin: 8px 0; }
  .card { background: #0d0d0f; border: 1px solid #232326; border-radius: 14px;
          padding: 18px; margin: 18px 0; }
  .scope { padding: 12px 0; border-bottom: 1px solid #1b1b1e; }
  .scope:last-child { border-bottom: none; }
  .scope-head { display: flex; align-items: center; gap: 10px; }
  .scope-name { font-size: 14px; font-weight: 600; }
  .badge { font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 999px;
           letter-spacing: 0.3px; white-space: nowrap; }
  .badge.read { background: #14231a; color: #7fd79a; border: 1px solid #23402c; }
  .badge.write { background: #2b1c07; color: #f5a623; border: 1px solid #5a3c10; }
  .scope-desc { font-size: 13px; color: #b5b5b5; margin: 6px 0 4px; }
  .scope-risk { font-size: 12px; color: #8a8a8e; margin: 0; }
  .actions { display: flex; gap: 12px; margin-top: 22px; }
  button { flex: 1; font-size: 15px; font-weight: 600; padding: 13px 0;
           border-radius: 12px; cursor: pointer; border: none; }
  .approve { background: #ff6a00; color: #fff; }
  .approve:hover { background: #e65f00; }
  .deny { background: #17171a; color: #f5f5f5; border: 1px solid #2c2c30; }
  .deny:hover { background: #202024; }
  .meta { font-size: 12px; color: #77777b; margin-top: 18px; line-height: 1.6; }
  .error-title { color: #ff7a7a; }
</style>
</head>
<body>
<div class="wrap">
<div class="brand">Q<span>U</span>ANT</div>
${body}
</div>
</body>
</html>`;
}

function consentPage(
  clientName: string,
  displayName: string,
  scopes: string[],
  ttlSec: number,
  nonce: string,
): string {
  const catalog = new Map(SCOPE_CATALOG.map((s) => [s.name, s]));
  const scopeRows = scopes
    .map((name) => {
      const info = catalog.get(name);
      if (!info) {
        return '';
      }
      const badge = info.flagged
        ? '<span class="badge write">Can make changes</span>'
        : '<span class="badge read">Read only</span>';
      return `<div class="scope">
  <div class="scope-head"><span class="scope-name">${escapeHtml(info.displayName)}</span>${badge}</div>
  <p class="scope-desc">${escapeHtml(info.description)}</p>
  <p class="scope-risk">${escapeHtml(info.riskNote)}</p>
</div>`;
    })
    .join('\n');

  const hours = Math.round((ttlSec / 3600) * 10) / 10;
  const expiryCopy =
    hours === 1 ? 'This access token lasts 1 hour.' : `This access token lasts ${hours} hours.`;

  return pageShell(
    'Authorize access',
    `<h1>Allow ${escapeHtml(clientName)} to access your Quant account?</h1>
<p>Signed in as <strong style="color:#f5f5f5">${escapeHtml(displayName)}</strong>. ${escapeHtml(clientName)} is requesting the following capabilities. You connect once — Quanty then acts within exactly these scopes.</p>
<div class="card">
${scopeRows}
</div>
<form method="post" action="/oauth/authorize/decision">
<input type="hidden" name="nonce" value="${escapeHtml(nonce)}">
<div class="actions">
<button class="deny" type="submit" name="decision" value="deny">Deny</button>
<button class="approve" type="submit" name="decision" value="approve">Allow access</button>
</div>
</form>
<p class="meta">${expiryCopy} You can revoke this access at any time.<br>
Sending mail, payments, and other higher-risk actions still ask for your confirmation each time — this screen does not pre-approve them.</p>`,
  );
}

function errorPage(title: string, detail: string): string {
  return pageShell(
    title,
    `<h1 class="error-title">${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p>`,
  );
}

function signInRequiredPage(clientName: string): string {
  return pageShell(
    'Sign in required',
    `<h1>Sign in required</h1>
<p>${escapeHtml(clientName)} wants to connect to your Quant account, but you are not signed in. Sign in to Quant first, then start the connection again.</p>
<p class="meta">No account access was granted.</p>`,
  );
}
