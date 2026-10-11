import { createSsoCallbackHandler } from '@quant/api-client/sso-routes';

// GET /api/auth/sso/callback — Contract A: QuantMail OAuth2 authorization-code
// + PKCE. The browser lands here with ?code=&state= after QuantMail consent;
// the code is exchanged server-side (back-channel), the access token is
// verified via userinfo, and the session is minted as httpOnly + Secure +
// SameSite=Lax cookies. No tokens ever touch the URL or JavaScript.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = createSsoCallbackHandler({ clientId: 'quantgram', loginPath: '/login' });
