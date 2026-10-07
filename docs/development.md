# Development Guide

## Prerequisites

- **Node.js 22+**: Install via [nvm](https://github.com/nvm-sh/nvm)
- **pnpm 10**: `corepack enable && corepack prepare pnpm@latest --activate`
- **Docker**: Required for local database, Redis, Kafka, search

## Setup (3 Commands)

```bash
git clone https://github.com/your-org/Quant-Ecosystem.git && cd Quant-Ecosystem
pnpm install
docker compose up -d
```

You can now run any app with `pnpm turbo dev --filter=<app-name>`.

---

## Project Structure

```
Quant-Ecosystem/
├── apps/                    # 17 frontend applications (Next.js 15)
│   ├── admin/              # Admin panel (port 3100)
│   ├── marketing/          # Marketing/landing site
│   ├── quantads/           # Advertising platform
│   ├── quantai/            # AI assistant hub (port 3020)
│   ├── quantcalendar/      # Calendar & scheduling
│   ├── quantchat/          # Instant messaging (port 3015)
│   ├── quantdocs/          # Collaborative documents
│   ├── quantdrive/         # Cloud file storage
│   ├── quantedits/         # Video/photo editor
│   ├── quantmail/          # Email + OAuth2 provider (port 3010)
│   ├── quantmax/           # Short video + dating + random chat
│   ├── quantmeet/          # Video conferencing
│   ├── quant-mobile/       # Cross-platform mobile (Capacitor)
│   ├── quantneon/          # Photo/video sharing
│   ├── quantsync/          # Social feed
│   ├── quantube/           # Video & music streaming
│   └── status/             # Service status monitor
├── packages/               # 90+ shared libraries
│   ├── common/             # Shared types, constants, utilities
│   ├── database/           # Prisma schemas and models
│   ├── auth/               # Authentication (OAuth2, JWT, sessions)
│   ├── ai/                 # AI engine (multi-model routing)
│   ├── server-core/        # Fastify app factory + plugins
│   ├── shared-ui/          # React component library
│   ├── realtime/           # WebSocket infrastructure
│   ├── security/           # Security (rate limit, WAF, CSRF, encryption)
│   ├── security-advanced/  # Advanced security (IP reputation, field encryption)
│   ├── observability/      # Tracing, metrics, logging, SLOs
│   ├── feature-flags/      # Feature flag service
│   ├── organizations/      # Multi-tenancy
│   ├── queue/              # BullMQ job processing
│   ├── data-pipeline/      # Redis Streams event streaming
│   ├── edge-config/        # CDN/edge optimization
│   └── ...                 # 75+ more packages
├── services/               # 8 infrastructure services
│   ├── ws-gateway/         # WebSocket connection management
│   ├── search-indexer/     # Kafka CDC to Meilisearch/Qdrant
│   ├── cdc-relay/          # Change Data Capture
│   ├── smtp-inbound/       # Inbound email processing
│   ├── ci-runner/          # CI/CD job execution
│   ├── git-server/         # Git hosting backend
│   ├── matchmaking/        # Real-time user matching
│   └── moderation-worker/  # AI content moderation
├── infra/                  # Infrastructure configs
│   ├── helm/               # Kubernetes Helm charts
│   ├── terraform/          # Cloud infrastructure IaC
│   ├── argocd/             # GitOps deployment
│   ├── prometheus/         # Metrics configs
│   ├── grafana/            # Dashboard configs
│   └── otel/               # OpenTelemetry collector
├── docs/                   # Documentation
├── e2e/                    # Playwright end-to-end tests
├── k6/                     # Load testing scripts
├── scripts/                # Build and dev tooling
├── docker-compose.yml      # Full development stack
├── turbo.json              # Turborepo pipeline config
├── package.json            # Root workspace config
└── tsconfig.json           # Root TypeScript config
```

---

## Code Conventions

### TypeScript

- **Strict mode** enabled globally (`tsconfig.json`)
- `noUnusedLocals` and `noUnusedParameters` enforced
- All exports must have explicit type annotations
- Use `type` imports for type-only imports: `import type { Foo } from './types'`

### Testing

- **Framework**: Vitest 2
- **Location**: `src/__tests__/*.test.ts` or co-located `*.test.ts`
- **Coverage**: All new code must include tests
- Run tests: `pnpm turbo test` or `pnpm turbo test --filter=<package>`

### Linting

- **ESLint** with flat config (`eslint.config.js`)
- Run: `pnpm turbo lint`

### Package Structure

Every package follows this standard layout:

```
packages/<name>/
├── src/
│   ├── index.ts            # Barrel export (all public APIs)
│   ├── types.ts            # Type definitions
│   ├── <module>.ts         # Implementation modules
│   └── __tests__/
│       └── <module>.test.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts        # (if package has tests)
```

---

## Adding a New Package

1. **Create the directory structure:**

```bash
mkdir -p packages/my-package/src/__tests__
```

2. **Create `package.json`:**

```json
{
  "name": "@quant/my-package",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build": "tsc",
    "lint": "eslint ."
  },
  "dependencies": {
    "@quant/common": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.8.3",
    "vitest": "^2.1.8",
    "@repo/eslint-config": "workspace:*",
    "@repo/typescript-config": "workspace:*"
  }
}
```

3. **Create `tsconfig.json`:**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

4. **Create `src/index.ts`:**

```typescript
export { MyService } from './my-service.js';
export type { MyServiceOptions } from './types.js';
```

5. **Install dependencies:**

```bash
pnpm install
```

6. **Verify:**

```bash
pnpm turbo typecheck --filter=@quant/my-package
pnpm turbo test --filter=@quant/my-package
```

---

## Adding a New App

1. **Create the app using Next.js:**

```bash
mkdir -p apps/my-app
```

2. **Create `package.json`:**

```json
{
  "name": "my-app",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3XXX",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "lint": "eslint ."
  },
  "dependencies": {
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@quant/common": "workspace:*",
    "@quant/shared-ui": "workspace:*",
    "@quant/auth": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.8.3",
    "@types/react": "^19.0.0",
    "@repo/eslint-config": "workspace:*",
    "@repo/typescript-config": "workspace:*"
  }
}
```

3. **Create `next.config.js` with security headers:**

```javascript
import { getSecurityHeaders } from '@quant/edge-config';

/** @type {import('next').NextConfig} */
const nextConfig = {
  headers: async () => [
    {
      source: '/(.*)',
      headers: getSecurityHeaders(),
    },
  ],
};

export default nextConfig;
```

4. **Add API routes** in `src/app/api/`.

5. **Register in `docker-compose.yml`** if the app needs its own container.

---

## PR Workflow

### CI Gates (in order)

1. **typecheck** - `pnpm turbo typecheck` (TypeScript strict compilation)
2. **test** - `pnpm turbo test` (Vitest unit/integration tests)
3. **build** - `pnpm turbo build` (Full production build)
4. **lint** - `pnpm turbo lint` (ESLint checks)

### Branch Naming

- `feat/<description>` - New features
- `fix/<description>` - Bug fixes
- `chore/<description>` - Maintenance, dependencies
- `docs/<description>` - Documentation changes

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(quantmail): add batch email operations
fix(auth): resolve token refresh race condition
chore(deps): update vitest to 2.1.8
docs: add API reference for admin endpoints
```

### Review Checklist

- [ ] All CI gates pass
- [ ] New code has test coverage
- [ ] Types are properly exported from barrel (`src/index.ts`)
- [ ] No `any` types without justification
- [ ] Security-sensitive changes reviewed by security team
- [ ] Breaking changes documented in PR description

---

## Common Development Tasks

### Running a Specific Test File

```bash
pnpm turbo test --filter=@quant/security -- --run src/__tests__/rate-limiter.test.ts
```

### Checking Type Errors Across the Monorepo

```bash
pnpm turbo typecheck
```

### Building Only Changed Packages

```bash
# Turborepo automatically caches and only rebuilds what changed
pnpm turbo build
```

### Viewing the Dependency Graph

```bash
pnpm turbo build --graph
```

### Cleaning Build Artifacts

```bash
pnpm turbo clean
```
