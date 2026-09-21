/**
 * Single source of truth for the QuantWave (quantsync) backend origin.
 *
 * Every route handler under `src/app/api/**` previously re-declared this constant, and all
 * 40 copies defaulted to `http://localhost:3003` — which is the port **Next itself** listens
 * on (`package.json` → `next dev -p 3003`). The Fastify backend listens on **3004**
 * (`backend/app.ts` → `Number(process.env['PORT'] ?? 3004)`, matching `.env.example`), so
 * with `QUANTSYNC_BACKEND_URL` unset the proxies pointed the app at itself and every
 * `/api/*` call looped back into Next instead of reaching the API.
 *
 * Keep the default aligned with `backend/app.ts` and `.env.example`. Override in any
 * environment where the API is not co-located by setting `QUANTSYNC_BACKEND_URL`.
 */
export const BACKEND_URL = process.env.QUANTSYNC_BACKEND_URL || 'http://localhost:3004';
