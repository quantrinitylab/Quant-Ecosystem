// ============================================================================
// APNs Client - Lightweight HTTP/2-based Apple Push Notification service client
// Replaces @parse/node-apn to eliminate vulnerable node-forge dependency.
// Uses Node.js built-in http2 module (no third-party crypto dependencies).
// ============================================================================

import * as http2 from 'node:http2';
import * as jwt from 'node:crypto';

/** APNs provider configuration using token-based authentication */
export interface ApnsProviderOptions {
  token: {
    key: string;
    keyId: string;
    teamId: string;
  };
  production?: boolean;
}

/** APNs notification payload */
export interface ApnsNotification {
  alert?: { title?: string; body?: string } | string;
  badge?: number;
  sound?: string;
  topic?: string;
  payload?: Record<string, unknown>;
}

/** Result of an APNs send attempt */
export interface ApnsSendResult {
  sent: Array<{ device: string }>;
  failed: Array<{ device: string; response?: { reason: string } }>;
}

/** Maximum token age before regeneration (50 minutes; Apple allows up to 60) */
const TOKEN_CACHE_DURATION_MS = 50 * 60 * 1000;

/**
 * Lightweight APNs provider using HTTP/2 and token-based (JWT) auth.
 * This is a minimal implementation for sending push notifications
 * without depending on node-forge or other vulnerable packages.
 *
 * NOTE: The token key MUST be an EC P-256 private key in PEM format.
 * Using any other key type will produce invalid signatures.
 */
export class ApnsProvider {
  private options: ApnsProviderOptions;
  private session: http2.ClientHttp2Session | null = null;
  private host: string;
  private cachedToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(options: ApnsProviderOptions) {
    this.options = options;
    this.host = options.production
      ? 'https://api.push.apple.com'
      : 'https://api.sandbox.push.apple.com';
  }

  /**
   * Generate a short-lived JWT for APNs token-based authentication.
   * Tokens are cached and reused for up to 50 minutes.
   * Uses ieee-p1363 signature encoding as required by Apple's ES256 verification.
   */
  private generateAuthToken(): string {
    const now = Date.now();
    if (this.cachedToken && now < this.tokenExpiry) {
      return this.cachedToken;
    }

    const header = Buffer.from(
      JSON.stringify({ alg: 'ES256', kid: this.options.token.keyId }),
    ).toString('base64url');

    const iat = Math.floor(now / 1000);
    const claims = Buffer.from(JSON.stringify({ iss: this.options.token.teamId, iat })).toString(
      'base64url',
    );

    const signingInput = `${header}.${claims}`;
    const sign = jwt.createSign('SHA256');
    sign.update(signingInput);
    const signature = sign.sign(
      { key: this.options.token.key, dsaEncoding: 'ieee-p1363' },
      'base64url',
    );

    const token = `${signingInput}.${signature}`;
    this.cachedToken = token;
    this.tokenExpiry = now + TOKEN_CACHE_DURATION_MS;
    return token;
  }

  /**
   * Send a notification to a single device token
   */
  async send(notification: ApnsNotification, deviceToken: string): Promise<ApnsSendResult> {
    try {
      if (!this.session || this.session.closed || this.session.destroyed) {
        this.session = http2.connect(this.host);
        this.session.on('error', () => {
          // Silently handle connection errors
        });
      }

      const token = this.generateAuthToken();
      const payload = JSON.stringify({
        aps: {
          alert: notification.alert,
          badge: notification.badge,
          sound: notification.sound ?? 'default',
        },
        ...notification.payload,
      });

      const headers: http2.OutgoingHttpHeaders = {
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        authorization: `bearer ${token}`,
        'apns-topic': notification.topic ?? 'com.quant.app',
        'content-type': 'application/json',
      };

      return await new Promise<ApnsSendResult>((resolve) => {
        const req = this.session!.request(headers);
        let responseData = '';
        let statusCode = 200;

        req.on('response', (resHeaders) => {
          statusCode = resHeaders[':status'] as number;
        });

        req.on('data', (chunk: Buffer) => {
          responseData += chunk.toString();
        });

        req.on('end', () => {
          if (statusCode === 200) {
            resolve({ sent: [{ device: deviceToken }], failed: [] });
          } else {
            let reason = 'Unknown';
            try {
              const parsed = JSON.parse(responseData);
              reason = parsed.reason ?? 'Unknown';
            } catch {
              // Use default reason
            }
            resolve({
              sent: [],
              failed: [{ device: deviceToken, response: { reason } }],
            });
          }
        });

        req.on('error', (err: Error) => {
          resolve({
            sent: [],
            failed: [{ device: deviceToken, response: { reason: err.message } }],
          });
        });

        req.write(payload);
        req.end();
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return {
        sent: [],
        failed: [{ device: deviceToken, response: { reason: message } }],
      };
    }
  }

  /**
   * Close the HTTP/2 session and release resources
   */
  shutdown(): void {
    if (this.session && !this.session.closed) {
      this.session.close();
    }
    this.session = null;
  }
}

/**
 * APNs Notification builder (replaces apn.Notification from @parse/node-apn)
 */
export class ApnsNotificationBuilder implements ApnsNotification {
  alert?: { title?: string; body?: string } | string;
  badge?: number;
  sound?: string;
  topic?: string;
  payload?: Record<string, unknown>;
}
