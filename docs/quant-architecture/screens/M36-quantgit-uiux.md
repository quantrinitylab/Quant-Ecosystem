# M36 — QuantGit UI/UX

## Product identity

QuantGit is a developer workspace and keeps a specialized GitHub-inspired dark/technical chrome where appropriate. It does not inherit consumer Mail navigation patterns.

## Information architecture

Repositories → Repository → Code / Issues / Pull Requests / Actions / Settings.

## Repository screen

Header identifies repository, branch/ref, visibility, and key actions. Main navigation is stable. Code browsing prioritizes tree, file content, history, and search.

## Pull request

PR view prioritizes title/status, reviewers, checks, changed files, conversation, and merge policy. Checks and merge readiness must be visually distinct from conversational comments.

## Actions

Workflow state shows queued/running/success/failure/cancelled with logs and timestamps. Quanty may explain failures or propose fixes but cannot silently merge or mutate protected branches.

## Cross-product context

Mail notifications can deep-link into QuantGit objects. The Git object remains authoritative in QuantGit.
