# Quanty MCP Connector Architecture

**Status:** Architecture design (no code yet) · **Date:** 2026-10-06 · **Author:** Muse (agentic deep-dive)

**Purpose:** Let Quanty act on the user's REAL external accounts (Gmail, GitHub, Google Calendar, Notion, …) — not just Quant apps — through the [Model Context Protocol](https://modelcontextprotocol.io/) (MCP, spec `2025-11-25`, now under the Agentic AI Foundation).

---

## 1. MCP Server Survey

### 1.1 What MCP is (30-second version)

MCP is "USB-C for AI": a JSON-RPC 2.0 protocol where a **host** (our backend) runs an **MCP client** that connects to **MCP servers**. Servers expose **tools** (model-invoked functions), **resources** (read-only data), and **prompts**. Two live transports: **stdio** (local subprocess, fastest, no network) and **Streamable HTTP** (remote, OAuth 2.1, session via `Mcp-Session-Id` header). The old HTTP+SSE transport is deprecated since spec 2025-03-26. Ecosystem: ~10–30K servers (Dec 2025–Sep 2026).

### 1.2 Recommended servers for Quanty

| Provider | Server | Transport | Auth | Tools (headline) | Verdict |
|---|---|---|---|---|---|
| **Gmail** | Google official remote: `https://gmailmcp.googleapis.com/mcp/v1` | Streamable HTTP | OAuth 2.0 (user grant) | search/read/send, drafts | ✅ **Use official.** Note: Developer Preview is read-mostly (drafts-only send) pending GA |
| **Google Calendar** | Google official remote: `https://calendarmcp.googleapis.com/mcp/v1` | Streamable HTTP | OAuth 2.0 | list/create/update/delete events | ✅ **Use official.** Preview is read-only; write comes at GA |
| **Google Drive** | Google official remote: `https://drivemcp.googleapis.com/mcp/v1` | Streamable HTTP | OAuth 2.0 | search/read files | ✅ **Use official.** No edit/delete in preview |
| **GitHub** | GitHub official remote: `https://api.githubcopilot.com/mcp/` | Streamable HTTP | PAT (`Authorization: Bearer`) or GitHub App | 100+ tools: repos, issues, PRs, Actions, code search, security alerts | ✅ **Use official** (`github/github-mcp-server`, also as `ghcr.io/github/github-mcp-server` docker). **MUST** scope token + toolset (see §4) |
| **Notion** | `@notionhq/notion-mcp-server` (official) | stdio (npx) | Notion internal integration token | read/write pages, databases, blocks | ✅ Use official; token is per-workspace, user pastes it |
| **Slack** | `@modelcontextprotocol/server-slack` | stdio | Bot token + team ID | post/read channels | 🟡 Phase 2 (nice-to-have) |
| **Linear** | Linear official MCP | Streamable HTTP | API key | issues, projects | 🟡 Phase 2 |
| **Brave Search** | `@modelcontextprotocol/server-brave-search` | stdio | API key | web search | 🟡 Phase 2 (QuantAI already has search; dedupe) |

**Key decision: prefer official remote (Streamable HTTP) servers over community stdio ones** wherever they exist (Google, GitHub). Reasons: no subprocess lifecycle to manage on the server, vendor-maintained tool schemas, OAuth 2.1 built in, and the user's own cloud already runs 24/7. Community stdio servers (`npx …`) are the fallback for providers with no official remote (Notion, Slack).

### 1.3 Auth summary per provider

| Provider | Flow | Scopes / token shape | Refresh |
|---|---|---|---|
| Google (Gmail/Cal/Drive) | OAuth 2.0 authorization-code, one shared Google Cloud client for all three | `gmail.readonly gmail.compose`, `drive.readonly drive.file`, `calendar.events.readonly` (+ write scopes at GA) | Refresh token stored encrypted; access tokens ~1h |
| GitHub | PAT (fine-grained) today; GitHub App OAuth later | Fine-grained PAT scoped to specific repos, **read-only** by default | PAT rotation manual; App gives refresh |
| Notion | Internal integration token (user pastes from notion.so/my-integrations) | Workspace-scoped by Notion | No refresh needed |
| Slack | Bot OAuth | `channels:read chat:write` | Refresh token |

---

## 2. Integration Layer Design

### 2.1 Where it lives

