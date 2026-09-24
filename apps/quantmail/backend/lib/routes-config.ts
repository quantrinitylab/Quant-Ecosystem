export interface RouteConfig {
  pattern: RegExp;
  methods: readonly string[];
}

export const ALLOWED_BACKEND_ROUTES: readonly RouteConfig[] = [
  // ── QuantCode & Git Plane (B3 Unblock: 30 endpoints) ──────────────────────
  {
    pattern: /^(?:api\/)?code(?:|(?:\/[^/]+)*)$/,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  },
  {
    pattern: /^(?:api\/)?code\/gitd(?:|(?:\/[^/]+)*)$/,
    methods: ['GET', 'POST'],
  },
  // ── AI V1 Surface (B3 Unblock: 20 endpoints) ──────────────────────────────
  {
    pattern: /^(?:api\/)?v1(?:|(?:\/[^/]+)*)$/,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  },

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
  // Default signature toggle for specific signature ID (B3 unblock)
  { pattern: /^email-signatures\/[^/]+\/default$/, methods: ['POST'] },
  { pattern: /^vacation-responder$/, methods: ['GET', 'PUT'] },
  { pattern: /^vacation-responder\/(?:enable|disable)$/, methods: ['POST'] },

  // Contacts & Contact groups
  { pattern: /^(?:api\/)?contacts(?:|(?:\/[^/]+)*)$/, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
  { pattern: /^contact-groups$/, methods: ['GET', 'POST'] },
  { pattern: /^contact-groups\/[^/]+$/, methods: ['GET', 'PUT', 'DELETE'] },

  { pattern: /^ai\/compose$/, methods: ['POST'] },
  { pattern: /^ai\/chat$/, methods: ['POST'] },
  { pattern: /^ai\/chat\/health$/, methods: ['GET'] },
  { pattern: /^repos(?:|(?:\/[^/]+)*)$/, methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
  { pattern: /^drive(?:|(?:\/[^/]+)*)$/, methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
  { pattern: /^documents(?:|(?:\/[^/]+)*)$/, methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
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
  // ── Calendar ───────────────────────────────────────────────────────────────
  // `calendarRoutes` is registered with NO prefix in backend/app.ts, so every
  // path below is top-level. The mutation verb on a calendar is PUT: calendar.ts
  // registers PUT and DELETE on /calendars/:id and never PATCH. Listing PATCH
  // here would open this proxy onto a Fastify 404 — the same class of failure as
  // the CI GETs and the PATCH-without-export documented at the bottom of this file.
  { pattern: /^calendars$/, methods: ['GET', 'POST'] },
  { pattern: /^calendars\/[^/]+$/, methods: ['PUT', 'DELETE'] },
  { pattern: /^calendars\/[^/]+\/primary$/, methods: ['POST'] },

  { pattern: /^events$/, methods: ['GET', 'POST'] },
  { pattern: /^events\/(?:today|upcoming|free-busy)$/, methods: ['GET'] },
  { pattern: /^events\/alarms\/due$/, methods: ['GET'] },
  { pattern: /^events\/alerts\/scheduled$/, methods: ['GET'] },
  // GET and PATCH added: calendar.ts registers GET /events/:id and both PUT and
  // PATCH for updates. The UI's inline edit uses PATCH and could only ever 404.
  { pattern: /^events\/[^/]+$/, methods: ['GET', 'PUT', 'PATCH', 'DELETE'] },
  // Its own row. The entry above is single-segment and anchored, so it cannot
  // match a nested path no matter which methods are listed on it.
  { pattern: /^events\/[^/]+\/rsvp$/, methods: ['POST'] },
  { pattern: /^events\/[^/]+\/(?:ics|invite\.ics|cancel\.ics)$/, methods: ['GET'] },

  // ── Booking links ──────────────────────────────────────────────────────────
  // Creating a link is authenticated. The invitee-facing read and the booking
  // POST must use the /calendar/booking duplicate: that prefix — and only that
  // prefix — is in `publicPaths` (backend/app.ts), so it is the only one a
  // logged-out invitee can reach without being 401'd by the auth hook.
  { pattern: /^booking\/links$/, methods: ['POST'] },
  { pattern: /^calendar\/booking\/[^/]+$/, methods: ['GET'] },
  { pattern: /^calendar\/booking\/[^/]+\/slots$/, methods: ['GET'] },
  { pattern: /^calendar\/booking\/[^/]+\/book$/, methods: ['POST'] },

  // ── Mail filters ───────────────────────────────────────────────────────────
  // Mounted at /mail-filters, not /filters (backend/app.ts).
  { pattern: /^mail-filters(?:|(?:\/[^/]+)*)$/, methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },

  // ── Operator search ────────────────────────────────────────────────────────
  // searchRoutes is registered with prefix '/search', so these are correct as
  // the sprint plan states them. /search/parse powers the query chips.
  { pattern: /^search\/emails$/, methods: ['GET'] },
  { pattern: /^search\/parse$/, methods: ['GET'] },
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

  // ── Folders (Task R11) ─────────────────────────────────────────────────────
  // foldersRoutes registered with prefix '/folders' in backend/app.ts
  { pattern: /^folders$/, methods: ['GET', 'POST'] },
  { pattern: /^folders\/[^/]+$/, methods: ['PUT', 'DELETE', 'PATCH'] },

  // ── Attachments (Task R11) ─────────────────────────────────────────────────
  // attachmentRoutes registered with prefix '/attachments' in backend/app.ts
  { pattern: /^attachments\/upload-url$/, methods: ['POST'] },
  { pattern: /^attachments\/[^/]+$/, methods: ['GET', 'DELETE'] },
  { pattern: /^attachments\/[^/]+\/download$/, methods: ['GET'] },
  { pattern: /^attachments\/[^/]+\/finalize$/, methods: ['POST'] },
  { pattern: /^attachments\/[^/]+\/download-url$/, methods: ['GET'] },

  // ── Settings Tokens / PATs (Task R11) ──────────────────────────────────────
  // settingsTokenRoutes registered with NO prefix in backend/app.ts
  { pattern: /^settings\/tokens$/, methods: ['GET', 'POST'] },
  { pattern: /^settings\/tokens\/[^/]+$/, methods: ['DELETE'] },

  { pattern: /^threads(?:|(?:\/[^/]+)*)$/, methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
  { pattern: /^emails(?:|(?:\/[^/]+)*)$/, methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
  { pattern: /^labels(?:|(?:\/[^/]+)*)$/, methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },

  // ── Templates, Deliverability, Audit Logs & Retention (Post-Wave 25 Unblock)
  { pattern: /^(?:api\/)?(?:email-)?templates(?:|(?:\/[^/]+)*)$/, methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
  { pattern: /^(?:api\/)?deliverability(?:|(?:\/[^/]+)*)$/, methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
  { pattern: /^(?:api\/)?audit-logs(?:|(?:\/[^/]+)*)$/, methods: ['GET', 'POST', 'PUT', 'DELETE'] },
  { pattern: /^(?:api\/)?retention(?:|(?:\/[^/]+)*)$/, methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
  { pattern: /^(?:api\/)?notifications(?:|(?:\/[^/]+)*)$/, methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
  { pattern: /^(?:api\/)?e2ee(?:|(?:\/[^/]+)*)$/, methods: ['GET', 'POST'] },
  { pattern: /^(?:api\/)?federation(?:|(?:\/[^/]+)*)$/, methods: ['GET', 'POST'] },
];

export const SUPPORTED_PROXY_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

export interface RouteMatchResult {
  matched: boolean;
  route?: RouteConfig;
  allowedMethods: string[];
}

/**
 * Longest-prefix / specificity-based route matching over the allowlist table.
 * Replaces naive ordered .find() to eliminate route shadowing and unblock nested endpoints.
 */
export function matchRoute(path: string, method?: string): RouteMatchResult {
  const cleanPath = path.replace(/^\/+/, '').replace(/\/+$/, '');
  const pathWithoutApi = cleanPath.replace(/^api\//, '');
  const pathWithApi = `api/${pathWithoutApi}`;

  const matches: { route: RouteConfig; specificity: number }[] = [];

  for (const route of ALLOWED_BACKEND_ROUTES) {
    const isMatch =
      route.pattern.test(cleanPath) ||
      route.pattern.test(pathWithoutApi) ||
      route.pattern.test(pathWithApi);

    if (isMatch) {
      // Calculate specificity score: longer regex source gives higher priority
      const specificity = route.pattern.source.length;
      matches.push({ route, specificity });
    }
  }

  if (matches.length === 0) {
    return { matched: false, allowedMethods: [] };
  }

  // Sort descending by specificity
  matches.sort((a, b) => b.specificity - a.specificity);

  // Collect the union of all allowed methods across all matching candidates for this path
  const allAllowedMethods = Array.from(
    new Set(matches.flatMap((m) => m.route.methods)),
  );

  // If a specific HTTP method is requested, find the most specific rule that permits it
  const exactMethodMatch = method
    ? matches.find((m) => m.route.methods.includes(method))
    : matches[0];

  const bestRoute = exactMethodMatch ? exactMethodMatch.route : matches[0].route;

  return {
    matched: true,
    route: bestRoute,
    allowedMethods: allAllowedMethods,
  };
}
