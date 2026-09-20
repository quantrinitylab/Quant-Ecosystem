# Live audit — 2026-09-20 (probed from outside, no cluster access)

**Verdict: nahi, "sab live" nahi hai.** 9/11 hostnames HTTP 200 dete hain, lekin sirf **3 apps
end-to-end functional** hain (quantmail, quantchat, quantai). 6 apps sirf UI shell hain — unke data
APIs 500/502 dete hain. 1 app (quanttrinity) poori tarah down hai.

Method: DNS + HTTPS probes on every host found in `infra/`, real declared route paths from
`apps/*/src/app/api/**/route.ts` probed live, plus GitHub Actions deploy/CI history via `gh api`.
`main` @ `4b9f3079`, working tree clean. AWS/kubectl creds is sandbox mein nahi hain, so cluster
internals inference se hain (evidence niche).

## Per-app live status

| App (dir)    | Host                                            | Page    | Data API                                                                                                                               | Live code (last OK deploy)                                   | Verdict                          |
| ------------ | ----------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------- |
| quantmail    | quantmail.in (`quantmail.quantrinity.in` → 301) | 200     | 401 `Invalid or expired token` (real JWT check), `/api/healthz` 200 uptime ~10h                                                        | FE `652ac616` (today 04:28) / **BE `e50a2604`, 16 Sep**      | 🟢 live, backend 4 din stale     |
| quantchat    | quantchat.quantrinity.in                        | 200     | 401 real, `/api/health` ok                                                                                                             | `652ac616`                                                   | 🟢 live                          |
| quantai      | quantai.quantrinity.in                          | 200     | 401 real; **`/api/models` 200 = hardcoded `AVAILABLE_MODELS` fallback**                                                                | `652ac616`                                                   | 🟢 live (ek fallback route fake) |
| quantads     | quantads.quantrinity.in                         | 200     | auth route 401 (via QuantMail OIDC), **own routes 502** (`/api/audiences`, `/api/bidding/*`, `/api/billing/balance`, `/api/campaigns`) | `8b6aa407`                                                   | 🟡 shell only                    |
| quantube     | quantube.quantrinity.in                         | 200     | **7/10 routes 500/502** (creator/_, cross-publish/_, ai/recommendations)                                                               | `4b9f3079`                                                   | 🟡 shell only                    |
| quantneon    | quantgram.quantrinity.in                        | 200     | **6/10 routes 500/502** (explore, dm, ar-lenses)                                                                                       | `4b9f3079`                                                   | 🟡 shell only                    |
| quantmax     | quantmax.quantrinity.in                         | 200     | **5/10 routes 502** (commerce/orders, economy/wallet, store/catalog)                                                                   | `4b9f3079`                                                   | 🟡 shell only                    |
| quantsync    | quantwave.quantrinity.in                        | 200     | **4/10 routes 502** (communities, anonymous/feed, auth/session)                                                                        | `4b9f3079`                                                   | 🟡 shell only                    |
| quantedits   | quantcooks.quantrinity.in                       | 200     | **4/10 routes 500** (assets, brand-kit(s), effects)                                                                                    | `4b9f3079`                                                   | 🟡 shell only                    |
| quanttrinity | quanttrinity.quantrinity.in                     | **503** | 503 (10/10)                                                                                                                            | **kabhi successful deploy nahi** — runs #181, #186 dono fail | 🔴 down                          |
| quant-mobile | —                                               | —       | —                                                                                                                                      | koi deploy target nahi                                       | ⚪ not deployed                  |

Extra hosts: `quanty.quantrinity.in` 200 · `quantws.quantrinity.in` 404 · **`staging.quantrinity.in`
TLS ke baad timeout** (ingress `infra/k8s/staging-api-ingress.yaml:45` exist karta hai, origin
respond nahi karta) · **apex `quantrinity.in` ka DNS resolve hi nahi hota** · unmapped subdomains
(api, quantdrive, quantmeet, quantpay, quantgit) 404 = wildcard DNS + ingress default backend.

## Root causes (code/infra se confirmed)

1. **7 apps ka backend deploy hi nahi hota.** In apps ke route handlers thin proxies hain —
   `apps/quantneon/src/app/api/_lib/proxy.ts:3` → `QUANTNEON_BACKEND_URL || 'http://localhost:3012'`,
   `apps/quantube/src/app/api/_lib/engine-proxy.ts` → `localhost:3006`,
   `apps/quantads/src/app/api/audiences/route.ts:4` → `localhost:3010`.
   `infra/k8s/staging-remaining-apps.yaml` mein **`BACKEND_URL` ka ek bhi occurrence nahi** (grep = 0)
   aur har app ka ek hi container hai. Compare: `infra/k8s/staging-quantchat-quantai.yaml` mein
   frontend + **`quant-quantchat-backend` / `quant-quantai-backend` sidecar** dono hain — isi wajah se
   chat/ai kaam karte hain. `deploy-staging.yml` ke targets mein backend sirf `quantmail-backend` hai.
   → localhost pe kuch nahi sun raha, isliye 500 (fetch fail) / 502 (upstream dead).
   `QUANTMAIL_BACKEND_URL=http://quant-quantmail-backend:3011` set hai, isliye cross-app OIDC
   (quantads `/api/auth/userinfo`) chalta hai — yeh confirm karta hai ki baaki URLs missing hain.