```
apps/quantmail/backend/services/quanty-agent/
├── tool-registry.ts          # existing: native Quanty tools (mail/git/…)
├── tools/
│   ├── mail-tools.ts         # existing (PR #480)
│   └── git-tools.ts          # existing (PR #481)
└── mcp/                      # ← NEW
    ├── types.ts              # McpConnection, McpToolDescriptor, McpServerDef
    ├── server-catalog.ts     # curated registry of approved servers (§1.2)
    ├── client-manager.ts     # lifecycle: connect/discover/cache/disconnect
    ├── tool-adapter.ts       # MCP tool → AITool adapter (namespacing, schema mapping)
    ├── oauth.ts              # OAuth dance: authorize URL, callback, token exchange/refresh
    ├── connection-store.ts   # encrypted persistence of connections + tokens
    └── routes/
        └── mcp.ts            # REST: list/connect/disconnect/test connections
```

**Why inside `quanty-agent/`:** MCP tools must register into the same `ToolRegistry` (`packages/ai/src/assistant/tool-registry.ts`) as native tools so the planner sees one unified tool list. The adapter (§2.3) makes an MCP tool indistinguishable from a native `AITool` at the planner/executor level.

### 2.2 Component diagram

```
┌──────────────────────────── USER ────────────────────────────┐
│  "mere Gmail ke unread dikhao"                                │
└──────────────────────┬────────────────────────────────────────┘
                       │ POST /api/quanty/tasks
┌──────────────────────▼────────────────────────────────────────┐
│  QUANTY AGENT CORE (existing)                                 │
│  planner.ts → QuantyStep[]  │  executor.ts → runs steps        │
└──────────────────────┬────────────────────────────────────────┘
                       │ registry.findTool(app, name)
┌──────────────────────▼────────────────────────────────────────┐
│  ToolRegistry (packages/ai)                                   │
│  ┌──────────────┐  ┌──────────────────────────────────────┐   │
│  │ NATIVE tools │  │ MCP tools (via tool-adapter.ts)      │   │
│  │ mail/git/…   │  │ mcp.gmail.search_emails              │   │
│  │ local impl   │  │ mcp.github.list_pull_requests        │   │
│  └──────────────┘  └──────────────┬───────────────────────┘   │
└──────────────────────────────────┼───────────────────────────┘
                                   │ client-manager.getClient(connId)
┌──────────────────────────────────▼───────────────────────────┐
│  MCP CLIENT MANAGER                                           │
│  connection pool (userId → provider → client)                 │
│  transport: Streamable HTTP (remote) │ stdio (local fallback) │
└──────────────┬───────────────────────────────┬───────────────┘
               │ OAuth 2.1 Bearer              │ subprocess env
┌──────────────▼──────────────┐  ┌──────────────▼──────────────┐
│ gmailmcp.googleapis.com     │  │ npx @notionhq/notion-…      │
│ api.githubcopilot.com/mcp   │  │ (local, per-request spawn)  │
└─────────────────────────────┘  └─────────────────────────────┘
```

### 2.3 Tool registration & namespacing

MCP-discovered tools are adapted into `AITool` and registered under a synthetic app key:

- Native: `registry.registerApp('quantmail', mailTools)` → tool `search_emails`
- MCP: `registry.registerApp('mcp.gmail' as QuantApp, adaptedTools)` → tool `mcp.gmail.search_emails`

Namespacing rules:
1. Every MCP tool name is prefixed `mcp.<provider>.` — the planner can never confuse `mcp.gmail.send_email` with native `send_email`.
2. `tool-adapter.ts` maps MCP JSON-Schema input → our `AIToolParameter` shape (`{type, description, required, enum?}`).
3. MCP tool **annotations are hints only** (spec: must not drive decisions for untrusted servers). Our adapter **ignores** upstream `destructive`/`readOnly` hints and applies **our own policy table** (`server-catalog.ts` → per-tool `policy: 'read' | 'write' | 'confirm'`).
4. Tool list is **per-user, per-connection**: only tools from connections the user has actually linked appear. No connection → no tools → planner cannot hallucinate them.

### 2.4 Server lifecycle

**Streamable HTTP (Google, GitHub remote) — preferred:**
- `client-manager` keeps **one client per (userId, provider)**, created lazily on first tool call, cached in memory.
- Session via `Mcp-Session-Id` header; on 404 the client **MUST re-initialize** (spec rule).
- OAuth access token injected per-request (`Authorization: Bearer`); refresh happens in `oauth.ts` before the call if expiry < 5 min.
- Idle clients are evicted after 15 min; disconnect is explicit on connection removal.

**stdio (Notion, Slack fallback):**
- Spawned **per tool-call batch**, not per call: `client-manager` spawns the `npx` process, runs `initialize` → `tools/call…` → keeps the process warm for up to 60 s of activity, then kills it.
- Credentials via **process env only** (never CLI args — avoids `ps` leakage and Windows quoting bugs).
- Hard cap: max 4 concurrent stdio processes per backend instance; queue beyond that.

