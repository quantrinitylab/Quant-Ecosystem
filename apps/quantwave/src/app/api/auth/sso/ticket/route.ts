import { createSsoTicketHandler } from '@quant/api-client/sso-routes';

// POST /api/auth/sso/ticket — Contract B: verify a single-use QuantMail /sso
// chooser ticket back-channel and mint an app session (HMAC-signed identity
// cookie). The ticket is NOT a token; the provider returns identity only.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = createSsoTicketHandler();
