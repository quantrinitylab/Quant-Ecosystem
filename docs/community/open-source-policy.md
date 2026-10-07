# Open Source Policy

## Philosophy

Quant believes in giving back to the open-source community. We open-source foundational packages that benefit the broader ecosystem while keeping proprietary the integrated product experience and infrastructure that provides our competitive advantage.

## What We Open Source

### Core Packages

These packages are released under the MIT license:

| Package             | Description                             | Repository           |
| ------------------- | --------------------------------------- | -------------------- |
| `packages/common`   | Shared utilities, types, and constants  | `quant-app/common`   |
| `packages/realtime` | WebSocket and real-time sync primitives | `quant-app/realtime` |
| `packages/testing`  | Testing utilities and helpers           | `quant-app/testing`  |
| `packages/crypto`   | End-to-end encryption library           | `quant-app/crypto`   |

### Developer Tools

| Package        | Description                         | Repository      |
| -------------- | ----------------------------------- | --------------- |
| `packages/sdk` | Official Quant SDK for integrations | `quant-app/sdk` |
| `packages/cli` | Command-line interface              | `quant-app/cli` |

### Documentation

All documentation in `docs/` is released under CC-BY-4.0.

## What Stays Proprietary

- Application code (`apps/`)
- Infrastructure configuration (`infra/`)
- AI/ML models (`models/`)
- Business logic services (`services/`)
- Internal governance tools (`packages/governance`)

## Contribution Model

### Contributor License Agreement (CLA)

All external contributors must sign a CLA before their first contribution is merged. The CLA ensures:

- You have the right to contribute the code
- You grant us a license to use the contribution
- You are not infringing on third-party rights

### Dual Licensing

Open-source packages may be dual-licensed:

- **MIT**: For community use
- **Commercial**: For enterprise features built on top

## Release Process

### Versioning

Open-source packages follow semantic versioning (semver):

- **Major**: Breaking changes
- **Minor**: New features (backward compatible)
- **Patch**: Bug fixes

### Publishing

1. Changes are developed in the monorepo
2. CI validates all checks pass
3. Changesets generate release notes
4. Packages are published to npm
5. GitHub releases are tagged

## Security

### Vulnerability Disclosure

For open-source packages:

- Report to security@quant.app
- 90-day disclosure timeline
- Coordinated disclosure with affected users
- Security advisories published on GitHub

### Dependency Management

- Automated dependency updates via Renovate
- Weekly security scans
- Critical vulnerabilities patched within 24 hours
- High vulnerabilities patched within 7 days

## Community Governance

### Maintainers

Core maintainers are Quant employees who:

- Review and merge PRs
- Triage issues
- Set roadmap priorities
- Ensure code quality standards

### Community Maintainers

Trusted contributors may receive maintainer status for specific packages after:

- Sustained contributions (6+ months)
- Demonstrated understanding of codebase
- Agreement to maintainer responsibilities
- Nomination by existing maintainer

## Support

### Open Source Support

- GitHub Issues for bug reports
- GitHub Discussions for questions
- Discord `#development` channel

### Enterprise Support

Organizations using open-source packages at scale can purchase enterprise support including:

- Priority bug fixes
- Custom feature development
- Dedicated support channel
- SLA guarantees
