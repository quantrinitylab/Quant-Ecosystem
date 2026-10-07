# QuantCooks — K04 Timeline (Web)

Route: `(panel in /editor)`
App: `apps/quantcooks` (Next.js pages router (UI) + app router (API only))

## Shell

- shared app shell + app switcher where implemented
- auth boundary: SignInRequired / AuthGuard; unauthenticated users are redirected to login
- LoadingState / ErrorState / EmptyState from `@quant/shared-ui`

No standalone route; rendered inside its host screen.

