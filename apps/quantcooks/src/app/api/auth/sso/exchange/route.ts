// ============================================================================
// QuantCooks — POST /api/auth/sso/exchange
//
// DEPRECATED ALIAS: this path previously accepted a QuantMail-issued JWT
// ({ ssoToken }) carried in ?token= URLs and verified it via userinfo. That
// contract is retired — QuantMail's /sso chooser now hands back single-use
// TICKETS (?sso_ticket=, NOT tokens), verified back-channel via
// POST https://quantmail.in/api/oauth/sso-ticket/verify (Contract B).
//
// This route now delegates to the shared ticket handler, so any client still
// hitting the old path gets the new contract (and the old { ssoToken } shape
// is rejected with 400). New code should use /api/auth/sso/ticket.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server';
import { createSsoTicketHandler } from '@quant/api-client/sso-routes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ticketHandler = createSsoTicketHandler();

export async function POST(request: NextRequest): Promise<NextResponse> {
  return ticketHandler(request);
}
