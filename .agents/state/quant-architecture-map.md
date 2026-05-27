# Quant Ecosystem Architecture Map

## Overview

- **13 apps** (frontend/backend applications)
- **17 services** (microservices)
- **37 packages** (shared libraries)
- **Build system:** pnpm 10.28.1 + Turborepo 2.9.14
- **Language:** TypeScript (strict mode, ESNext modules)
- **Node version:** 22

## Apps (13)

| App           | Scripts                                                        |
| ------------- | -------------------------------------------------------------- |
| quantads      | build, dev, test, typecheck                                    |
| quantai       | build, build:backend, dev, dev:backend, start, test, typecheck |
| quantcalendar | test, typecheck                                                |
| quantchat     | build, build:backend, dev, dev:backend, start, test, typecheck |
| quantdocs     | test, typecheck                                                |
| quantdrive    | test, typecheck                                                |
| quantedits    | build, dev, test, typecheck                                    |
| quantmail     | build, build:backend, dev, dev:backend, start, test, typecheck |
| quantmax      | build, dev, test, typecheck                                    |
| quantmeet     | build, dev, test, typecheck                                    |
| quantneon     | build, dev, test, typecheck                                    |
| quantsync     | build, dev, test, typecheck                                    |
| quantube      | build, dev, test, typecheck                                    |

## Services (17)

| Service           | Scripts                     |
| ----------------- | --------------------------- |
| ads-api           | (no package.json)           |
| ai-api            | (no package.json)           |
| cdc-relay         | dev, start, test, typecheck |
| chat-api          | (no package.json)           |
| ci-runner         | build, test, typecheck      |
| edits-api         | (no package.json)           |
| git-server        | build, test, typecheck      |
| identity          | (no package.json)           |
| mail-api          | (no package.json)           |
| max-api           | (no package.json)           |
| moderation-worker | dev, start, test, typecheck |
| neon-api          | (no package.json)           |
| search-indexer    | dev, start, test, typecheck |
| smtp-inbound      | build, test, typecheck      |
| sync-api          | (no package.json)           |
| tube-api          | (no package.json)           |
| ws-gateway        | (no package.json)           |

## Packages (37)

### Packages with build + typecheck + test

| Package       | Scripts                                                  |
| ------------- | -------------------------------------------------------- |
| cross-publish | build, test, typecheck                                   |
| database      | build, db:generate, db:migrate, db:seed, test, typecheck |
| data-plane    | build, test, typecheck                                   |
| media         | build, test, typecheck                                   |
| notifications | build, test, typecheck                                   |
| observability | build, test, typecheck                                   |
| payments      | build, test, typecheck                                   |
| queue         | build, test, typecheck                                   |
| search        | build, test, typecheck                                   |
| social-graph  | build, test, typecheck                                   |
| storage       | build, test, typecheck                                   |

### Packages with typecheck + test (no build)

| Package         | Scripts         |
| --------------- | --------------- |
| agent-runtime   | test, typecheck |
| ai              | test, typecheck |
| api-client      | test, typecheck |
| auth            | test, typecheck |
| federation      | test, typecheck |
| ml-pipeline     | test, typecheck |
| ml-runtime      | test, typecheck |
| moderation      | test, typecheck |
| ranking         | test, typecheck |
| realtime        | test, typecheck |
| recommendations | test, typecheck |
| security        | test, typecheck |
| server-core     | test, typecheck |
| shared-ui       | test, typecheck |
| sync-engine     | test, typecheck |
| testing         | test, typecheck |

### Packages with typecheck only

| Package | Scripts   |
| ------- | --------- |
| common  | typecheck |

### Packages with no scripts (empty or no package.json)

| Package            | Notes                |
| ------------------ | -------------------- |
| admin              | no package.json      |
| analytics          | no package.json      |
| data-pipeline      | no package.json      |
| developer-platform | no package.json      |
| ecosystem-bridge   | no package.json      |
| gaming             | no package.json      |
| i18n               | no package.json      |
| performance        | no package.json      |
| server             | empty scripts object |

## Dependency Chain

Core dependency flow (based on tsconfig project references and package.json dependencies):

```
common -> auth -> server-core
common -> database
common -> ai -> agent-runtime
common -> realtime
common -> shared-ui
```

The `common` package is the foundation. Most other packages depend on it.

`database` depends on `common` and requires Prisma client generation (`prisma generate`) before typecheck can work.

## Build Pipeline (turbo.json)

- `typecheck`: depends on `^typecheck` (upstream packages must typecheck first)
- `build`: depends on `^build` (upstream packages must build first), outputs `dist/**`
- `test`: depends on `^build` (upstream packages must be built first)

## Key Issues

1. Packages with `composite: true` in tsconfig need `dist/` from referenced packages, but typecheck uses `--noEmit` creating a circular problem
2. 8 packages have no package.json at all (likely placeholder/stub packages)
3. 9 services have no package.json (likely placeholder/stub services)
4. The `server` package has an empty scripts object
