# QuantMail — Retro-spec'd extra surfaces (K15)

Un-specced surfaces verified real on `origin/main` @ `e1fcc6b2` and kept.
Decision record: `docs/quant-architecture/decisions/extras-retro-spec.md` (B1).

## Routes

| Route | Surface | Data contract | States |
|---|---|---|---|
| `/marketing` | Public SEO/acquisition landing | Static; brand lockup from `src/brand/identity`; app links via `@quant/app-registry` | Static render |
| `/pipelines` | CI build/deploy monitor (QuantGit surface) | `usePipelines` → `apiClient.getWorkflows(repoId)` / `getBuilds({repoId,status,page})`; Workflow/Build entities | loading skeleton, error+retry, empty |
| `/lab/bubble`, `/lab/marks` | Internal design labs (BubbleLab, MarkLab, DinosaurMarkCandidate) | None (client-side experiments) | 404 unless `QUANT_ENABLE_LABS=1` or non-production |
| `/workspaces`, `/workspaces/[id]` | Team workspaces | `useWorkspaces`/`useCreateWorkspace` → `backend/routes/workspaces.ts` CRUD + invites; `ROLE_COPY` role model | loading, error+retry, empty |
| `/help` | Support/help center | Static + support links | Static |
| `/privacy`, `/terms` | Legal pages | Static copy | Static |
| `/invite/[token]` | Invite acceptance | Token validation endpoint → membership grant | validating, invalid/expired, success |
| `/groups/join/[token]` | Group join via token | Token endpoint → group membership | validating, invalid/expired, success |
| `/sso`, `/login`, `/register`, `/forgot-email`, `/forgot-password`, `/reset-password` | Auth flows | Identity service per `08-identity-security-trust.md` (QuantMail SSO is the ecosystem identity root) | form, submitting, error, success |

## Notes

- `/postcards` (PostcardStudio) is **excluded** — marked `needs-user-decision`
  in the decision record. If the user keeps it, spec it here (route, localStorage
  schema `STORAGE_KEY`, export formats).
- Auth screens are architecture-spec'd in `08`; this file only records their
  screen-level existence so the inventory gap is closed.
- Workspaces have no definition in `02-company-and-admin-model.md` — that doc
  needs a workspaces section; this retro-spec does not invent it.
