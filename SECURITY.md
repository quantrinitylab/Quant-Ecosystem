# Security Policy

## Project Status and Supported Versions

Quant Ecosystem is under active development. This repository does not currently publish a generally available, supported release or a production security service-level agreement.

| Version | Security support |
| --- | --- |
| `main` | Best-effort fixes for reproducible issues in current code |
| Tags and older commits | Not currently supported |

This policy describes how to report issues in the repository. It does not claim that every documented product or infrastructure component is deployed.

## Reporting a Vulnerability

Please do not publish exploit details, credentials, personal data, or proof-of-concept payloads in a public issue.

1. Prefer GitHub's private vulnerability reporting for this repository: [Report a vulnerability privately](https://github.com/quantrinitylabsgo/Quant-Ecosystem/security/advisories/new).
2. If private reporting is unavailable, open a minimal public issue asking the maintainers to establish a private channel. Include no sensitive technical details in that issue.
3. Do not send reports to domains or email addresses unless the repository or organization profile currently verifies that contact. This project does not promise that previously documented security mailboxes are monitored.

Include, when safe to share privately:

- affected path, package, endpoint, or commit;
- prerequisites and minimal reproduction steps;
- expected and observed behavior;
- likely impact and affected data or tenants;
- suggested mitigation, if known;
- whether the issue is already public or actively exploited.

## Response Expectations

Reports are handled on a best-effort basis. The project does not currently promise fixed acknowledgment, remediation, disclosure, or bounty timelines. Maintainers should prioritize credible reports by exploitability and impact, keep the reporter informed when practical, and avoid claiming resolution until a fix is merged and verified.

## Safe Research Boundaries

Authorization to read this repository is not authorization to test any deployed system.

- Test only code, accounts, data, and infrastructure you own or have explicit permission to assess.
- Do not perform denial-of-service testing, social engineering, phishing, credential attacks, persistence, destructive actions, or access to other users' data.
- Use synthetic data and local or isolated environments.
- Stop testing and report privately if you encounter credentials, personal data, or evidence of unauthorized access.
- Preserve evidence without copying more sensitive data than necessary.

## Repository Security Controls

The following controls are represented by checked-in workflows at the time of this policy update:

- [CI](.github/workflows/ci.yml) runs on pull requests and pushes to `main`. It includes canonical-memory checks, Memory release gates, affected-package typecheck/lint/test/build, a PostgreSQL Memory isolation test, and a QuantChat coverage gate. The repository-wide full sweep is currently informational (`continue-on-error`).
- [CodeQL](.github/workflows/codeql.yml) analyzes GitHub Actions, JavaScript/TypeScript, and Python on pull requests, pushes to `main`, and a weekly schedule.
- [Production deployment](.github/workflows/deploy.yml) is manual-only and validates an exact current-`main` SHA, required checks, a Memory preflight without cloud credentials, immutable image digests, and rollback logic. A checked-in workflow is not proof that a production environment exists or that a deployment has run successfully.

This policy does **not** claim automatic Trivy container scanning, dependency auditing, OWASP ZAP testing, secret scanning, third-party penetration testing, annual architecture audits, or continuous compliance monitoring. Native GitHub security features may vary by repository settings and are not asserted here unless represented by verifiable evidence.

## Security Posture Claims

No SOC 2, ISO 27001, PCI DSS, HIPAA, GDPR operational certification, external penetration-test attestation, private bug-bounty program, or guaranteed production incident-response capability is claimed by this repository.

Architecture documents, threat models, tests, and planned controls describe intent or partial implementation unless accompanied by current operational evidence. Security-sensitive changes should be reviewed against the code and final-SHA CI results rather than prose claims.

## Coordinated Disclosure

Please allow a reasonable opportunity to investigate and fix a report before public disclosure when doing so does not increase user risk. If active exploitation or exposed credentials are involved, state that clearly in the private report so containment can be prioritized.

## Secrets and Credentials

Never commit real credentials. If a secret is exposed:

1. revoke or rotate it at the provider immediately;
2. determine where it was used and review relevant logs;
3. remove it from current code and configuration;
4. assess whether history rewriting is necessary;
5. add a safe placeholder and a regression control where appropriate.

Removing a secret from Git history does not revoke it.
