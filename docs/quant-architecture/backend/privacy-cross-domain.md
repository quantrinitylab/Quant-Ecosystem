# M21 — Cross-Domain Privacy Boundaries

## Default
Cross-product context is deny-by-default and purpose-bound.

Examples:
- Mail may correlate a Calendar event only through authorized Calendar APIs.
- Quanty may use Drive context only when the task and authorization permit it.
- Search may aggregate results only after each domain's permission check.
- Analytics cannot become an indirect path to private content.

## Data contracts
Cross-domain events carry references and necessary metadata, not unrestricted payload copies.
