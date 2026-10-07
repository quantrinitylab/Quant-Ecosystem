# QuantMax — X09 Preferences (Web)

Route: `(no preferences UI page)`
App: `apps/quantmax` (Next.js pages router (UI) + app router (API only))

## Shell

- shared app shell + app switcher where implemented
- auth boundary: SignInRequired / AuthGuard; unauthenticated users are redirected to login
- LoadingState / ErrorState / EmptyState from `@quant/shared-ui`