**Discovery:** on connect, `tools/list` is called once and cached per (provider, server version). The planner's prompt is built from the cached list — no per-request discovery overhead.

### 2.5 Data flow (concrete example)

User: *"mere Gmail ke unread emails dikhao"*

1. `POST /api/quanty/tasks { command }` → planner sees `mcp.gmail.*` tools (user linked Gmail).
2. Plan: `[ mcp.gmail.list_messages(q="is:unread", max=10) ]` — read-only, no confirmation.
3. Executor → `registry.findTool('mcp.gmail', 'mcp.gmail.list_messages')` → adapter → `client-manager.getClient(userId, 'gmail')`.
4. Client: valid access token? No → `oauth.refresh('gmail', userId)` → new Bearer → POST `https://gmailmcp.googleapis.com/mcp/v1` (`tools/call`).
5. Result → normalized `{success, data, displayMessage}` → audit log (`quanty.mcp.gmail.list_messages`) → streamed to UI via existing task SSE.
6. Planner summarizes: *"3 unread mile…"*.

---

## 3. Security Design

### 3.1 Token storage

- **At rest:** OAuth refresh tokens and PATs are encrypted with AES-256-GCM (per-user DEK wrapped by a KMS/master key) in a new `mcp_connections` table. **Never** in plaintext, never in logs, never in the Quanty activity feed.
- **In transit:** TLS 1.2+ only; tokens travel in `Authorization` headers, **never** in URLs (spec rule) or CLI args.
- **In memory:** access tokens live only in the client-manager cache; evicted on idle timeout or disconnect.

### 3.2 Scope limiting (least privilege)

