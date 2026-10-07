# QuantAds — D05 Audience (Web)

Route: `/audiences`
App: `apps/quantads` (Next.js app router + pages router (legacy /create-campaign, /creative-studio, /fraud, /brand-safety, /pixels))

## Shell

- shared app shell + app switcher where implemented
- auth boundary: SignInRequired / AuthGuard; unauthenticated users are redirected to login
- LoadingState / ErrorState / EmptyState from `@quant/shared-ui`

