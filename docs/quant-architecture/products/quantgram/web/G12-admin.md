# QuantGram — G12 Admin (Web)

Route: `(none)`
App: `apps/quantgram` (Next.js pages router (UI) + app router (API only))

## Shell

- shared app shell + app switcher where implemented
- auth boundary: SignInRequired / AuthGuard; unauthenticated users are redirected to login
- LoadingState / ErrorState / EmptyState from `@quant/shared-ui`

Route does not exist. Linking to this inventory ID returns 404.

