import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '../_lib/proxy';

export const dynamic = 'force-dynamic';

const ALLOWED_BACKEND_ROUTES: Array<{ pattern: RegExp; methods: readonly string[] }> = [
  {
    pattern: /^auth\/(?:password-reset(?:\/confirm)?|change-password|2fa\/(?:setup|enable))$/,
    methods: ['POST'],
  },
  { pattern: /^auth\/phone$/, methods: ['GET', 'DELETE'] },
  { pattern: /^auth\/phone\/(?:send-otp|verify)$/, methods: ['POST'] },
  { pattern: /^email-signatures$/, methods: ['GET', 'POST'] },
  { pattern: /^email-signatures\/default$/, methods: ['GET'] },
  { pattern: /^email-signatures\/[^/]+$/, methods: ['PUT', 'DELETE'] },
  { pattern: /^vacation-responder$/, methods: ['GET', 'PUT'] },
  { pattern: /^vacation-responder\/(?:enable|disable)$/, methods: ['POST'] },
  { pattern: /^ai\/compose$/, methods: ['POST'] },
  { pattern: /^ai\/chat$/, methods: ['POST'] },
  { pattern: /^ai\/chat\/health$/, methods: ['GET'] },
  { pattern: /^repos\/[^/]+\/(?:branches|commits|tree|file)$/, methods: ['GET'] },
  { pattern: /^ci\/(?:workflows\/[^/]+\/trigger|builds\/[^/]+\/cancel)$/, methods: ['POST'] },
  { pattern: /^ci\/deployments$/, methods: ['GET', 'POST'] },
  { pattern: /^calendars$/, methods: ['GET'] },
  { pattern: /^events$/, methods: ['GET', 'POST'] },
  { pattern: /^events\/(?:today|upcoming)$/, methods: ['GET'] },
  { pattern: /^events\/[^/]+$/, methods: ['PUT', 'DELETE'] },
  { pattern: /^workspaces$/, methods: ['GET', 'POST'] },
  { pattern: /^workspaces\/[^/]+$/, methods: ['GET', 'PATCH', 'DELETE'] },
  { pattern: /^workspaces\/[^/]+\/members$/, methods: ['GET'] },
  { pattern: /^workspaces\/[^/]+\/members\/[^/]+$/, methods: ['PATCH', 'DELETE'] },
  { pattern: /^workspaces\/[^/]+\/leave$/, methods: ['POST'] },
  { pattern: /^workspaces\/[^/]+\/invites$/, methods: ['GET', 'POST'] },
  { pattern: /^workspaces\/[^/]+\/invites\/[^/]+$/, methods: ['DELETE'] },
  { pattern: /^workspaces\/[^/]+\/invites\/[^/]+\/resend$/, methods: ['POST'] },
  { pattern: /^public\/invites\/[^/]+$/, methods: ['GET'] },
  { pattern: /^invites\/[^/]+\/accept$/, methods: ['POST'] },
  { pattern: /^webhook\/inbound$/, methods: ['POST'] },
];

const handle = async (
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) => {
  const { path } = await params;
  const decodedPath = path.join('/');
  const route = ALLOWED_BACKEND_ROUTES.find(({ pattern }) => pattern.test(decodedPath));
  if (!route) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'API_ROUTE_NOT_FOUND', message: 'API route not found.', statusCode: 404 },
      },
      { status: 404, headers: { 'cache-control': 'no-store' } },
    );
  }
  if (!route.methods.includes(request.method)) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.', statusCode: 405 },
      },
      {
        status: 405,
        headers: { 'cache-control': 'no-store', allow: route.methods.join(', ') },
      },
    );
  }

  const backendPath = `/${path.map((segment) => encodeURIComponent(segment)).join('/')}`;
  return proxyToBackend(request, backendPath);
};

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
