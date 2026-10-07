# QuantChat realtime load / soak tests (k6)

These [k6](https://k6.io/) scripts validate the launch-critical realtime path for
QuantChat (Requirement 18.5 / design "Load / Soak Testing" + "Performance
Considerations"). They exercise:

- **N concurrent WebSocket connections** to `/ws/chat`
- **sustained message throughput** (`chat_message` frames)
- **presence churn** (rapid connect/disconnect cycles that drive `presence:update`)

and assert the design SLOs via k6 thresholds:

| Threshold | Meaning |
| --- | --- |
| `ws_roundtrip_latency p(95) < 300ms` | p95 end-to-end fan-out latency (send → recipient socket) — the design SLO |
| `ws_connect_success rate > 0.99` | WS connection establishment stays healthy as the cluster scales horizontally |
| `ws_session_errors rate < 0.01` | sessions stay stable (no leak/error storm during soak) |
| `checks rate > 0.95` | most round-trips actually complete |

A run that stays green proves sustained throughput holds the latency SLO while
the staging cluster scales out across multiple instances.

## Files

| File | Purpose |
| --- | --- |
| `quantchat-ws.js` | Main script. One file, two scenarios via `SCENARIO=load\|soak`. |
| `lib/token.js` | Mints / resolves the JWT used to authenticate the WS upgrade. |

## Prerequisites

- Install k6: <https://grafana.com/docs/k6/latest/set-up/install-k6/>
- A reachable QuantChat backend (local, or a staging deployment — see below).
- A way to authenticate the WS upgrade. The backend reads `?token=<jwt>` and
  verifies an **HS256** JWT signed with its `JWT_SECRET`, with issuer
  `quantchat` and audience `quant-ecosystem` (see `packages/realtime/src/auth.ts`).

### Providing tokens (pick one)

1. **Pre-minted tokens (recommended for shared staging):** pass real user tokens
   minted by your auth service.
   ```bash
   -e TOKENS="<jwt-user-a>,<jwt-user-b>,<jwt-user-c>"
   ```
   VUs round-robin across the pool, so several VUs share a conversation and
   exercise real cross-socket fan-out.
2. **Single token:** `-e TOKEN="<jwt>"` (all VUs act as one user).
3. **In-script minting (throwaway cluster whose secret you control):** provide
   the backend's signing secret and the script mints a token per VU.
   ```bash
   -e JWT_SECRET="dev-secret-at-least-32-characters-long"
   ```
   Only use this against a cluster whose `JWT_SECRET` you own (e.g. the staging
   Secret referenced by `values-staging.yaml`). Never point it at production.

## Running locally

Start the backend (`apps/quantchat`, default port `3002`), then:

```bash
# Load test: ramp to 200 VUs, hold, validate p95 fan-out latency < 300ms
k6 run -e SCENARIO=load \
       -e WS_URL=ws://localhost:3002/ws/chat \
       -e JWT_SECRET="dev-secret-at-least-32-characters-long" \
       apps/quantchat/load-tests/quantchat-ws.js

# Soak test: low constant load for a long duration (stability / leak detection)
k6 run -e SCENARIO=soak \
       -e SOAK_VUS=40 -e SOAK_DURATION=2h \
       -e WS_URL=ws://localhost:3002/ws/chat \
       -e JWT_SECRET="dev-secret-at-least-32-characters-long" \
       apps/quantchat/load-tests/quantchat-ws.js
```

## Running against staging

Staging is deployed from the `quantchat-backend` Helm chart with the staging
overlay, which runs **≥ 2 replicas + Redis backplane/presence + HPA** so
horizontal scaling is genuinely validated:

```bash
helm upgrade --install quantchat-staging infra/helm/quantchat-backend \
  -n quantchat-staging --create-namespace \
  -f infra/helm/quantchat-backend/values-staging.yaml \
  --set image.tag=<staging-sha>
```

Then point k6 at the staging ingress (use `wss://` for TLS):

```bash
k6 run -e SCENARIO=load \
       -e WS_URL=wss://chat-staging.example.com/ws/chat \
       -e TARGET_VUS=500 \
       -e CONVERSATION_IDS="conv-1,conv-2,conv-3" \
       -e TOKENS="<jwt1>,<jwt2>,<jwt3>" \
       apps/quantchat/load-tests/quantchat-ws.js
```

To watch the HPA scale the backend out while the load test runs:

```bash
kubectl -n quantchat-staging get hpa -w
kubectl -n quantchat-staging get pods -w
```

A passing run (all thresholds green) while the HPA adds replicas demonstrates
sustained throughput **and** horizontal scaling under the p95 < 300ms SLO.

> If you minted load-test tokens in-script via `JWT_SECRET`, that secret must
> match the `JWT_SECRET` key in the staging Secret
> (`quantchat-backend-staging-secrets`).

## Environment variables

| Var | Default | Description |
| --- | --- | --- |
| `SCENARIO` | `load` | `load` (ramp + hold) or `soak` (low constant, long duration). |
| `WS_URL` | `ws://localhost:3002/ws/chat` | WebSocket endpoint (use `wss://` for TLS). |
| `CONVERSATION_IDS` | `loadtest-conversation` | Comma-separated rooms VUs spread across. |
| `TARGET_VUS` | `200` | Peak VUs for the load scenario. |
| `RAMP` / `HOLD` / `RAMP_DOWN` | `1m` / `3m` / `30s` | Load scenario stage durations. |
| `SOAK_VUS` / `SOAK_DURATION` | `40` / `2h` | Soak scenario load + duration. |
| `MSG_INTERVAL_MS` | `1000` | Per-VU interval between `chat_message` sends. |
| `HOLD_SECONDS` | `30` | How long each chat VU stays connected before cycling. |
| `CHURN_RATE` / `CHURN_VUS` | `20` / `50` | Presence-churn connect/disconnect rate + VU pool. |
| `TOKENS` / `TOKEN` / `JWT_SECRET` | — | WS auth (see "Providing tokens"). |
| `JWT_ISSUER` / `JWT_AUDIENCE` / `TOKEN_TTL` | `quantchat` / `quant-ecosystem` / `3600` | Claims used when minting tokens in-script. |
| `USER_PREFIX` | `loadtest-user` | Synthetic user-id prefix for minted tokens. |

## Notes

- The script measures fan-out latency by tagging each `chat_message` with a
  `nonce` and timing the `new_message` frame the server echoes back to the room
  (the backend fans `new_message` to every socket in the conversation, including
  the sender).
- Content sent is a placeholder string — these tests measure transport/fan-out
  behaviour, not E2EE crypto. Drive E2EE-specific paths with integration tests.
