# Authentication Guide

Quant uses a multi-layered authentication system designed for security and convenience.

## Password-Based Authentication

Your passphrase is used to derive your master encryption key via Argon2id. Choose a strong passphrase (minimum 12 characters recommended).

## Two-Factor Authentication (2FA)

### TOTP (Time-Based One-Time Passwords)

1. Go to Settings > Security > Two-Factor Authentication
2. Scan the QR code with your authenticator app (Google Authenticator, Authy, 1Password)
3. Enter the verification code to confirm
4. Save your backup codes in a secure location

### Hardware Security Keys

Quant supports FIDO2/WebAuthn hardware keys:

- YubiKey 5 series
- Google Titan Security Key
- SoloKeys
- Any FIDO2-compatible key

Setup:

1. Go to Settings > Security > Hardware Keys
2. Click "Add Security Key"
3. Insert and tap your hardware key
4. Name your key for identification

## Single Sign-On (SSO)

### SAML 2.0 (Enterprise)

Configure SAML SSO for your organization:

1. Go to Admin > Authentication > SAML
2. Enter your IdP metadata URL
3. Configure attribute mappings
4. Test the connection
5. Enable for your organization

Supported IdPs:

- Okta
- Azure AD
- OneLogin
- Google Workspace
- PingIdentity
- Custom SAML 2.0

### OAuth 2.0 / OIDC

For custom integrations, Quant acts as an OAuth 2.0 provider:

```
Authorization endpoint: https://auth.quant.app/oauth/authorize
Token endpoint: https://auth.quant.app/oauth/token
UserInfo endpoint: https://auth.quant.app/oauth/userinfo
```

## API Authentication

### Personal Access Tokens

Generate tokens at Settings > Developer > API Tokens:

```bash
curl -H "Authorization: Bearer qt_live_abc123..." \
  https://api.quant.app/v1/mail/messages
```

### OAuth 2.0 for Apps

For third-party app integrations, use OAuth 2.0 with PKCE:

```typescript
const authUrl = new URL('https://auth.quant.app/oauth/authorize');
authUrl.searchParams.set('client_id', 'your-client-id');
authUrl.searchParams.set('redirect_uri', 'your-redirect-uri');
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('code_challenge', codeChallenge);
authUrl.searchParams.set('code_challenge_method', 'S256');
```

## Session Management

- Sessions expire after 30 days of inactivity
- Active sessions shown in Settings > Security > Sessions
- Revoke individual sessions or all sessions at once
- Device trust for recognized devices (skip 2FA)

## Recovery

If you lose access to your account:

1. Use your recovery key to restore access
2. Recovery key decrypts your master key
3. Set a new passphrase after recovery
4. Re-register 2FA methods

> **Warning**: Without your recovery key and passphrase, account recovery is impossible due to zero-knowledge encryption.
