import { createPasswordResetHandler } from '@quant/api-client/sso-routes';

// POST /api/auth/password-reset/request — Contract C: proxy a forgot-password
// request to QuantMail, which emails the reset link to the user's QuantMail
// inbox (always 200, no account enumeration).
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = createPasswordResetHandler();
