import { createSessionHandler } from '@quant/api-client/sso-routes';

// GET /api/auth/session — session status derived ONLY from httpOnly cookies:
// the OAuth access cookie (verified live via userinfo, self-healing through
// the refresh cookie) or the signed ticket-identity cookie. 401 when neither
// verifies. Never returns tokens.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = createSessionHandler({ clientId: 'quantcooks' });
