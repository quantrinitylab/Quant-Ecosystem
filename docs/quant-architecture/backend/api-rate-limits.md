# M23 — API Rate Limits & Quotas

## Dimensions
Apply limits by app, user, organization, endpoint class, and expensive workload where appropriate.

## Response
Use stable rate-limit metadata and retry guidance. Limits are independent from product authorization.

## Fairness
Prevent one app or tenant from consuming shared capacity disproportionately.

## Adaptive control
The platform may tighten limits during abuse or dependency pressure, but changes must be observable and policy-governed.
