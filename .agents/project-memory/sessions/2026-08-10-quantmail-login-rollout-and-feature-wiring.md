# 2026-08-10 — QuantMail login rollout and feature wiring

## Authority boundary

This note is supporting continuity. Code, blocking CI, `docs/CURRENT_STATE.md`, and `docs/EXECUTION_QUEUE.md` remain authoritative. The active milestone remains **M11D-SHADOW-CANARY / WU4**.

## Verified merged and live evidence

- PR #161 merged as `2e3a3d6b67883156e7cd4991ce0f4b53c3382d4a`.
- GitHub-hosted OIDC run `31381388221` passed.
- Exact-main gate run `31400717610`, attempt 2, passed.
- QuantMail frontend digest: `sha256:b0574a82285f567e04d64f460db3933d847c181a0867f5f2ce372dcef78f0281`.
- SSM rollout command `bd0d69a5-c3c9-432d-98a3-f0d607f2a58a` succeeded on `quant-staging`.
- Internal and external invalid-login probes returned HTTP 400 JSON; the external endpoint was `https://quantmail.quantrinity.in/auth/login`.
- This proves the runtime login transport boundary only, not full feature readiness.

## Candidate feature-wiring work

Branch `fix/quantmail-feature-wiring` repairs persistent snooze, archive/trash/restore semantics, update-in-place drafts, fail-closed API proxying, duplicate global UI mounts, mobile drawer behavior, and simulated repository-editor success states. At this checkpoint local TypeScript, production Next build, targeted lint, and 23 focused EmailService tests pass. The branch remains candidate evidence until merged, exact-main gated, image-built, and deployed.

## Safety constraints

- Do not persist or repeat user credentials.
- Do not perform external sends, permanent real-data deletion, 2FA changes, password changes, or deployment clicks as UI tests.
- Keep deployment digest-pinned, rollback-safe, and fail-closed.
- Do not enable production deployment gates or change production DNS.
