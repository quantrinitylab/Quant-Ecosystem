# QuantChat — C02 1:1 Chat (Web)

Route: `/chat/[id]`
App: `apps/quantchat` (Next.js app router + pages router (legacy /settings, /calls, /discover, /bitmoji))

## Shell

- shared app shell + app switcher where implemented
- auth boundary: SignInRequired / AuthGuard; unauthenticated users are redirected to login
- LoadingState / ErrorState / EmptyState from `@quant/shared-ui`

