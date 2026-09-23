# Proposed workflow changes (needs a human commit)

The automation token that opened this PR is a GitHub App installation token
**without the `workflows` permission**, so `POST /git/trees` returns
`403 Resource not accessible by integration` for any path under
`.github/workflows/`. Everything else in this PR pushed fine.

The three workflow changes are staged here instead, fully reviewable in the
diff. After merging, move them into place with a normal user commit:

```bash
git checkout main && git pull
git apply infra/proposed-workflows/deploy-staging.yml.patch
git mv infra/proposed-workflows/smoke-live.yml       .github/workflows/smoke-live.yml
git mv infra/proposed-workflows/ops-inspect-live.yml .github/workflows/ops-inspect-live.yml
rm infra/proposed-workflows/README.md
git commit -am "ops: add live smoke + cluster inspector, wire OWNER_SECRET into quanttrinity deploy"
git push
```

## 1. `deploy-staging.yml.patch` — the actual bug fix

`quanttrinity.quantrinity.in` serves its UI but every owner API call returns
**503**, because the pod has no `OWNER_SECRET`. The deploy job never supplied
one and never noticed it was missing.

The patch adds a `needs_owner_secret` flag to the target `case` (true only for
`quanttrinity`), publishes it as a step output, and inserts a block before
`kubectl set image` that:

- **fails the deploy** if `needs_owner_secret=true` and `secrets.OWNER_SECRET`
  is empty, instead of shipping a pod that 503s;
- otherwise merge-patches the value into the `quant-staging-secrets` Secret and
  binds it with `kubectl set env --from=secret --keys=OWNER_SECRET`;
- asserts afterwards that **no literal secret value** ended up in the pod
  template.

Prerequisite (only the repo owner can do this): create repo secret
`OWNER_SECRET`, and in AWS Secrets Manager create `quant/trinity` with property
`owner-secret` so External Secrets can serve it in production. The
`infra/k8s/external-secrets.yaml` and `values-production-v2.yaml` halves of that
wiring **are** in this PR.

## 2. `smoke-live.yml` — stop trusting HTTP 200

`quantube.quantrinity.in` and `quantmax.quantrinity.in` return **200 with a
blank page**. Any status-code-only check calls them healthy. This workflow
renders each host in headless Chromium and asserts real content.

Per host in the matrix (10 hosts, `mode: live | down`):

| check | assertion |
|---|---|
| `/` | HTTP 200 |
| rendered text | `>= MIN_RENDERED_CHARS` (150) after JS executes |
| `/login` | HTTP 200 where `login_required` |
| authed path | HTTP 401 (proves the auth layer is wired, not that the app is dead) |
| `/api/health` | recorded, informational only |

`down` hosts are recorded without assertions so the file stays an honest
inventory instead of a red board.

Verified locally before proposing: quantmail / quantchat / quantai **exit 0**;
quantube run as-if-live **exits 1** on exactly the blank-render and `/login`
checks. Rendered characters measured: quantmail 1382, quantai 951,
quantchat 190, quantube 70.

Schedule `17 */6 * * *` plus manual dispatch.

## 3. `ops-inspect-live.yml` — read-only, run this first

Live topology does not match the repo and I will not guess at a fix:

- `apps/admin/` **no longer exists**, but `deploy-staging.yml` still has an
  `admin` target pointing at `apps/admin/Dockerfile` — a dead target.
- `infra/k8s/app-routing-ingress.yaml` routes `quanttrinity.quantrinity.in` to
  service `quant-platform-production-admin:3100`, while the `quanttrinity`
  deploy target patches deployment `quant-quanttrinity` on container port
  **3113**. Those cannot both be right.

This workflow only reads: deployments and their images, services and selectors,
ingress host-to-service mapping, and env var **names only** (never values). No
`apply`, no `patch`, no `set image`. Run it once and the ingress fix becomes a
grounded one-line change instead of a blind edit.

Uses `vars.AWS_DEPLOY_ROLE_ARN`, `vars.AWS_REGION`, `vars.EKS_CLUSTER`,
`vars.K8S_NAMESPACE` and the same pinned
`aws-actions/configure-aws-credentials@ff717079ee2060e4bcee96c4779b553acc87447c`
this repo already uses.
