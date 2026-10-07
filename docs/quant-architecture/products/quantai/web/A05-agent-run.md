# QuantAI — A05 Agent Run (Web)

Route: `(embedded in chat /code terminal)`
App: `apps/quantai` (Next.js app router + pages router (legacy /models, /memory, /analytics, /automation, /device, /code, /image-gen, /personas, /plugins, /prompts, /training, /translate, /ecosystem))

## Shell

- shared app shell + app switcher where implemented
- auth boundary: SignInRequired / AuthGuard; unauthenticated users are redirected to login
- LoadingState / ErrorState / EmptyState from `@quant/shared-ui`

