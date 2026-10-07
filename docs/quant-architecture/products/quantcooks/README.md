# QuantCooks — Product Screen Specs

App: `apps/quantcooks`
Routers: Next.js pages router (UI) + app router (API only)

Role: ecosystem video-editing surface ('QuantEdits') — projects, multi-track timeline editor, assets, AI tools, templates, export with a real render queue. No fake progress: exports poll real job status.

Mobile: Flutter app at `flutter_apps/apps/quant_cooks` plus responsive web.

Desktop: no native desktop client in the repo; desktop is the responsive web build.

## Screen inventory (from `docs/quant-architecture/12-screen-inventory.md`)

| ID | Screen | Status | Route |
|----|--------|--------|-------|
| K01 | Home | IMPLEMENTED | `/ (index)` |
| K02 | Projects | IMPLEMENTED | `/projects, /projects-gallery` |
| K03 | Editor | IMPLEMENTED | `/editor` |
| K04 | Timeline | EMBEDDED | `(panel in /editor)` |
| K05 | Assets | IMPLEMENTED | `/assets` |
| K06 | AI Generation | EMBEDDED | `(AITools panel in /editor)` |
| K07 | Render Queue | PARTIAL | `/export (queue embedded)` |
| K08 | Preview/Export | IMPLEMENTED | `/export` |
| K09 | Templates | IMPLEMENTED | `/templates` |
| K10 | Marketplace | MISSING | `(none)` |
| K11 | Creator | MISSING | `(none)` |
| K12 | Admin | MISSING | `(none)` |

Status meanings: IMPLEMENTED = real UI + real data path; PARTIAL = incomplete;
EMBEDDED = panel inside another screen; MISSING = no UI in the repo.

## Layout

- `screens/` — per-screen spec: purpose, route, data contract, states, permissions, reality
- `desktop/` — desktop adaptation notes (responsive web; no native client)
- `mobile/` — mobile notes (Flutter app where it exists + responsive web)
- `web/` — web route, shell, auth boundary
- `security/` — per-screen security contract
- `testing/` — per-screen test plan
