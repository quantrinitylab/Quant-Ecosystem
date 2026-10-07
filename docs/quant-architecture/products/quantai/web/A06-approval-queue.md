# QuantAI — A06 Approval Queue (Web)

Route: `(none)`
App: `apps/quantai` (Next.js app router + pages router (legacy /models, /memory, /analytics, /automation, /device, /code, /image-gen, /personas, /plugins, /prompts, /training, /translate, /ecosystem))

## Shell

- shared app shell + app switcher where implemented
- auth boundary: SignInRequired / AuthGuard; unauthenticated users are redirected to login
- LoadingState / ErrorState / EmptyState from `@quant/shared-ui`

Route does not exist. Linking to this inventory ID returns 404.

