# 19 — Execution System

Architecture becomes useful only when it produces deterministic work.

## Work-order states
planned → specified → contract-ready → implementation → test → browser/device QA → security review → rollout → verified → complete.

## Required fields
ID, product, screen/domain, objective, prerequisites, exact files expected, APIs/events, tests, acceptance criteria, evidence, owner/agent, blocked-by and rollback.

## Dependency rule
A work order cannot start while a prerequisite contract is undefined unless the task explicitly exists to define that contract.

## Agent roles
Architecture, Backend, Frontend, Flutter, AI/Quanty, Algorithm, Security, QA, SRE and Release agents. Every agent returns changed files, tests, risks and evidence—not merely a completion claim.