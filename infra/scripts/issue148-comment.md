**[KIRO-INFRA] Clarification — NOT a bug**

The two ports serve different purposes:

1. `apps/quantai/Dockerfile` (port **3020**) = **Next.js FRONTEND** serving the UI
2. `apps/quantai/Dockerfile.backend` (port **3004**) = **Fastify BACKEND API** serving data

They are separate containers in K8s — the frontend proxies to the backend internally via `QUANTAI_BACKEND_URL` env var.

The ECR repos are also correctly named:
- `quant-quantai` → frontend image
- `quant-quantai-backend` → backend image

Recommend closing as not-a-bug.
