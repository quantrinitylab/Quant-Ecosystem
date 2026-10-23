export interface RouteConfig {
  pattern: RegExp;
  methods: readonly string[];
}

export const ALLOWED_BACKEND_ROUTES: readonly RouteConfig[] = [
  {
    pattern: /^auth\/(?:password-reset(?:\/confirm)?|change-password)$/,
    methods: ['POST'],
  },
  // Email address ownership proof (6-digit SES code). Reached without a
  // session: the code IS the credential for the verify step.
  {
    pattern: /^auth\/(?:verify-email|resend-verification)$/,
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
  // Active Sessions tab (QM-SCREEN-016): real session list + revoke-others.
  // `revoke-others` is the destructive one; the backend step-up-guards it.
  { pattern: /^auth\/sessions$/, methods: ['GET'] },
  { pattern: /^auth\/sessions\/revoke-others$/, methods: ['POST'] },
  // Recovery-email verified lifecycle (fix/qm-recovery-channel-authz,
  // CODEX-REVIEW 6241280732 corrective on merged #1254): the settings UI
  // reaches these through the Next proxy — without rows here the proxy
  // answers 404 API_ROUTE_NOT_FOUND before the backend ever sees the
  // request (the #1254 GET/PUT shipped without them and were unreachable
  // through the default `/api` base URL). The backend step-up-guards all
  // three mutations; the proxy only needs to let them through.
  { pattern: /^auth\/account\/recovery-email$/, methods: ['GET', 'PUT'] },
  { pattern: /^auth\/account\/recovery-email\/verify$/, methods: ['POST'] },
  // Phone login/OTP REMOVED per the locked 2026-10-05 / 2026-10-11 SSO design
  // (OTP is email-based only: POST /auth/verify-email + /auth/resend-verification).
  // `backend/routes/phone.ts` (POST /auth/phone/send-otp, POST /auth/phone/verify,
  // GET/DELETE /auth/phone) was deleted and unmounted — there is intentionally NO
  // `auth/phone` entry here, so the catch-all proxy answers 404 API_ROUTE_NOT_FOUND.
  { pattern: /^email-signatures$/, methods: ['GET', 'POST'] },
  { pattern: /^email-signatures\/default$/, methods: ['GET'] },
  { pattern: /^email-signatures\/[^/]+$/, methods: ['PUT', 'DELETE'] },
  // Email templates (fix/qm-templates-unreachable). The backend CRUD lives at
  // backend/routes/email-templates.ts (registered under /email-templates in
  // app.ts) and the EmailTemplates picker calls it via this proxy — without
  // these rows the picker got a 404 from the proxy on every request.
  // ORDER MATTERS: the static `render` segment comes before the generic :id
  // row so `email-templates/:id/render` does not fall through to a GET/PUT/
  // DELETE match and 405 on its POST.
  { pattern: /^email-templates$/, methods: ['GET', 'POST'] },
  { pattern: /^email-templates\/[^/]+\/render$/, methods: ['POST'] },
  { pattern: /^email-templates\/[^/]+$/, methods: ['GET', 'PUT', 'DELETE'] },
  { pattern: /^vacation-responder$/, methods: ['GET', 'PUT'] },
  { pattern: /^vacation-responder\/(?:enable|disable)$/, methods: ['POST'] },
  // Follow-up reminders (fix/qm-followup-reminders). The EmailFollowUpReminder
  // picker calls these through the Next proxy — without these rows the proxy
  // answers 404 API_ROUTE_NOT_FOUND before the backend ever sees the request.
  { pattern: /^follow-up-reminders$/, methods: ['GET', 'POST'] },
  { pattern: /^follow-up-reminders\/[^/]+$/, methods: ['DELETE'] },
  // Contact groups. `/contacts` and `/contacts/:id` have their own route files;
  // these do not, because the pattern list is the cheaper place to add a resource
  // and every method below has an export at the bottom of this file.
  //
  // ORDER MATTERS: `find()` returns the first matching row, so the specific
  // static-segment entries below come BEFORE the generic `:id` entry. Otherwise
  // `contact-groups/join` falls through to `^contact-groups\/[^/]+$` and its
  // POST 405s — the exact P0 this block fixes (QM-SCREEN-012).
  // Contact-group membership and invite links. Every one of these has a real
  // backend export (backend/routes/contact-groups.ts). `invite` and `join`
  // are static segments, so they cannot collide with an `:id` here — but the
  // rows stay anchored anyway.
  { pattern: /^contact-groups\/[^/]+\/invite-link$/, methods: ['GET', 'POST', 'DELETE'] },
  { pattern: /^contact-groups\/[^/]+\/admins$/, methods: ['POST'] },
  { pattern: /^contact-groups\/[^/]+\/admins\/[^/]+$/, methods: ['DELETE'] },
  { pattern: /^contact-groups\/[^/]+\/members\/[^/]+$/, methods: ['DELETE'] },
  { pattern: /^contact-groups\/invite\/[^/]+$/, methods: ['GET'] },
  { pattern: /^contact-groups\/join$/, methods: ['POST'] },
  { pattern: /^contact-groups$/, methods: ['GET', 'POST'] },
  { pattern: /^contact-groups\/[^/]+$/, methods: ['GET', 'PUT', 'DELETE'] },
  { pattern: /^ai\/compose$/, methods: ['POST'] },
  { pattern: /^ai\/chat$/, methods: ['POST'] },
  { pattern: /^ai\/chat\/health$/, methods: ['GET'] },
  { pattern: /^repos(?:|(?:\/[^/]+)*)$/, methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
  // Git Smart HTTP transport (QM-SCREEN-013 P1). The backend advertises clone
  // URLs as /api/code/gitd/... and dual-registers gitTransportRoutes at both
  // /api/code/gitd and /code/gitd (modules/code/index.ts) because the staging
  // ingress strips /api and the Next proxy forwards without it. This row lets
  // the proxy path through; git needs GET (info/refs) and POST (upload-pack).
  { pattern: /^code\/gitd(?:\/(?:[^/]+))*$/, methods: ['GET', 'POST'] },
  { pattern: /^drive(?:|(?:\/[^/]+)*)$/, methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
  { pattern: /^documents(?:|(?:\/[^/]+)*)$/, methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
  // The Pipelines page. `backend/routes/ci.ts` implements six routes and its
  // header comment says it exists because the page "showed Failed to load" —
  // but three of its GETs were never allow-listed here, so this proxy answered
  // `API_ROUTE_NOT_FOUND` before the request left Next and Workflows and Recent
  // Builds still failed to load. The backend fix landed; the door stayed shut.
  { pattern: /^ci\/(?:workflows|builds)$/, methods: ['GET'] },
  { pattern: /^ci\/builds\/[^/]+$/, methods: ['GET'] },
  // Live CI build logs (P1 fix/qm-quantgit-ci-logs-allowlist). The action-detail
  // modal's <BuildTerminal> defaults to GET /api/ci/builds/:id/logs when no
  // streamUrl is passed, and backend/routes/ci-logs.ts registers exactly that
  // GET (SSE). Without this row the catch-all answered API_ROUTE_NOT_FOUND and
  // the Execution Logs panel could never stream — the same "door stayed shut"
  // class documented above. GET only: there is no POST/DELETE on this path.
  { pattern: /^ci\/builds\/[^/]+\/logs$/, methods: ['GET'] },
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
  // Host-owned link management (BookingLinksModal): the signed-in host lists
  // their links (GET), creates (POST), and deletes individual links (DELETE)
  // through the authenticated /booking/links prefix. The DELETE row is
  // id-addressed and DELETE-only — it can never serve a public read. The
  // invitee-facing read and the booking POST must use the /calendar/booking
  // duplicate: that prefix — and only that prefix — is in `publicPaths`
  // (backend/app.ts), so it is the only one a logged-out invitee can reach
  // without being 401'd by the auth hook.
  { pattern: /^booking\/links$/, methods: ['GET', 'POST'] },
  { pattern: /^booking\/links\/[^/]+$/, methods: ['DELETE'] },
  { pattern: /^calendar\/booking\/[^/]+$/, methods: ['GET'] },
  { pattern: /^calendar\/booking\/[^/]+\/slots$/, methods: ['GET'] },
  { pattern: /^calendar\/booking\/[^/]+\/book$/, methods: ['POST'] },
  // Slot lock (fix/qm-slot-lock-dead-surface-6): POST /calendar/booking/:slug/lock
  // existed in the backend but the Next.js catch-all proxy 404'd it — no
  // allow-list row admitted it, and no client called it, so the 409 race the
  // lock exists to prevent was unmitigated in the real booking flow. The
  // public booking page now locks the slot pre-confirm; this row lets that
  // proxied call through. Public-by-prefix like /book: the backend's
  // publicPaths admit /calendar/booking/* for logged-out invitees, so the
  // auth hook never 401s this guest call.
  { pattern: /^calendar\/booking\/[^/]+\/lock$/, methods: ['POST'] },

  // ── Mail filters ───────────────────────────────────────────────────────────
  // Mounted at /mail-filters, not /filters (backend/app.ts).
  { pattern: /^mail-filters(?:|(?:\/[^/]+)*)$/, methods: ['GET', 'POST', 'PUT', 'DELETE'] },

  // ── Operator search ────────────────────────────────────────────────────────
  // searchRoutes is registered with prefix '/search', so this is correct as
  // the sprint plan states it. The Next proxy deliberately does NOT expose
  // /search/parse (QM-UIUX-070): no web caller ever used it — the web search
  // UI posts to /emails/search and reads /search/all. The backend endpoint
  // itself stays; the Flutter client calls it directly on the backend.
  { pattern: /^search\/emails$/, methods: ['GET'] },
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
  // Open-tracking beacon (fix/qm-composer-open-tracking): the 1x1 image in
  // tracked outbound mail, fetched by the recipient's mail client with no
  // QuantMail session. GET-only; the backend route answers 200 + GIF for
  // unknown tokens too, so nothing about token validity leaks.
  { pattern: /^track\/open\/[^/]+$/, methods: ['GET'] },

  // ── Folders (Task R11) ─────────────────────────────────────────────────────
  // foldersRoutes registered with prefix '/folders' in backend/app.ts
  { pattern: /^folders$/, methods: ['GET', 'POST'] },
  { pattern: /^folders\/[^/]+$/, methods: ['PUT', 'DELETE'] },

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

  // ── Data lifecycle: export center (QM-BACK-006, QM-UIUX-091) ──────────────
  // dataLifecycleRoutes is registered at BOTH `/data-lifecycle` and
  // `/api/data-lifecycle` in backend/app.ts; the web client calls
  // `/api/data-lifecycle/*`, so this proxy sees `data-lifecycle/*`. The
  // backend export center was live with NO allow-list entry, so every call
  // 404'd here — the Account page had no way to reach it. Only the export
  // routes are exposed: the retention sweep and the operations read have no
  // web caller and stay backend-only. The `:id` GET row is anchored and
  // single-segment, so it cannot shadow the `/build` POST below it.
  { pattern: /^data-lifecycle\/exports$/, methods: ['GET', 'POST'] },
  { pattern: /^data-lifecycle\/exports\/[^/]+$/, methods: ['GET'] },
  { pattern: /^data-lifecycle\/exports\/[^/]+\/build$/, methods: ['POST'] },

  // ── Admin console (restructure Phase 1 pilot) ──────────────────────────────
  // adminRoutes is mounted at both `/admin` and `/api/admin` (backend/app.ts).
  // The web client calls `/api/admin/*`, so this proxy sees `admin/*`. Without
  // these four read-only, staff-gated KPI GETs the proxy returned
  // API_ROUTE_NOT_FOUND and every card in src/app/admin/page.tsx read
  // "Unavailable" even though the backend and the AdminGuard were both in place.
  // Anchored + enumerated on purpose: this opens exactly the four KPI reads, not
  // a blanket `admin/*` door — any other admin path still 404s here.
  {
    pattern: /^admin\/(?:accounts\/count|sessions\/active|storage\/summary|mail\/deliverability)$/,
    methods: ['GET'],
  },

  // ── Admin console: K9 (M19 Admin Domains + M20 DLP/Audit) ──────────────────
  // Staff-gated on the backend (401/403 enforced there); the proxy stays an
  // enumerated list — no blanket `admin/*` door. Organization scope travels as
  // `?organizationId=` on GETs; DELETE takes `{ organizationId }` in the JSON
  // body (Next only forwards search params for GET requests).
  { pattern: /^admin\/organizations$/, methods: ['GET'] },
  { pattern: /^admin\/mail\/domains$/, methods: ['GET', 'POST'] },
  { pattern: /^admin\/mail\/domains\/[^/]+\/verify$/, methods: ['POST'] },
  { pattern: /^admin\/mail\/domains\/[^/]+$/, methods: ['DELETE'] },
  { pattern: /^admin\/mail\/dlp\/policies$/, methods: ['GET'] },
  { pattern: /^admin\/audit\/logs$/, methods: ['GET'] },

  { pattern: /^threads(?:|(?:\/[^/]+)*)$/, methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
  { pattern: /^emails(?:|(?:\/[^/]+)*)$/, methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
  { pattern: /^labels(?:|(?:\/[^/]+)*)$/, methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
];

export const SUPPORTED_PROXY_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
