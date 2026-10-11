/**
 * Seed the eight first-party Quant apps as OAuth clients of the QuantMail
 * identity provider. Idempotent (upsert by clientId).
 *
 * Public clients (PKCE-only, no secret): the browser apps exchange the
 * authorization code from their own server-side callback routes, so no
 * confidential secret is stored anywhere. redirectUris are exact-match —
 * the authorize endpoint refuses anything not listed here (open-redirect
 * safe).
 *
 * Run: pnpm --filter @quant/database exec tsx prisma/seed-oauth-clients.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const APPS: Array<{ clientId: string; name: string; host: string }> = [
  { clientId: 'quantai', name: 'QuantAI', host: 'quantai.quantrinity.in' },
  { clientId: 'quantchat', name: 'QuantChat', host: 'quantchat.quantrinity.in' },
  { clientId: 'quantgram', name: 'QuantGram', host: 'quantgram.quantrinity.in' },
  { clientId: 'quantube', name: 'QuanTube', host: 'quantube.quantrinity.in' },
  { clientId: 'quantwave', name: 'QuantWave', host: 'quantwave.quantrinity.in' },
  { clientId: 'quantcooks', name: 'QuantCooks', host: 'quantcooks.quantrinity.in' },
  { clientId: 'quantads', name: 'QuantAds', host: 'quantads.quantrinity.in' },
  { clientId: 'quantmax', name: 'QuantMax', host: 'quantmax.quantrinity.in' },
];

const SCOPES = ['openid', 'profile', 'email'];

async function main() {
  for (const app of APPS) {
    const redirectUris = [
      `https://${app.host}/api/auth/sso/callback`,
      // Local dev callbacks for each app's usual port.
      `http://localhost:3001/api/auth/sso/callback`,
      `http://localhost:3002/api/auth/sso/callback`,
      `http://localhost:3003/api/auth/sso/callback`,
      `http://localhost:3004/api/auth/sso/callback`,
    ];
    await prisma.oAuthClient.upsert({
      where: { clientId: app.clientId },
      update: {
        name: app.name,
        redirectUris,
        allowedScopes: SCOPES,
        isConfidential: false,
        isFirstParty: true,
      },
      create: {
        clientId: app.clientId,
        clientSecretHash: null,
        name: app.name,
        description: `First-party ${app.name} app — Continue with QuantMail`,
        redirectUris,
        allowedScopes: SCOPES,
        isConfidential: false,
        isFirstParty: true,
      },
    });
    console.log(`upserted OAuth client ${app.clientId}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
