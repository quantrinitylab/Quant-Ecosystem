# QuantCooks — K02 Projects (Web)

Route: `/projects, /projects-gallery`
App: `apps/quantcooks` (Next.js pages router (UI) + app router (API only))

## Shell

- shared app shell + app switcher where implemented
- auth boundary: SignInRequired / AuthGuard; unauthenticated users are redirected to login
- LoadingState / ErrorState / EmptyState from `@quant/shared-ui`