2. **quantmail-backend rollout timeout.** Run `35515628862`: `kubectl rollout status` 10 min baad
   `timed out waiting for the condition`, phir auto-rollback → live backend abhi bhi `e50a2604`
   (16 Sep) hai, `main` ka backend code live nahi hai. Naye pods ready nahi ho rahe (probe/secret/
   crashloop — cluster access ke bina exact reason nahi).
3. **quanttrinity never rolled out.** Run `35515616322`: image update ke 1 second baad
   `exceeded its progress deadline`, rollback bhi wahi error → ReplicaSet pehle se failed state mein
   hai (image pull ya crashloop). Ports consistent hain (Dockerfile 3113 = manifest 3113), to port
   drift nahi.

## CI ka jhootha bharosa

- Deploy gate sirf `gate` check-run maangta hai (`deploy-staging.yml:~78`), aur `gate` job
  `--filter='[base]'` se **sirf directly changed packages** typecheck/lint/test/build karta hai
  (`ci.yml:92-98`).
- Poora repo sweep karne wala `full-sweep` job **`continue-on-error: true`** hai (`ci.yml:~190`) —
  fail hone par bhi deploy nahi rukta. (Aaj `main` pe full-sweep pass hua hai, so repo build-health
  theek hai — par yeh guarantee nahi hai.)
- Koi bhi post-deploy smoke/health gate nahi hai: `verify-live.yml` sirf 2 hosts (`quantmail`,
  `staging`) curl karta hai aur manual dispatch hai. Isi liye "deploy success" hone ke baad bhi
  500/502 kisi ko dikha nahi.

## Doc drift (repo apne baare mein galat bol raha hai)

- `.agents/state/quant-go-live-readiness.md`: "Buildable frontends 2/6", "no staging",
  "3 Dockerfiles" — reality: 10 Dockerfiles, staging cluster live, 9 hosts serving. Doc purana hai.
- `.agents/project-memory/CURRENT_CHECKPOINT.md`: AWS account **266176113726** likha hai, jabki live
  deploy logs + manifests **178313340246** use karte hain. Account truth conflict.
- Repo name bhi `quantrinitylabsgo/Quant-Ecosystem` likha hai, actual `quantrinitylab/Quant-Ecosystem`.

## Fix status

Landed in `fix/wire-app-backends-staging` (validated locally, needs a merge + one dispatch per
target to reach staging):

1. **Backend entrypoints** — `apps/{quantads,quantedits,quantmax,quantneon,quantsync,quantube}/backend/server.ts`.
   `backend/app.ts` only exported `buildApp()`/`getConfig()`; nothing ever bound a socket, so the
   Fastify apps could not be run at all. Verified by booting all six: each logs
   `<App> backend listening` and answers `/healthz` 200, and protected routes answer 401 instead of
   the 500/502 above. quantsync/quantube also had a stray inline `listen()` at the bottom of
   `app.ts`, removed now that a real entrypoint exists.
2. **Backend sidecars** — `infra/k8s/staging-remaining-apps.yaml` now runs each backend beside its
   frontend on the same image (the app Dockerfile already copies `backend/` + root `node_modules`,
   and turbo builds `@quant/database`'s `dist`, so no new image or ECR repo is needed) and sets
   every `<APP>_BACKEND_URL` the route handlers actually read — including the
   `NEXT_PUBLIC_`-prefixed second spelling that quantmax/quantneon/quantube also use.
3. **Probes** — sidecar readiness/liveness use `/healthz` + `/livez`. `/health` does not exist in
   `@quant/server-core` (404, verified), so probing it would have failed all six rollouts.
4. **Sidecar image drift** — `deploy-staging.yml` now updates EVERY container that runs the target's
   image, not just the primary. quantchat/quantai already had backend sidecars whose image the
   deploy never touched, so their backends were pinned at `3c127037` while their frontends moved.
5. **Rollout stalls** — every single-replica staging Deployment is pinned to `maxSurge: 0`
   (manifests + `bootstrap-aws.yml`), and the deploy re-applies that patch. A 25% surge on 1 replica
   needs a second pod scheduled before the old one may go, which is exactly the
   `1 old replicas are pending termination` stall that killed quanttrinity and quantmail-backend.
6. **Blind failures** — on rollout or smoke failure the deploy now dumps pod events, container
   logs and namespace events, so `Insufficient cpu`, `ImagePullBackOff` or a crash reason is named
   instead of a bare deadline message.
7. **Post-deploy smoke gate** — after rollout the deploy calls real routes through the public host
   and rolls back on 5xx. 401 counts as a pass (it proves a live backend validated the token).
   Health-only checks could never catch this class of bug, because on these apps `/api/health` is
   served by Next itself.

Still open (needs cluster access or an owner decision):

- **quanttrinity's real pod failure.** The surge fix and the diagnostics address the stall and the
  silence, but why the pod never went Ready is still unproven from outside. The next failed run
  will print it.
- **Namespace capacity.** Six sidecars add ~600m CPU / 1.5Gi of memory requests. If pods land
  Pending with `Insufficient cpu/memory`, the node group needs scaling.
- `staging.quantrinity.in` origin, and apex `quantrinity.in` DNS — fix or remove from ingress/DNS.
- Make `full-sweep` blocking (or add it to the deploy gate) so a repo-wide break cannot ship.
- Sync `quant-go-live-readiness.md` + `CURRENT_CHECKPOINT.md` with reality (AWS account, repo name,
  frontend/deploy status).
- If any of these backends ever needs to scale independently of its frontend, promote it from a
  sidecar to its own Deployment with a `Dockerfile.backend` (the esbuild-bundled pattern
  quantmail/quantchat/quantai already ship) + a new ECR repository.
