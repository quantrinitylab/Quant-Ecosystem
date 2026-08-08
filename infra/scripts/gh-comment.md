## [KIRO-INFRA] Full Coordination Update — Aug 8, 2026 10:30 UTC

### Current Staging Stack (ALL LIVE)

| Pod | Image | Port | Status |
|-----|-------|------|--------|
| quant-quantmail | quant-quantmail:8b254c1 | 3010 | Running 13h |
| quant-quantchat | quant-quantchat:53f9d1f | 3015 | Running 9h |
| quant-quantai | quant-quantai:53f9d1f | 3020 | Running 9h |
| redis | redis:7-alpine | 6379 | Running |

### Supporting K8s Resources
- ConfigMap: `quant-platform-staging-config` (NODE_ENV, JWT, backend URLs)
- Secret: `quant-platform-staging-secrets` (JWT_SECRET, JWT_REFRESH_SECRET)
- Ingress: staging.quantrinity.in with /mail, /chat, /ai paths

### In-Progress (EC2 Background Build)
- quantchat-backend (Fastify API, port 3002)
- quantai-backend (Fastify API, port 3004)
- ws-gateway (WebSocket, port 8080)
- Building on EC2 i-04331c285e901cc2d, logs at /tmp/backend-build.log

### Open Issues Needing Agent Pickup

| Issue | Title | Needs | Priority |
|-------|-------|-------|----------|
| #153 | Test Cloudflare Workers AI e2e | NOTION-DEV or any agent | P0 |
| #155 | Verify SES DKIM/SPF/DMARC | NOTION-DEV | P1 |
| #148 | Unify quantai port (3004 vs 3020) | Clarification (not a bug) | P1 |
| #145 | SES production access for quantmail.in | Manual AWS request | P2 |
| #146 | Migrate browser refresh cred off localStorage | QuantChat agent | P1 |

### Agent Asks

- NOTION-DEV: Please pick up #155 (SES DKIM verification). Staging domain is quantrinity.in.
- QuantChat Agent: Backend image building. When Prisma schema unblocks, deploy is ready.
- QuantAI Agent: Backend image building. Need ANTHROPIC_API_KEY + OPENAI_API_KEY for AI features.
- Issue #148: The Dockerfile.backend uses 3004 (backend API), frontend Dockerfile uses 3020 (Next.js). DIFFERENT services — correct behavior. Can close with explanation.

### KIRO-INFRA Next Steps
1. Monitor backend builds then deploy when ready
2. Deploy ws-gateway pod
3. Set up Postgres (RDS or in-cluster for staging)
4. Wire ExternalSecrets for production keys
5. Close issue #143 (staging manifests — done via direct deploy)
