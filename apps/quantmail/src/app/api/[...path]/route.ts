import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '../_lib/proxy';

export const dynamic = 'force-dynamic';

const ALLOWED_BACKEND_ROUTES: Array<{ pattern: RegExp; methods: readonly string[] }> = [
  {
    pattern: /^auth\/(?:password-reset(?:\/confirm)?|change-password)$/,
    methods: ['POST'],
  },
  // The only mutable field on an identity. `email` and `username` are not
  // editable anywhere, so there is no PUT here to advertise.
  { pattern: /^auth\/profile$/, methods: ['PATCH'] },
  // Second factor. `verify` completes a login and is reached without a token;
  // the rest carry the caller's access token through to the backend, which is
  // what actually authorises them.
  {
    pattern: /^auth\/2fa\/(?:setup|enable|verify|disable|backup-codes)$/,
    methods: ['POST'],
  },
  { pattern: /^auth\/2fa\/status$/, methods: ['GET'] },
  { pattern: /^auth\/phone$/, methods: ['GET', 'DELETE'] },
  { pattern: /^auth\/phone\/(?:send-otp|verify)$/, methods: ['POST'] },
  { pattern: /^email-signatures$/, methods: ['GET', 'POST'] },
  { pattern: /^email-signatures\/default$/, methods: ['GET'] },
  { pattern: /^email-signatures\/[^/]+$/, methods: ['PUT', 'DELETE'] },
  { pattern: /^vacation-responder$/, methods: ['GET', 'PUT'] },
  { pattern: /^vacation-responder\/(?:enable|disable)$/, methods: ['POST'] },
  // Contact groups. `/contacts` and `/contacts/:id` have their own route files;
  // these do not, because the pattern list is the cheaper place to add a resource
  // and every method below has an export at the bottom of this file.
  { pattern: /^contact-groups$/, methods: ['GET', 'POST'] },
  { pattern: /^contact-groups\/[^/]+$/, methods: ['GET', 'PUT', 'DELETE'] },
  { pattern: /^ai\/compose$/, methods: ['POST'] },
  { pattern: /^ai\/chat$/, methods: ['POST'] },
  { pattern: /^ai\/chat\/health$/, methods: ['GET'] },
  { pattern: /^repos\/[^/]+\/(?:branches|commits|tree|file)$/, methods: ['GET'] },
  // The Pipelines page. `backend/routes/ci.ts` implements six routes and its
  // header comment says it exists because the page "showed Failed to load" —
  // but three of its GETs were never allow-listed here, so this proxy answered
  // `API_ROUTE_NOT_FOUND` before the request left Next and Workflows and Recent
  // Builds still failed to load. The backend fix landed; the door stayed shut.
  { pattern: /^ci\/(?:workflows|builds)$/, methods: ['GET'] },
  { pattern: /^ci\/builds\/[^/]+$/, methods: ['GET'] },
  { pattern: /^ci\/(?:workflows\/[^/]+\/trigger|builds\/[^/]+\/cancel)$/, methods: ['POST'] },
  // GET only. There is no `POST /ci/deployments` in the backend and the one
  // client for it, `apiClient.deploy`, has no callers — so listing POST was
  // precisely the route-that-advertises-itself this file's closing note warns
  // about, one layer further out.
  { pattern: /^ci\/deployments$/, methods: ['GET'] },
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
  { pattern: /^threads(?:|(?:\/[^/]+)*)$/, methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
  { pattern: /^emails(?:|(?:\/[^/]+)*)$/, methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
  { pattern: /^labels(?:|(?:\/[^/]+)*)$/, methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
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

// One handler, one export per method. The App Router 405s a method that has no
// export, *before* the allow-list above is consulted — so a `methods: ['PATCH']`
// entry without a `PATCH` export is a route that advertises itself and cannot be
// called. That is what shipped: `workspaces/:id`, its member rows, `threads`,
// `emails` and `labels` all listed PATCH while the Save button behind
// `updateWorkspace()` could only ever get a 405 back.
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
