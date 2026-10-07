# 08 — Identity, Security and Trust

Identity hierarchy: Human, Organization, Device, Service, Agent, API client, Developer.

QuantMail remains the identity root/provider, while authorization is a platform concern.

Every sensitive action evaluates subject, tenant, resource, action, scope, policy, device/session and risk.

Quanty never receives a permanent master token. It receives short-lived scoped capabilities with tool/resource limits, action tier, spending limit and expiry.

Security controls: tenant isolation, service identity, encryption in transit/at rest, key rotation, audit, rate limiting, abuse controls, WAF/DDoS, secure file handling, prompt-injection defenses, SSRF controls and supply-chain verification.

Every product declares collection, purpose, retention, sharing, AI use, export and deletion behavior.

Trust & Safety covers spam, impersonation, scams, harassment, child safety, copyright abuse, financial fraud and coordinated abuse. High-risk enforcement supports human review and appeals.