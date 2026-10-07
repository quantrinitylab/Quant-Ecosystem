# Contributing to Quant

Thank you for your interest in contributing to Quant! This guide explains how to get involved.

## Ways to Contribute

### Code Contributions

- Bug fixes for open-source packages
- Feature implementations from the roadmap
- Performance improvements
- Test coverage improvements

### Documentation

- Fix typos and errors
- Improve explanations
- Add examples and tutorials
- Translate documentation

### Community

- Answer questions on Discord/GitHub Discussions
- Report bugs with detailed reproduction steps
- Suggest features with use cases
- Write blog posts about using Quant

### Security

- Report vulnerabilities responsibly (security@quant.app)
- Review encryption implementations
- Audit open-source packages

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 10.28+
- Git

### Setup

```bash
# Fork the repository on GitHub
# Clone your fork
git clone https://github.com/YOUR_USERNAME/quant-ecosystem.git
cd quant-ecosystem

# Install dependencies
pnpm install

# Run tests
pnpm test

# Run type checking
pnpm typecheck
```

### Development Workflow

1. Create a branch from `main`:

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes following our coding standards

3. Run checks:

   ```bash
   pnpm typecheck
   pnpm test
   pnpm lint
   ```

4. Commit with conventional commit format:

   ```bash
   git commit -m "feat: add new feature"
   git commit -m "fix: resolve issue with sync"
   git commit -m "docs: update API reference"
   ```

5. Push and create a Pull Request

### Coding Standards

- TypeScript strict mode
- ESLint configuration (run `pnpm lint`)
- Tests required for new features
- Documentation for public APIs
- No `any` types without justification

### Commit Message Format

```
type(scope): description

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`

## Pull Request Process

1. Ensure all CI checks pass
2. Request review from maintainers
3. Address review feedback
4. Squash commits if requested
5. Maintainer merges when approved

### PR Checklist

- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] Types are correct (no `any`)
- [ ] Lint passes
- [ ] Conventional commit message
- [ ] No breaking changes (or documented)

## Reporting Issues

### Bug Reports

Include:

- Quant version and platform
- Steps to reproduce
- Expected vs actual behavior
- Error messages or logs
- Screenshots if applicable

### Feature Requests

Include:

- Problem description
- Proposed solution
- Use cases
- Alternatives considered

## Code of Conduct

All contributors must follow our [Code of Conduct](./code-of-conduct.md). We are committed to providing a welcoming and inclusive environment.

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (see repository LICENSE file).

## Questions?

- Discord: `#development` channel
- GitHub Discussions: Q&A category
- Email: contributors@quant.app
