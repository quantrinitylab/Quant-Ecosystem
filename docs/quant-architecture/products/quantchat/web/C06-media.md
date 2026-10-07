# QuantChat — C06 Media (Web)

Route: `/camera, /stories, /spotlight, /reels`
App: `apps/quantchat` (Next.js app router + pages router (legacy /settings, /calls, /discover, /bitmoji))

## Shell

- shared app shell + app switcher where implemented
- auth boundary: SignInRequired / AuthGuard; unauthenticated users are redirected to login
- LoadingState / ErrorState / EmptyState from `@quant/shared-ui`

