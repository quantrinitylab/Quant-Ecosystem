# QuantWave — W06 Profile (Web)

Route: `/profile`
App: `apps/quantwave` (Next.js app router)

## Shell

- shared app shell + app switcher where implemented
- auth boundary: SignInRequired / AuthGuard; unauthenticated users are redirected to login
- LoadingState / ErrorState / EmptyState from `@quant/shared-ui`

