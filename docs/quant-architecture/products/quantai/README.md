# QuantAI — Product Screen Specs

App: `apps/quantai`
Routers: Next.js app router + pages router (legacy /models, /memory, /analytics, /automation, /device, /code, /image-gen, /personas, /plugins, /prompts, /training, /translate, /ecosystem)

Role: ecosystem AI surface — chat with 7 models, artifacts, agent runtime, automations, cross-app Quanty. Ambiguity worth stating up front: QuantAI and the Quanty agent platform overlap. This spec covers the QuantAI PRODUCT screens (A01–A13); Quanty-the-platform is specified in docs/quant-architecture/06-ai-quanty-platform.md.

Mobile: Flutter app at `flutter_apps/apps/quant_ai` plus responsive web.

Desktop: no native desktop client in the repo; desktop is the responsive web build.

## Screen inventory (from `docs/quant-architecture/12-screen-inventory.md`)

| ID | Screen | Status | Route |
|----|--------|--------|-------|
| A01 | Chat | IMPLEMENTED | `/` |
| A02 | Model Picker | IMPLEMENTED | `/models (pages router); embedded in / chat header` |
| A03 | Artifacts | IMPLEMENTED | `/artifacts` |
| A04 | Agent Builder | PARTIAL | `/automation (workflow builder); /code (agent terminal)` |
| A05 | Agent Run | PARTIAL | `(embedded in chat /code terminal)` |
| A06 | Approval Queue | MISSING | `(none)` |
| A07 | Automations | IMPLEMENTED | `/automation (pages router)` |
| A08 | Memory | IMPLEMENTED | `/memory (pages router)` |
| A09 | Model Playground | PARTIAL | `/models (directory); /code` |
| A10 | Usage | IMPLEMENTED | `/analytics (pages router)` |
| A11 | Device Control | IMPLEMENTED | `/device (pages router)` |
| A12 | Settings | IMPLEMENTED | `/settings` |
| A13 | Admin | MISSING | `(none)` |

Status meanings: IMPLEMENTED = real UI + real data path; PARTIAL = incomplete;
EMBEDDED = panel inside another screen; MISSING = no UI in the repo.

## Layout

- `screens/` — per-screen spec: purpose, route, data contract, states, permissions, reality
- `desktop/` — desktop adaptation notes (responsive web; no native client)
- `mobile/` — mobile notes (Flutter app where it exists + responsive web)
- `web/` — web route, shell, auth boundary
- `security/` — per-screen security contract
- `testing/` — per-screen test plan