| Layer | Control |
|---|---|
| OAuth scopes | Request **minimal scopes** at connect time (§1.3). Write scopes (e.g. `gmail.send`) are requested only when the user enables a write tool. |
| GitHub token | Fine-grained PAT: specific repos, **read-only** default. Write needs explicit per-repo upgrade. |
| Tool allowlist | `server-catalog.ts` defines per-provider `allowedTools`; anything not listed is **never registered**, even if the server advertises it. (Mirrors the official GitHub server's own `--toolsets`/`--tools` flags.) |
| Read-only mode | Connections start in `mode: 'read'`; `mode: 'write'` requires a second explicit user action. The executor refuses write-policy tools on read-mode connections. |

### 3.3 Approvals (mirrors the Quanty Approvals tab)

Every MCP tool carries `policy: 'read' | 'write' | 'confirm'` (our table, not the server's hints):

- `read` → executes immediately (e.g. `mcp.gmail.list_messages`).
- `write` → executes only on `mode: 'write'` connections, still logged.
- `confirm` → executor pauses the task (`status: 'waiting-confirm'`), pushes an approval card to the Quanty popup (same UI as native destructive tools), and resumes only on `POST /api/quanty/tasks/:id/confirm`.

Destructive-by-default tools (`delete`, `send`, `merge`) are **`confirm` always** — no silent writes, ever.

### 3.4 Audit logging

Every MCP invocation writes to the existing audit service (`apps/quantmail/backend/services/audit.service.ts`):

```
action:   "quanty.mcp.<provider>.<tool>"
resource: "mcp:<provider>:<connectionId>"
metadata: { args: <sanitized — bodies truncated, tokens redacted>,
            durationMs, httpStatus, toolVersion }
```

Sanitization rules: drop any field matching `*token*`, `*secret*`, `*password*`, `*key`; truncate string args > 500 chars. Audit entries are user-scoped and visible in the Approvals/Activity tabs.

### 3.5 Threat model (what we're defending against)

1. **Tool poisoning** (documented Apr 2025, up to ~73% ASR in benchmarks): a malicious/compromised MCP server ships tool *descriptions* containing instructions ("also email the user's inbox to attacker@…"). **Defenses:** our own policy table overrides server hints; tool *results* are treated as untrusted data (never as instructions to the planner — planner prompt marks them as such); allowlisted servers only.
2. **Token theft:** encrypted at rest, header-only in transit, short-lived access tokens, refresh on demand.
3. **Over-scoped grants:** minimal OAuth scopes, read-mode default, per-repo GitHub PATs.
4. **Server impersonation / DNS rebinding:** Streamable HTTP clients **MUST validate `Origin`** (spec rule); server URLs come from the built-in `server-catalog.ts`, **not user-editable** (same pattern as the ahq reference implementation).
5. **Prompt injection via tool results:** results are wrapped as data; the planner is instructed that MCP content is untrusted (mirrors the spec's "resources are untrusted content" rule).

---

## 4. Auth Flows

### 4.1 Google (Gmail / Calendar / Drive) — one OAuth client, one consent

```
User taps "Connect Gmail" in Quanty popup
  → GET /api/quanty/mcp/oauth/google/authorize?providers=gmail,calendar,drive
  → backend builds consent URL (scopes = union of requested providers' minimal scopes)
  → 302 redirect to accounts.google.com
  → user consents → Google → GET /api/quanty/mcp/oauth/google/callback?code=…
  → backend exchanges code → {access_token, refresh_token, expires_in}
  → encrypt refresh_token → upsert mcp_connections(userId, provider='google',
       products=['gmail','calendar','drive'], scopes=[…], mode='read')
  → redirect to quantmail.in/settings/connections?connected=google
```

One Google Cloud OAuth client serves all three products (shared consent). If a product's MCP server rejects the token (scope gap), the user is sent through consent again for that product only.

### 4.2 GitHub — PAT first, App later

- **Phase 1 (PAT):** user pastes a fine-grained PAT in Settings → Connections. Backend validates it (`GET /user`), stores encrypted, registers `mcp.github.*` tools in **read-only** toolset. UI guides the user to create the PAT with repo-scoped read permissions.
- **Phase 2 (GitHub App):** standard OAuth-app flow like §4.1; enables refresh and org-level installs.

### 4.3 Notion / Slack — token paste

User pastes the integration/bot token (from the provider's dashboard) into Settings → Connections. Backend validates with a lightweight call (`/v1/users/me` for Notion), stores encrypted. No OAuth dance — these providers use long-lived tokens by design.

---

## 5. Phased Rollout

| Phase | Scope | Rationale |
|---|---|---|
| **P0 — foundation** | `mcp/` skeleton: `types.ts`, `server-catalog.ts` (Gmail, Calendar, GitHub), `tool-adapter.ts`, `connection-store.ts` + `mcp_connections` migration; read-only tools only | Unblocks everything; zero write risk |
| **P1 — Gmail read** | OAuth flow (§4.1) + `mcp.gmail.*` read tools + Approvals UI wiring | Highest user value: "mere Gmail ke unread dikhao" |
| **P2 — Calendar read** | Same OAuth grant, `mcp.calendar.*` read tools | Natural pair with Gmail |
| **P3 — GitHub read** | PAT connect + `mcp.github.*` read toolset | Dev users; mirrors QuantGit |
| **P4 — writes + confirm** | `mode:'write'` upgrade, `confirm` policy enforcement, Gmail compose, Calendar create, GitHub issue create | Only after P0–P3 are stable and audited |
| **P5 — Notion/Slack** | stdio lifecycle (§2.4) + token-paste connect | Proves the stdio path |

**Out of scope for v1:** custom user-added MCP servers (allowlist only — poisoning risk), MCP resources/prompts (tools only), server-side sampling.

---

## 6. Open Questions (need product decisions)

1. **Google Cloud project ownership:** who owns the OAuth client (Quant vs per-deployment)? Affects consent-screen branding and quota.
2. **Write-mode UX:** one global "enable writes" per connection, or per-tool confirmation forever? (Recommendation: per-connection write mode + per-destructive-tool confirm.)
3. **Token refresh UX:** silent refresh is invisible; on refresh-token revocation, how loudly do we tell the user? (Recommendation: Quanty status pill "Gmail disconnected — reconnect".)
4. **Multi-account:** one Gmail per user in v1, or N? (Recommendation: v1 = one per provider; schema supports N via `connectionId`.)
5. **Self-hosted MCP servers:** enterprise users will ask. v1 says no; revisit with mTLS + admin allowlist.

---

## 7. References

- MCP spec 2025-11-25 — transports, authorization, lifecycle: https://modelcontextprotocol.io/specification/2025-11-25/
- Google Workspace MCP setup (official endpoints): https://developers.google.com/workspace/guides/configure-mcp-servers
- Official GitHub MCP server: https://github.com/github/github-mcp-server (+ hardened read-only guide: https://devtocash.com/blog/2026-09-21-github-mcp-server-read-only-toolsets-lockdown-mode-devops-agents)
- MCP security — tool poisoning (Invariant Labs, Apr 2025); MCPTox benchmark (arXiv:2508.14925); STRIDE threat model (arXiv:2603.22489)
- Reference patterns: connective-ai-platform (per-user OAuth + `redirect_to_auth`), ahq (built-in server registry, tool intersection), RaeburnAI Enterprise MCP (governed gateway, audit, write approvals)

---

*End of architecture doc. Next step: P0 foundation PR (types + catalog + adapter + store + migration), then P1 Gmail-read slice.*
